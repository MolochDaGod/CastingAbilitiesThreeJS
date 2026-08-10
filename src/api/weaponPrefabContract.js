/**
 * GRUDGE UUID + weapon prefab contract (Casting / Warlords).
 *
 * Strengthens pattern: every weapon prefab is a **linked UUID graph**, not just a name.
 * Catalog SSOT: master-weapon-prefabs.json · t0-weapons.json · master-weaponSkills.json
 *
 * @see docs/WEAPON_PREFAB_UUID_SSOT.md
 * @see docs/GAME_ITEM_PREFAB_PRODUCTION_SSOT.md
 */

import { cdnUrl, presentPrefab, tierPresent } from '../loot/prefabAssets.js';
import { labMapForWeaponType, normalizeWeaponTypeId } from './weaponSkillsCatalog.js';
import { WEAPON_SLOT_TO_PACK } from '../config/weaponAnimPack.js';
import { WEAPON_TYPE_TO_MESH_SLOT } from './t0WeaponCatalog.js';

/** Official GRUDGE UUID prefixes (ObjectStore / registry). */
export const GRUDGE_UUID_PREFIX = Object.freeze({
  item: 'ITEM-',
  skill: 'SKIL-',
  icon: 'ICON-',
  recipe: 'RECP-',
  attribute: 'ATTR-',
  material: 'MATL-',
  relic: 'RELC-',
  mount: 'MNT-',
  artifact: 'ARTF-',
  enchant: 'ENCH-',
  effect: 'VFX-' // when bound on skill.prefab.vfxRef
});

/**
 * What a weapon prefab must **have** (data layers).
 * @type {readonly string[]}
 */
export const WEAPON_PREFAB_REQUIRED_LAYERS = Object.freeze([
  'identity', // uuid + id + name + tier + weaponType
  'stats', // damage / speed / crit / defense …
  'skills', // SKIL-* slots (T0 three-slot or T1+ five-slot)
  'assets', // icon (+ model when available)
  'runtime', // meshSlot · animPack · labStyle
  'loadout' // pattern three-slot-starter | five-slot
]);

/**
 * What a weapon prefab must **do** at runtime (consumers).
 * @type {readonly { id: string, label: string, surface: string }[]}
 */
export const WEAPON_PREFAB_RUNTIME_JOBS = Object.freeze([
  { id: 'bag', label: 'Show in bag / world drop', surface: 'icon + tier presentation' },
  { id: 'equip', label: 'Equip main/off hand', surface: 'mesh_ids + hand GLB attach' },
  { id: 'controller', label: 'Drive controller pack', surface: 'animPack from weaponType' },
  { id: 'hotbar', label: 'Bind skill hotbar', surface: 'skillIds + skillUuids → DRC' },
  { id: 'combat', label: 'Fire skills in combat', surface: 'delivery · residual · cast' },
  { id: 'craft', label: 'Link craft / T0→T1', surface: 'recipeUuid · craftsInto' },
  { id: 'export', label: 'Export for Unity / Warlords', surface: 'full contract JSON' }
]);

/**
 * @param {string|null|undefined} u
 * @param {string} [prefix]
 */
export function isGrudgeUuid(u, prefix) {
  if (!u || typeof u !== 'string') return false;
  if (prefix) return u.startsWith(prefix);
  return /^(ITEM|SKIL|ICON|RECP|ATTR|MATL|RELC|MNT|ARTF|ENCH|VFX|PREFAB)-/i.test(u);
}

/**
 * Parse skill slot blocks from prefab.skills or prefab.loadout.bindings.
 * @param {object} prefab
 * @returns {{ type: string, label?: string, skillIds: string[], skillUuids: string[], fixed: boolean, choice: boolean }[]}
 */
export function prefabSkillSlots(prefab) {
  const slots =
    prefab?.skills?.slots ||
    prefab?.loadout?.bindings?.slots ||
    prefab?.loadout?.slots ||
    [];
  return (slots || []).map((s) => ({
    type: s.type || 'ability',
    label: s.label || s.type,
    skillIds: [...(s.skillIds || [])],
    skillUuids: [...(s.skillUuids || [])],
    fixed: !!s.fixed,
    choice: !!s.choice,
    unlockTier: s.unlockTier ?? 0
  }));
}

/**
 * Flatten all SKIL-* on a prefab.
 * @param {object} prefab
 * @returns {string[]}
 */
export function prefabAllSkillUuids(prefab) {
  const fromRoot = prefab?.skills?.skillUuids || [];
  const fromSlots = prefabSkillSlots(prefab).flatMap((s) => s.skillUuids);
  return [...new Set([...fromRoot, ...fromSlots].filter((u) => isGrudgeUuid(u, GRUDGE_UUID_PREFIX.skill)))];
}

/**
 * Runtime bind surface from weaponType.
 * @param {object} prefab
 */
