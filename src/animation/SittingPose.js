import { MathUtils, Quaternion, Vector3 } from 'three';
import { settings } from '../config/settings.js';

/**
 * SittingPose — a procedural cross-legged meditation pose.
 *
 * Authored against Mixamo-style short bone names (Hips, LeftArm, …) and also
 * accepts grudge6 **Bip001** skeletons via `toMixamoShort()` (Pelvis→Hips,
 * L UpperArm→LeftArm, …). The seated pose is code-authored rather than a
 * second clip. Every joint is described in a *rig-relative* frame
 * (forward / up / left, derived from the bind pose) which makes the table
 * readable and keeps it independent of which way the rig happens to face:
 *
 *  - `dir`   the world direction the bone should point at (bone → child).
 *            Absolute, so tweaking the thigh never drags the shin off target.
 *  - `twist` roll around that direction, in degrees.
 *  - `rot`   a list of [axis, degrees] rotations carried in the bone's own
 *            frame — used where a bone has no meaningful child direction
 *            (the hips) or where the parent's orientation should be inherited
 *            (the fingers).
 *
 * Only the left side is authored; the right is mirrored across the sagittal
 * plane, which keeps `right` angles and flips `up` / `forward` / `twist`.
 *
 * The result is baked once into a per-bone target transform, then blended
 * against the live animation every frame by `apply()`, so the character can
 * cross-fade between the idle clip and the sit without a second AnimationMixer.
 */

const DEG = MathUtils.DEG2RAD;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Pose table                                                          */
/* ------------------------------------------------------------------ */

/** Spine chain — mostly upright, with the pelvis rolled back onto the sit bones. */
const CENTER = {
  Hips: { rot: [['right', 10]] },
  Spine: { dir: [0.07, 1, 0] },
  Spine1: { dir: [0.02, 1, 0] },
  Spine2: { dir: [-0.02, 1, 0], child: 'Neck' },
  Neck: { dir: [0.09, 1, 0] },
  Head: { dir: [0.17, 1, 0] }
};

/** Left-side limbs; the right side is mirrored. Directions are [forward, up, left]. */
const LIMB = {
  // Thigh out and forward, barely sloping: the seat carries the weight, so the
  // knee ends up just clear of the floor rather than driven into it.
  UpLeg: { dir: [0.58, -0.05, 0.72], twist: 16 },
  // Shin folded back across the midline, ankle tucked in front of the pelvis.
  Leg: { dir: [-0.24, -0.08, -0.94] },
  // Foot rolled onto its outer edge, the way it lies when the legs are crossed.
  Foot: { dir: [0.3, 0.12, -0.94], twist: -90 },
  ToeBase: { dir: [0.42, 0.1, -0.9] },

  Shoulder: { dir: [0.05, -0.14, 0.98] },
  // Arms are only a starting guess — the IK pass below lands the wrists on the
  // knees, wherever the leg tuning has put them.
  Arm: { dir: [0.1, -0.88, 0.46], twist: -10 },
  ForeArm: { dir: [0.6, -0.52, 0.6] },
  Hand: { dir: [0.88, -0.12, 0.46], twist: -78, child: 'HandMiddle1' },

  ...fingers()
};

/** Relaxed open hand: a light curl on each joint, the thumb drawn in slightly. */
function fingers() {
  const curls = {
    Index: [14, 20, 12],
    Middle: [18, 24, 14],
    Ring: [22, 28, 16],
    Pinky: [26, 32, 18]
  };
  const out = {
    HandThumb1: { rot: [['up', -14], ['forward', -8]] },
    HandThumb2: { rot: [['forward', -12]] },
    HandThumb3: { rot: [['forward', -8]] }
  };
  for (const [finger, joints] of Object.entries(curls)) {
    joints.forEach((angle, index) => {
      out[`Hand${finger}${index + 1}`] = { rot: [['forward', -angle]] };
    });
  }
  return out;
}

