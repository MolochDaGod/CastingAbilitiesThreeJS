/**
 * Master weapon skills catalog — ObjectStore SSOT (not a fork).
 *
 * Browse: https://info.grudge-studio.com/WEAPON_SKILLS.html
 * Docs:   https://info.grudge-studio.com/docs
 * JSON:   https://info.grudge-studio.com/api/v1/master-weaponSkills.json  (v3.1.0 · 268 skills)
 *
 * Icons: https://assets.grudge-studio.com{icon path}
 */

export const MASTER_WEAPON_SKILLS_URL =
  'https://info.grudge-studio.com/api/v1/master-weaponSkills.json';
export const MASTER_WEAPON_SKILLS_MIRROR =
  'https://objectstore.grudge-studio.com/api/v1/master-weaponSkills.json';
export const WEAPON_SKILLS_HTML = 'https://info.grudge-studio.com/WEAPON_SKILLS.html';
export const INFO_DOCS_URL = 'https://info.grudge-studio.com/docs';
export const ICONS_CDN = 'https://assets.grudge-studio.com';

/** Weapon type id (catalog) → casting mesh slot + anim pack */
export const WEAPON_TYPE_TO_LAB = Object.freeze({
  SWORD: { slot: 'sword', pack: 'sword_shield', style: 'melee' },
  AXE: { slot: 'axe', pack: 'sword_shield', style: 'melee' },
  AXE_1H: { slot: 'axe', pack: 'sword_shield', style: 'melee' },
  DAGGER: { slot: 'sword', pack: 'sword_shield', style: 'melee' },
  MACE: { slot: 'hammer', pack: 'sword_shield', style: 'melee' },
  HAMMER: { slot: 'hammer', pack: 'sword_shield', style: 'melee' },
  HAMMER_1H: { slot: 'hammer', pack: 'sword_shield', style: 'melee' },
  SPEAR: { slot: 'spear', pack: 'sword_shield', style: 'melee' },
  GREATSWORD: { slot: 'sword', pack: 'sword_shield', style: 'melee' },
  GREATAXE: { slot: 'axe', pack: 'sword_shield', style: 'melee' },
  HAMMER_2H: { slot: 'hammer', pack: 'sword_shield', style: 'melee' },
  SCYTHE: { slot: 'axe', pack: 'sword_shield', style: 'melee' },
  BOW: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  LONGBOW: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  CROSSBOW: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  GUN: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  RIFLE: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  PISTOL: { slot: 'bow', pack: 'longbow', style: 'ranged' },
  STAFF: { slot: 'staff', pack: 'magic', style: 'spell' },
  FIRE_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'fire' },
  FROST_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'ice' },
  HOLY_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'holy' },
  LIGHTNING_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'storm' },
  NATURE_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'nature' },
  ARCANE_STAFF: { slot: 'staff', pack: 'magic', style: 'spell', element: 'arcane' },
  WAND: { slot: 'staff', pack: 'magic', style: 'spell', element: 'arcane' },
  TOME: { slot: 'staff', pack: 'magic', style: 'spell' },
  TOOL: { slot: 'axe', pack: 'sword_shield', style: 'melee' },
  SHIELD: { slot: 'shield', pack: 'sword_shield', style: 'melee' }
});

/**
 * Normalize catalog weapon type id.
 * @param {string} id
 */