export function runtimeBindFromPrefab(prefab) {
  const wt = normalizeWeaponTypeId(prefab?.weaponType || prefab?.category || 'SWORD');
  const lab = labMapForWeaponType(wt);
  const meshSlot = WEAPON_TYPE_TO_MESH_SLOT[wt] || lab.slot || 'sword';
  const animPack = WEAPON_SLOT_TO_PACK[meshSlot] || lab.pack || 'sword_shield';
  return {
    weaponType: wt,
    meshSlot,
    animPack,
    labStyle: lab.style || 'melee',
    labElement: lab.element || null,
    equipmentSlot: prefab?.ummorpg?.equipmentSlot || 'MainHand',
    ummorpgClass: prefab?.ummorpg?.scriptableItemClass || 'WeaponItem'
  };
}

/**
 * Validate a master-weapon-prefabs (or merged T0) row.
 * @param {object} prefab
 * @returns {{ ok: boolean, score: number, max: number, missing: string[], warnings: string[], layers: Record<string, boolean> }}
 */
export function validateWeaponPrefab(prefab) {
  const missing = [];
  const warnings = [];
  const layers = {
    identity: false,
    stats: false,
    skills: false,
    assets: false,
    runtime: false,
    loadout: false
  };

  if (!prefab) {
    return { ok: false, score: 0, max: 6, missing: ['prefab'], warnings, layers };
  }

  // identity
  if (isGrudgeUuid(prefab.uuid, GRUDGE_UUID_PREFIX.item) && prefab.id && prefab.name != null) {
    layers.identity = true;
  } else {
    if (!isGrudgeUuid(prefab.uuid, GRUDGE_UUID_PREFIX.item)) missing.push('uuid ITEM-*');
    if (!prefab.id) missing.push('id');
    if (prefab.name == null) missing.push('name');
  }
  if (prefab.tier == null) warnings.push('tier missing (default 0)');
  if (!prefab.weaponType && !prefab.category) warnings.push('weaponType missing');

  // stats
  if (prefab.stats && typeof prefab.stats === 'object' && Object.keys(prefab.stats).length) {
    layers.stats = true;
  } else {
    missing.push('stats');
  }

  // skills
  const slots = prefabSkillSlots(prefab);
  const skUuids = prefabAllSkillUuids(prefab);
  if (slots.length >= 1 && (skUuids.length >= 1 || slots.some((s) => s.skillIds.length))) {
    layers.skills = true;
    if (skUuids.length < slots.filter((s) => s.skillIds.length).length) {
      warnings.push('some skill slots lack skillUuids (ids only)');
    }
  } else {
    missing.push('skills.slots + SKIL-*');
  }

  // assets
  const icon =
    prefab.assets?.iconUrl ||
    prefab.assets?.iconR2Key ||
    prefab.icon?.cdnUrl ||
    prefab.icon?.path;
  const model =
    prefab.modelUrl ||
    prefab.prodGltfUrl ||
    prefab.assets?.modelUrl ||
    prefab.prodGltfKey ||
    prefab.assets?.modelR2Key;
  if (icon) {
    layers.assets = true;
    if (!model) warnings.push('modelUrl/prodGltf missing (family fallback OK)');
    if (!prefab.assets?.iconUuid) warnings.push('iconUuid ICON-* not set');
  } else {
    missing.push('assets.iconUrl');
  }

  // runtime (derivable)
  const rt = runtimeBindFromPrefab(prefab);
  if (rt.meshSlot && rt.animPack) layers.runtime = true;
  else missing.push('runtime meshSlot/animPack');

  // loadout pattern
  const pattern =
    prefab.skills?.slotPattern ||
    prefab.loadout?.pattern ||
    prefab.loadout?.slotPattern ||
    (Number(prefab.tier) === 0 ? 'three-slot-starter' : 'five-slot');
  if (pattern) layers.loadout = true;
  else missing.push('loadout.pattern');

  const score = Object.values(layers).filter(Boolean).length;
  const max = WEAPON_PREFAB_REQUIRED_LAYERS.length;
  return {
    ok: score === max && missing.length === 0,
    score,
    max,
    missing,
    warnings,
    layers,
    pattern,
    skillUuidCount: skUuids.length,
    runtime: rt
  };
}

/**
 * Normalize catalog prefab → **full runtime contract** (UUID graph + jobs).
 * @param {object} prefab raw master-weapon-prefabs entry
 * @param {object} [t0] optional t0-weapons body (skills authority for starters)
 * @returns {object}
 */