/** Bones that ride the breath, and how many degrees they move at full amplitude. */
const BREATH = {
  Spine: 0.5,
  Spine1: 0.7,
  Spine2: 0.6,
  Neck: -0.35,
  Head: -0.3,
  LeftShoulder: 0.4,
  RightShoulder: 0.4
};

/* ------------------------------------------------------------------ */

const _dir = new Vector3();
const _from = new Vector3();
const _pos = new Vector3();
const _axis = new Vector3();
const _scale = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _qd = new Quaternion();

export class SittingPose {
  /**
   * @param {import('three').Object3D} model  the loaded rig, still in bind pose
   */
  constructor(model) {
    this.model = model;
    this.bones = new Map(); // short name (namespace stripped) → Bone
    this.rest = new Map(); // Bone → { quaternion, position, world }
    this.entries = []; // hierarchy-ordered list of posed bones
    this.hips = null;
    this.hipsTarget = new Vector3();
    this.skin = null;
    this.skinStride = 1;
    this.valid = false;
    this._tuning = null;

    this._collect();
    if (this.valid) this.build();
  }

  /* ---------------------------------------------------------------- */
  /* setup                                                             */
  /* ---------------------------------------------------------------- */

  /** Index the skeleton, snapshot the bind pose and derive the rig's axes. */
  _collect() {
    this.model.updateMatrixWorld(true);
    // Where the rig's own origin sits while it is standing on the floor. Every
    // later bake measures the ground relative to this, so moving the character
    // does not drag the seated pose off the floor with it.
    this.modelBaseY = this.model.getWorldPosition(new Vector3()).y;

    this.model.traverse((node) => {
      if (node.isSkinnedMesh && !this.skin) {
        this.skin = node;
        // ~12k samples is plenty to find the floor contact on any rig.
        this.skinStride = Math.max(1, Math.ceil(node.geometry.attributes.position.count / 12000));
      }
      if (!node.isBone) return;
      // Mixamo: "mixamorig:LeftArm" / "mixamorigLeftArm". Bip001: "Bip001 L UpperArm".
      const raw = node.name.split(':').pop().replace(/^mixamorig/i, '');
      const short = toMixamoShort(raw);
      if (!this.bones.has(short)) this.bones.set(short, node);

      this.rest.set(node, {
        quaternion: node.quaternion.clone(),
        position: node.position.clone(),
        world: node.getWorldQuaternion(new Quaternion())
      });

      const spec = resolveSpec(short);
      if (spec) this.entries.push({ bone: node, short, ...spec, target: new Quaternion() });
    });

    this.hips = this.bones.get('Hips') ?? null;
    if (!this.hips || this.entries.length === 0) {
      console.warn('[SittingPose] no Hips/Pelvis skeleton — sitting disabled');
      return;
    }

    // Rig-relative basis. The heel → toe vector is the most reliable indicator
    // of facing on a bind pose that may not be axis aligned.
    this.up = new Vector3(0, 1, 0);
    this.forward = new Vector3(0, 0, 1);
    const foot = this.bones.get('LeftFoot');
    const toe = this.bones.get('LeftToeBase');
    if (foot && toe) {
      toe.getWorldPosition(_dir).sub(foot.getWorldPosition(_pos)).setY(0);
      if (_dir.lengthSq() > 1e-6) this.forward.copy(_dir).normalize();
    }
    this.left = new Vector3().crossVectors(this.up, this.forward).normalize();
    this.axes = { forward: this.forward, up: this.up, left: this.left, right: this.left.clone().negate() };

    this.hipsRest = this.rest.get(this.hips).position.clone();
    this.valid = true;
  }

  /* ---------------------------------------------------------------- */
  /* baking                                                            */
  /* ---------------------------------------------------------------- */

