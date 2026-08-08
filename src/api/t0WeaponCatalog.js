/**
 * T0 + equippable weapon loadouts for Warlords prefab authoring.
 *
 * Sources (SSOT — do not fork):
 *  - master-weapon-prefabs.json  → icon, 3D model, tier, weaponType, skill slot ids
 *  - t0-weapons.json             → three-slot starter skill bodies
 *  - master-weaponSkills.json    → full skill defs / starters by weapon type
 *
 * Lab: equip weapon → anim pack + skill bar + hand mesh + icon sprite
 */

import {
  presentPrefab,
  loadPrefabCatalog,
  cdnUrl,
  CDN
} from '../loot/prefabAssets.js';
import {
  loadWeaponSkillsCatalog,
  labMapForWeaponType,
  normalizeWeaponTypeId,
  animRoleForSkill,
  vfxIdForSkill,
  iconCdnUrl
} from './weaponSkillsCatalog.js';
import { WEAPON_SLOT_TO_PACK } from '../config/weaponAnimPack.js';

export const T0_WEAPONS_URL = 'https://info.grudge-studio.com/api/v1/t0-weapons.json';
export const T0_WEAPONS_MIRROR =
  'https://objectstore.grudge-studio.com/api/v1/t0-weapons.json';

/** category / id → kit mesh slot */
export const WEAPON_TYPE_TO_MESH_SLOT = Object.freeze({
  SWORD: 'sword',
  AXE: 'axe',
  AXE_1H: 'axe',
  DAGGER: 'sword',
  MACE: 'hammer',
  HAMMER: 'hammer',
  HAMMER_1H: 'hammer',
  HAMMER_2H: 'hammer',
  SPEAR: 'spear',
  GREATSWORD: 'sword',
  GREATAXE: 'axe',
  SCYTHE: 'axe',
  BOW: 'bow',
  LONGBOW: 'bow',
  CROSSBOW: 'bow',
  GUN: 'bow',
  RIFLE: 'bow',
  PISTOL: 'bow',
  STAFF: 'staff',
  WAND: 'staff',
  TOME: 'staff',
  NATURE_STAFF: 'staff',
  TOOL: 'axe',
  SHIELD: 'shield'
});

/**
 * @typedef {object} WeaponSkillDef
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {number} [damage]
 * @property {number} [cooldown]
 * @property {number} [castTime]
 * @property {string} [damageType]
 * @property {string} [icon]
 * @property {string[]} [effects]
 * @property {object} [resourceCost]
 * @property {'primary'|'secondary'|'ability'|'ultimate'|string} [slotType]
 * @property {boolean} [fixed]
 * @property {boolean} [choice]
 */

/**
 * @typedef {object} EquippableWeapon
 * @property {string} id
 * @property {string} name
 * @property {number} tier
 * @property {string} weaponType  SWORD | WAND | …
 * @property {string} meshSlot    sword|axe|staff|bow|…
 * @property {string} animPack    sword_shield|magic|longbow
 * @property {string} iconUrl
 * @property {string|null} modelUrl
 * @property {string|null} dropPrefabUrl
 * @property {object} present     presentPrefab()
 * @property {WeaponSkillDef} slot1
 * @property {WeaponSkillDef} slot2
 * @property {WeaponSkillDef[]} slot3Options
 * @property {string} defaultSlot3Id
 * @property {object} [stats]
 * @property {object} [rawPrefab]
 * @property {object} [rawT0]
 */

let _cache = null;
let _loading = null;

