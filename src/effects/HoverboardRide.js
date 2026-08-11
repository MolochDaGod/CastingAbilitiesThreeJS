import {
  Box3,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { ParticleShape } from '../particles/ParticleSystem.js';
import { RateEmitter } from '../particles/ParticleEngine.js';
import { BurstMode } from './BurstSphere.js';
import { DecalType } from './GroundDecals.js';
import { LAYER } from '../core/Layers.js';
import { frame } from '../core/FrameUniforms.js';
import { settings } from '../config/settings.js';
import { getColor } from '../utils/color.js';
import { Easing, saturate } from '../utils/math.js';
import {
  applySailClothMaterials,
  setSailClothMode,
  updateSailCloth
} from '../materials/SailCloth.js';

const UP = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _fwd = new Vector3();
const _local = new Vector3();
const _emit = {};
const TAU = Math.PI * 2;

const BIRTH_TIME = 0.32;
const DEATH_TIME = 0.5;

const MANIFEST_URL = './models/ride/ride.manifest.json';

/**
 * Replaces the procedural air ball with SI-scaled windsurf/hoverboard package.
 *
 * - Rigid body = deck under Toon RTS feet (sockets footL/footR from IK graph)
 * - Sail boom/rail sockets for hand IK
 * - Left↔right bank + sway while riding
 *
 * Same lifecycle as AirScooter: spawn → update → release / cancel.
 */
export class HoverboardRide {
  /**
   * @param {object} ctx { scene, particles, lights, decals, bursts, shake }
   * @param {import('../loaders/AssetLoader.js').AssetLoader} [assets]
   */
  constructor(ctx, assets = null) {
    this.ctx = ctx;
    this.assets = assets;
    this.group = new Group();
    this.group.name = 'HoverboardRide';
    this.group.visible = false;

    this.boardRoot = new Group();
    this.boardRoot.name = 'RideBody';
    this.group.add(this.boardRoot);

    this.socketGroup = new Group();
    this.socketGroup.name = 'RideSockets';
    this.boardRoot.add(this.socketGroup);

    /**
     * Unscaled rider seat — sibling of boardRoot so birth/death scale never
     * multiplies the character (that "ripped away" / giant / micro bug).
     * Bank/sway match the visual board; scale always identity.
     */
    this.seatRoot = new Group();
    this.seatRoot.name = 'RideSeat';
    this.group.add(this.seatRoot);

    /** @type {Record<string, Group>} */
    this.sockets = {};
    this.manifest = null;
    this.mesh = null;
    this._ready = false;
    this._loadPromise = null;

    this.dust = ctx.particles.get('walk.dust', {
      capacity: 900,
      shape: ParticleShape.SOFT,
      additive: true,
      swirl: true,
      softFade: 0.4
    });
    this.dust.uniforms.uGravity.value.set(0, -0.35, 0);
    this.dust.uniforms.uDrag.value = 0.9;
    this.dust.uniforms.uEndSize.value = 0.6;
    this.dustEmitter = new RateEmitter();

    this.light = null;
    this._birth = 0;
    this._death = 0;
    this._releasing = false;
    this._bank = 0;
    this._swayT = 0;
    this._yaw = 0;

    this.debugHelpers = [];
  }

  get active() {
    return this.group.visible;
  }

  get ready() {
    return this._ready;
  }

  /** Load windsurf (primary) or hoverboard package + socket empties. */
  async load(assets) {
    if (this._loadPromise) return this._loadPromise;
    this.assets = assets || this.assets;
    this._loadPromise = this._loadInner();
    return this._loadPromise;
  }

  async _loadInner() {
    let manifest;
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      manifest = await res.json();
    } catch (err) {
      console.warn('[HoverboardRide] manifest fail', err);
      manifest = {
        primary: 'windsurf',
        windsurf: {
          file: './models/ride/windsurf_package.glb',
          deckY: 0.06,
          sockets: {
            footL: [-0.18, 0.07, -0.08],
            footR: [0.18, 0.07, -0.08],
            sailRail: [0, 0.34, 0.18],
            sailBoomL: [-0.22, 0.32, 0.12],
            deckCenter: [0, 0.06, 0]
          },
          motion: { bankMaxDeg: 18, swayHz: 0.55, swayM: 0.04 }
        }
      };
    }
    this.manifest = manifest;
    const key = manifest.primary === 'hoverboard' ? 'hoverboard' : 'windsurf';
    const pack = manifest[key] || manifest.windsurf;
    const url = pack.file.startsWith('.') ? pack.file.replace(/^\.\//, './models/ride/').replace('models/ride/models/ride/', 'models/ride/') : pack.file;
    // normalize path
    const glbUrl = pack.file.includes('models/ride')
      ? pack.file.replace(/^\.\//, './')
      : `./models/ride/${pack.file.replace(/^\.\//, '')}`;

    try {
      const gltf = await this.assets.loadGLTF(glbUrl);
      const scene = skeletonClone(gltf.scene);
      scene.name = 'RideMesh';
      // Fit package: keep author SI bake; ensure deck roughly at y=0 if needed
      this._normalizeMesh(scene, pack);
      // Art yaw vs travel +Z (WalkController: +Z = cos(yaw), +X = sin(yaw)).
      // 0 = package forward matches travel; 180 = stern-first (wrong freeride feel).
      const artYawDeg =
        Number.isFinite(pack.artYawDeg)
          ? pack.artYawDeg
          : Number.isFinite(settings.walk?.boardArtYawDeg)
            ? settings.walk.boardArtYawDeg
            : 0;
      scene.rotation.y = (artYawDeg * Math.PI) / 180;
      // Sail cloth: sRGB maps + double-sided fabric + vertex wind (no soft-body engine)
      applySailClothMaterials(scene, { forceCloth: false });
      setSailClothMode(scene, 'ride');
      this.boardRoot.add(scene);
      this.mesh = scene;
      this._artYawDeg = artYawDeg;
      console.info(`[HoverboardRide] mesh artYaw=${artYawDeg}° travel=+Z cloth=on`);
    } catch (err) {
      console.error('[HoverboardRide] GLB load failed', glbUrl, err);
      throw err;
    }

    // Sockets stay in TRAVEL frame (+Z forward), not mesh art frame
    const sockets = pack.sockets || {};
    for (const [name, xyz] of Object.entries(sockets)) {
      const g = new Group();
      g.name = `socket_${name}`;
      g.position.set(xyz[0], xyz[1], xyz[2]);
      this.socketGroup.add(g);
      this.sockets[name] = g;
    }
    // IK socket deckCenter (on scaled board for visual pad markers)
    if (!this.sockets.deckCenter) {
      const deck = new Group();
      deck.name = 'socket_deckCenter';
      deck.position.set(0, pack.deckY ?? 0.06, 0);
      this.socketGroup.add(deck);
      this.sockets.deckCenter = deck;
    }
    // Character parents to unscaled seatRoot — local stand only (see WalkController)
    this.seat = this.seatRoot;
    this.pack = pack;
    this._ready = true;

    if (settings.walk?.debugSockets) this._buildDebugSpheres();
    return this;
  }

  _normalizeMesh(scene, pack) {
    scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    box.getSize(size);
    // Target board length ~2.4–2.8 m if oversized, or scale up if tiny
    const len = Math.max(size.x, size.z);
    if (len > 4.5) {
      const s = 2.6 / len;
      scene.scale.multiplyScalar(s);
      scene.updateMatrixWorld(true);
    } else if (len < 0.4) {
      const s = 2.4 / Math.max(len, 1e-3);
      scene.scale.multiplyScalar(s);
      scene.updateMatrixWorld(true);
    }
    // Ground bottom of mesh near y=0 under boardRoot
    box.setFromObject(scene);
    scene.position.y -= box.min.y;
    scene.position.x -= (box.min.x + box.max.x) * 0.5;
    scene.position.z -= (box.min.z + box.max.z) * 0.5;
  }

  _buildDebugSpheres() {
    const geo = new SphereGeometry(0.04, 10, 8);
    const mat = new MeshBasicMaterial({ color: 0x3aa0ff, depthWrite: false });
    for (const g of Object.values(this.sockets)) {
      const m = new Mesh(geo, mat);
      m.layers.set(LAYER.VFX);
      g.add(m);
      this.debugHelpers.push(m);
    }
  }

  /** Deck / seat height above world ground for the rider root. */
  get deckHeight() {
    return this.pack?.deckY ?? settings.walk.hover ?? 0.06;
  }

  /** Seat Object3D for mounting the character (unscaled, banked with board). */
  getSeat() {
    return this.seatRoot || this.seat || this.sockets.deckCenter || this.boardRoot;
  }

  /**
   * Snap birth scale to full size before parenting a rider.
   * Call from WalkController._mountRider so the character never inherits 0.01.
   */
  forceFullSize() {
    this._birth = 1;
    this._death = 0;
    this._releasing = false;
    this.boardRoot.scale.setScalar(1);
    this.seatRoot.scale.set(1, 1, 1);
  }

  /**
   * Current board bank about local Z (radians), for matching character lean
   * when not reparented.
   */
  get bank() {
    return this._bank || 0;
  }

  /**
   * World position of a named socket (footL, sailRail, …).
   * @param {string} name
   * @param {Vector3} [out]
   */
  getSocketWorld(name, out = new Vector3()) {
    const s = this.sockets[name];
    if (s) {
      s.getWorldPosition(out);
      return out;
    }
    this.boardRoot.getWorldPosition(out);
    return out;
  }

  /** Snapshot of IK sockets in world space for RideIK. */
  getIkWorldTargets() {
    const out = {};
    for (const name of Object.keys(this.sockets)) {
      out[name] = this.getSocketWorld(name, new Vector3());
    }
    return out;
  }

  /**
   * Puff the board into existence under the rider.
   * @param {Vector3|{x:number,y?:number,z:number}} position
   * @param {number} [yaw] world heading so board points travel direction on spawn
   */
  spawn(position, yaw = 0) {
    const c = settings.walk;
    this._birth = 0;
    this._death = 0;
    this._releasing = false;
    this._bank = 0;
    this._swayT = 0;
    this.dustEmitter.reset();

    this.group.visible = true;
    this.group.position.set(position.x, position.y || 0, position.z);
    this._yaw = Number.isFinite(yaw) ? yaw : 0;
    this.group.rotation.y = this._yaw;
    this.boardRoot.position.set(0, this.deckHeight, 0);
    this.boardRoot.scale.setScalar(0.01);
    this.light = this.light ?? this.ctx.lights.acquire();

    const inner = getColor(c.colorInner);
    const outer = getColor(c.colorOuter);
    this.ctx.bursts.spawn(BurstMode.AIR, position, {
      radius: 0.4,
      endRadius: 2.8,
      life: 0.4,
      intensity: 0.85 * settings.global.glow,
      fresnel: c.fresnel,
      displace: 0.25,
      colorA: outer,
      colorB: inner,
      colorC: inner
    });
    _pos.set(position.x, 0.02, position.z);
    this.ctx.decals.spawn(DecalType.DUSTRING, _pos, {
      radius: 2.2,
      life: 1.0,
      intensity: 0.65,
      colorA: inner,
      colorB: outer
    });
    this.ctx.shake.add(0.16 * c.landShake * settings.global.explosionIntensity, 0.85, 20);
  }

  /**
   * @param {number} dt
   * @param {Vector3} position  ride anchor (deck under rider), world
   * @param {Vector3} side      rider left (horizontal)
   * @param {number} distance   metres ridden
   * @param {number} speed      m/s
   * @param {number} [yaw]      world heading about Y
   * @param {number} [turnRate] rad/s signed (left +) for bank
   */
  update(dt, position, side, distance, speed, yaw = 0, turnRate = 0) {
    if (!this.group.visible) return;
    const c = settings.walk;
    const motion = this.pack?.motion || { bankMaxDeg: 18, swayHz: 0.55, swayM: 0.04 };
    // Sail flap with speed (visual cloth only)
    if (this.mesh) {
      const wind = MathUtils.clamp(0.7 + (speed || 0) * 0.08, 0.7, 2.0);
      updateSailCloth(this.mesh, dt, { wind, speed: 1 });
    }

    if (this._releasing) {
      this._death = saturate(this._death + dt / DEATH_TIME);
      if (this._death >= 1) {
        this._retire();
        return;
      }
    } else {
      this._birth = saturate(this._birth + dt / BIRTH_TIME);
    }

    const birth = Easing.outBack(this._birth);
    const fade = 1 - Easing.outQuad(this._death);

    // Full world anchor (incl. freeride wave Y) — rider is parented under seat
    // so they ride with this group, not via separate character world transforms.
    const py = Number.isFinite(position.y) ? position.y : 0;
    this.group.position.set(position.x, py, position.z);
    this._yaw = yaw;
    this.group.rotation.y = yaw;

    // Left ↔ right bank from turn + mild periodic sway (sail feel)
    this._swayT += dt;
    const bankTarget =
      -MathUtils.clamp(turnRate / Math.max(0.4, c.leanRate || 2), -1, 1) *
        (motion.bankMaxDeg || 18) *
        MathUtils.DEG2RAD +
      Math.sin(this._swayT * (motion.swayHz || 0.55) * TAU) * 0.06;
    this._bank = MathUtils.damp(this._bank, bankTarget, 8, dt);

    const sway =
      Math.sin(this._swayT * (motion.swayHz || 0.55) * TAU + 1.2) * (motion.swayM || 0.04);
    const pitch = -MathUtils.clamp(speed * 0.012, 0, 0.12);
    const deckY = this.deckHeight * birth;
    // Deck height local to group (group already at water/path Y)
    this.boardRoot.position.set(sway, deckY, 0);
    this.boardRoot.rotation.z = this._bank;
    this.boardRoot.rotation.x = pitch;
    // Visual board only scales on birth/death — never the rider seat
    this.boardRoot.scale.setScalar(Math.max(0.001, birth * fade));

    // Rider seat: same bank/sway/height, always scale 1 (SI character intact)
    this.seatRoot.position.set(sway, deckY, 0);
    this.seatRoot.rotation.z = this._bank;
    this.seatRoot.rotation.x = pitch;
    this.seatRoot.scale.set(1, 1, 1);
    this.seatRoot.visible = fade > 0.05;

    if (this.light) {
      this.getSocketWorld('deckCenter', _pos);
      if (!_pos.lengthSq()) _pos.set(position.x, this.deckHeight + 0.4, position.z);
      this.ctx.lights.set(
        this.light,
        _pos,
        getColor(c.lightColor),
        c.lightIntensity * 0.55 * birth * fade,
        c.lightRadius,
        dt
      );
    }

    // Dust from under deck
    if (!this._releasing) {
      const rate = c.dustRate * (0.25 + 0.75 * saturate(speed / Math.max(0.5, c.speed)));
      const count = Math.round(this.dustEmitter.tick(dt, rate) * settings.global.particleCount);
      if (count > 0) {
        _pos.set(position.x, 0.05, position.z);
        _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
        _dir.copy(_fwd).multiplyScalar(-1);
        _emit.position = _pos;
        _emit.radius = 0.55;
        _emit.direction = _dir;
        _emit.speed = speed * 0.4 + 0.5;
        _emit.speedVariance = 0.5;
        _emit.spread = 0.7;
        _emit.inherit = null;
        _emit.anchor = position;
        _emit.size = 0.11;
        _emit.sizeVariance = 0.5;
        _emit.life = c.dustLifetime;
        _emit.lifeVariance = 0.45;
        _emit.spin = 0;
        _emit.tint = null;
        _emit.time = frame.uTime.value;
        this.dust.emit(count, _emit);
      }
    }
  }

  release() {
    if (!this.group.visible || this._releasing) return;
    const c = settings.walk;
    this._releasing = true;
    this._death = 0;
    const inner = getColor(c.colorInner);
    const outer = getColor(c.colorOuter);
    _pos.copy(this.group.position).setY(this.deckHeight);
    this.ctx.bursts.spawn(BurstMode.AIR, _pos, {
      radius: 0.5,
      endRadius: 3.5,
      life: 0.55,
      intensity: 1.0 * settings.global.glow,
      fresnel: c.fresnel,
      displace: 0.3,
      colorA: outer,
      colorB: inner,
      colorC: inner
    });
    this.ctx.shake.add(0.12 * c.landShake * settings.global.explosionIntensity, 0.75, 18);
  }

  /** Instant remove — used on hard cancel / dismount complete. */
  cancel() {
    this._retire();
  }

  /**
   * Hide vehicle and clear VFX. Mesh stays loaded for next deploy;
   * group is not in the playable scene (visible=false).
   */
  _retire() {
    this.group.visible = false;
    this._releasing = false;
    this._birth = 0;
    this._death = 0;
    this._bank = 0;
    this.boardRoot.scale.setScalar(0.01);
    if (this.light) {
      this.ctx.lights.release(this.light);
      this.light = null;
    }
  }

  dispose() {
    this.cancel();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }
}
