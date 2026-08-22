/**
 * Toon RTS WK cavalry mount — Elden Ring–style summon + land ride.
 *
 * Extends WalkController seat-parent + RideIK (hero one mixer).
 * Horse group has a MeshMixer (vehicle law — not the hero mixer).
 *
 * Source: WK_Cavalry_customizable.FBX → models/grudge6/mounts/western-kingdoms/cavalry.glb
 * Hide in-kit rider meshes; attach player to seat.
 *
 * @see grudge6-toon-rts-mounts-siege · docs/BACK_SLOT_MOBILITY_SSOT.md
 */
import {
  Box3,
  Group,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from 'three';
import { MeshMixer } from '../animation/meshMixer.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { clamp } from '../utils/math.js';
import { sameOriginFleetUrl } from '../config/fleetEnv.js';

const KIT_DIR = './models/grudge6/mounts/western-kingdoms';
const CDN_DIR = sameOriginFleetUrl(
  'https://assets.grudge-studio.com/models/grudge6/mounts/western-kingdoms'
);

export const WK_CAVALRY_URL = `${KIT_DIR}/cavalry.glb`;
export const WK_CAVALRY_CDN = `${CDN_DIR}/cavalry.glb`;
const CLIP_URLS = {
  idle: [`${KIT_DIR}/cavalry_idle.glb`, `${CDN_DIR}/cavalry_idle.glb`],
  run: [`${KIT_DIR}/cavalry_run.glb`, `${CDN_DIR}/cavalry_run.glb`]
};
const HORSE_TEX = [`${KIT_DIR}/WK_Horse_A.png`, `${CDN_DIR}/WK_Horse_A.png`];

const SEAT_NAMES = [
  'WK_horse_Seat',
  'Bone_Mount',
  'Mount_Seat',
  'Seat',
  'Bone_seat',
  'Rider_attach',
  'Bip002',
  'Bip001 Spine',
  'Bip001_Spine'
];

const _box = new Box3();
const _p = new Vector3();
const _fwd = new Vector3();
const _move = new Vector3();

function isRiderMesh(name) {
  const n = String(name || '').toLowerCase();
  if (/horse|saddle|tail|mane|rein|stirrup|hoof/.test(n)) return false;
  return /units_|body_|arms_|legs_|head_|weapon|shield|cape|helmet|wk_units/.test(n);
}

function findNamed(root, names) {
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

export class HorseMount {
  /**
   * @param {import('../animation/CharacterController.js').CharacterController} character
   * @param {object} ctx { scene, assets, physics, session, camera, heightSample }
   */
  constructor(character, ctx) {
    this.character = character;
    this.ctx = ctx;
    this.group = new Group();
    this.group.name = 'HorseMount';
    this.root = null;
    this.seat = null;
    this.meshMixer = null;
    this.mixer = null;
    this.actions = new Map();
    this.ready = false;
    this.mounted = false;
    this.phase = 'idle'; // idle | summon | mounted | dismiss
    this._t = 0;
    this._yaw = 0;
    this._vx = 0;
    this._vz = 0;
    this._from = new Vector3();
    this._side = new Vector3();
    ctx.scene.add(this.group);
  }

  get active() {
    return this.phase !== 'idle';
  }

  async load() {
    if (this.ready) return this;
    const assets = this.ctx.assets;
    let gltf;
    try {
      gltf = await assets.loadGLTF(WK_CAVALRY_URL);
    } catch {
      gltf = await assets.loadGLTF(WK_CAVALRY_CDN);
    }
    const scene = gltf.scene || gltf.scenes?.[0];
    if (!scene) throw new Error('cavalry glb empty');
    const skinned = (() => {
      let hit = null;
      scene.traverse((o) => {
        if (!hit && o.isSkinnedMesh) hit = o;
      });
      return hit;
    })();
    const clone = skinned ? skeletonClone(scene) : scene.clone(true);
    clone.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (isRiderMesh(o.name)) {
          o.visible = false;
          o.userData.cavalryRider = true;
        }
      }
    });
    _box.setFromObject(clone);
    if (Number.isFinite(_box.min.y)) clone.position.y -= _box.min.y;
    this.root = clone;
    this.group.add(clone);
    this.seat = findNamed(clone, SEAT_NAMES);
    if (!this.seat) {
      this.seat = new Group();
      this.seat.name = 'Mount_Seat';
      _box.setFromObject(clone);
      this.seat.position.set(0, Math.max(0.85, _box.max.y * 0.55), 0.05);
      clone.add(this.seat);
    }
    this.meshMixer = new MeshMixer(clone);
    this.mixer = this.meshMixer.mixer;
    this.actions = this.meshMixer.actions;
    await this._bindHorseAtlas(clone);
    await this._loadClips(assets, clone, gltf.animations || []);
    this.meshMixer.play('idle', 0.08);
    this.group.visible = false;
    this.ready = true;
    return this;
  }

  async _bindHorseAtlas(root) {
    let tex = null;
    for (const url of HORSE_TEX) {
      try {
        tex = await new Promise((resolve, reject) => {
          new TextureLoader().load(url, resolve, undefined, reject);
        });
        break;
      } catch {
        tex = null;
      }
    }
    if (!tex) return;
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const n = String(o.name || '');
      if (!/horse/i.test(n) || /seat/i.test(n)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.map = tex;
        m.color?.set?.('#ffffff');
        m.needsUpdate = true;
      }
    });
  }

  async _loadClips(assets, target, embedded) {
    const add = (clip, role) => {
      if (!clip || !this.meshMixer) return;
      this.meshMixer.addClip(clip, role);
    };
    for (const clip of embedded) {
      const n = String(clip.name || '');
      if (/idle/i.test(n)) add(clip, 'idle');
      else if (/run|gallop|walk/i.test(n)) add(clip, 'run');
      else add(clip, null);
    }
    for (const [role, urls] of Object.entries(CLIP_URLS)) {
      if (this.actions.has(role)) continue;
      for (const url of urls) {
        try {
          const extra = await assets.loadGLTF(url);
          const clip = extra.animations?.[0];
          if (clip) {
            clip.name = role;
            add(clip, role);
          }
          break;
        } catch {
          /* try next url */
        }
      }
    }
  }

  /**
   * Elden Ring–style: spawn behind, approach left hip, hop on.
   */
  async summon() {
    if (this.mounted) {
      this.dismount();
      return 'dismount';
    }
    await this.load();
    const feet = this.character.getWorldPosition?.() || this.character.root.position;
    this._yaw = this.character.facing || 0;
    const behind = new Vector3(
      feet.x - Math.sin(this._yaw) * 6.5,
      feet.y,
      feet.z - Math.cos(this._yaw) * 6.5
    );
    this._from.copy(behind);
    this._side.set(
      feet.x + Math.cos(this._yaw) * 1.35 - Math.sin(this._yaw) * 0.4,
      feet.y,
      feet.z - Math.sin(this._yaw) * 1.35 - Math.cos(this._yaw) * 0.4
    );
    this.group.position.copy(behind);
    this.group.rotation.y = this._yaw;
    this.group.visible = true;
    this.phase = 'summon';
    this._t = 0;
    this._play('run') || this._play('idle');
    return 'summon';
  }

  dismount() {
    if (!this.mounted && this.phase === 'idle') return;
    this._unparent();
    this.phase = 'dismiss';
    this._t = 0;
    this._play('run') || this._play('idle');
    const away = new Vector3(
      this.group.position.x - Math.sin(this._yaw) * 10,
      this.group.position.y,
      this.group.position.z - Math.cos(this._yaw) * 10
    );
    this._side.copy(away);
  }

  _play(key) {
    return this.meshMixer?.play(key, 0.12) || false;
  }

  _parent() {
    if (!this.seat) return;
    this.seat.updateWorldMatrix(true, true);
    if (this.character.root.parent !== this.seat) {
      this.seat.attach(this.character.root);
    }
    this.character.root.position.set(0, 0.06, 0.02);
    this.character.root.rotation.set(0, 0, 0);
    this.character.root.scale.set(1, 1, 1);
    this.character.setRideParented?.(true);
    this.character.setRideActive?.(true, this._yaw);
    this.mounted = true;
  }

  _unparent() {
    if (!this.mounted && this.character.root.parent !== this.ctx.scene) {
      this.ctx.scene.attach(this.character.root);
      return;
    }
    this.character.root.updateWorldMatrix(true, false);
    this.character.root.getWorldPosition(_p);
    this.ctx.scene.attach(this.character.root);
    this.character.setRideParented?.(false);
    this.character.setRideActive?.(false);
    const y = this.ctx.heightSample?.(_p.x, _p.z) ?? _p.y;
    this.character.root.position.set(_p.x + Math.cos(this._yaw) * 0.9, y, _p.z - Math.sin(this._yaw) * 0.9);
    this.character.root.rotation.set(0, this._yaw, 0);
    this.mounted = false;
    this.ctx.physics?.setPlayerFeet?.(
      this.character.root.position.x,
      this.character.root.position.y,
      this.character.root.position.z
    );
  }

  /**
   * @param {number} dt
   * @param {Set<string>} keys
   */
  update(dt, keys) {
    this.meshMixer?.update(dt);
    if (this.phase === 'idle') return;

    if (this.phase === 'summon') {
      this._t += dt;
      const u = clamp(this._t / 1.65, 0, 1);
      if (u < 0.76) {
        const t = u / 0.76;
        this.group.position.lerpVectors(this._from, this._side, t);
      } else {
        const t = (u - 0.76) / 0.24;
        const feet = this.character.getWorldPosition?.() || this.character.root.position;
        this.group.position.lerpVectors(this._side, feet, t * 0.55);
      }
      const landY = this.ctx.heightSample?.(this.group.position.x, this.group.position.z);
      if (Number.isFinite(landY)) this.group.position.y = landY;
      this.group.rotation.y = this._yaw;
      if (this._t >= 1.65) {
        this.phase = 'mounted';
        this._parent();
        this._play('idle');
      }
      return;
    }

    if (this.phase === 'dismiss') {
      this._t += dt;
      const u = clamp(this._t / 1.4, 0, 1);
      this.group.position.lerp(this._side, 1 - Math.exp(-4 * dt));
      const landY = this.ctx.heightSample?.(this.group.position.x, this.group.position.z);
      if (Number.isFinite(landY)) this.group.position.y = landY;
      if (u >= 1) {
        this.group.visible = false;
        this.phase = 'idle';
      }
      return;
    }

    if (this.phase !== 'mounted') return;

    const cam = this.ctx.camera;
    if (cam) {
      cam.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
      else _fwd.normalize();
    } else {
      _fwd.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    }
    let ix = 0;
    let iz = 0;
    if (keys?.has('KeyW') || keys?.has('ArrowUp')) iz -= 1;
    if (keys?.has('KeyS') || keys?.has('ArrowDown')) iz += 1;
    if (keys?.has('KeyA') || keys?.has('ArrowLeft')) ix += 1;
    if (keys?.has('KeyD') || keys?.has('ArrowRight')) ix -= 1;
    const sprint = keys?.has('ShiftLeft') || keys?.has('ShiftRight');
    _move.set(_fwd.x * -iz + _fwd.z * ix, 0, _fwd.z * -iz + -_fwd.x * ix);
    const moving = _move.lengthSq() > 1e-6;
    if (moving) _move.normalize();
    const speed = sprint ? 12.5 : 6.4;
    const wantX = moving ? _move.x * speed : 0;
    const wantZ = moving ? _move.z * speed : 0;
    const blend = Math.min(1, dt * (moving ? 16 : 12));
    this._vx += (wantX - this._vx) * blend;
    this._vz += (wantZ - this._vz) * blend;
    this.group.position.x += this._vx * dt;
    this.group.position.z += this._vz * dt;
    const y = this.ctx.heightSample?.(this.group.position.x, this.group.position.z);
    if (Number.isFinite(y)) this.group.position.y = y;
    if (this._vx * this._vx + this._vz * this._vz > 0.4) {
      this._yaw = Math.atan2(this._vx, this._vz);
      this.group.rotation.y = this._yaw;
      this._play('run') || this._play('idle');
    } else {
      this._play('idle');
    }
    this.character.setRideActive?.(true, this._yaw);
    this.ctx.physics?.setPlayerFeet?.(
      this.group.position.x,
      this.group.position.y,
      this.group.position.z
    );
  }
}

export default HorseMount;
