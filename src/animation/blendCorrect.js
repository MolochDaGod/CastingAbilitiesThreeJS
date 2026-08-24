/**
 * Shake-free clip bind + crossfade — rotation-only, no timeScale warp.
 * Position tracks on hips = hip-float + mesh squash. Warp=true = gait shake.
 */

/**
 * Drop .position tracks (keep quaternion / scale). Mutates clip.
 * @param {import('three').AnimationClip} clip
 */
export function stripPositionTracks(clip) {
  if (!clip?.tracks) return clip;
  clip.tracks = clip.tracks.filter((t) => !/\.position$/i.test(t.name || ''));
  return clip;
}

/**
 * @param {import('three').AnimationAction} next
 * @param {import('three').AnimationAction|null} current
 * @param {number} fade
 * @param {{ exclusive?: boolean }} [opts]
 */
export function safeCrossFade(next, current, fade, opts = {}) {
  if (!next) return;
  const fadeSec = Math.max(0, fade || 0);
  // warp=false — interpolating timeScale shakes limbs on mismatched clip lengths
  if (current && current !== next && fadeSec > 0 && !opts.exclusive) {
    next.crossFadeFrom(current, fadeSec, false);
  } else if (opts.exclusive && fadeSec > 0) {
    next.fadeIn(fadeSec);
  }
  next.play();
}
