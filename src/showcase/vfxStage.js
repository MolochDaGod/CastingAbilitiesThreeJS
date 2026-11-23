/**
 * VfxStage — one WebGLRenderer for the whole showcase.
 *
 * Plays either:
 *  - a CDN sprite sheet as an animated billboard (UV-stepped frames), or
 *  - a real casting 3D effect through the game's own VfxDirector
 *    (same ParticleEngine / BurstSystem / DecalSystem / LightPool as play).
 *
 * Runtime bar: single renderer, setAnimationLoop paused while the tab is
 * hidden or the stage is off-screen, dt-scaled updates, sRGB colour maps,
 * and dispose of every geometry / material / texture we create.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CircleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  GridHelper,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer
} from 'three';
import { ParticleEngine } from '../particles/ParticleEngine.js';
import { LightPool } from '../effects/LightPool.js';
import { DecalSystem } from '../effects/GroundDecals.js';
import { BurstSystem } from '../effects/BurstSphere.js';
import { CameraShake } from '../effects/CameraShake.js';
import { ScreenFlash } from '../effects/ScreenFlash.js';
import { VfxDirector } from '../vfx/VfxDirector.js';
import { frame } from '../core/FrameUniforms.js';
import { enableMainCameraLayers } from '../core/Layers.js';

/** Seconds between auto re-casts of a 3D effect while looping. */
const RECAST_SECONDS = { default: 2.4, getsuga_slash: 1.8, moon_beam: 3.2, fire_aura: 3.2, frost_wave: 2.8 };

