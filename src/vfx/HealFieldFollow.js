/**
 * Nature HoT field — slim healing-field.glb under the affected unit.
 * Follows XZ of the target; Y = terrain + pad, never through the ground,
 * always below the ankles.
 */
import { AnimationMixer, Group, LoopRepeat } from 'three';

export const HEAL_FIELD_URL = './models/vfx/heal/healing-field.glb';
const PAD_M = 0.05;
const ANKLE_CLEAR_M = 0.04;

export class HealFieldFollow {
  /**
   * @param {import('three').Scene} scene
   * @param {{ loadGLTF?: (url: string) => Promise<object> }} assets
   */
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this._proto = null;
    this._load = null;
    /** @type {{ root: Group, until: number, target: object, mixer?: object }[]} */
    this._live = [];
  }

  async _loadGltf() {
    if (this.assets?.loadGLTF) return this.assets.loadGLTF(HEAL_FIELD_URL);
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    return loader.loadAsync(HEAL_FIELD_URL);
  }

  async _ensure() {
    if (this._proto) return this._proto;
    if (this._load) return this._load;
    this._load = this._loadGltf()
      .then((gltf) => {
        const src = gltf.scene || gltf.scenes?.[0];
        src.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
            o.frustumCulled = false;
            if (o.material) {
              o.material.transparent = true;
              o.material.depthWrite = false;
              if (o.material.opacity == null || o.material.opacity > 0.92) {
                o.material.opacity = 0.85;
              }
            }
          }
        });
        this._proto = { scene: src, clips: gltf.animations || [] };
        return this._proto;
      })
      .catch((err) => {
        console.warn('[HealField] GLB miss', HEAL_FIELD_URL, err?.message || err);
        this._load = null;
        return null;
      });
    return this._load;
  }

  /**
   * Ground mist disks along a CatmullRom (same spline as travel / totem tether).
   * @param {{ getPoint?: Function, getPointAt?: Function }} curve
   * @param {{ samples?: number, duration?: number, heightSample?: Function }} [opts]
   */
  async attachAlongCurve(curve, opts = {}) {
    if (!curve) return;
    const n = Math.max(2, Math.min(8, Math.round(opts.samples ?? 4)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p =
        typeof curve.getPointAt === 'function'
          ? curve.getPointAt(u)
          : curve.getPoint?.(u);
      if (!p) continue;
      await this.attach({ position: p.clone() }, opts);
    }
  }

  /**
   * @param {object} target  character / mesh with .position
   * @param {{ duration?: number, heightSample?: Function }} [opts]
   */
  async attach(target, opts = {}) {
    if (!target?.position || !this.scene) return;
    const proto = await this._ensure();
    if (!proto) return;
    this.detach(target);
    const root = proto.scene.clone(true);
    root.name = 'NatureHealField';
    this.scene.add(root);
    let mixer = null;
    if (proto.clips[0]) {
      mixer = new AnimationMixer(root);
      const act = mixer.clipAction(proto.clips[0]);
      act.setLoop(LoopRepeat, Infinity).play();
    }
    const rec = {
      root,
      mixer,
      target,
      until: (performance.now() / 1000) + (opts.duration ?? 8),
      heightSample: opts.heightSample || this.heightSample
    };
    this._live.push(rec);
    this._place(rec);
  }

  detach(target) {
    this._live = this._live.filter((r) => {
      if (r.target !== target) return true;
      this.scene.remove(r.root);
      r.mixer?.stopAllAction?.();
      return false;
    });
  }

  setHeightSample(fn) {
    this.heightSample = typeof fn === 'function' ? fn : null;
  }

  _place(rec) {
    const p = rec.target.position;
    if (!p) return;
    const land = rec.heightSample?.(p.x, p.z);
    const terrainY = Number.isFinite(land) ? land : 0;
    const feetY = Number.isFinite(p.y) ? p.y : terrainY;
    // Above terrain, under ankles of the affected unit
    const y = Math.min(feetY - ANKLE_CLEAR_M, terrainY + PAD_M + 0.12);
    rec.root.position.set(p.x, Math.max(terrainY + PAD_M, y), p.z);
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    const now = performance.now() / 1000;
    const keep = [];
    for (const rec of this._live) {
      if (now >= rec.until || !rec.target?.position) {
        this.scene.remove(rec.root);
        rec.mixer?.stopAllAction?.();
        continue;
      }
      rec.mixer?.update(dt);
      this._place(rec);
      keep.push(rec);
    }
    this._live = keep;
  }
}
