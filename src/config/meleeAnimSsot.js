/**
 * 2H melee locomotion / idle SSOT (author FBX → lab public path).
 *
 * Author: D:\Games\Models\2hand Idle.fbx
 * Lab:    public/anim/melee/2hand-idle.fbx
 *
 * Used as sword_shield pack **idle** (2H melee stance) before 1H S&S baked idle.
 */

/** Absolute + same-origin candidates for 2-hand melee idle. */
export const MELEE_2H_IDLE_FBX_URLS = Object.freeze([
  './anim/melee/2hand-idle.fbx',
  '/anim/melee/2hand-idle.fbx',
  // Local author path is not web-served — ship under public/ only
]);

/**
 * Role → FBX URL list (same shape as FALL_FBX_URLS).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const MELEE_FBX_URLS = Object.freeze({
  /** 2H melee idle — primary idle for sword_shield pack */
  idle2h: MELEE_2H_IDLE_FBX_URLS,
  idle: MELEE_2H_IDLE_FBX_URLS,
});
