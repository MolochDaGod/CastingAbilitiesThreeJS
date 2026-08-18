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
import { catalogJsonUrls } from '../config/fleetEnv.js';
import {
  loadWeaponSkillsCatalog,
  labMapForWeaponType,
  normalizeWeaponTypeId,
  animRoleForSkill,
  vfxIdForSkill,
  iconCdnUrl
} from './weaponSkillsCatalog.js';
import { WEAPON_SLOT_TO_PACK } from '../config/weaponAnimPack.js';
import { bindFromCatalogSkill } from '../combat/staffWeaponSkillsBind.js';
import {
  compileProductionWeaponSkill,
  getCachedProductionOverride,
  productionToDrcSkill,
  warmProductionOverrides
} from '../combat/weaponSkillProduction.js';
import { labMaxTier, isLabAdmin } from '../config/labAdmin.js';

export { warmProductionOverrides };

export const T0_WEAPONS_URL = 'https://info.grudge-studio.com/api/v1/t0-weapons.json';
/** Live ObjectStore Pages — objectstore.grudge-studio.com/api/v1 is 404 */
export const T0_WEAPONS_MIRROR =
  'https://grudge-objectstore.pages.dev/api/v1/t0-weapons.json';
/** Product browse (same skills as JSON) */
export const WEAPON_SKILLS_HTML = 'https://info.grudge-studio.com/WEAPON_SKILLS.html';

/** Catalog ids for the two T0 magic starters (Mage Wand = class item, later) */
export const T0_STARTER_WEAPON_IDS = Object.freeze({
  apprenticeWand: 't0-wand',
  saplingStaff: 't0-nature-staff'
});

/**
 * All catalog T0 starter weapon ids (api/v1/t0-weapons.json).
 * Lab equip + `?t0=<id>` · do not invent extra starters.
 */
export const T0_ALL_WEAPON_IDS = Object.freeze([
  't0-sword',
  't0-axe1h',
  't0-dagger',
  't0-hammer1h',
  't0-spear',
  't0-greatsword',
  't0-greataxe',
  't0-hammer2h',
  't0-bow',
  't0-crossbow',
  't0-gun',
  't0-wand',
  't0-nature-staff',
  't0-tool',
  't0-fishing-pole',
  't0-offhand-tome'
]);

/**
 * Production mesh overrides (R2 prod/gltf) when catalog still points at family staff.glb.
 * Uploaded 2026-08: arcane resonance → t0-wand · mushroom → t0-nature-staff · wand family.
 */
export const T0_MODEL_CDN = Object.freeze({
  't0-wand': `${CDN}/prod/gltf/weapons/t0-wand.glb`,
  't0-nature-staff': `${CDN}/prod/gltf/weapons/t0-nature-staff.glb`,
  /** Flintlock Pistol — local lab mesh until R2 prod upload */
  't0-gun': './models/weapons/t0-flintlock.glb',
  /** Fishing poles — Animated Fish Bundle (profession TOOL · Grudge Angler tiers) */
  't0-fishing-pole': './models/fish/poles/fishing_rod.glb',
  'fishing-pole-t1': './models/fish/poles/fishing_rod-0yar0lg58p.glb',
  'fishing-pole-t2': './models/fish/poles/fishing_rod-9aohhrphe7.glb',
  'fishing-pole-t3': './models/fish/poles/fishing_rod-aoabqwh68m.glb',
  'fishing-pole-t4': './models/fish/poles/fishing_rod-ldlwqjn9zg.glb',
  'fishing-pole-t5': './models/fish/poles/fishing_rod-ldlwqjn9zg.glb'
});

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
  /** Handgun uses dedicated pistol anim pack (gunplay spin · draw · whip) */
  GUN: 'pistol',
  RIFLE: 'bow',
  PISTOL: 'pistol',
  HANDGUN: 'pistol',
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

