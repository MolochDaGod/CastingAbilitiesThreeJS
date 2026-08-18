/**
 * Prefab Scaffold Control — correct access + generation briefs for Grudge items.
 *
 * Access (read SSOT only):
 *   canonical-items-manifest · equipment-pattern · master-weapon-prefabs ·
 *   t0-weapons · master-weaponSkills · master-recipes · master-registry
 *
 * Generation (local drafts — do not mint ITEM- or SKIL- UUIDs here):
 *   style icon prompt · 3D sprite brief · item script stub · craft formula pack
 *
 * Minting UUIDs / writing ObjectStore = ObjectStore pipelines only
 * (npm run build:weapon-pipeline / generate:master).
 *
 * @see docs/PREFAB_SCAFFOLD_CONTROL_SSOT.md
 * @see docs/WEAPON_PREFAB_UUID_SSOT.md
 */

import {
  INFO_API,
  INFO_MIRROR,
  ITEMS_MANIFEST_URL,
  PREFAB_CATEGORIES
} from './gameItemCatalog.js';
import { catalogJsonUrls } from '../config/fleetEnv.js';
import {
  GRUDGE_UUID_PREFIX,
  WEAPON_PREFAB_RUNTIME_JOBS,
  WEAPON_PREFAB_REQUIRED_LAYERS,
  validateWeaponPrefab,
  normalizeWeaponPrefabContract,
  isGrudgeUuid
} from './weaponPrefabContract.js';
import { CDN, presentPrefab, loadPrefabCatalog } from '../loot/prefabAssets.js';
import {
  loadEquippableWeapons,
  exportWarlordsWeaponPrefab,
  T0_ALL_WEAPON_IDS
} from './t0WeaponCatalog.js';

export const SCAFFOLD_ENDPOINTS = Object.freeze({
  manifest: `${INFO_API}/canonical-items-manifest.json`,
  equipmentPattern: `${INFO_API}/_meta/canonical-equipment-pattern.json`,
  weaponPrefabs: `${INFO_API}/master-weapon-prefabs.json`,
  t0Weapons: `${INFO_API}/t0-weapons.json`,
  weaponSkills: `${INFO_API}/master-weaponSkills.json`,
  recipes: `${INFO_API}/master-recipes.json`,
  materials: `${INFO_API}/master-materials.json`,
  registry: `${INFO_API}/master-registry.json`,
  iconRegistry: `${INFO_API}/icon-registry.json`,
  docs: 'https://info.grudge-studio.com/docs',
  hub: 'https://info.grudge-studio.com/hub.html',
  itemBrowser: 'https://info.grudge-studio.com/GRUDGE_Item_Database.html',
  weaponSkillsHtml: 'https://info.grudge-studio.com/WEAPON_SKILLS.html',
  iconBrowser: 'https://info.grudge-studio.com/ICON_BROWSER.html',
  cdn: CDN,
  workerMirror: INFO_MIRROR,
  fetchOrder: [
    'same-origin /api/info/v1/*',
    'info.grudge-studio.com/api/v1/*',
    'grudge-objectstore.pages.dev/api/v1/*',
    'assets.grudge-studio.com via /api/assets (binaries only)'
  ]
});

/** Style families for icon / 3D sprite generation (house art direction). */
export const ITEM_STYLE_FAMILIES = Object.freeze({
  warlords_dark: {
    id: 'warlords_dark',
    label: 'Warlords dark fantasy',
    palette: ['#1a1410', '#3d2b1f', '#8b6914', '#c4a35a', '#e8dcc2', '#5c1a1a'],
    notes: 'Grudge house style — worn metal, muted gold, no plastic MMO gloss'
  },
  toon_rts: {
    id: 'toon_rts',
    label: 'Toon RTS polyart',
    palette: ['#2a2a32', '#6b7c8f', '#c9a227', '#e8eef6'],
    notes: 'Matches grudge6 / Toon RTS polyart weapons'
  },
  starter_t0: {
    id: 'starter_t0',
    label: 'T0 training / blunted',
    palette: ['#6b7280', '#9aa3ad', '#c5ccd4', '#4b5563'],
    notes: 'Grey training gear — blunted edges, wood + scrap'
  }
});

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

let _scaffoldCache = null;