  /** True when a tuning value the baked pose depends on has been edited. */
  get stale() {
    const c = settings.character;
    const t = this._tuning;
    return (
      !t ||
      t.legSpread !== c.legSpread ||
      t.torsoLean !== c.torsoLean ||
      t.seatClearance !== c.seatClearance ||
      t.handsOnKnees !== c.handsOnKnees ||
      t.handHeight !== c.handHeight
    );
  }

  /**
   * Evaluate the pose table onto the skeleton, ground it, solve the arms and
   * snapshot the result. The rig is left back in its bind pose afterwards —
   * the mixer overwrites it on the next frame either way.
   */
  build() {
    const c = settings.character;
    this._tuning = {
      legSpread: c.legSpread,
      torsoLean: c.torsoLean,
      seatClearance: c.seatClearance,
      handsOnKnees: c.handsOnKnees,
      handHeight: c.handHeight
    };

    this._restore();

    for (const entry of this.entries) this._applySpec(entry);
    this._ground();
    if (c.handsOnKnees) this._solveArms();

    for (const entry of this.entries) entry.target.copy(entry.bone.quaternion);
    this.hipsTarget.copy(this.hips.position);

    this._prepareBreathing();
    this._restore();
  }

  /** Put every bone back on its bind transform. */
  _restore() {
    for (const [bone, rest] of this.rest) {
      bone.quaternion.copy(rest.quaternion);
      bone.position.copy(rest.position);
    }
    this.model.updateMatrixWorld(true);
  }

  _applySpec(entry) {
    const { bone, spec, sign } = entry;

    if (spec.dir) {
      const child = this._childOf(entry);
      if (child) {
        _dir.set(0, 0, 0)
          .addScaledVector(this.forward, spec.dir[0])
          .addScaledVector(this.up, spec.dir[1])
          .addScaledVector(this.left, spec.dir[2] * sign);
        if (entry.short.endsWith('UpLeg')) {
          // Widening the lotus only makes sense on the thighs.
          _dir.addScaledVector(this.left, spec.dir[2] * sign * (settings.character.legSpread - 1));
        }
        this._orient(bone, child, _dir.normalize(), (spec.twist ?? 0) * sign);
      }
    }

    if (spec.rot) this._rotate(bone, spec.rot, sign);

    if (entry.short === 'Hips' && settings.character.torsoLean) {
      this._rotate(bone, [['right', -settings.character.torsoLean]], 1);
    }
  }

  /** Aim `bone` (measured towards `child`) along a world direction, then roll it. */
  _orient(bone, child, targetDir, twistDeg) {
    child.getWorldPosition(_from).sub(bone.getWorldPosition(_pos));
    if (_from.lengthSq() < 1e-10) return;
    _from.normalize();

    bone.getWorldQuaternion(_qa);
    _qb.setFromUnitVectors(_from, targetDir);
    if (twistDeg) {
      _qc.setFromAxisAngle(targetDir, twistDeg * DEG);
      _qb.premultiply(_qc);
    }
    _qa.premultiply(_qb); // final world orientation

    bone.parent.getWorldQuaternion(_qd).invert();
    bone.quaternion.copy(_qd.multiply(_qa));
    bone.updateMatrixWorld(true);
  }

  /**
   * Rotate `bone` about rig axes expressed in its *bind* frame, so the rotation
   * is carried along by whatever the parents are already doing.
   */
  _rotate(bone, list, sign) {
    const restWorld = this.rest.get(bone).world;
    _qd.copy(restWorld).invert();

    bone.getWorldQuaternion(_qa);
    for (const [name, degrees] of list) {
      const flip = name === 'right' ? 1 : sign; // mirroring keeps left/right bends
      _axis.copy(this.axes[name]).applyQuaternion(_qd);
      _qb.setFromAxisAngle(_axis, degrees * flip * DEG);
      _qa.multiply(_qb);
    }

    bone.parent.getWorldQuaternion(_qc).invert();
    bone.quaternion.copy(_qc.multiply(_qa));
    bone.updateMatrixWorld(true);
  }

