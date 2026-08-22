/**
 * Worge shapeshift — same contract as claw weapons.
 *
 * Equip form → hide humanoid kit → spawn animal GLB (MeshMixer, not hero mixer).
 * Forms get **3 skills** + **slot 4 = swap back**.
 * Worge (not generic claw users) also keep **F · R · MMB** on the animal —
 * those extras are why Worge forms beat unenchanted claw forms.
 *
 * Meshes: Quaternius animals already in the harvest catalog (no new pack).
 * Form ids: clawFormEnchant CLAW_FORM_BINDS.
 *
 * @see src/api/clawFormEnchant.js
 * @see src/animation/meshMixer.js
 */
import { Box3, Group, Vector3 } from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshMixer } from '../animation/meshMixer.js';
import { CLAW_FORM_BINDS } from '../api/clawFormEnchant.js';
import { makeGltfLoader } from '../loaders/gltfPipeline.js';

const ANIMAL_DIR = './models/creatures/animals';

/** Available GLBs mapped onto claw form ids. */
export const WORGE_FORM_MESH = Object.freeze({
  bear: { file: 'bull.glb', heightM: 1.55, label: 'Bear' },
  raptor: { file: 'deer.glb', heightM: 1.15, label: 'Raptor' },
  bird: { file: 'stag.glb', heightM: 1.35, label: 'Bird' },
  wolf: { file: 'wolf.glb', heightM: 0.8, label: 'Wolf' },
  cheetah: { file: 'husky.glb', heightM: 0.55, label: 'Cheetah' },
  spider: { file: 'fox.glb', heightM: 0.45, label: 'Spider' }
});

/**
 * 1–3 form weapon skills. Slot 4 is always swap-back (not a 4th attack).
 * Worge extras F/R/MMB — claw-only casters do not get these.
 */
export const WORGE_FORM_SKILLS = Object.freeze({
  bear: {
    slots: ['maul', 'roar', 'swipe'],
    f: 'stun',
    r: 'charge',
    mmb: 'bearMmb'
  },
  wolf: {
    slots: ['bite', 'howl', 'pounce'],
    f: 'howl',
    r: 'bite',
    mmb: 'typhoon'
  },
  raptor: {
    slots: ['pounce', 'shred', 'screech'],
    f: 'pounce',
    r: 'shred',
    mmb: 'pounce'
  },
  bird: {
    slots: ['swoop', 'gust', 'talon'],
    f: 'swoop',
    r: 'gust',
    mmb: 'typhoon'
  },
  cheetah: {
    slots: ['slash', 'sprint', 'rake'],
    f: 'sprint',
    r: 'slash',
    mmb: 'dash'
  },
  spider: {
    slots: ['bite', 'web', 'leap'],
    f: 'web',
    r: 'bite',
    mmb: 'web'
  }
});

export const FORM_SWAP_SLOT = 3;

const TYPHOON = Object.freeze({ outM: 7, upM: 2, halfDeg: 48, rangeM: 8 });

export function getWorgeFormId(character, equipped) {
  return (
    character?.userData?.worgeFormId ||
    equipped?.formId ||
    equipped?.userData?.formId ||
    null
  );
}

export function isWorgeClass(classId) {
  return classId === 'worge';
}

/**
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {import('../animation/CharacterController.js').CharacterController} opts.character
 */
export class WorgeFormPlay {
  constructor(opts) {
    this.scene = opts.scene;
    this.character = opts.character;
    this._loader = opts.loader || makeGltfLoader();
    this.formId = null;
    this.root = null;
    this.meshMixer = null;
    this._worgeExtras = false;
  }

  isActive() {
    return !!this.formId && !!this.root;
  }

  skills() {
    return WORGE_FORM_SKILLS[this.formId] || null;
  }