/**
 * Load control-plane catalogs (manifest + pattern + optional recipes index).
 */
export async function loadPrefabScaffold() {
  if (_scaffoldCache) return _scaffoldCache;
  const [manifest, pattern, recipes] = await Promise.all([
    fetchJson(catalogJsonUrls('canonical-items-manifest.json')),
    fetchJson(catalogJsonUrls('_meta/canonical-equipment-pattern.json')),
    fetchJson(catalogJsonUrls('master-recipes.json'))
  ]);

  _scaffoldCache = {
    loadedAt: Date.now(),
    endpoints: SCAFFOLD_ENDPOINTS,
    categories: PREFAB_CATEGORIES,
    uuidPrefixes: {
      ...GRUDGE_UUID_PREFIX,
      ...(manifest?.uuidPrefixes || {})
    },
    manifest,
    pattern,
    recipesTotal: recipes?.totalRecipes || recipes?.total || recipes?.recipes?.length || 0,
    recipes: recipes?.recipes || [],
    layers: WEAPON_PREFAB_REQUIRED_LAYERS,
    jobs: WEAPON_PREFAB_RUNTIME_JOBS,
    styleFamilies: ITEM_STYLE_FAMILIES,
    t0Ids: T0_ALL_WEAPON_IDS,
    pipelines: pattern?.pipelines || {
      weaponsAndTools: 'npm run build:weapon-pipeline',
      allMasterData: 'npm run generate:master && npm run consolidate:game-data'
    }
  };
  return _scaffoldCache;
}

/**
 * Resolve craft formula for an item (T0 inline recipe or RECP-* by result name/id).
 * @param {object} item  equippable or prefab row
 * @param {object} [scaffold] loadPrefabScaffold()
 */
export function resolveCraftFormula(item, scaffold) {
  if (!item) return null;
  const t0Craft = item.rawT0?.craftingRecipe || item.craftingRecipe || item.raw?.craftingRecipe;
  if (t0Craft?.materials?.length) {
    return {
      source: 't0-weapons.craftingRecipe',
      uuid: null,
      station: t0Craft.station || 'Anywhere',
      profession: t0Craft.profession || null,
      craftTime: t0Craft.craftTime ?? 10,
      gold: t0Craft.gold ?? 0,
      materials: t0Craft.materials.map((m) => ({
        id: m.id,
        uuid: m.uuid || null,
        name: m.name || m.id,
        quantity: m.quantity || 1
      })),
      resultId: item.id,
      resultUuid: item.uuid || null,
      note: 'T0 starter craft (Anywhere). T1 unlocks five-slot via craftsInto.'
    };
  }

  const recipes = scaffold?.recipes || [];
  const id = String(item.id || '');
  const name = String(item.name || '');
  const uuid = item.uuid || item.uuids?.item;
  const hit =
    recipes.find((r) => r.resultItemId === id || r.resultItemId === uuid) ||
    recipes.find((r) => r.resultUuid === uuid) ||
    recipes.find(
      (r) =>
        r.resultName &&
        name &&
        String(r.resultName).toLowerCase() === name.toLowerCase()
    ) ||
    null;

  if (!hit) {
    return {
      source: 'none',
      uuid: item.rawPrefab?.recipeUuid || null,
      materials: [],
      note: 'No RECP row linked — fill recipeUuid on prefab or craft in ObjectStore'
    };
  }

  return {
    source: 'master-recipes.json',
    uuid: hit.uuid,
    id: hit.id,
    name: hit.name,
    station: hit.station,
    profession: hit.profession,
    craftTime: hit.craftTime,
    gold: hit.goldCost ?? hit.gold,
    tier: hit.tier,
    materials: (hit.materials || []).map((m) => ({
      id: m.id,
      uuid: m.uuid,
      name: m.name || m.id,
      quantity: m.quantity || 1
    })),
    resultId: hit.resultItemId,
    resultName: hit.resultName,
    successRate: hit.successRate,
    requiredLevel: hit.requiredLevel
  };
}

/**
 * Full control pack for one weapon/item (access + validation + gen briefs).
 * @param {object} weapon equippable from loadEquippableWeapons or raw prefab
 */
