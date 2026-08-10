import { AnimationClip, PropertyBinding } from 'three';

/**
 * Baked-clip helpers for grudge6 Bip001 JSON packs.
 * Fleet rules: rotation-only, bone-name rematch (space/underscore), no Mixamo.
 * Port of gameopen grudge/skeleton.ts rematch + normalize.
 */

/** Strip hip/root position & scale tracks so a grounded kit does not float. */
export function toRotationOnlyClip(clip) {
  const tracks = clip.tracks.filter((t) => !/\.position$|\.scale$/.test(t.name));
  const out = new AnimationClip(clip.name, clip.duration, tracks);
  out.uuid = clip.uuid;
  return out;
}

/** Alnum-only bone key: "Bip001 L UpperArm" / "Bip001_L_UpperArm" → bip001lupperarm */
export function normalizeBoneKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^mixamorig\d*:/i, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Alias map: exact name + normalized key + space/underscore variants.
 * HARD: only real Bone nodes. Never SkinnedMesh (WK_Units_head_* would steal Head tracks → head at feet).
 */
export function buildBoneNameLookup(root) {
  const lookup = new Map();
  const actualByKey = new Map();

  root.traverse((node) => {
    // Bones only — containers are Object3D and must not receive bone quaternion tracks
    if (node.isBone !== true) return;
    const name = node.name || '';
    if (!name) return;
    // Never treat mesh-like names as bones (defense if mis-typed)
    if (/units_|weapon_|xtra_|shield_/i.test(name)) return;

    lookup.set(name, name);
    const key = normalizeBoneKey(name);
    lookup.set(key, name);
    actualByKey.set(key, name);

    if (name.includes('_')) {
      const spaced = name.replace(/^Bip001_/, 'Bip001 ').replace(/_/g, ' ');
      lookup.set(spaced, name);
      lookup.set(normalizeBoneKey(spaced), name);
    }
    if (name.includes(' ')) {
      const underscored = name.replace(/ /g, '_');
      lookup.set(underscored, name);
      lookup.set(normalizeBoneKey(underscored), name);
    }
  });

  // Role aliases (clip may say Hips / LeftArm when kit is Bip001)
  // Mixamo short names → Bip001 (combo bakes from Documents Mixamo FBX)
  const aliases = [
    ['bip001pelvis', 'hips'],
    ['bip001lupperarm', 'leftarm'],
    ['bip001rupperarm', 'rightarm'],
    ['bip001lforearm', 'leftforearm'],
    ['bip001rforearm', 'rightforearm'],
    ['bip001lhand', 'lefthand'],
    ['bip001rhand', 'righthand'],
    ['bip001lthigh', 'leftupleg'],
    ['bip001rthigh', 'rightupleg'],
    ['bip001lcalf', 'leftleg'],
    ['bip001rcalf', 'rightleg'],
    ['bip001lfoot', 'leftfoot'],
    ['bip001rfoot', 'rightfoot'],
    ['bip001lclavicle', 'leftshoulder'],
    ['bip001rclavicle', 'rightshoulder'],
    // Spine / head (Mixamo Spine / Spine01 / Spine02 / neck)
    ['bip001spine', 'spine'],
    ['bip001spine1', 'spine01'],
    ['bip001spine1', 'spine1'],
    ['bip001spine2', 'spine02'],
    ['bip001spine2', 'spine2'],
    ['bip001neck', 'neck'],
    ['bip001head', 'head']
  ];
  for (const [a, b] of aliases) {
    const boneA = actualByKey.get(a);
    const boneB = actualByKey.get(b);
    if (boneA) lookup.set(b, boneA);
    if (boneB) lookup.set(a, boneB);
  }
  // Prefer mapping Mixamo Spine02 → highest available Bip001 spine
  const spine2 = actualByKey.get('bip001spine2') || actualByKey.get('bip001spine1') || actualByKey.get('bip001spine');
  if (spine2) {
    lookup.set('spine02', spine2);
    lookup.set('spine2', spine2);
    // Ghost Rider / Toon: clip may author Spine2 when kit only has Spine1/Spine
    lookup.set('bip001spine2', spine2);
  }
  const spine1 = actualByKey.get('bip001spine1') || actualByKey.get('bip001spine');
  if (spine1) {
    lookup.set('spine01', spine1);
    lookup.set('spine1', spine1);
    if (!actualByKey.get('bip001spine1')) lookup.set('bip001spine1', spine1);
  }
  // Toe0 often missing on grudge6 kits — fold into Foot to avoid dropped foot pose
  const lFoot = actualByKey.get('bip001lfoot');
  const rFoot = actualByKey.get('bip001rfoot');
  if (lFoot) {
    lookup.set('bip001ltoe0', lFoot);
    lookup.set('bip001ltoe', lFoot);
    lookup.set('lefttoeBase', lFoot);
    lookup.set('lefttoe', lFoot);
  }
  if (rFoot) {
    lookup.set('bip001rtoe0', rFoot);
    lookup.set('bip001rtoe', rFoot);
    lookup.set('righttoeBase', rFoot);
    lookup.set('righttoe', rFoot);
  }

  return lookup;
}

