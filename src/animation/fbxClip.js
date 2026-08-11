/**
 * Load real FBX one-shot clips (flips, etc.) from Open CDN and rematch to Bip001.
 * Prefer baked JSON when available; FBX is the author source for striker/extra flips.
 */
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { rematchClipToSkeleton, toRotationOnlyClip } from './bakeClip.js';

let _loader = null;
function getLoader() {
  if (!_loader) _loader = new FBXLoader();
  return _loader;
}

/**
 * @param {string} url absolute FBX url
 * @param {import('three').Object3D} skeletonRoot grudge6 kit
 * @param {string} [name] clip name
 * @returns {Promise<import('three').AnimationClip|null>}
 */
export async function loadFbxClipRematched(url, skeletonRoot, name = 'clip') {
  if (!url || !skeletonRoot) return null;
  try {
    const fbx = await getLoader().loadAsync(url);
    const raw = fbx.animations?.[0];
    if (!raw) return null;
    raw.name = name;
    // Rotation-only + bone rematch (Mixamo/striker → Bip001)
    const rot = toRotationOnlyClip(raw);
    const matched = rematchClipToSkeleton(skeletonRoot, rot, { stripPositions: true });
    if (!matched.tracks.length) {
      console.warn('[fbxClip] empty after rematch', url);
      return null;
    }
    matched.name = name;
    return matched;
  } catch (e) {
    console.warn('[fbxClip] load fail', url, e?.message || e);
    return null;
  }
}

/** Open host absolute paths for production flip clips (real author FBX). */
export const FLIP_FBX_URLS = Object.freeze({
  frontflip: [
    'https://open.grudge-studio.com/anim/animations/extra/front-flip.fbx',
    'https://open.grudge-studio.com/anim/extra/front-flip.fbx'
  ],
  backflip: [
    'https://open.grudge-studio.com/anim/striker/backflip.fbx',
    'https://open.grudge-studio.com/anim/animations/striker/Back_Flip_To_Uppercut.fbx'
  ]
});

/**
 * Jump / fall locomotion FBX (author on D:\Games\Models · lab under public/anim/locomotion/fall).
 * @see config/fallAnimSsot.js
 */
export { FALL_FBX_URLS } from '../config/fallAnimSsot.js';