/** Clear in-memory equippable catalog (e.g. after DO promote / Multiverse push). */
export function clearEquippableWeaponsCache() {
  _cache = null;
  _loading = null;
  if (typeof globalThis !== 'undefined') {
    globalThis.__castingT0WeaponsCache = null;
  }
}

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
  // Catalog Instant = castTime null/undefined → 0. Do not invent 0.4/0.5.
  const castRaw = sk.castTime;
  const castTime =
    castRaw == null || castRaw === '' || castRaw === 'Instant'
      ? 0
      : Number(castRaw) || 0;
  const cdRaw = sk.cooldown;
  const cooldown =
    cdRaw == null || cdRaw === '' || cdRaw === '—' ? 0 : Number(cdRaw) || 0;
  return {
    id: sk.id,
    uuid: sk.uuid || null,
    name: sk.name || sk.id,
    description: sk.description || '',
    damage: Number(sk.damage) || 0,
    cooldown,
    castTime,
    range: sk.range == null || sk.range === '' || sk.range === '—' ? null : sk.range,
    damageType: sk.damageType || 'physical',
    /** Catalog projectile token: bullet | null — keep for gun / bow delivery */
    projectile:
      sk.projectile == null || sk.projectile === '' || sk.projectile === '—'
        ? null
        : String(sk.projectile),
    icon: sk.icon || opts.fallbackIcon || null,
    iconUrl: iconCdnUrl(sk.icon || opts.fallbackIcon) || opts.fallbackIconUrl || null,
    effects: Array.isArray(sk.effects) ? sk.effects.slice() : [],
    resourceCost: sk.resourceCost || { mana: 0, stamina: 0 },
    slotType,
    fixed: opts.fixed ?? false,
    choice: opts.choice ?? false,
    tier: sk.tier ?? 0,
    animation: sk.animation || sk.prefab?.animationClip || null,
    prefab: sk.prefab || null,
    castingSpellId: sk.castingSpellId || null,
    /** Provenance — never invent skill rows; only catalog or explicit stub */
    source: opts.source || 'catalog'
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

  // Prefer authored T0 meshes on CDN over generic family staff.glb
  const modelOverride = T0_MODEL_CDN[id] || null;
  const modelUrl =
    modelOverride ||
    t0?.modelUrl ||
    t0?.assets?.modelUrl ||
    present?.modelUrl ||
    null;

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

  // Absolute last resort stub — only if catalog fetch failed; marked source stub
  if (!slot1) {
    console.warn(`[t0WeaponCatalog] missing catalog slot1 for ${id} — stub only`);
    slot1 = normalizeSkillDef(
      {
        id: `${id}_basic`,
        name: 'Basic Attack',
        damage: 10,
        cooldown: 0.5,
        castTime: 0,
        damageType: lab.labStyle === 'spell' ? 'arcane' : 'physical'
      },
      'primary',
      { fixed: true, fallbackIconUrl: iconUrl, source: 'stub-fallback' }
    );
  }
  if (!slot2) {
    console.warn(`[t0WeaponCatalog] missing catalog slot2 for ${id} — stub only`);
    slot2 = normalizeSkillDef(
      {
        id: `${id}_style`,
        name: 'Stance',
        damage: 0,
        cooldown: 5,
        castTime: 0,
        damageType: slot1.damageType
      },
      'secondary',
      { fixed: true, fallbackIconUrl: iconUrl, source: 'stub-fallback' }
    );
  }
  if (!slot3Options.length) {
    console.warn(`[t0WeaponCatalog] missing catalog slot3 for ${id} — stub only`);
    slot3Options = [
      normalizeSkillDef(
        {
          id: `${id}_ability`,
          name: 'Ability',
          damage: 12,
          cooldown: 4,
          castTime: 0,
          damageType: slot1.damageType
        },
        'ability',
        { choice: true, fallbackIconUrl: iconUrl, source: 'stub-fallback' }
      )
    ];
  }

  const defaultSlot3Id =
    t0?.weaponSkills?.defaultSlot3 ||
    t0?.defaultSlot3 ||
    slot3Options[0]?.id;

  return {
    id,
    /** GRUDGE ITEM-* identity (prefab or t0 row) */
    uuid: prefab?.uuid || t0?.uuid || present?.uuid || null,
    baseUuid: prefab?.baseUuid || prefab?.uuid || t0?.uuid || null,
    name: present?.name || t0?.name || prefab?.name || id,
    tier: present?.tier ?? t0?.tier ?? 0,
    weaponType,
    meshSlot: lab.meshSlot,
    animPack: lab.animPack,
    labStyle: lab.labStyle,
    labElement: lab.labElement,
    iconUrl,
    modelUrl,
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
 * Load all equippable T0 weapons from live catalog.
 * **SSOT:** https://info.grudge-studio.com/api/v1/t0-weapons.json
 * (+ master-weapon-prefabs for icons/models when present)
 * Browse: WEAPON_SKILLS.html
 *
 * @returns {Promise<{ weapons: EquippableWeapon[], byId: Map<string, EquippableWeapon>, prefabCat: object, skillsCat: object }>}
 */
export async function loadEquippableWeapons() {
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = (async () => {
    const [prefabCat, skillsCat, t0Data] = await Promise.all([
      loadPrefabCatalog().catch(() => null),
      loadWeaponSkillsCatalog().catch(() => null),
      fetchJson(catalogJsonUrls('t0-weapons.json'))
    ]);

    const t0List = t0Data?.weapons || [];
    if (!t0List.length) {
      console.warn('[t0WeaponCatalog] t0-weapons.json empty/unreachable — no starters');
    }
    const t0ById = new Map(t0List.map((w) => [w.id, w]));
    const prefabList = prefabCat?.list || [];
    const prefabRawById = new Map();
    if (prefabCat?._rawPrefabs) {
      for (const p of prefabCat._rawPrefabs) prefabRawById.set(p.id, p);
    }

    // t0-weapons is skill SSOT; prefabs enrich icon/model.
    // Lab admin (L20 · max T8): also load higher-tier prefabs that resolve skills
    // so production push can smoke every icon / tree / equip path.
    const maxTier = isLabAdmin() ? labMaxTier() : 0;
    const ids = new Set([
      ...t0List.map((w) => w.id),
      ...prefabList
        .filter(
          (p) =>
            p.tier === 0 ||
            String(p.id).startsWith('t0-') ||
            (maxTier > 0 && Number(p.tier) <= maxTier && p.weaponType)
        )
        .map((p) => p.id)
    ]);

    /** @type {EquippableWeapon[]} */
    const weapons = [];
    let stubCount = 0;
    let missingIcon = 0;
    for (const id of ids) {
      const present = prefabList.find((p) => p.id === id) || null;
      const raw = prefabRawById.get(id) || present?.raw || null;
      const t0 = t0ById.get(id) || null;
      // Prefer t0 body (skills) + prefab mesh when available
      const eq = buildEquippable(raw || present?.raw || present, t0, skillsCat);
      if (eq) {
        // Every skill must produce an icon for Main Panel tree + HUD
        ensureWeaponSkillIcons(eq);
        if (
          eq.slot1?.source === 'stub-fallback' ||
          eq.slot2?.source === 'stub-fallback'
        ) {
          stubCount += 1;
        }
        if (!eq.iconUrl) missingIcon += 1;
        eq.catalogSource = {
          t0: T0_WEAPONS_URL,
          skillsHtml: WEAPON_SKILLS_HTML,
          weaponId: id
        };
        weapons.push(eq);
      }
    }
    if (stubCount || missingIcon) {
      console.warn(
        `[t0WeaponCatalog] ${weapons.length} weapons · ${stubCount} with stub skills · ${missingIcon} missing weapon icon · maxTier=${maxTier}`
      );
    } else {
      console.info(
        `[t0WeaponCatalog] ${weapons.length} weapons loaded · all skill icons resolved · maxTier=${maxTier}`
      );
    }

    // Ensure the two magic starters always surface first when present
    const priority = [T0_STARTER_WEAPON_IDS.apprenticeWand, T0_STARTER_WEAPON_IDS.saplingStaff];
    weapons.sort((a, b) => {
      const pa = priority.indexOf(a.id);
      const pb = priority.indexOf(b.id);
      if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
      return a.name.localeCompare(b.name);
    });
    let byId = new Map(weapons.map((w) => [w.id, w]));
    let doMerge = { merged: 0, doMeta: null };

    // Merge Cloudflare DO equip mirror (lab drafts + Multiverse push) — t0 wins on id
    try {
      const { mergeDoEquipCatalog } = await import('./weaponSkillDoApi.js');
      const merged = await mergeDoEquipCatalog({ weapons, byId }, { preferRemote: false });
      if (merged.merged > 0) {
        weapons.length = 0;
        weapons.push(...merged.weapons);
        byId = merged.byId;
      }
      doMerge = { merged: merged.merged, doMeta: merged.doMeta, remoteCount: merged.remoteCount };
    } catch (e) {
      console.warn('[t0WeaponCatalog] DO equip merge skipped', e?.message || e);
    }

    _cache = {
      weapons,
      byId,
      prefabCat,
      skillsCat,
      t0Data,
      doMerge,
      starters: {
        apprenticeWand: byId.get(T0_STARTER_WEAPON_IDS.apprenticeWand) || null,
        saplingStaff: byId.get(T0_STARTER_WEAPON_IDS.saplingStaff) || null
      },
      loadedAt: Date.now()
    };
    // Sync access for skill trees (wand / sapling) without re-fetch
    if (typeof globalThis !== 'undefined') {
      globalThis.__castingT0WeaponsCache = _cache;
    }
    _loading = null;
    return _cache;
  })();

  return _loading;
}

/** Sync read of last loaded equippable catalog (null until first load). */
export function getEquippableWeaponsCache() {
  return _cache || (typeof globalThis !== 'undefined' ? globalThis.__castingT0WeaponsCache : null) || null;
}

/**
 * Hotbar for a live catalog T0 id (e.g. t0-wand, t0-nature-staff).
 * @param {string} weaponId
 * @param {string} [slot3Id]
 */
export async function hotbarForCatalogWeaponId(weaponId, slot3Id) {
  const cat = await loadEquippableWeapons();
  const w = cat.byId.get(weaponId);
  if (!w) return [];
  return hotbarForWeapon(w, slot3Id || w.defaultSlot3Id);
}

/**
 * Convert a skill def to DRC hotbar skill (combat runtime).
 * @param {WeaponSkillDef} sk
 * @param {number} barSlot
 * @param {EquippableWeapon} weapon
 */
export function skillDefToDrc(sk, barSlot, weapon) {
  if (!sk) return null;

  // Production compiler — anim + VFX + physics + statuses + delivery (catalog-first)
  // Overrides: warmProductionOverrides([ids]) on equip, then cache is available here.
  try {
    const cachedOv = getCachedProductionOverride(sk.id);
    const prod = compileProductionWeaponSkill(sk, {
      weaponTypeId: weapon?.weaponType || weapon?.weaponTypeId,
      animPack: weapon?.animPack,
      labStyle: weapon?.labStyle,
      barSlot,
      overrides: cachedOv || sk.production || undefined
    });
    if (prod) {
      const drc = productionToDrcSkill(prod);
      if (!drc.iconUrl && weapon?.iconUrl) drc.iconUrl = weapon.iconUrl;
      drc.weaponId = weapon?.id;
      drc.attachToHand = true;
      drc.fixed = !!sk.fixed;
      drc.choice = !!sk.choice;
      drc.tier = sk.tier ?? 0;
      drc.catalogUuid = sk.uuid || null;
      drc.source = sk.source || 'catalog';
      drc.hint = `${sk.name} · ${weapon?.name || weapon?.id || ''} · production`;
      return drc;
    }
  } catch (e) {
    console.warn('[skillDefToDrc] production compile failed, legacy path', sk.id, e);
  }

  // ── Legacy fallback (should rarely run) ─────────────────────────────
  const labStyle = weapon?.labStyle || 'melee';
  const dmg = String(sk.damageType || '').toLowerCase();
  const nameId = `${sk.id} ${sk.name}`;
  const isHeal = sk.damage < 0 || /heal|sprout|radiant|minor.?heal/i.test(nameId);
  // Zero-damage utility / stance / aim — catalog buffs (not invented)
  const isBuff =
    !isHeal &&
    Number(sk.damage) === 0 &&
    /focus|stance|guard|ward|buff|shield|brace|aim|reload|cover|evade|wind.?up|lumber|pole.?guard|read.?page|take.?aim|take.?cover/i.test(
      nameId
    );
  /** Focus / Take Aim / Wind-Up / Power Stance = next-hit damage mul */
  const isFocus =
    isBuff && /focus|take.?aim|wind.?up|power.?stance|read.?page/i.test(nameId);
  /** Ward / guard / brace / cover / lumber = defense */
  const isWard =
    isBuff && /ward|shield|guard|brace|cover|lumber|pole.?guard/i.test(nameId);

  let element = 'arcane';
  let abilityElement = null;
  let style = 'melee';

  if (labStyle === 'ranged') {
    style = isBuff ? 'spell' : 'ranged';
    element = 'physical';
    abilityElement = null;
  } else if (labStyle === 'spell' || /arcane|fire|frost|ice|holy|nature|lightning|water|earth|wind/.test(dmg)) {
    style = 'spell';
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
    // Melee / tool — buffs stay non-damage utility
    style = isBuff || isHeal ? 'spell' : 'melee';
    element = isHeal ? 'nature' : 'physical';
    abilityElement = isHeal ? 'earth' : null;
  }

  // Fill cast/travel/impact from WEAPON_SKILLS / staff school bind (catalog id only)
  const staffB = bindFromCatalogSkill({
    id: sk.id,
    name: sk.name,
    description: sk.description,
    damageType: sk.damageType,
    effects: sk.effects,
    cooldown: sk.cooldown,
    castTime: sk.castTime,
    range: sk.range,
    damage: sk.damage,
    slotType: sk.slotType,
    resourceCost: sk.resourceCost
  });

  const catalogLike = {
    ...sk,
    labStyle,
    labPack: weapon?.animPack,
    slotType: sk.slotType,
    castEffectId: staffB?.castEffectId,
    travelEffectId: staffB?.travelEffectId,
    impactEffectId: staffB?.impactEffectId
  };

  const vfx = vfxIdForSkill(catalogLike);

  return {
    id: sk.id,
    label: sk.name,
    slot: barSlot,
    style,
    skillKind: isBuff ? 'buff' : isHeal ? 'heal' : style,
    element: staffB?.element || element,
    abilityElement: staffB ? staffB.element : abilityElement,
    pathMode: isBuff || isHeal ? null : staffB?.pathMode || (style === 'spell' ? 'stream' : null),
    presentation: staffB?.presentation || null,
    animRole: isBuff || isHeal ? (labStyle === 'melee' || labStyle === 'ranged' ? 'block' : 'cast') : animRoleForSkill(catalogLike),
    animPack:
      weapon?.animPack ||
      (labStyle === 'spell' ? 'magic' : labStyle === 'ranged' ? 'longbow' : 'sword_shield'),
    castClip: sk.animation || staffB?.castClip || 'magic/standing 1h cast spell 01',
    rangeM:
      sk.range ||
      staffB?.rangeM ||
      (style === 'spell' ? 12 : style === 'ranged' ? 18 : 3.2),
    // Prefer catalog numbers; Instant castTime = 0 (do not invent cast windows)
    cooldown: sk.cooldown ?? staffB?.cooldown ?? 0,
    castDuration:
      sk.castTime != null && sk.castTime !== ''
        ? Number(sk.castTime) || 0
        : staffB?.castDuration ?? 0,
    staminaCost: sk.resourceCost?.stamina ?? 0,
    manaCost: sk.resourceCost?.mana ?? staffB?.manaCost ?? 0,
    damage: sk.damage ?? 0,
    castEffectId: staffB?.castEffectId || vfx,
    travelEffectId: isBuff || isHeal ? null : staffB?.travelEffectId || vfx,
    impactEffectId: staffB?.impactEffectId || vfx,
    attachToHand: true,
    weaponId: weapon?.id,
    catalogSkillId: sk.id,
    isFocus,
    isWard,
    focusDurationSec: isFocus ? 3 : isWard ? 2 : 0,
    focusDamageMul: isFocus ? 1.35 : 1,
    effects: sk.effects || [],
    description: sk.description || '',
    iconUrl: sk.iconUrl || weapon?.iconUrl,
    tier: sk.tier ?? 0,
    fixed: !!sk.fixed,
    choice: !!sk.choice,
    source: sk.source || 'info.grudge-studio.com/api/v1/t0-weapons.json',
    catalogUuid: sk.uuid || null,
    hint: `${sk.name} · ${weapon?.name || weapon?.id || ''} · catalog`
  };
}

/**
 * Guarantee every skill on a weapon has iconUrl (CDN or weapon fallback).
 * Product: no weapon ships without skill icons for Main Panel + HUD.
 * @param {EquippableWeapon} weapon
 */
export function ensureWeaponSkillIcons(weapon) {
  if (!weapon) return weapon;
  const fallback =
    weapon.iconUrl ||
    cdnUrl('icons/pack/weapons/Sword_01.png');
  if (!weapon.iconUrl) weapon.iconUrl = fallback;
  const patch = (sk) => {
    if (!sk) return;
    if (!sk.iconUrl) {
      sk.iconUrl = iconCdnUrl(sk.icon) || fallback;
    }
    if (!sk.icon && sk.iconUrl) {
      // keep path-ish for export when only URL present
      sk.icon = sk.icon || null;
    }
  };
  patch(weapon.slot1);
  patch(weapon.slot2);
  for (const s of weapon.slot3Options || []) patch(s);
  return weapon;
}

/**
 * Full skill list for Main Panel weapon skill tree (icons + tooltips).
 * Slot1 · Slot2 · all Slot3 options — catalog only.
 * @param {EquippableWeapon} weapon
 * @param {string} [activeSlot3Id]
 */
export function weaponSkillTreeRows(weapon, activeSlot3Id) {
  if (!weapon) return [];
  ensureWeaponSkillIcons(weapon);
  const active =
    activeSlot3Id || weapon.defaultSlot3Id || weapon.slot3Options?.[0]?.id;
  /** @type {object[]} */
  const rows = [];
  if (weapon.slot1) {
    rows.push({
      ...weapon.slot1,
      barSlot: 0,
      keyLabel: '1',
      active: true,
      treeRole: 'primary'
    });
  }
  if (weapon.slot2) {
    rows.push({
      ...weapon.slot2,
      barSlot: 1,
      keyLabel: '2',
      active: true,
      treeRole: 'secondary'
    });
  }
  for (const s of weapon.slot3Options || []) {
    rows.push({
      ...s,
      barSlot: 2,
      keyLabel: '3',
      active: s.id === active,
      treeRole: 'ability',
      choice: true
    });
  }
  return rows;
}

/**
 * Tooltip body for a weapon skill (Main Panel + HUD title).
 * @param {object} sk
 * @param {EquippableWeapon} [weapon]
 */
export function weaponSkillTooltip(sk, weapon) {
  if (!sk) return '';
  const parts = [
    sk.name || sk.label || sk.id,
    sk.description || '',
    [
      sk.damageType || '',
      sk.damage != null ? `${sk.damage} dmg` : '',
      sk.cooldown != null ? `CD ${sk.cooldown}s` : '',
      sk.castTime != null && sk.castTime > 0 ? `cast ${sk.castTime}s` : 'Instant',
      sk.range != null ? `rng ${sk.range}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    weapon ? `${weapon.name} · T${weapon.tier} · ${weapon.weaponType}` : '',
    sk.slotType || sk.treeRole || '',
    sk.source === 'stub-fallback' ? '⚠ stub — catalog missing skill body' : ''
  ].filter(Boolean);
  return parts.join('\n');
}

/**
 * Hotbar for equipped weapon — **catalog skills only** (no invented rows).
 * T0: slots 1–2 fixed, slot 3 = chosen option from slot3Options.
 * Anim roles map presentation only; DMG/CD/cast/effects stay from JSON.
 * @param {EquippableWeapon} weapon
 * @param {string} [slot3Id]
 */
export function hotbarForWeapon(weapon, slot3Id) {
  if (!weapon) return [];
  ensureWeaponSkillIcons(weapon);
  const s3 =
    weapon.slot3Options.find((s) => s.id === slot3Id) ||
    weapon.slot3Options.find((s) => s.id === weapon.defaultSlot3Id) ||
    weapon.slot3Options[0];
  const bar = [
    skillDefToDrc(weapon.slot1, 0, weapon),
    skillDefToDrc(weapon.slot2, 1, weapon),
    skillDefToDrc(s3, 2, weapon)
  ].filter(Boolean);

  // Always surface icon + tooltip fields on hotbar skills
  for (const sk of bar) {
    if (!sk.iconUrl) sk.iconUrl = weapon.iconUrl;
    if (!sk.description && sk.id === weapon.slot1?.id) sk.description = weapon.slot1?.description;
    if (!sk.description && sk.id === weapon.slot2?.id) sk.description = weapon.slot2?.description;
    if (!sk.description && s3?.id === sk.id) sk.description = s3?.description;
    sk.tooltip = weaponSkillTooltip(
      {
        name: sk.label,
        description: sk.description,
        damage: sk.damage,
        damageType: sk.damageType,
        cooldown: sk.cooldown,
        castTime: sk.castDuration,
        range: sk.rangeM,
        slotType: sk.slot === 0 ? 'primary' : sk.slot === 1 ? 'secondary' : 'ability',
        id: sk.id,
        source: sk.source
      },
      weapon
    );
  }

  // Presentation only: anim role + effect-string hints (catalog numbers untouched)
  applyT0Presentation(bar, weapon);
  return bar;
}

/**
 * Map all T0 catalog skill names → anim roles / residual hints.
 * Does not invent skills — only presentation for the 15 starters.
 * @param {object[]} bar
 * @param {EquippableWeapon} [weapon]
 */
export function applyT0Presentation(bar, weapon) {
  const pack = weapon?.animPack || 'sword_shield';
  const isRangedPack =
    pack === 'longbow' || pack === 'pistol' || weapon?.labStyle === 'ranged';
  for (const sk of bar) {
    if (!sk) continue;
    const idn = `${sk.id} ${sk.label}`.toLowerCase();
    const desc = String(sk.description || '').toLowerCase();
    const fx = (sk.effects || []).join(' ').toLowerCase();
    const blob = `${idn} ${fx} ${desc}`;

    // --- Slot 2 style / utility (dmg 0) ---
    if (sk.damage === 0 || sk.isBuff || sk.isWard || sk.isFocus) {
      if (/evade/.test(idn)) {
        sk.animRole = 'dodgeB';
        sk.skillKind = 'buff';
      } else if (pack === 'magic') {
        sk.animRole = sk.isFocus || /aim|reload|focus|read/.test(idn) ? 'cast' : 'block';
      } else if (isRangedPack) {
        // Take Cover / Reload / Take Aim — block or cast (pistol kneel-ready later)
        sk.animRole =
          sk.isFocus || /aim|reload|focus|read/.test(idn) ? 'cast' : 'block';
      } else {
        sk.animRole = 'block';
      }
      const m = fx.match(/(\d+(?:\.\d+)?)\s*s/);
      if (m) sk.focusDurationSec = Number(m[1]);
      // Take Cover: default 2s ward if catalog effect has no number (still "-dmg taken 2s")
      if (sk.isWard && !(sk.focusDurationSec > 0)) sk.focusDurationSec = 2;
      continue;
    }

    // --- Heals ---
    if (sk.damage < 0 || sk.skillKind === 'heal') {
      sk.animRole = 'cast';
      sk.style = 'spell';
      continue;
    }

    // --- Ranged T0 (bow / xbow / flintlock pistol) ---
    if (
      isRangedPack ||
      sk.style === 'ranged' ||
      sk.projectile === 'bullet' ||
      sk.projectileKind === 'bullet' ||
      sk.useBulletProjectile ||
      /shot|bolt|arrow|fire|pinning|rapid|piercing|knockback.?shot|burst|suppress/i.test(idn)
    ) {
      if (isRangedPack || sk.style === 'ranged' || sk.useBulletProjectile) {
        sk.style = 'ranged';
        sk.animRole = 'attack';
        if (!sk.rangeM || sk.rangeM < 5) sk.rangeM = 18;
        if (/knockback/i.test(fx + idn)) {
          sk.knockbackMm = 280;
          sk.knockupVy = 1.2;
        }
        // Multi-hit count from catalog text (Burst Fire = three-round → 3)
        if (/double|rapid|burst|multi|three.?round|3.?round|triple/i.test(blob)) {
          if (/three.?round|3.?round|triple/i.test(blob)) sk.multiHit = 3;
          else if (/double|twin|2.?hit/i.test(blob)) sk.multiHit = 2;
          else if (/burst|multi/i.test(blob)) sk.multiHit = sk.multiHit || 3;
          else sk.multiHit = sk.multiHit || 2;
        }
        // Flintlock / gun: ensure bullet delivery flags survive presentation
        if (
          pack === 'pistol' ||
          weapon?.id === 't0-gun' ||
          /t0_gun|flint|pistol|handgun/i.test(idn) ||
          sk.projectile === 'bullet'
        ) {
          sk.useBulletProjectile = true;
          sk.projectileKind = 'bullet';
          if (sk.projectile == null) sk.projectile = 'bullet';
        }
        continue;
      }
    }

    // --- Magic T0 (wand / staff / tome) ---
    if (pack === 'magic' || sk.style === 'spell') {
      sk.animRole = 'cast';
      sk.style = 'spell';
      continue;
    }

    // --- Melee / tool starters (sword_shield pack) ---
    // Order: specials before generic "practice/stab/thrust" so Backstab ≠ attack1
    if (
      /overhead|heavy.?blow|crushing|stagger|backstab|reach.?strike|quick.?thrust|high single|armor break/i.test(
        idn + fx
      )
    ) {
      sk.animRole = 'attack3';
    } else if (/sweep|cleaving|spinning|wide.?arc|shockwave|cone|\baoe\b|poison/i.test(idn + fx)) {
      sk.animRole = 'attack2';
      sk.residualAoe = sk.residualAoe || 1.3;
    } else if (
      /practice|starter|^chop$|^mine$|^skin$|^pry$|practice.?chop|practice.?stab|practice.?smash|practice.?thrust|practice.?cleave|practice.?hew/i.test(
        idn
      )
    ) {
      sk.animRole = 'attack1';
    } else {
      sk.animRole = sk.animRole && sk.animRole !== 'attack' ? sk.animRole : 'attack1';
    }

    if (/extended reach|extended range|reach/i.test(fx) && (!sk.rangeM || sk.rangeM < 4)) {
      sk.rangeM = 3.8;
    }
    if (/small aoe|aoe|cone/i.test(fx)) sk.residualAoe = sk.residualAoe || 1.2;
  }
}

/**
 * Warlords / fleet weapon prefab export — full GRUDGE UUID contract + hotbar.
 * @param {EquippableWeapon} weapon
 * @param {{ slot3Id?: string }} [opts]
 */
export function exportWarlordsWeaponPrefab(weapon, opts = {}) {
  if (!weapon) return null;
  const slot3Id = opts.slot3Id || weapon.defaultSlot3Id;
  const hotbar = hotbarForWeapon(weapon, slot3Id);
  // Lazy import avoided circular issues — inline contract shape from raw rows
  const raw = weapon.rawPrefab || weapon.rawT0 || {};
  const t0 = weapon.rawT0 || null;
  const contract = {
    version: '1.1.0',
    kind: 'warlords-weapon-prefab',
    generated: new Date().toISOString(),
    uuids: {
      item: weapon.uuid || raw.uuid || t0?.uuid || null,
      baseItem: raw.baseUuid || weapon.uuid || t0?.uuid || null,
      icon: raw.assets?.iconUuid || null,
      recipe: raw.recipeUuid || null,
      skills: [
        weapon.slot1?.uuid,
        weapon.slot2?.uuid,
        ...(weapon.slot3Options || []).map((s) => s.uuid)
      ].filter(Boolean),
      activeSlot3: (weapon.slot3Options || []).find((s) => s.id === slot3Id)?.uuid || null
    },
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
      animPack: weapon.animPack,
      dropPrefabR2Key: raw.assets?.dropPrefabR2Key || null,
      worldDropVfxR2Key: raw.assets?.worldDropVfxR2Key || null
    },
    presentation: {
      iconUrl: weapon.iconUrl,
      modelUrl: weapon.modelUrl,
      borderColor: weapon.present?.borderColor,
      glowColor: weapon.present?.glowColor,
      tierLabel: weapon.present?.tierLabel
    },
    slotPattern: weapon.tier === 0 ? 'three-slot-starter' : 'five-slot',
    skills: {
      slot1: weapon.slot1,
      slot2: weapon.slot2,
      slot3Options: weapon.slot3Options,
      defaultSlot3Id: weapon.defaultSlot3Id,
      activeSlot3Id: slot3Id,
      hotbar,
      skillUuids: [
        weapon.slot1?.uuid,
        weapon.slot2?.uuid,
        ...(weapon.slot3Options || []).map((s) => s.uuid)
      ].filter(Boolean)
    },
    runtime: {
      meshSlot: weapon.meshSlot,
      animPack: weapon.animPack,
      labStyle: weapon.labStyle,
      jobs: ['bag', 'equip', 'controller', 'hotbar', 'combat', 'craft', 'export']
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
      skills: 'api/v1/master-weaponSkills.json',
      registry: 'api/v1/master-registry.json'
    }
  };
  return contract;
}