/**
 * Make quaternion keyframes continuous (no 180° flips) — reduces limb “pop” on rolls.
 * @param {import('three').KeyframeTrack} track
 */
export function ensureQuaternionContinuity(track) {
  if (!track || !/\.quaternion$/.test(track.name)) return track;
  const v = track.values;
  const n = Math.floor(v.length / 4);
  for (let i = 1; i < n; i++) {
    const o = (i - 1) * 4;
    const c = i * 4;
    const dot = v[o] * v[c] + v[o + 1] * v[c + 1] + v[o + 2] * v[c + 2] + v[o + 3] * v[c + 3];
    if (dot < 0) {
      v[c] = -v[c];
      v[c + 1] = -v[c + 1];
      v[c + 2] = -v[c + 2];
      v[c + 3] = -v[c + 3];
    }
  }
  return track;
}

/**
 * Rewrite track node names so they bind to bones present on `root`.
 * Drops position/scale by default (grounded kits).
 */
export function rematchClipToSkeleton(root, clip, { stripPositions = true } = {}) {
  const lookup = buildBoneNameLookup(root);
  const tracks = [];
  let rewritten = 0;
  let dropped = 0;

  for (const track of clip.tracks) {
    if (stripPositions && /\.position$|\.scale$/.test(track.name)) continue;

    const parsed = PropertyBinding.parseTrackName(track.name);
    const nodeName = parsed.nodeName;
    if (!nodeName) {
      tracks.push(track);
      continue;
    }

    // Never bind anim tracks to equip meshes (Units_head / Body / weapon)
    if (/units_|weapon_|xtra_|shield_/i.test(nodeName)) {
      dropped++;
      continue;
    }
    // Drop Spine1/2 etc. when kit only has Bip001 Spine (common Toon RTS)
    // Prefer lookup; do NOT use PropertyBinding.findNode (can hit non-bones)

    let resolved =
      lookup.get(nodeName) || lookup.get(normalizeBoneKey(nodeName)) || null;

    // Exact bone only via findNode if it is really a Bone
    if (!resolved) {
      const found = PropertyBinding.findNode(root, nodeName);
      if (found && found.isBone === true && !/units_|weapon_|xtra_/i.test(found.name || '')) {
        resolved = found.name;
      }
    }

    if (!resolved) {
      dropped++;
      continue;
    }

    const dot = track.name.indexOf('.');
    const propSuffix = dot >= 0 ? track.name.slice(dot) : `.${parsed.propertyName || 'quaternion'}`;
    const Ctor = track.constructor;
    const times = track.times.slice ? track.times.slice() : Array.from(track.times);
    const values = track.values.slice ? track.values.slice() : Array.from(track.values);
    const nextName = resolved === nodeName ? track.name : `${resolved}${propSuffix}`;
    if (resolved !== nodeName) rewritten++;
    const nt = new Ctor(nextName, times, values);
    if (/\.quaternion$/.test(nextName)) ensureQuaternionContinuity(nt);
    tracks.push(nt);
  }

  if (rewritten || dropped) {
    console.info(
      `[bakeClip] rematch "${clip.name}": keep=${tracks.length} rewrote=${rewritten} dropped=${dropped}`
    );
  }

  return new AnimationClip(clip.name, clip.duration, tracks);
}

/** Fetch a fleet-baked JSON clip and return a rotation-only AnimationClip. */
export async function loadBakedClipJson(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`[bakeClip] HTTP ${res.status} for ${url}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) throw new Error(`[bakeClip] HTML response for ${url}`);
  const json = await res.json();
  const clip = AnimationClip.parse(json);
  return toRotationOnlyClip(clip);
}
