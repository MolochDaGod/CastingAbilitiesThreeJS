/**
 * Mixamo (and other humanoid) clips → **one** play skeleton: Bip001.
 *
 * Best API: three r185 `SkeletonUtils.retargetClip` (bind-pose aware).
 * Fallback: `rematchClipToSkeleton` (name rewrite + rotation-only).
 *
 * Play body stays Toon `loadRaceKit` / `deployToonPlayKit`. One mixer.
 * Do not play mixamorig tracks on Bip001 without this pass.
 */
import { AnimationClip, SkinnedMesh, Skeleton, BufferGeometry, MeshBasicMaterial } from 'three';
import { retargetClip as suRetargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rematchClipToSkeleton, toRotationOnlyClip, normalizeBoneKey } from './bakeClip.js';

export const MIN_RETARGET_TRACKS = 6;

/** Mixamo core (after mixamorig prefix) → Bip001 bone. */
export const MIXAMO_CORE_TO_BIP001 = Object.freeze({
  Hips: 'Bip001 Pelvis',
  Spine: 'Bip001 Spine',
  Spine1: 'Bip001 Spine1',
  Spine2: 'Bip001 Spine2',
  Neck: 'Bip001 Neck',
  Head: 'Bip001 Head',
  LeftShoulder: 'Bip001 L Clavicle',
  LeftArm: 'Bip001 L UpperArm',
  LeftForeArm: 'Bip001 L Forearm',
  LeftHand: 'Bip001 L Hand',
  RightShoulder: 'Bip001 R Clavicle',
  RightArm: 'Bip001 R UpperArm',
  RightForeArm: 'Bip001 R Forearm',
  RightHand: 'Bip001 R Hand',
  LeftUpLeg: 'Bip001 L Thigh',
  LeftLeg: 'Bip001 L Calf',
  LeftFoot: 'Bip001 L Foot',
  LeftToeBase: 'Bip001 L Toe0',
  RightUpLeg: 'Bip001 R Thigh',
  RightLeg: 'Bip001 R Calf',
  RightFoot: 'Bip001 R Foot',
  RightToeBase: 'Bip001 R Toe0',
});

/** Bandai / One Piece `Body_*` → Bip001 (Danger Room family `bandai`). */
export const BANDAI_TO_BIP001 = Object.freeze({
  'Body Pelvis': 'Bip001 Pelvis',
  Body_Pelvis: 'Bip001 Pelvis',
  'Body Belly': 'Bip001 Spine',
  Body_Belly: 'Bip001 Spine',
  'Body Chest': 'Bip001 Spine1',
  Body_Chest: 'Bip001 Spine1',
  'Body Neck': 'Bip001 Neck',
  Body_Neck: 'Bip001 Neck',
  'Body Head': 'Bip001 Head',
  Body_Head: 'Bip001 Head',
  'Body L Shoulder': 'Bip001 L Clavicle',
  Body_L_Shoulder: 'Bip001 L Clavicle',
  'Body L Arm': 'Bip001 L UpperArm',
  Body_L_Arm: 'Bip001 L UpperArm',
  'Body L Elbow': 'Bip001 L Forearm',
  Body_L_Elbow: 'Bip001 L Forearm',
  'Body L Hand': 'Bip001 L Hand',
  Body_L_Hand: 'Bip001 L Hand',
  'Body R Shoulder': 'Bip001 R Clavicle',
  Body_R_Shoulder: 'Bip001 R Clavicle',
  'Body R Arm': 'Bip001 R UpperArm',
  Body_R_Arm: 'Bip001 R UpperArm',
  'Body R Elbow': 'Bip001 R Forearm',
  Body_R_Elbow: 'Bip001 R Forearm',
  'Body R Hand': 'Bip001 R Hand',
  Body_R_Hand: 'Bip001 R Hand',
  'Body L Leg': 'Bip001 L Thigh',
  Body_L_Leg: 'Bip001 L Thigh',
  'Body L Knee': 'Bip001 L Calf',
  Body_L_Knee: 'Bip001 L Calf',
  'Body L Foot': 'Bip001 L Foot',
  Body_L_Foot: 'Bip001 L Foot',
  'Body R Leg': 'Bip001 R Thigh',
  Body_R_Leg: 'Bip001 R Thigh',
  'Body R Knee': 'Bip001 R Calf',
  Body_R_Knee: 'Bip001 R Calf',
  'Body R Foot': 'Bip001 R Foot',
  Body_R_Foot: 'Bip001 R Foot',
});

