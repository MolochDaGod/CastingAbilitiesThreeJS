/**
 * Admin law — Warlords play kit. Fail closed so these never recur:
 *  - second AnimationMixer on the same body
 *  - Mixamo remesh / mixamorig tracks on Toon Bip001
 *  - invented hand-bone set (only kit containers)
 *
 * Used by attach, verify, Target shake-out.
 * @see grudge6-full-stack · laterality · combat-runtime
 */

export const WARLORDS_ADMIN_LAW_VERSION = '2026-08-18.admin-axe.1';

/** Only these sockets may receive a held weapon. */
export const WARLORDS_HAND_BONES = Object.freeze({
  main: Object.freeze(['R_hand_container', 'Bip001 R Hand', 'Bip001_R_Hand']),
  off: Object.freeze(['L_hand_container', 'Bip001 L Hand', 'Bip001_L_Hand']),
  shield: Object.freeze(['L_shield_container', 'L_hand_container', 'Bip001 L Hand'])
});

export const WARLORDS_BANNED = Object.freeze({
  mixamoOnToon: /mixamorig/i,
  secondMixer: /second.?mixer|new AnimationMixer/i,
  inventedHand: /LeftHand|RightHand|mixamorig:RightHand|mixamorig:LeftHand/i,
  pelvisFeet: /pelvis.?as.?feet|pelvis\.y\s*=\s*0/i,
  fusedMultipack: /30characters\.glb/
});

/**
 * @param {import('three').Object3D|null} root
 * @param {'main'|'off'|'shield'} [slot]
 * @returns {import('three').Object3D|null}
 */
export function resolveWarlordsHandBone(root, slot = 'main') {
  if (!root) return null;
  const names = WARLORDS_HAND_BONES[slot] || WARLORDS_HAND_BONES.main;
  for (const n of names) {
    const hit = root.getObjectByName?.(n);
    if (hit) return hit;
  }
  let found = null;
  const want = names.map((n) => n.replace(/[^a-z0-9]/gi, '').toLowerCase());
  root.traverse?.((o) => {
    if (found) return;
    const k = String(o.name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (want.includes(k)) found = o;
  });
  return found;
}

/**
 * True if a clip/track name is illegal on a Warlords Toon kit.
 * @param {string} name
 */
export function isBannedWarlordsTrack(name) {
  return WARLORDS_BANNED.mixamoOnToon.test(String(name || ''));
}

/**
 * @param {{ era?: string, skeleton?: string, clips?: string[], mixerCount?: number, handBone?: string }} input
 */
export function adminShakeWarlords(input = {}) {
  const issues = [];
  const era = String(input.era || 'warlords');
  if (era === 'warlords' && /mixamo/i.test(String(input.skeleton || '')) && String(input.skeleton) !== 'Bip001') {
    issues.push('Warlords play skeleton is Bip001 — Mixamo remesh forbidden');
  }
  if (Number(input.mixerCount) > 1) {
    issues.push('second mixer on same body forbidden');
  }
  for (const c of input.clips || []) {
    if (isBannedWarlordsTrack(c)) issues.push(`mixamorig track on Toon: ${c}`);
  }
  const hb = String(input.handBone || '');
  if (hb && !WARLORDS_HAND_BONES.main.concat(WARLORDS_HAND_BONES.off, WARLORDS_HAND_BONES.shield).some((n) => n === hb)) {
    if (WARLORDS_BANNED.inventedHand.test(hb) || /mixamorig/i.test(hb)) {
      issues.push(`invented/Mixamo hand bone: ${hb} — use R_hand_container`);
    }
  }
  return { ok: issues.length === 0, issues };
}