  _childOf(entry) {
    if (entry.spec.child) {
      const named = this.bones.get(entry.side + entry.spec.child) ?? this.bones.get(entry.spec.child);
      if (named) return named;
    }
    return entry.bone.children.find((node) => node.isBone) ?? null;
  }

  /** Drop the hips until the seat and the folded legs rest on the floor. */
  _ground() {
    this.model.updateMatrixWorld(true);

    const lowest = this._lowestPoint();
    if (!Number.isFinite(lowest)) return;

    // Measured against the floor *under the rig*, not world zero: a re-bake can
    // land while walk mode has the character airborne on the air scooter, and
    // the pose still has to be grounded on the ground he will come back to.
    const base = this.model.getWorldPosition(_from).y - this.modelBaseY;

    this.hips.parent.matrixWorld.decompose(_pos, _qa, _scale);
    const unit = Math.max(1e-6, _scale.y); // world metres per bone unit
    this.hips.position.y = this.hipsRest.y + (settings.character.seatClearance - (lowest - base)) / unit;
    this.model.updateMatrixWorld(true);
  }

  /**
   * Lowest skinned vertex, in world space. Joint centres sit inside the body,
   * so grounding on them alone leaves the character hovering — this walks the
   * deformed mesh instead (once per bake, strided on dense meshes).
   */
  _lowestPoint() {
    if (!this.skin) return Infinity;

    const position = this.skin.geometry.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < position.count; i += this.skinStride) {
      _pos.fromBufferAttribute(position, i);
      this.skin.applyBoneTransform(i, _pos).applyMatrix4(this.skin.matrixWorld);
      if (_pos.y < lowest) lowest = _pos.y;
    }
    return lowest;
  }

  /**
   * Two-bone IK that parks each wrist on top of the knee. The legs move a lot
   * with `legSpread`, so solving beats hand-authored arm angles here.
   */
  _solveArms() {
    for (const side of ['Left', 'Right']) {
      const shoulder = this.bones.get(`${side}Arm`);
      const elbow = this.bones.get(`${side}ForeArm`);
      const wrist = this.bones.get(`${side}Hand`);
      const knee = this.bones.get(`${side}Leg`);
      if (!shoulder || !elbow || !wrist || !knee) continue;

      const sign = side === 'Left' ? 1 : -1;
      const root = shoulder.getWorldPosition(new Vector3());
      const upper = elbow.getWorldPosition(new Vector3()).distanceTo(root);
      const lower = wrist.getWorldPosition(new Vector3()).distanceTo(elbow.getWorldPosition(_pos));

      // Palms rest on the kneecap: above the joint centre, and pulled back
      // along the thigh so the hand covers the knee instead of hanging off it.
      const kneePos = knee.getWorldPosition(new Vector3());
      const thigh = kneePos.clone().sub(knee.parent.getWorldPosition(_pos)).normalize();
      const target = kneePos
        .clone()
        .addScaledVector(this.up, settings.character.handHeight)
        .addScaledVector(thigh, -0.07);

      const toTarget = new Vector3().subVectors(target, root);
      const reach = MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);
      toTarget.normalize();

      // Elbows swing out and back, away from the ribs; the hint is projected
      // onto the plane perpendicular to the shoulder → wrist line.
      const pole = new Vector3().addScaledVector(this.left, 0.75 * sign).addScaledVector(this.forward, -0.66);
      pole.addScaledVector(toTarget, -pole.dot(toTarget));
      if (pole.lengthSq() < 1e-8) pole.copy(this.up);
      pole.normalize();

      const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
      const out = Math.sqrt(Math.max(0, upper * upper - along * along));
      const elbowPos = root.clone().addScaledVector(toTarget, along).addScaledVector(pole, out);

      this._orient(shoulder, elbow, elbowPos.clone().sub(root).normalize(), 0);
      this._orient(elbow, wrist, target.clone().sub(elbow.getWorldPosition(_pos)).normalize(), 0);

      // Re-aim the hand so the palm keeps its authored roll after the IK.
      const handEntry = this.entries.find((entry) => entry.bone === wrist);
      if (handEntry) this._applySpec(handEntry);
    }
  }

  /** Cache, per breathing bone, the rig's lateral axis expressed in bind space. */
  _prepareBreathing() {
    this.breath = [];
    for (const [name, degrees] of Object.entries(BREATH)) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      const axis = this.axes.right.clone().applyQuaternion(_qa.copy(this.rest.get(bone).world).invert());
      this.breath.push({ bone, axis, amount: degrees * DEG });
    }
  }

  /* ---------------------------------------------------------------- */
  /* runtime                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Blend the baked pose over whatever the mixer just wrote.
   *
   * @param {number} weight 0 = untouched animation, 1 = fully seated
   * @param {number} time   seconds, drives the breathing
   */
  apply(weight, time) {
    if (!this.valid || weight <= 0) return;

    for (const entry of this.entries) entry.bone.quaternion.slerp(entry.target, weight);
    this.hips.position.lerp(this.hipsTarget, weight);

    const c = settings.character;
    const amplitude = c.breathing * weight;
    if (amplitude <= 0) return;

    const breath = Math.sin(time * c.breathRate * TAU);
    for (const { bone, axis, amount } of this.breath) {
      _qa.setFromAxisAngle(axis, breath * amount * amplitude);
      bone.quaternion.multiply(_qa);
    }
    // The whole body lifts a hair on the inhale.
    this.hips.position.y += breath * 0.004 * amplitude;
  }
}

