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
 * Only includes Bone nodes (and hand containers for attach tracks).
 */
export function buildBoneNameLookup(root) {
  const lookup = new Map();
  const actualByKey = new Map();

  root.traverse((node) => {
    const isBone = node.isBone === true;
    const name = node.name || '';
    if (!isBone && !/bip001|mixamo|container|hand|pelvis|spine|hips/i.test(name)) return;
    if (!name) return;

    lookup.set(name, name);
    const key = normalizeBoneKey(name);
    lookup.set(key, name);
    if (isBone) actualByKey.set(key, name);

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
    ['bip001rclavicle', 'rightshoulder']
  ];
  for (const [a, b] of aliases) {
    const boneA = actualByKey.get(a);
    const boneB = actualByKey.get(b);
    if (boneA) lookup.set(b, boneA);
    if (boneB) lookup.set(a, boneB);
  }

  return lookup;
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

    const resolved =
      lookup.get(nodeName) ||
      lookup.get(normalizeBoneKey(nodeName)) ||
      (PropertyBinding.findNode(root, nodeName) ? nodeName : null);

    if (!resolved) {
      dropped++;
      continue;
    }

    if (resolved === nodeName) {
      tracks.push(track);
      continue;
    }

    rewritten++;
    const dot = track.name.indexOf('.');
    const propSuffix = dot >= 0 ? track.name.slice(dot) : `.${parsed.propertyName || 'quaternion'}`;
    const Ctor = track.constructor;
    tracks.push(
      new Ctor(
        `${resolved}${propSuffix}`,
        track.times.slice ? track.times.slice() : track.times,
        track.values.slice ? track.values.slice() : track.values
      )
    );
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