export function normalizeWeaponTypeId(id) {
  return String(id || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * @param {string} iconPath
 */
export function iconCdnUrl(iconPath) {
  if (!iconPath) return null;
  if (/^https?:\/\//i.test(iconPath)) return iconPath;
  const p = iconPath.startsWith('/') ? iconPath : `/${iconPath}`;
  return `${ICONS_CDN}${p}`;
}

/**
 * @param {string} weaponTypeId
 */
export function labMapForWeaponType(weaponTypeId) {
  const id = normalizeWeaponTypeId(weaponTypeId);
  return (
    WEAPON_TYPE_TO_LAB[id] ||
    WEAPON_TYPE_TO_LAB[id.replace(/_STAFF$/, '_STAFF')] ||
    { slot: 'sword', pack: 'sword_shield', style: 'melee' }
  );
}

/**
 * Flatten one weapon type's slots into skill rows.
 * @param {object} wt catalog weaponTypes[] entry
 */
export function flattenWeaponTypeSkills(wt) {
  const typeId = normalizeWeaponTypeId(wt.id || wt.weaponType || wt.name);
  const lab = labMapForWeaponType(typeId);
  /** @type {object[]} */
  const out = [];

  const pushSkill = (sk, slotType, slotLabel) => {
    if (!sk || !sk.id) return;
    const casting = sk.prefab?.castingLab || sk.lab || null;
    out.push({
      id: sk.id,
      uuid: sk.uuid || null,
      name: sk.name || sk.id,
      description: sk.description || '',
      icon: sk.icon || wt.icon || null,
      iconUrl: iconCdnUrl(sk.icon || wt.icon),
      tier: sk.tier ?? 1,
      damage: sk.damage ?? 0,
      cooldown: sk.cooldown ?? 0,
      castTime: sk.castTime ?? 0,
      range: sk.range ?? null,
      damageType: sk.damageType || 'physical',
      animation: sk.animation || sk.prefab?.animationClip || casting?.animationClip || null,
      prefab: sk.prefab || null,
      effects: sk.effects || [],
      weaponTypeId: typeId,
      weaponTypeName: wt.name || typeId,
      slotType: slotType || 'ability',
      slotLabel: slotLabel || slotType || '',
      labPack: casting?.animPack || lab.pack,
      labSlot: lab.slot,
      labStyle: lab.style,
      labElement: casting?.element || lab.element || null,
      castingSpellId: sk.castingSpellId || casting?.castingSpellId || null,
      castEffectId: sk.prefab?.castEffectId || casting?.castEffectId || null,
      travelEffectId: sk.prefab?.travelEffectId || casting?.travelEffectId || null,
      impactEffectId: sk.prefab?.impactEffectId || casting?.impactEffectId || null,
      pathMode: casting?.pathMode || null
    });
  };

  for (const block of wt.slots || []) {
    for (const sk of block.skills || []) pushSkill(sk, block.type, block.label);
  }
  for (const block of wt.starterSlots || []) {
    for (const sk of block.skills || []) pushSkill(sk, block.type || 'starter', block.label || 'T0');
  }
  return out;
}

/**
 * @typedef {object} WeaponSkillsCatalog
 * @property {string} version
 * @property {number} totalSkills
 * @property {object[]} weaponTypes
 * @property {object[]} allSkills
 * @property {Map<string, object>} byId
 */

/**
 * Load master catalog (cached).
 * @returns {Promise<WeaponSkillsCatalog>}
 */
let _cache = null;
let _loading = null;

export async function loadWeaponSkillsCatalog() {
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    let data = null;
    for (const url of [MASTER_WEAPON_SKILLS_URL, MASTER_WEAPON_SKILLS_MIRROR]) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch {
        /* try next */
      }
    }
    if (!data) {
      _loading = null;
      throw new Error('master-weaponSkills.json unreachable');
    }

    const weaponTypes = data.weaponTypes || [];
    /** @type {object[]} */
    const allSkills = [];
    for (const wt of weaponTypes) {
      allSkills.push(...flattenWeaponTypeSkills(wt));
    }
    const byId = new Map(allSkills.map((s) => [s.id, s]));

    _cache = {
      version: data.version || 'unknown',
      totalSkills: data.totalSkills || allSkills.length,
      weaponTypes,
      allSkills,
      byId,
      loadedAt: Date.now()
    };
    _loading = null;
    return _cache;
  })();

  return _loading;
}

/**
 * Skills for a weapon type id (SWORD, BOW, …).
 * @param {WeaponSkillsCatalog} cat
 * @param {string} weaponTypeId
 */
export function skillsForWeaponType(cat, weaponTypeId) {
  const id = normalizeWeaponTypeId(weaponTypeId);
  return (cat?.allSkills || []).filter((s) => s.weaponTypeId === id);
}

/**
 * Pick a T0/starter 4-skill bar for a weapon type (primary→ultimate).
 * @param {WeaponSkillsCatalog} cat
 * @param {string} weaponTypeId
 */
export function defaultHotbarForWeaponType(cat, weaponTypeId) {
  const list = skillsForWeaponType(cat, weaponTypeId);
  const starters = list.filter((s) => String(s.id).startsWith('t0_') || s.tier === 0);
  const pool = starters.length >= 4 ? starters : list;
  const bySlot = { primary: [], secondary: [], ability: [], ultimate: [] };
  for (const s of pool) {
    const k = s.slotType in bySlot ? s.slotType : 'ability';
    bySlot[k].push(s);
  }
  const pick = (arr, i) => arr[i] || pool[i] || null;
  return [
    pick(bySlot.primary, 0) || pool[0] || null,
    pick(bySlot.secondary, 0) || pool[1] || null,
    pick(bySlot.ability, 0) || pool[2] || null,
    pick(bySlot.ultimate, 0) || pool[3] || null
  ].filter(Boolean);
}

/** Infer anim role to play for a catalog skill. */
export function animRoleForSkill(skill) {
  if (!skill) return 'attack';
  if (skill.labStyle === 'spell') return 'cast';
  if (skill.animation && /cast|spell/i.test(skill.animation)) return 'cast';
  if (skill.slotType === 'defense' || /parry|guard|block/i.test(skill.id + skill.name)) return 'block';
  return skill.labStyle === 'ranged' ? 'attack' : 'attack';
}

/** Infer VFX effect id from damage type / description / casting kit binds. */
export function vfxIdForSkill(skill) {
  if (!skill) return 'arcane_swirl';
  if (skill.impactEffectId) return skill.impactEffectId;
  if (skill.travelEffectId) return skill.travelEffectId;
  if (skill.castEffectId) return skill.castEffectId;
  if (skill.prefab?.impactEffectId) return skill.prefab.impactEffectId;
  if (skill.prefab?.vfxRef) return skill.prefab.vfxRef;
  const t = String(skill.damageType || '').toLowerCase();
  const blob = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
  if (t === 'fire' || /fire|ember|inferno/.test(blob)) return 'inferno';
  if (t === 'frost' || t === 'ice' || /frost|ice|freeze/.test(blob)) return 'frost_wave';
  if (t === 'lightning' || /storm|lightning|thunder/.test(blob)) return 'chain_lightning';
  if (t === 'holy' || /holy|light|moon/.test(blob)) return 'moon_beam';
  if (t === 'nature' || /nature|earth|quake/.test(blob)) return 'earth_surge';
  if (/slash|cleave|sweep/.test(blob)) return 'getsuga_slash';
  if (skill.labStyle === 'spell') return 'arcane_swirl';
  return 'getsuga_slash';
}
