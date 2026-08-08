/**
 * Hotkey / skill-slot bindings → master catalog skill ids.
 * Persisted so showcase "save to hotkey" is true for combat 1–4 + F.
 *
 * Slots:
 *   0–3 → Digit1–4 (sig1–4 / DRC skills)
 *   f   → F interact fallback attack (when no pickup/harvest)
 */

const STORAGE_KEY = 'casting.lab.skillBindings.v1';

/**
 * @typedef {object} SkillBind
 * @property {string} skillId
 * @property {string} [name]
 * @property {string} [weaponTypeId]
 * @property {string} [labPack]
 * @property {string} [labSlot]
 * @property {string} [iconUrl]
 * @property {number} [cooldown]
 * @property {string} [damageType]
 */

/**
 * @returns {Record<string, SkillBind|null>}
 */
export function loadSkillBindings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyBindings();
    const parsed = JSON.parse(raw);
    return { ...emptyBindings(), ...parsed };
  } catch {
    return emptyBindings();
  }
}

export function emptyBindings() {
  return { 0: null, 1: null, 2: null, 3: null, f: null };
}

/**
 * @param {Record<string, SkillBind|null>} bindings
 */
export function saveSkillBindings(bindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

/**
 * @param {string|number} slot 0-3 or 'f'
 * @param {SkillBind|null} bind
 */
export function setSkillBinding(slot, bind) {
  const all = loadSkillBindings();
  const key = String(slot);
  all[key] = bind
    ? {
        skillId: bind.skillId,
        name: bind.name,
        weaponTypeId: bind.weaponTypeId,
        labPack: bind.labPack,
        labSlot: bind.labSlot,
        iconUrl: bind.iconUrl,
        cooldown: bind.cooldown,
        damageType: bind.damageType
      }
    : null;
  saveSkillBindings(all);
  return all;
}

/**
 * Apply four catalog skills to slots 0–3.
 * @param {object[]} skills
 */
export function bindHotbarFromSkills(skills) {
  const all = emptyBindings();
  for (let i = 0; i < 4; i++) {
    const s = skills[i];
    if (!s) continue;
    all[String(i)] = {
      skillId: s.id,
      name: s.name,
      weaponTypeId: s.weaponTypeId,
      labPack: s.labPack,
      labSlot: s.labSlot,
      iconUrl: s.iconUrl,
      cooldown: s.cooldown,
      damageType: s.damageType
    };
  }
  saveSkillBindings(all);
  return all;
}

export function getSkillBinding(slot) {
  return loadSkillBindings()[String(slot)] || null;
}