export class VfxStage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ flashEl?: HTMLElement, onFrame?: (info: object) => void }} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.flashEl = opts.flashEl || null;
    this.onFrame = opts.onFrame || null;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(new Color(0x07090e), 1);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(42, 1, 0.1, 400);
    // Particles / bursts live on LAYER.VFX, same as the combat camera.
    enableMainCameraLayers(this.camera);
    this.cameraBase = new Vector3(0, 3.4, 8.2);
    this.cameraTarget = new Vector3(0, 1.2, 0);
    this.rig = { shakeOffset: new Vector3(), shakeRoll: 0 };

    this._owned = [];
    this.scene.add(new HemisphereLight(0x9fb4ff, 0x1a1410, 0.55));
    const groundGeo = this._own(new CircleGeometry(14, 64));
    const groundMat = this._own(new MeshStandardMaterial({ color: 0x141821, roughness: 0.92, metalness: 0.02 }));
    const ground = new Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const grid = new GridHelper(28, 28, 0x2a3346, 0x1a2030);
    grid.position.y = 0.002;
    this._own(grid.geometry);
    this._own(grid.material);
    this.scene.add(grid);
    // Caster marker ring (a pad, not a character stand-in)
    const padGeo = this._own(new RingGeometry(0.42, 0.5, 48));
    const padMat = this._own(new MeshBasicMaterial({ color: 0xd4a84b, transparent: true, opacity: 0.55, side: DoubleSide }));
    const pad = new Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    this.scene.add(pad);

    // Soft-particle depth: no depth pre-pass here, so feed a "far" 1x1 depth.
    this._farDepth = this._own(new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat));
    this._farDepth.needsUpdate = true;
    frame.uSceneDepth.value = this._farDepth;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    this.particles = new ParticleEngine(this.scene);
    this.lights = new LightPool(this.scene);
    this.decals = new DecalSystem(this.scene);
    this.bursts = new BurstSystem(this.scene);
    this.shake = new CameraShake(this.rig);
    this.flash = new ScreenFlash();
    this.director = new VfxDirector({
      scene: this.scene,
      assets: null,
      character: null,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash
    });

    /** @type {null | {kind: 'sprite', item: object, mesh: Mesh, tex: Texture, geo: PlaneGeometry, mat: MeshBasicMaterial, t: number, frame: number} | {kind: '3d', id: string, t: number, cast: number}} */
    this.current = null;
    this.playing = true;
    this.loop = true;
    this.speed = 1;
    this.fps = 16;
    this.mode = 'billboard'; // billboard | ground
    this.elapsed = 0;

    this._last = 0;
    this._visible = true;
    this._docVisible = !document.hidden;
    this._running = false;
    this._onVis = () => { this._docVisible = !document.hidden; this._syncLoop(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._io = new IntersectionObserver((ents) => {
      for (const e of ents) this._visible = e.isIntersecting;
      this._syncLoop();
    });
    this._io.observe(canvas);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);
    this.resize();
    this._syncLoop();
  }

  _own(obj) { this._owned.push(obj); return obj; }

  _syncLoop() {
    const want = this._visible && this._docVisible;
    if (want && !this._running) {
      this._last = performance.now();
      this.renderer.setAnimationLoop(() => this._tick());
      this._running = true;
    } else if (!want && this._running) {
      this.renderer.setAnimationLoop(null);
      this._running = false;
    }
  }

  resize() {
    const host = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    frame.uResolution.value.set(w * pr, h * pr);
  }

  /** Clear whatever is showing and dispose sprite GPU objects. */
  clear() {
    const c = this.current;
    if (c && c.kind === 'sprite') {
      this.scene.remove(c.mesh);
      c.geo.dispose();
      c.mat.dispose();
      c.tex.dispose();
    }
    this.current = null;
  }

  /**
   * @param {object} item manifest item
   * @param {HTMLImageElement} image verified bytes, decoded
   */
  showSprite(item, image) {
    this.clear();
    const tex = new Texture(image);
    tex.colorSpace = SRGBColorSpace;
    const pixel = item.frameW <= 64 || (item.categories || []).includes('pixel') || (item.categories || []).includes('retro');
    tex.magFilter = pixel ? NearestFilter : LinearFilter;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    const iw = image.naturalWidth, ih = image.naturalHeight;
    tex.repeat.set(item.frameW / iw, item.frameH / ih);
    tex.needsUpdate = true;
    const aspect = item.frameW / item.frameH;
    const height = 3.0;
    const geo = new PlaneGeometry(height * aspect, height);
    const additive = item.blendMode === 'additive' || item.blendMode === 'lighter' || item.blendMode === 'screen';
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: additive ? AdditiveBlending : NormalBlending,
      toneMapped: false
    });
    const mesh = new Mesh(geo, mat);
    this.scene.add(mesh);
    this.current = { kind: 'sprite', item, mesh, tex, geo, mat, t: 0, frame: 0, iw, ih };
    this._placeSprite();
    this._setFrame(0);
  }

  setMode(mode) {
    this.mode = mode === 'ground' ? 'ground' : 'billboard';
    this._placeSprite();
  }

  _placeSprite() {
    const c = this.current;
    if (!c || c.kind !== 'sprite') return;
    if (this.mode === 'ground') {
      c.mesh.rotation.set(-Math.PI / 2, 0, 0);
      c.mesh.position.set(0, 0.03, 0);
    } else {
      c.mesh.rotation.set(0, 0, 0);
      c.mesh.position.set(0, 1.55, 0);
    }
  }

  _setFrame(f) {
    const c = this.current;
    if (!c || c.kind !== 'sprite') return;
    const it = c.item;
    const n = Math.max(1, it.frames);
    c.frame = ((f % n) + n) % n;
    const col = c.frame % it.cols;
    const row = Math.floor(c.frame / it.cols);
    c.tex.offset.set((col * it.frameW) / c.iw, 1 - ((row + 1) * it.frameH) / c.ih);
  }

  /** @param {string} effectId VFX_CATALOG id */
  show3d(effectId) {
    this.clear();
    this.current = { kind: '3d', id: effectId, t: 0, cast: 0 };
    this.cast();
  }

  /** Fire the current 3D effect once (or restart the sprite). */
  cast() {
    const c = this.current;
    if (!c) return;
    if (c.kind === 'sprite') { c.t = 0; this._setFrame(0); return; }
    c.t = 0;
    c.cast++;
    this.director.deploy(c.id, {
      origin: new Vector3(0, 0, 0),
      forward: new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), 0.0),
      aim: new Vector3(0, 1.1, 7.5),
      intensity: 1
    });
  }

  stepFrame(delta) {
    const c = this.current;
    if (!c || c.kind !== 'sprite') return;
    this.playing = false;
    this._setFrame(c.frame + delta);
  }

  _tick() {
    const now = performance.now();
    const raw = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    const dt = this.playing ? raw * this.speed : 0;
    this.elapsed += dt;
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    const c = this.current;
    if (c && c.kind === 'sprite' && this.playing) {
      c.t += dt;
      const f = Math.floor(c.t * this.fps);
      if (!this.loop && f >= c.item.frames) {
        this._setFrame(c.item.frames - 1);
        this.playing = false;
      } else {
        this._setFrame(f);
      }
    } else if (c && c.kind === '3d' && this.playing) {
      c.t += dt;
      const every = RECAST_SECONDS[c.id] ?? RECAST_SECONDS.default;
      if (this.loop && c.t >= every) this.cast();
    }
    if (c && c.kind === 'sprite' && this.mode === 'billboard') c.mesh.quaternion.copy(this.camera.quaternion);

    // Gentle orbit so 3D volume reads; shake from the game's CameraShake.
    const ang = this.elapsed * 0.12;
    this.camera.position.set(
      Math.sin(ang) * this.cameraBase.z * 0.35,
      this.cameraBase.y,
      Math.cos(ang) * this.cameraBase.z
    ).add(this.rig.shakeOffset);
    this.camera.lookAt(this.cameraTarget);
    this.camera.rotation.z += this.rig.shakeRoll;

    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);
    this.director.update(dt);
    this.shake.update(raw);
    this.flash.update(raw);
    if (this.flashEl) {
      this.flashEl.style.opacity = String(Math.min(0.6, this.flash.strength));
      this.flashEl.style.background = `#${this.flash.color.getHexString()}`;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.onFrame && c) this.onFrame(c.kind === 'sprite' ? { frame: c.frame, frames: c.item.frames } : { t: c.t, cast: c.cast });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this._running = false;
    document.removeEventListener('visibilitychange', this._onVis);
    this._io.disconnect();
    this._ro.disconnect();
    this.clear();
    this.particles.dispose();
    this.decals.dispose?.();
    this.bursts.dispose?.();
    this.lights.dispose?.();
    for (const o of this._owned) o.dispose?.();
    this._owned.length = 0;
    if (frame.uSceneDepth.value === this._farDepth) frame.uSceneDepth.value = null;
    this.renderer.dispose();
  }
}