export function normalizeWeaponPrefabContract(prefab, t0 = null) {
  const present = presentPrefab(prefab);
  const report = validateWeaponPrefab(prefab || t0);
  const rt = runtimeBindFromPrefab(prefab || t0 || {});
  const slots = prefabSkillSlots(prefab || {});
  // Prefer T0 skill bodies when provided (skill SSOT)
  const t0Slots = t0?.weaponSkills
    ? [
        {
          type: 'primary',
          label: 'Slot 1 · Starter Attack',
          skillIds: t0.weaponSkills.slot1?.id ? [t0.weaponSkills.slot1.id] : [],
          skillUuids: t0.weaponSkills.slot1?.uuid ? [t0.weaponSkills.slot1.uuid] : [],
          fixed: true,
          choice: false,
          skill: t0.weaponSkills.slot1 || null
        },
        {
          type: 'secondary',
          label: 'Slot 2 · Starter Style',
          skillIds: t0.weaponSkills.slot2?.id ? [t0.weaponSkills.slot2.id] : [],
          skillUuids: t0.weaponSkills.slot2?.uuid ? [t0.weaponSkills.slot2.uuid] : [],
          fixed: true,
          choice: false,
          skill: t0.weaponSkills.slot2 || null
        },
        {
          type: 'ability',
          label: 'Slot 3 · Choose One',
          skillIds: (t0.weaponSkills.slot3Options || []).map((s) => s.id).filter(Boolean),
          skillUuids: (t0.weaponSkills.slot3Options || []).map((s) => s.uuid).filter(Boolean),
          fixed: false,
          choice: true,
          options: t0.weaponSkills.slot3Options || []
        }
      ]
    : null;

  const skillSlots = t0Slots || slots;
  const allSkillUuids = [
    ...new Set(
      [
        ...prefabAllSkillUuids(prefab || {}),
        ...skillSlots.flatMap((s) => s.skillUuids || []),
        t0?.weaponSkills?.slot1?.uuid,
        t0?.weaponSkills?.slot2?.uuid,
        ...((t0?.weaponSkills?.slot3Options || []).map((s) => s.uuid) || [])
      ].filter(Boolean)
    )
  ];

  const tier = Number(prefab?.tier ?? t0?.tier ?? 0) || 0;
  const pattern =
    prefab?.skills?.slotPattern ||
    prefab?.loadout?.pattern ||
    (tier === 0 ? 'three-slot-starter' : 'five-slot');

  return {
    version: '1.1.0',
    kind: 'grudge-weapon-prefab-contract',
    generated: new Date().toISOString(),
    /** UUID graph — resolve everything through these */
    uuids: {
      item: prefab?.uuid || t0?.uuid || null,
      baseItem: prefab?.baseUuid || prefab?.uuid || t0?.uuid || null,
      icon: prefab?.assets?.iconUuid || null,
      recipe: prefab?.recipeUuid || null,
      skills: allSkillUuids,
      attributes: prefab?.attributeUuids || prefab?.statConnections?.attributeUuids || []
    },
    identity: {
      id: prefab?.id || t0?.id,
      name: prefab?.name || t0?.name,
      baseName: prefab?.baseName || t0?.baseName || prefab?.name,
      tier,
      tierLabel: prefab?.tierLabel || tierPresent(tier).label,
      weaponType: rt.weaponType,
      category: prefab?.category || t0?.category,
      subCategory: prefab?.subCategory || t0?.subCategory,
      lore: prefab?.lore || t0?.description || '',
      source: prefab?.source || t0?.source || 'catalog'
    },
    stats: prefab?.stats || t0?.stats || {},
    skills: {
      slotPattern: pattern,
      slots: skillSlots,
      skillUuids: allSkillUuids,
      craftsInto: prefab?.skills?.craftsInto || (tier === 0 ? 'T1' : null)
    },
    assets: {
      iconUrl: present?.iconUrl || t0?.iconUrl || null,
      iconUuid: prefab?.assets?.iconUuid || null,
      modelUrl: present?.modelUrl || null,
      prodGltfUrl: prefab?.prodGltfUrl || prefab?.modelUrl || null,
      dropPrefabR2Key: prefab?.assets?.dropPrefabR2Key || null,
      worldDropVfxR2Key: prefab?.assets?.worldDropVfxR2Key || null,
      cdn: 'https://assets.grudge-studio.com'
    },
    runtime: {
      ...rt,
      jobs: WEAPON_PREFAB_RUNTIME_JOBS.map((j) => j.id)
    },
    loadout: {
      pattern,
      role: prefab?.loadout?.role || (tier === 0 ? 'starter' : 'combat'),
      noTierUpgrades: tier === 0 || !!prefab?.loadout?.noTierUpgrades,
      ummorpg: prefab?.ummorpg || null
    },
    validation: report,
    presentation: present
      ? {
          borderColor: present.borderColor,
          glowColor: present.glowColor,
          tierLabel: present.tierLabel
        }
      : null,
    sources: {
      prefabs: 'api/v1/master-weapon-prefabs.json',
      t0: 'api/v1/t0-weapons.json',
      skills: 'api/v1/master-weaponSkills.json',
      registry: 'api/v1/master-registry.json'
    }
  };
}

/**
 * Completeness matrix for a list of prefabs (lab diagnostics).
 * @param {object[]} prefabs
 */
export function summarizePrefabCompleteness(prefabs = []) {
  const rows = prefabs.map((p) => {
    const v = validateWeaponPrefab(p);
    return {
      id: p.id,
      uuid: p.uuid,
      tier: p.tier,
      ok: v.ok,
      score: `${v.score}/${v.max}`,
      missing: v.missing,
      warnings: v.warnings
    };
  });
  const ok = rows.filter((r) => r.ok).length;
  return {
    total: rows.length,
    complete: ok,
    incomplete: rows.length - ok,
    rows
  };
}
