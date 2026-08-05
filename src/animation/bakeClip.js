import { AnimationClip, PropertyBinding } from 'three';

/**
 * Minimal baked-clip helpers for grudge6 Bip001 JSON packs.
 * Mirrors fleet rules: rotation-only tracks, bone-name rematch, no Mixamo.
 */

/** Strip hip/root position & scale tracks so a grounded kit does not float. */
export function toRotationOnlyClip(clip) {
  const tracks = clip.tracks.filter((t) => !/\.position$|\.scale$/.test(t.name));
  const out = new AnimationClip(clip.name, clip.duration, tracks);
  out.uuid = clip.uuid;
  return out;
}

function normalizeBoneKey(name) {
  return String(name || '')
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/^Bip001[\s_]?/i, '')
    .replace(/[:\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildBoneLookup(root) {
  const lookup = new Map();
  root.traverse((node) => {
    if (!node.isBone && node.type !== 'Bone') return;
    const name = node.name;
    if (!name) return;
    lookup.set(name, name);
    lookup.set(normalizeBoneKey(name), name);
    // Common aliases
    const short = normalizeBoneKey(name);
    if (short === 'pelvis') lookup.set('hips', name);
    if (short === 'l thigh') lookup.set('leftupleg', name);
    if (short === 'r thigh') lookup.set('rightupleg', name);
    if (short === 'l calf') lookup.set('leftleg', name);
    if (short === 'r calf') lookup.set('rightleg', name);
    if (short === 'l upperarm') lookup.set('leftarm', name);
    if (short === 'r upperarm') lookup.set('rightarm', name);
    if (short === 'l forearm') lookup.set('leftforearm', name);
    if (short === 'r forearm') lookup.set('rightforearm', name);
    if (short === 'l clavicle') lookup.set('leftshoulder', name);
    if (short === 'r clavicle') lookup.set('rightshoulder', name);
    if (short === 'l toe0') lookup.set('lefttoebase', name);
    if (short === 'r toe0') lookup.set('righttoebase', name);
  });
  return lookup;
}

/**
 * Rewrite track node names so they bind to bones present on `root`.
 * Drops position/scale by default (grounded kits).
 */
export function rematchClipToSkeleton(root, clip, { stripPositions = true } = {}) {
  const lookup = buildBoneLookup(root);
  const tracks = [];

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

    if (!resolved) continue;

    if (resolved === nodeName) {
      tracks.push(track);
      continue;
    }

    const dot = track.name.indexOf('.');
    const propSuffix = dot >= 0 ? track.name.slice(dot) : `.${parsed.propertyName || 'quaternion'}`;
    const Ctor = track.constructor;
    tracks.push(new Ctor(`${resolved}${propSuffix}`, track.times, track.values));
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