  /**
   * Hide Toon kit, spawn animal. Hero mixer stays on the kit (idle, frozen).
   * Animal uses MeshMixer.
   */
  async enter(formId, { worgeExtras = true } = {}) {
    if (!WORGE_FORM_MESH[formId]) return { ok: false, reason: 'unknown form' };
    await this.exit({ silent: true });
    const spec = WORGE_FORM_MESH[formId];
    const url = `${ANIMAL_DIR}/${spec.file}`;
    let gltf;
    try {
      gltf = await this._loader.loadAsync(url);
    } catch (e) {
      return { ok: false, reason: e?.message || 'mesh 404' };
    }
    const src = gltf.scene || gltf.scenes?.[0];
    if (!src) return { ok: false, reason: 'empty gltf' };
    const clone = skeletonClone(src);
    const box = new Box3().setFromObject(clone);
    const h = Math.max(0.2, box.max.y - box.min.y);
    const s = spec.heightM / h;
    clone.scale.multiplyScalar(s);
    clone.position.set(0, -box.min.y * s, 0);

    const hold = new Group();
    hold.name = `worge-form-${formId}`;
    hold.add(clone);
    const kit = this.character.model || this.character.root;
    if (this.character.model) this.character.model.visible = false;
    this.character.root.add(hold);

    const mixer = new MeshMixer(clone);
    const clips = gltf.animations || [];
    for (const clip of clips) {
      const n = String(clip.name || '');
      const idle = /idle/i.test(n);
      const run = /run|walk/i.test(n);
      const atk = /attack/i.test(n);
      mixer.addClip(clip, idle ? 'idle' : run ? 'run' : atk ? 'attack' : null, {
        once: !!atk
      });
    }
    mixer.play('idle', 0.08);

    this.root = hold;
    this.meshMixer = mixer;
    this.formId = formId;
    this._worgeExtras = !!worgeExtras;
    this.character.userData = this.character.userData || {};
    this.character.userData.worgeFormId = formId;
    this.character.setGait?.(0, false);
    return { ok: true, formId, extras: this._worgeExtras };
  }

  exit({ silent } = {}) {
    if (this.meshMixer) {
      this.meshMixer.dispose();
      this.meshMixer = null;
    }
    if (this.root) {
      this.root.removeFromParent();
      this.root = null;
    }
    if (this.character?.model) this.character.model.visible = true;
    if (this.character?.userData) this.character.userData.worgeFormId = null;
    this.formId = null;
    this._worgeExtras = false;
    return { ok: true, silent: !!silent };
  }

  /** Gait → animal idle/run. */
  update(dt, moving) {
    this.meshMixer?.update(dt);
    if (!this.meshMixer) return;
    const want = moving ? 'run' : 'idle';
    if (this.meshMixer.current !== this.meshMixer.actions.get(want)) {
      this.meshMixer.play(want, 0.12);
    }
  }

  playAttack() {
    return this.meshMixer?.play('attack', 0.08) || false;
  }
}

/**
 * Typhoon: cone in front, 7 m out, 2 m up, **no damage**.
 * @param {object[]} targets
 * @param {Vector3} origin
 * @param {Vector3} forward
 */
export function applyTyphoonCone(targets, origin, forward, opts = {}) {
  const outM = opts.outM ?? TYPHOON.outM;
  const upM = opts.upM ?? TYPHOON.upM;
  const range = opts.rangeM ?? TYPHOON.rangeM;
  const cos = Math.cos(((opts.halfDeg ?? TYPHOON.halfDeg) * Math.PI) / 180);
  const fwd = forward.clone();
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
  else fwd.normalize();
  let n = 0;
  const _d = new Vector3();
  for (const t of targets || []) {
    if (!t?.mesh || t.kind === 'aim' || t.kind === 'ally') continue;
    const p = t.point || t.mesh.position;
    _d.set(p.x - origin.x, 0, p.z - origin.z);
    const dist = _d.length();
    if (dist > range || dist < 0.15) continue;
    _d.multiplyScalar(1 / dist);
    if (_d.dot(fwd) < cos) continue;
    t.mesh.position.x += _d.x * outM;
    t.mesh.position.z += _d.z * outM;
    t.mesh.position.y += upM;
    t.mesh.userData = t.mesh.userData || {};
    t.mesh.userData.knockupVy = upM;
    n += 1;
  }
  return n;
}

export { CLAW_FORM_BINDS, TYPHOON };