/** Match a bone name against the pose table, resolving side and mirroring. */
/**
 * Map grudge6 Bip001 / Mixamo raw names onto the Mixamo short names used by
 * the pose tables (Hips, LeftArm, LeftUpLeg, …).
 */
function toMixamoShort(name) {
  let n = String(name || '').trim();
  // Strip Bip001 prefix: "Bip001 Pelvis" / "Bip001_L_UpperArm" / "Bip001 L UpperArm"
  n = n.replace(/^Bip001[\s._-]*/i, '');
  n = n.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();

  const lower = n.toLowerCase();
  const BIP_MAP = {
    pelvis: 'Hips',
    hips: 'Hips',
    spine: 'Spine',
    spine1: 'Spine1',
    spine2: 'Spine2',
    neck: 'Neck',
    head: 'Head',
    'l clavicle': 'LeftShoulder',
    'r clavicle': 'RightShoulder',
    'l upperarm': 'LeftArm',
    'r upperarm': 'RightArm',
    'l forearm': 'LeftForeArm',
    'r forearm': 'RightForeArm',
    'l hand': 'LeftHand',
    'r hand': 'RightHand',
    'l thigh': 'LeftUpLeg',
    'r thigh': 'RightUpLeg',
    'l calf': 'LeftLeg',
    'r calf': 'RightLeg',
    'l foot': 'LeftFoot',
    'r foot': 'RightFoot',
    'l toe0': 'LeftToeBase',
    'r toe0': 'RightToeBase',
    'l toe': 'LeftToeBase',
    'r toe': 'RightToeBase'
  };
  if (BIP_MAP[lower]) return BIP_MAP[lower];

  // Already Mixamo-ish (LeftArm, Hips, …)
  return n.replace(/\s+/g, '');
}

function resolveSpec(short) {
  if (CENTER[short]) return { spec: CENTER[short], sign: 1, side: '' };
  for (const side of ['Left', 'Right']) {
    if (!short.startsWith(side)) continue;
    const spec = LIMB[short.slice(side.length)];
    if (spec) return { spec, sign: side === 'Left' ? 1 : -1, side };
  }
  return null;
}