async function fetchJson(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Infer weaponType from t0 id / category.
 * @param {object} w
 */
export function inferWeaponType(w) {
  if (w.weaponType) return normalizeWeaponTypeId(w.weaponType);
  const id = String(w.id || '');
  const cat = String(w.category || w.subCategory || '');
  if (/wand/i.test(id + cat)) return 'WAND';
  if (/nature.?staff|staff/i.test(id + cat)) return 'STAFF';
  if (/tome|offhand/i.test(id + cat)) return 'TOME';
  if (/greatsword/i.test(id + cat)) return 'GREATSWORD';
  if (/greataxe/i.test(id + cat)) return 'GREATAXE';
  if (/crossbow/i.test(id + cat)) return 'CROSSBOW';
  if (/bow/i.test(id + cat)) return 'BOW';
  if (/gun|rifle|pistol/i.test(id + cat)) return 'GUN';
  if (/dagger/i.test(id + cat)) return 'DAGGER';
  if (/spear/i.test(id + cat)) return 'SPEAR';
  if (/hammer|mace/i.test(id + cat)) return 'HAMMER';
  if (/axe/i.test(id + cat)) return 'AXE';
  if (/sword/i.test(id + cat)) return 'SWORD';
  if (/tool/i.test(id + cat)) return 'TOOL';
  return 'SWORD';
}

/**
 * Mesh slot + anim pack for a weapon type.
 * @param {string} weaponType
 */
export function labSlotsForWeaponType(weaponType) {
  const wt = normalizeWeaponTypeId(weaponType);
  const lab = labMapForWeaponType(wt);
  const meshSlot = WEAPON_TYPE_TO_MESH_SLOT[wt] || lab.slot || 'sword';
  const animPack = WEAPON_SLOT_TO_PACK[meshSlot] || lab.pack || 'sword_shield';
  return { meshSlot, animPack, labStyle: lab.style, labElement: lab.element || null };
}

/**
 * Normalize one skill blob from t0-weapons / master.
 * @param {object} sk
 * @param {string} slotType
 * @param {object} [opts]
 */
export function normalizeSkillDef(sk, slotType = 'ability', opts = {}) {
  if (!sk) return null;
  return {
    id: sk.id,
    uuid: sk.uuid || null,
    name: sk.name || sk.id,
    description: sk.description || '',
    damage: Number(sk.damage) || 0,
    cooldown: Number(sk.cooldown) || 0,
    castTime: Number(sk.castTime) || (slotType === 'primary' ? 0.4 : 0.5),
    range: sk.range ?? null,
    damageType: sk.damageType || 'physical',
    icon: sk.icon || opts.fallbackIcon || null,
    iconUrl: iconCdnUrl(sk.icon || opts.fallbackIcon) || opts.fallbackIconUrl || null,
    effects: sk.effects || [],
    resourceCost: sk.resourceCost || { mana: 0, stamina: 2 },
    slotType,
    fixed: opts.fixed ?? false,
    choice: opts.choice ?? false,
    tier: sk.tier ?? 0,
    animation: sk.animation || sk.prefab?.animationClip || null,
    prefab: sk.prefab || null,
    castingSpellId: sk.castingSpellId || null
  };
}

/**
 * Build equippable from prefab + optional t0 body.
 * @param {object} prefab
 * @param {object|null} t0
 * @param {import('./weaponSkillsCatalog.js').WeaponSkillsCatalog|null} skillsCat
 */
export function buildEquippable(prefab, t0 = null, skillsCat = null) {
  if (!prefab && !t0) return null;
  const base = prefab || t0;
  const id = base.id;
  const weaponType = inferWeaponType({ ...t0, ...prefab, weaponType: prefab?.weaponType || t0?.weaponType });
  const lab = labSlotsForWeaponType(weaponType);
  const present = presentPrefab(
    prefab || {
      id,
      name: t0?.name || id,
      tier: t0?.tier ?? 0,
      weaponType,
      assets: { iconUrl: t0?.iconUrl },
      modelUrl: null
    }
  );

  const iconUrl =
    present?.iconUrl ||
    t0?.iconUrl ||
    cdnUrl('icons/pack/weapons/Sword_01.png');

  let slot1 = null;
  let slot2 = null;
  /** @type {WeaponSkillDef[]} */
  let slot3Options = [];

  if (t0?.weaponSkills) {
    const ws = t0.weaponSkills;
    slot1 = normalizeSkillDef(ws.slot1, 'primary', {
      fixed: true,
      fallbackIconUrl: iconUrl
    });
    slot2 = normalizeSkillDef(ws.slot2, 'secondary', {
      fixed: true,
      fallbackIconUrl: iconUrl
    });
    slot3Options = (ws.slot3Options || []).map((s) =>
      normalizeSkillDef(s, 'ability', { choice: true, fallbackIconUrl: iconUrl })
    );
  }

  // Prefab skill ids → resolve from master catalog
  if ((!slot1 || !slot2) && skillsCat && prefab?.skills?.slots) {
    const byId = skillsCat.byId;
    for (const block of prefab.skills.slots) {
      const ids = block.skillIds || [];
      const defs = ids.map((sid) => byId.get(sid)).filter(Boolean);
      if (block.type === 'primary' && defs[0] && !slot1) {
        slot1 = normalizeSkillDef(defs[0], 'primary', { fixed: true, fallbackIconUrl: iconUrl });
      }
      if (block.type === 'secondary' && defs[0] && !slot2) {
        slot2 = normalizeSkillDef(defs[0], 'secondary', { fixed: true, fallbackIconUrl: iconUrl });
      }
      if (block.type === 'ability' && !slot3Options.length) {
        slot3Options = defs.map((d) =>
          normalizeSkillDef(d, 'ability', { choice: true, fallbackIconUrl: iconUrl })
        );
      }
    }
  }

  // Fallback: master weapon type starters
  if ((!slot1 || !slot2) && skillsCat) {
    const list = (skillsCat.allSkills || []).filter(
      (s) => s.weaponTypeId === weaponType && (s.tier === 0 || String(s.id).startsWith('t0_'))
    );
    const prim = list.find((s) => s.slotType === 'primary') || list[0];
    const sec = list.find((s) => s.slotType === 'secondary') || list[1];
    const abs = list.filter((s) => s.slotType === 'ability');
    if (!slot1 && prim)
      slot1 = normalizeSkillDef(prim, 'primary', { fixed: true, fallbackIconUrl: iconUrl });
    if (!slot2 && sec)
      slot2 = normalizeSkillDef(sec, 'secondary', { fixed: true, fallbackIconUrl: iconUrl });
    if (!slot3Options.length && abs.length) {
      slot3Options = abs.map((s) =>
        normalizeSkillDef(s, 'ability', { choice: true, fallbackIconUrl: iconUrl })
      );
    }
  }

  // Absolute last resort stub
  if (!slot1) {
    slot1 = normalizeSkillDef(
      {
        id: `${id}_basic`,
        name: 'Basic Attack',
        damage: 10,
        cooldown: 0.5,
        damageType: lab.labStyle === 'spell' ? 'arcane' : 'physical'
      },
      'primary',
      { fixed: true, fallbackIconUrl: iconUrl }
    );
  }
  if (!slot2) {
    slot2 = normalizeSkillDef(
      {
        id: `${id}_style`,
        name: 'Stance',
        damage: 0,
        cooldown: 5,
        damageType: slot1.damageType
      },
      'secondary',
      { fixed: true, fallbackIconUrl: iconUrl }
    );
  }
  if (!slot3Options.length) {
    slot3Options = [
      normalizeSkillDef(
        {
          id: `${id}_ability`,
          name: 'Ability',
          damage: 12,
          cooldown: 4,
          damageType: slot1.damageType
        },
        'ability',
        { choice: true, fallbackIconUrl: iconUrl }
      )
    ];
  }

  const defaultSlot3Id =
    t0?.weaponSkills?.defaultSlot3 ||
    t0?.defaultSlot3 ||
    slot3Options[0]?.id;

  return {
    id,
    name: present?.name || t0?.name || prefab?.name || id,
    tier: present?.tier ?? t0?.tier ?? 0,
    weaponType,
    meshSlot: lab.meshSlot,
    animPack: lab.animPack,
    labStyle: lab.labStyle,
    labElement: lab.labElement,
    iconUrl,
    modelUrl: present?.modelUrl || null,
    dropPrefabUrl: present?.dropPrefabUrl || null,
    present,
    slot1,
    slot2,
    slot3Options,
    defaultSlot3Id,
    stats: prefab?.stats || t0?.stats || null,
    description: t0?.description || prefab?.lore || prefab?.description || '',
    rawPrefab: prefab || null,
    rawT0: t0 || null,
    assetCdn: CDN
  };
}

/**
 * Load all equippable T0 weapons (merged prefab + t0 + skills).
 * @returns {Promise<{ weapons: EquippableWeapon[], byId: Map<string, EquippableWeapon>, prefabCat: object, skillsCat: object }>}
 */
export async function loadEquippableWeapons() {
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    const [prefabCat, skillsCat, t0Data] = await Promise.all([
      loadPrefabCatalog().catch(() => null),
      loadWeaponSkillsCatalog().catch(() => null),
      fetchJson([T0_WEAPONS_URL, T0_WEAPONS_MIRROR])
    ]);

    const t0List = t0Data?.weapons || [];
    const t0ById = new Map(t0List.map((w) => [w.id, w]));
    const prefabList = prefabCat?.list || [];
    // prefab catalog stores present-normalized list; also keep raw map if available
    const prefabRawById = new Map();
    if (prefabCat?._rawPrefabs) {
      for (const p of prefabCat._rawPrefabs) prefabRawById.set(p.id, p);
    }

    // Prefer all t0 prefabs + any t0-weapons not in prefabs
    const ids = new Set([
      ...prefabList.filter((p) => p.tier === 0 || String(p.id).startsWith('t0-')).map((p) => p.id),
      ...t0List.map((w) => w.id)
    ]);

    /** @type {EquippableWeapon[]} */
    const weapons = [];
    for (const id of ids) {
      const present = prefabList.find((p) => p.id === id) || null;
      const raw = prefabRawById.get(id) || present?.raw || null;
      const t0 = t0ById.get(id) || null;
      // presentPrefab already applied in list; rebuild from raw when possible
      const eq = buildEquippable(raw || present?.raw || present, t0, skillsCat);
      if (eq) weapons.push(eq);
    }

    weapons.sort((a, b) => a.name.localeCompare(b.name));
    const byId = new Map(weapons.map((w) => [w.id, w]));

    _cache = {
      weapons,
      byId,
      prefabCat,
      skillsCat,
      t0Data,
      loadedAt: Date.now()
    };
    _loading = null;
    return _cache;
  })();

  return _loading;
}