export async function buildItemScaffoldPack(weapon) {
  const scaffold = await loadPrefabScaffold();
  const eqCat = await loadEquippableWeapons().catch(() => null);
  const w =
    weapon ||
    eqCat?.byId?.get?.('t0-sword') ||
    null;
  if (!w) return { error: 'no weapon' };

  const raw = w.rawPrefab || w.raw || w;
  const t0 = w.rawT0 || (eqCat?.t0Data?.weapons || []).find((x) => x.id === w.id) || null;
  const contract = normalizeWeaponPrefabContract(raw, t0);
  // merge equippable skill bodies into contract for gen
  if (w.slot1) {
    contract.skills.slot1Body = w.slot1;
    contract.skills.slot2Body = w.slot2;
    contract.skills.slot3Options = w.slot3Options;
  }
  const validation = validateWeaponPrefab(raw?.uuid ? raw : { ...raw, ...w, stats: w.stats || raw.stats });
  // if raw thin, re-validate with merged identity
  const mergedForVal = {
    uuid: w.uuid || raw.uuid,
    id: w.id,
    name: w.name,
    tier: w.tier,
    weaponType: w.weaponType,
    stats: w.stats || raw.stats || {},
    assets: {
      iconUrl: w.iconUrl,
      ...(raw.assets || {})
    },
    modelUrl: w.modelUrl,
    skills: raw.skills || {
      slots: [
        {
          type: 'primary',
          skillIds: w.slot1?.id ? [w.slot1.id] : [],
          skillUuids: w.slot1?.uuid ? [w.slot1.uuid] : [],
          fixed: true
        },
        {
          type: 'secondary',
          skillIds: w.slot2?.id ? [w.slot2.id] : [],
          skillUuids: w.slot2?.uuid ? [w.slot2.uuid] : [],
          fixed: true
        },
        {
          type: 'ability',
          skillIds: (w.slot3Options || []).map((s) => s.id),
          skillUuids: (w.slot3Options || []).map((s) => s.uuid).filter(Boolean),
          choice: true
        }
      ],
      skillUuids: [
        w.slot1?.uuid,
        w.slot2?.uuid,
        ...(w.slot3Options || []).map((s) => s.uuid)
      ].filter(Boolean),
      slotPattern: w.tier === 0 ? 'three-slot-starter' : 'five-slot'
    },
    loadout: raw.loadout || { pattern: w.tier === 0 ? 'three-slot-starter' : 'five-slot' }
  };
  const val = validateWeaponPrefab(mergedForVal);
  const craft = resolveCraftFormula(
    { ...w, rawT0: t0, craftingRecipe: t0?.craftingRecipe },
    scaffold
  );
  const styleKey =
    w.tier === 0 ? 'starter_t0' : /toon|rts/i.test(w.weaponType || '') ? 'toon_rts' : 'warlords_dark';
  const style = ITEM_STYLE_FAMILIES[styleKey];

  const gen = {
    icon: buildIconGenerationBrief(w, style),
    sprite3d: build3dSpriteBrief(w, style),
    itemScript: buildItemScriptStub(w, craft, contract),
    statsBlock: w.stats || {},
    craft
  };

  return {
    access: {
      endpoints: SCAFFOLD_ENDPOINTS,
      resolveOrder: scaffold.manifest?.resolutionOrder || scaffold.pattern?.fetchOrder,
      pipelines: scaffold.pipelines
    },
    identity: {
      id: w.id,
      uuid: w.uuid,
      name: w.name,
      tier: w.tier,
      weaponType: w.weaponType
    },
    validation: val,
    contract,
    exportPrefab: exportWarlordsWeaponPrefab(w),
    generation: gen,
    use: {
      equip: true,
      meshSlot: w.meshSlot,
      animPack: w.animPack,
      labStyle: w.labStyle,
      hotbarKeys: '1–3 (T0) or 1–5 (T1+)',
      jobs: WEAPON_PREFAB_RUNTIME_JOBS
    }
  };
}

/**
 * Style-appropriate 2D icon generation brief (for Imagine / Meshy / artist).
 */