/** Detect author rig from a bone name. Play target is always Bip001. */
export function detectRigFamily(boneName) {
  const n = String(boneName || '');
  if (/^mixamorig/i.test(n) || /^(Hips|LeftArm|RightUpLeg)$/i.test(n)) return 'mixamo';
  if (/^Body[ _]/i.test(n) || /^Body_(Pelvis|Belly|Chest)/i.test(n)) return 'bandai';
  if (/^Bip001/i.test(n) || /^Bip01(?!\d)/i.test(n)) return 'biped';
  return 'unknown';
}

export function findSkinnedMesh(root) {
  let found = null;
  root?.traverse?.((o) => {
    if (!found && o.isSkinnedMesh && o.skeleton?.bones?.length) found = o;
  });
  return found;
}

/** SkinnedMesh with .skeleton, or a dummy bound to collected Bones. */
export function asSkinned(root) {
  const existing = findSkinnedMesh(root);
  if (existing) return existing;
  const bones = [];
  root?.traverse?.((o) => {
    if (o.isBone) bones.push(o);
  });
  if (!bones.length) return null;
  const sm = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  sm.bind(new Skeleton(bones));
  return sm;
}

function mixamoCore(name) {
  return String(name || '')
    .replace(/^mixamorig\d*:?/i, '')
    .replace(/_\d+$/, '');
}

/**
 * `options.names` for retargetClip: TARGET bone.name → SOURCE bone.name
 */
export function buildBip001Names(targetSkinned, sourceSkinned) {
  const srcBones = sourceSkinned?.skeleton?.bones || [];
  const srcByNorm = new Map();
  const srcByCore = new Map();
  for (const b of srcBones) {
    const n = b.name || '';
    if (!srcByNorm.has(normalizeBoneKey(n))) srcByNorm.set(normalizeBoneKey(n), n);
    const core = mixamoCore(n);
    if (core && !srcByCore.has(core.toLowerCase())) srcByCore.set(core.toLowerCase(), n);
  }
  const names = {};
  let hip = 'Bip001 Pelvis';
  const tgtBones = targetSkinned?.skeleton?.bones || [];
  for (const tb of tgtBones) {
    const tname = tb.name || '';
    if (!tname) continue;
    let src = srcByNorm.get(normalizeBoneKey(tname));
    if (!src) {
      const entry = Object.entries(MIXAMO_CORE_TO_BIP001).find(([, bip]) => bip === tname);
      if (entry) src = srcByCore.get(entry[0].toLowerCase());
    }
    if (!src) {
      const bandai = Object.entries(BANDAI_TO_BIP001).find(([, bip]) => bip === tname);
      if (bandai) {
        src =
          srcByNorm.get(normalizeBoneKey(bandai[0])) ||
          srcByCore.get(mixamoCore(bandai[0]).toLowerCase());
      }
    }
    if (!src) continue;
    names[tname] = src;
    if (/pelvis|hips/i.test(tname)) hip = tname;
  }
  return { names, hip };
}

function toNodeForm(clip) {
  const tracks = [];
  for (const t of clip.tracks) {
    const m = /^\.bones\[(.+?)\]\.(\w+)$/.exec(t.name);
    if (m) {
      const [, bone, prop] = m;
      if (prop !== 'quaternion') continue;
      t.name = `${bone}.${prop}`;
      tracks.push(t);
      continue;
    }
    if (/\.quaternion$/.test(t.name)) tracks.push(t);
  }
  return new AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Bake `clip` (from Mixamo / other humanoid `sourceRoot`) onto Bip001 `targetRoot`.
 * @returns {import('three').AnimationClip}
 */
export function retargetClipToBip001(targetRoot, sourceRoot, clip) {
  if (!clip) return clip;
  const target = asSkinned(targetRoot);
  const source = asSkinned(sourceRoot);
  if (target?.skeleton && source?.skeleton && sourceRoot) {
    try {
      if (!sourceRoot.skeleton) sourceRoot.skeleton = source.skeleton;
      const { names, hip } = buildBip001Names(target, source);
      if (Object.keys(names).length >= 6) {
        target.skeleton.pose();
        const baked = suRetargetClip(target, sourceRoot, clip, { names, hip });
        const node = toNodeForm(baked);
        const rot = toRotationOnlyClip(node);
        if (rot.tracks.length >= MIN_RETARGET_TRACKS) {
          rot.name = clip.name;
          return rot;
        }
      }
    } catch (e) {
      console.warn('[retargetToBip001] SkeletonUtils failed, name-rematch', e?.message || e);
    }
  }
  const rot = toRotationOnlyClip(clip);
  const matched = rematchClipToSkeleton(targetRoot, rot, { stripPositions: true });
  matched.name = clip.name;
  return matched;
}