/**
 * Convert a skill def to DRC hotbar skill (combat runtime).
 * @param {WeaponSkillDef} sk
 * @param {number} barSlot
 * @param {EquippableWeapon} weapon
 */
export function skillDefToDrc(sk, barSlot, weapon) {
  if (!sk) return null;
  const labStyle = weapon?.labStyle || 'melee';
  const dmg = String(sk.damageType || '').toLowerCase();
  const isBuff =
    (sk.damage === 0 || /focus|stance|guard|ward|buff/i.test(sk.name + sk.id)) &&
    !/slash|bolt|spark|ping|thrust|sweep|shot/i.test(sk.name + sk.id);

  let element = 'arcane';
  let abilityElement = null;
  let style = 'melee';

  if (labStyle === 'spell' || /arcane|fire|frost|ice|holy|nature|lightning|water|earth|wind/.test(dmg)) {
    style = isBuff ? 'spell' : 'spell';
    if (dmg === 'fire') {
      element = 'fire';
      abilityElement = 'fire';
    } else if (dmg === 'frost' || dmg === 'ice' || dmg === 'water') {
      element = 'ice';
      abilityElement = 'water';
    } else if (dmg === 'nature' || dmg === 'earth') {
      element = 'nature';
      abilityElement = 'earth';
    } else if (dmg === 'lightning' || dmg === 'wind' || dmg === 'storm') {
      element = 'storm';
      abilityElement = 'wind';
    } else if (dmg === 'holy') {
      element = 'holy';
      abilityElement = 'wind';
    } else {
      element = 'arcane';
      abilityElement = 'wind';
    }
  } else {
    style = isBuff ? 'spell' : 'melee';
    element = 'physical';
    abilityElement = null;
  }

  const catalogLike = {
    ...sk,
    labStyle,
    labPack: weapon?.animPack,
    slotType: sk.slotType
  };

  return {
    id: sk.id,
    label: sk.name,
    slot: barSlot,
    style,
    skillKind: isBuff ? 'buff' : style,
    element,
    abilityElement,
    pathMode: style === 'spell' ? (isBuff ? null : 'stream') : null,
    animRole: isBuff ? 'block' : animRoleForSkill(catalogLike),
    animPack: weapon?.animPack || 'sword_shield',
    castClip: sk.animation || null,
    rangeM: sk.range || (style === 'spell' ? 12 : 3.2),
    cooldown: sk.cooldown || (style === 'melee' ? 0.55 : 1),
    castDuration: sk.castTime || 0.45,
    staminaCost: sk.resourceCost?.stamina ?? (style === 'melee' ? 6 : 0),
    manaCost: sk.resourceCost?.mana ?? 0,
    damage: sk.damage || 0,
    castEffectId: vfxIdForSkill(catalogLike),
    travelEffectId: style === 'spell' ? vfxIdForSkill(catalogLike) : null,
    impactEffectId: vfxIdForSkill(catalogLike),
    attachToHand: true,
    weaponId: weapon?.id,
    catalogSkillId: sk.id,
    isFocus: isBuff,
    focusDurationSec: isBuff ? 3 : 0,
    focusDamageMul: isBuff ? 1.35 : 1,
    effects: sk.effects || [],
    iconUrl: sk.iconUrl || weapon?.iconUrl,
    tier: sk.tier ?? 0,
    fixed: !!sk.fixed,
    choice: !!sk.choice,
    hint: `${sk.name} · ${weapon?.name || weapon?.id || ''}`
  };
}