export function buildIconGenerationBrief(item, style = ITEM_STYLE_FAMILIES.warlords_dark) {
  const wt = item.weaponType || 'WEAPON';
  const name = item.name || item.id;
  const tier = item.tier ?? 0;
  return {
    kind: 'icon_2d',
    targetPath: `game-assets/icons/weapons/${String(item.id || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.png`,
    targetUuidPrefix: GRUDGE_UUID_PREFIX.icon,
    size: '512×512 PNG, transparent, centered',
    style: style.id,
    palette: style.palette,
    prompt: [
      `${style.label} game item icon of ${name}`,
      `${wt} weapon, tier T${tier}`,
      'single object, three-quarter view, readable silhouette at 64px',
      'dark fantasy, grounded materials, no text, no UI chrome',
      style.notes,
      item.tier === 0 ? 'training/blunted look, grey-brown, recruit gear' : 'production combat gear'
    ].join('. '),
    negative: 'text, watermark, busy background, neon cyberpunk, plastic toy, multiple objects',
    register: 'Upload to R2 → set assets.iconUrl + assets.iconUuid ICON-* on prefab via ObjectStore pipeline'
  };
}

/**
 * 3D “sprite” / world-drop mesh brief (billboard or low-poly prop).
 */
export function build3dSpriteBrief(item, style = ITEM_STYLE_FAMILIES.warlords_dark) {
  const name = item.name || item.id;
  const wt = item.weaponType || 'SWORD';
  return {
    kind: 'mesh_3d_world_sprite',
    targetPath: `models/weapons/${String(item.category || 'misc').toLowerCase()}/${String(item.id || name).toLowerCase()}.glb`,
    dropPrefabPath: `prefabs/items/weapons/${wt}/${item.tier ?? 0}/${String(name).toLowerCase()}.prefab.glb`,
    si: {
      maxLengthM:
        /SPEAR|GREAT|2H/i.test(wt) ? 1.8 : /DAGGER|WAND/i.test(wt) ? 0.7 : /BOW|GUN/i.test(wt) ? 1.3 : 1.15,
      units: '1 unit = 1 m'
    },
    style: style.id,
    prompt: [
      `Low-poly stylized ${name} (${wt}) for browser Three.js`,
      'single mesh or few meshes, PBR metal/roughness, no rig required for drop prop',
      'origin at grip for equip; drop prefab may be icon-plane + glow',
      style.notes
    ].join('. '),
    collider: 'box or capsule along blade — bake .collider.json optional',
    register: 'grudge-asset-convert → R2 → prefab modelUrl / prodGltfUrl / dropPrefabR2Key'
  };
}

/**
 * Item script stub — use hooks, stats, craft (runtime consumer shape).
 */
export function buildItemScriptStub(item, craft, contract) {
  return {
    kind: 'item_script',
    language: 'javascript-module',
    note: 'Draft only — production wiring uses fleet equip + DRC, not eval of this file',
    module: {
      id: item.id,
      uuid: item.uuid || contract?.uuids?.item || null,
      type: 'weapon',
      weaponType: item.weaponType,
      tier: item.tier,
      stats: item.stats || {},
      skills: {
        slot1: item.slot1?.id || item.slot1,
        slot2: item.slot2?.id || item.slot2,
        slot3Options: (item.slot3Options || []).map((s) => s.id || s),
        skillUuids: contract?.uuids?.skills || []
      },
      use: {
        equipSlot: item.meshSlot || 'sword',
        animPack: item.animPack,
        onEquip: 'setAnimPack + mesh_ids + attachWeaponModel',
        onSkill: 'hotbar 1–3 → useSkill(slot) catalog only',
        onUnequip: 'clear attach + restore pack'
      },
      craft: craft || null,
      validate: 'validateWeaponPrefab / normalizeWeaponPrefabContract'
    }
  };
}

/**
 * Download helper payload for UI.
 * @param {object} pack buildItemScaffoldPack result
 * @param {'full'|'icon'|'sprite3d'|'script'|'craft'} [part]
 */
export function serializeScaffoldPart(pack, part = 'full') {
  if (!pack) return null;
  if (part === 'full') return pack;
  if (part === 'icon') return pack.generation?.icon;
  if (part === 'sprite3d') return pack.generation?.sprite3d;
  if (part === 'script') return pack.generation?.itemScript;
  if (part === 'craft') return pack.generation?.craft;
  if (part === 'export') return pack.exportPrefab;
  return pack;
}

export function downloadJson(obj, filename) {
  if (!obj || typeof document === 'undefined') return false;
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}