/**
 * Hotbar [slot1, slot2, slot3] for an equipped weapon.
 * @param {EquippableWeapon} weapon
 * @param {string} [slot3Id]
 */
export function hotbarForWeapon(weapon, slot3Id) {
  if (!weapon) return [];
  const s3 =
    weapon.slot3Options.find((s) => s.id === slot3Id) ||
    weapon.slot3Options.find((s) => s.id === weapon.defaultSlot3Id) ||
    weapon.slot3Options[0];
  return [
    skillDefToDrc(weapon.slot1, 0, weapon),
    skillDefToDrc(weapon.slot2, 1, weapon),
    skillDefToDrc(s3, 2, weapon)
  ].filter(Boolean);
}

/**
 * Warlords / fleet weapon prefab export (authoring snapshot).
 * @param {EquippableWeapon} weapon
 * @param {{ slot3Id?: string }} [opts]
 */
export function exportWarlordsWeaponPrefab(weapon, opts = {}) {
  if (!weapon) return null;
  const slot3Id = opts.slot3Id || weapon.defaultSlot3Id;
  const hotbar = hotbarForWeapon(weapon, slot3Id);
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    kind: 'warlords-weapon-prefab',
    id: weapon.id,
    name: weapon.name,
    tier: weapon.tier,
    weaponType: weapon.weaponType,
    description: weapon.description,
    stats: weapon.stats,
    assets: {
      iconUrl: weapon.iconUrl,
      modelUrl: weapon.modelUrl,
      dropPrefabUrl: weapon.dropPrefabUrl,
      worldSprite: weapon.iconUrl,
      meshSlot: weapon.meshSlot,
      animPack: weapon.animPack
    },
    presentation: {
      iconUrl: weapon.iconUrl,
      modelUrl: weapon.modelUrl,
      borderColor: weapon.present?.borderColor,
      glowColor: weapon.present?.glowColor,
      tierLabel: weapon.present?.tierLabel
    },
    slotPattern: 'three-slot-starter',
    skills: {
      slot1: weapon.slot1,
      slot2: weapon.slot2,
      slot3Options: weapon.slot3Options,
      defaultSlot3Id: weapon.defaultSlot3Id,
      activeSlot3Id: slot3Id,
      hotbar
    },
    lab: {
      meshSlot: weapon.meshSlot,
      animPack: weapon.animPack,
      labStyle: weapon.labStyle,
      liveLab: 'https://casting-abilities-threejs.vercel.app/'
    },
    sources: {
      prefabs: 'api/v1/master-weapon-prefabs.json',
      t0: 'api/v1/t0-weapons.json',
      skills: 'api/v1/master-weaponSkills.json'
    }
  };
}
