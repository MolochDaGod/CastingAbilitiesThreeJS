/**
 * Deployable prefab contract — everything we can author / save / deploy.
 *
 * Extends weaponPrefabContract pattern to:
 *   weapons · buildables (scripts + purpose) · enemy Grudge characters · assets
 *
 * Never mint ITEM-/SKIL-/NPC- UUIDs here. Drafts are local until ObjectStore pipelines.
 *
 * @see docs/ADMIN_HUB_F1_F5_SSOT.md
 * @see docs/WEAPON_PREFAB_UUID_SSOT.md
 * @see docs/PREFAB_SCAFFOLD_CONTROL_SSOT.md
 */

import { GRUDGE_UUID_PREFIX, isGrudgeUuid, WEAPON_PREFAB_REQUIRED_LAYERS } from './weaponPrefabContract.js';
import { PREFAB_CATEGORIES, INFO_API, INFO_MIRROR } from './gameItemCatalog.js';
import { CDN } from '../loot/prefabAssets.js';

/**
 * Admin tab map (SSOT).
 * F1–F4 · ] World (not F5) · Esc close · ? help · ` auto run/sail
 */
export const ADMIN_TABS = Object.freeze([
  {
    id: 'player',
    key: 'F1',
    label: 'Player',
    blurb: 'Hero session · race · equip · controller · fleet identity'
  },
  {
    id: 'assets',
    key: 'F2',
    label: 'Assets',
    blurb: 'Buildables · harvest · vehicles · props · scripts + purpose'
  },
  {
    id: 'creatures',
    key: 'F3',
    label: 'Creatures',
    blurb: 'Enemy · ally · boss · NPC · Grudge race kits · AI brain'
  },
  {
    id: 'prefabs',
    key: 'F4',
    label: 'Prefabs',
    blurb: 'Weapons · armour · tools · scaffold · craft · export'
  },
  {
    id: 'world',
    key: ']',
    keyCode: 'BracketRight',
    label: 'World',
    blurb: 'Stage · water · loot · SI map · placement notes'
  }
]);

/**
 * Deployable kinds the lab can create / save drafts for.
 * @type {readonly { id: string, label: string, uuidPrefix: string, adminTab: string, authority: string, layers: string[], jobs: string[] }[]}
 */
export const DEPLOYABLE_KINDS = Object.freeze([
  {
    id: 'weapon',
    label: 'Weapon',
    uuidPrefix: 'ITEM-',
    adminTab: 'prefabs',
    authority: 'master-weapon-prefabs.json · t0-weapons.json',
    layers: [...WEAPON_PREFAB_REQUIRED_LAYERS],
    jobs: ['bag', 'equip', 'controller', 'hotbar', 'combat', 'craft', 'export']
  },
  {
    id: 'armour',
    label: 'Armour',
    uuidPrefix: 'ITEM-',
    adminTab: 'prefabs',
    authority: 'master-armor.json',
    layers: ['identity', 'stats', 'assets', 'runtime', 'slots'],
    jobs: ['bag', 'equip_mesh_ids', 'stats', 'export']
  },
  {
    id: 'buildable',
    label: 'Buildable',
    uuidPrefix: 'PREFAB-',
    adminTab: 'assets',
    authority: 'locations / kenney-build / ObjectStore buildables',
    layers: ['identity', 'purpose', 'script', 'assets', 'placement', 'runtime'],
    jobs: ['place', 'snap', 'interact', 'harvest_or_use', 'save_instance', 'export']
  },
  {
    id: 'harvestable',
    label: 'Harvestable',
    uuidPrefix: 'PREFAB-',
    adminTab: 'assets',
    authority: 'Mine-Loader harvest + nature props CDN',
    layers: ['identity', 'purpose', 'script', 'assets', 'drops', 'runtime'],
    jobs: ['spawn', 'interact_E', 'drop_loot', 'export']
  },
  {
    id: 'map_layout',
    label: 'Map layout (Training Room)',
    uuidPrefix: 'MAP-',
    adminTab: 'world',
    authority:
      'trainingRoomMap + trainingRoomDeploy · ObjectStore maps/training_room · R2 lab/casting/training-room',
    layers: ['identity', 'terrain', 'nodes', 'physics', 'publish'],
    jobs: ['author_devnode', 'export_layout', 'promote_r2_d1', 'play_boot', 'forge_handoff']
  },
  {
    id: 'vehicle',
    label: 'Vehicle / ship',
    uuidPrefix: 'PREFAB-',
    adminTab: 'assets',
    authority: 'Kenney vehicles · fleet ride',
    layers: ['identity', 'purpose', 'script', 'assets', 'seats', 'runtime'],
    jobs: ['spawn', 'mount', 'drive', 'export']
  },
  {
    id: 'enemy',
    label: 'Enemy / monster',
    uuidPrefix: 'NPC-',
    adminTab: 'creatures',
    authority: 'grudge6 kits + training dummy + boss pins',
    layers: ['identity', 'kit', 'anims', 'ai', 'combat', 'assets', 'runtime'],
    jobs: ['spawn', 'aggro', 'anim_pack', 'skills', 'loot', 'export']
  },
  {
    id: 'ally',
    label: 'Ally / commander',
    uuidPrefix: 'NPC-',
    adminTab: 'creatures',
    authority: 'grudge6 · party units',
    layers: ['identity', 'kit', 'anims', 'ai', 'combat', 'assets', 'runtime'],
    jobs: ['spawn', 'follow', 'command', 'export']
  },
  {
    id: 'npc',
    label: 'NPC / vendor',
    uuidPrefix: 'NPC-',
    adminTab: 'creatures',
    authority: 'vendor catalogs · dialogue hooks',
    layers: ['identity', 'kit', 'role', 'assets', 'runtime'],
    jobs: ['spawn', 'interact', 'shop', 'export']
  },
  {
    id: 'character_kit',
    label: 'Grudge character kit',
    uuidPrefix: 'KIT-',
    adminTab: 'creatures',
    authority: 'grudge6 CDN · race GLB · mesh_ids',
    layers: ['identity', 'race', 'mesh_ids', 'anims', 'assets', 'runtime'],
    jobs: ['load_kit', 'equip', 'anim_pack', 'export']
  }
]);

export const DEPLOYABLE_BY_ID = Object.freeze(
  Object.fromEntries(DEPLOYABLE_KINDS.map((k) => [k.id, k]))
);

/** Buildable purpose tags (what the prop does in-world). */
export const BUILDABLE_PURPOSES = Object.freeze([
  { id: 'structure', label: 'Structure', note: 'Wall / floor / roof snap piece' },
  { id: 'camp', label: 'Camp', note: 'Claim / storage / fire' },
  { id: 'crafting', label: 'Crafting station', note: 'Workbench · forge · cook' },
  { id: 'storage', label: 'Storage', note: 'Chest · depot · bag deposit' },
  { id: 'defense', label: 'Defense', note: 'Tower · spike · gate' },
  { id: 'decoration', label: 'Decoration', note: 'Prop only' },
  { id: 'resource_node', label: 'Resource node', note: 'Tree · rock · ore (harvest)' },
  { id: 'spawn_pad', label: 'Spawn pad', note: 'Unit / vehicle spawn' },
  { id: 'transport', label: 'Transport', note: 'Dock · pad · teleporter' }
]);

/** Enemy / creature roles for F3 deploy catalog. */
export const CREATURE_ROLES = Object.freeze([
  { id: 'enemy', label: 'Enemy' },
  { id: 'monster', label: 'Monster' },
  { id: 'boss', label: 'Boss' },
  { id: 'ally', label: 'Ally' },
  { id: 'commander', label: 'Commander' },
  { id: 'npc', label: 'NPC' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'training_dummy', label: 'Training dummy' }
]);

/** AI brain stubs (wire to Yuka / fleet AI later — names only). */
export const AI_BRAINS = Object.freeze([
  { id: 'passive', label: 'Passive', note: 'No aggro' },
  { id: 'guard', label: 'Guard', note: 'Aggro in radius' },
  { id: 'patrol', label: 'Patrol', note: 'Path + return' },
  { id: 'hunter', label: 'Hunter', note: 'Chase + attack' },
  { id: 'boss_phase', label: 'Boss phases', note: 'Telegraph → skill cycles' },
  { id: 'ally_follow', label: 'Ally follow', note: 'Follow player + assist' },
  { id: 'vendor_idle', label: 'Vendor idle', note: 'Stand + interact shop' }
]);

export const DEPLOYABLE_ENDPOINTS = Object.freeze({
  weapons: `${INFO_API}/master-weapon-prefabs.json`,
  t0Weapons: `${INFO_API}/t0-weapons.json`,
  armor: `${INFO_API}/master-armor.json`,
  mounts: `${INFO_API}/master-mounts.json`,
  registry: `${INFO_API}/master-registry.json`,
  grudge6: 'https://assets.grudge-studio.com/asset-packs/toon-rts-characters/glb/characters/',
  cdn: CDN,
  info: INFO_API,
  mirror: INFO_MIRROR,
  itemBrowser: 'https://info.grudge-studio.com/GRUDGE_Item_Database.html',
  pipelines: {
    weapons: 'npm run build:weapon-pipeline',
    master: 'npm run generate:master && npm run consolidate:game-data',
    assets: 'grudge-asset-convert → R2 → D1 index'
  }
});

/**
 * Create a local draft deployable (no UUID mint).
 * @param {string} kindId
 * @param {Partial<object>} [fields]
 */
export function createDeployableDraft(kindId, fields = {}) {
  const kind = DEPLOYABLE_BY_ID[kindId] || DEPLOYABLE_BY_ID.weapon;
  const slug =
    fields.slug ||
    String(fields.name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    'untitled';
  const now = new Date().toISOString();
  const base = {
    _schema: 'grudge.deployable.draft.v1',
    _local: true,
    _savedAt: null,
    _createdAt: now,
    kind: kind.id,
    kindLabel: kind.label,
    adminTab: kind.adminTab,
    id: fields.id || `draft-${kind.id}-${slug}`,
    /** Placeholder only — ObjectStore assigns real uuid */
    uuid: fields.uuid || null,
    name: fields.name || `New ${kind.label}`,
    tier: fields.tier ?? 0,
    description: fields.description || '',
    layers: Object.fromEntries(kind.layers.map((L) => [L, null])),
    jobs: kind.jobs,
    authority: kind.authority,
    assets: {
      iconUrl: fields.iconUrl || null,
      modelUrl: fields.modelUrl || null,
      r2Key: fields.r2Key || null
    },
    notes: fields.notes || ''
  };

  if (kind.id === 'weapon' || kind.id === 'armour') {
    base.layers.identity = {
      id: base.id,
      uuid: null,
      name: base.name,
      tier: base.tier,
      weaponType: fields.weaponType || 'SWORD',
      slot: fields.slot || 'mainHand'
    };
    base.layers.stats = fields.stats || { damage: 10, attackSpeed: 1, crit: 0.05 };
    base.layers.skills = fields.skills || { slots: [], skillUuids: [], note: 'Link SKIL-* via ObjectStore' };
    base.layers.assets = { ...base.assets };
    base.layers.runtime = {
      meshSlot: fields.meshSlot || 'sword',
      animPack: fields.animPack || 'sword_shield',
      labStyle: fields.labStyle || 'starter_t0'
    };
    base.layers.loadout = { pattern: base.tier === 0 ? 'three-slot-starter' : 'five-slot' };
  }

  if (kind.id === 'buildable' || kind.id === 'harvestable' || kind.id === 'vehicle') {
    const purposeId = fields.purpose || (kind.id === 'harvestable' ? 'resource_node' : 'structure');
    const purpose = BUILDABLE_PURPOSES.find((p) => p.id === purposeId) || BUILDABLE_PURPOSES[0];
    base.layers.identity = { id: base.id, uuid: null, name: base.name, kind: kind.id };
    base.layers.purpose = {
      id: purpose.id,
      label: purpose.label,
      note: purpose.note,
      tags: fields.tags || [purpose.id]
    };
    base.layers.script = buildBuildableScriptStub(base, purpose, fields);
    base.layers.assets = { ...base.assets };
    base.layers.placement = {
      snapGridM: fields.snapGridM ?? 1,
      footprintM: fields.footprintM || [1, 1],
      rotateY: fields.rotateY ?? true,
      collision: fields.collision || 'box'
    };
    base.layers.runtime = {
      interactKey: 'E',
      health: fields.health ?? 100,
      team: fields.team || 'neutral'
    };
    if (kind.id === 'harvestable') {
      base.layers.drops = fields.drops || [{ materialId: 'wood', qty: 1 }];
    }
    if (kind.id === 'vehicle') {
      base.layers.seats = fields.seats || [{ id: 'driver', bone: null }];
    }
  }

  if (kind.id === 'enemy' || kind.id === 'ally' || kind.id === 'npc' || kind.id === 'character_kit') {
    const role = fields.role || (kind.id === 'ally' ? 'ally' : kind.id === 'npc' ? 'npc' : 'enemy');
    base.layers.identity = {
      id: base.id,
      uuid: null,
      name: base.name,
      role,
      faction: fields.faction || (role === 'ally' ? 'player' : 'hostile')
    };
    // raceId may be WK/ELF/… or short human/elf — CDN kits use short names
    const raceId = fields.raceId || 'WK';
    const shortRace =
      fields.shortRace ||
      ({ WK: 'human', ELF: 'elf', ORC: 'orc', DWF: 'dwarf', UD: 'undead', BRB: 'barbarian' }[raceId] ||
        String(raceId).toLowerCase());
    base.layers.kit = {
      raceId,
      shortRace,
      kitUrl: fields.kitUrl || `${DEPLOYABLE_ENDPOINTS.grudge6}${shortRace}.glb`,
      heightM: fields.heightM ?? (role === 'boss' ? 4.3 : 1.8),
      mesh_ids: fields.mesh_ids || null
    };
    base.layers.anims = {
      pack: fields.animPack || 'sword_shield',
      roles: fields.animRoles || ['idle', 'walk', 'run', 'attack', 'death']
    };
    base.layers.ai = {
      brain: fields.brain || (role === 'ally' ? 'ally_follow' : role === 'vendor' ? 'vendor_idle' : 'guard'),
      aggroRangeM: fields.aggroRangeM ?? 8,
      attackRangeM: fields.attackRangeM ?? 1.6
    };
    base.layers.combat = {
      hp: fields.hp ?? (role === 'boss' ? 900 : 150),
      damage: fields.damage ?? 12,
      skills: fields.skills || []
    };
    base.layers.assets = { ...base.assets, modelUrl: base.layers.kit.kitUrl };
    base.layers.runtime = {
      targetable: true,
      selectable: true,
      siUnits: true
    };
    if (kind.id === 'character_kit') {
      base.layers.race = { id: fields.raceId || 'human' };
      base.layers.mesh_ids = fields.mesh_ids || {};
    }
  }

  return base;
}

/**
 * Buildable / asset item script stub (purpose + hooks).
 */
export function buildBuildableScriptStub(draft, purpose, fields = {}) {
  return {
    kind: 'buildable_script',
    language: 'javascript-module',
    note: 'Draft only — fleet uses place/snap/interact systems, not eval',
    module: {
      id: draft.id,
      type: draft.kind,
      purpose: purpose?.id || fields.purpose || 'structure',
      onPlace: 'snap to grid · register collider · save instance pos',
      onInteract: purpose?.id === 'crafting' ? 'open craft UI' : purpose?.id === 'storage' ? 'open depot' : purpose?.id === 'resource_node' ? 'start harvest swing' : 'inspect / use',
      onDestroy: 'despawn · optional scrap drops',
      tick: fields.tick || null,
      stats: fields.scriptStats || {},
      purposeNote: purpose?.note || ''
    }
  };
}

/**
 * Validate a deployable draft for completeness (soft score).
 * @param {object} draft
 */
export function validateDeployableDraft(draft) {
  const kind = DEPLOYABLE_BY_ID[draft?.kind] || DEPLOYABLE_BY_ID.weapon;
  const missing = [];
  const warnings = [];
  for (const L of kind.layers) {
    if (draft.layers?.[L] == null || draft.layers[L] === '') missing.push(L);
  }
  if (!draft.name) missing.push('name');
  if (!draft.assets?.modelUrl && !draft.layers?.assets?.modelUrl && !draft.layers?.kit?.kitUrl) {
    warnings.push('no modelUrl — generate 3D brief before deploy');
  }
  if (draft.uuid && !isGrudgeUuid(draft.uuid)) {
    warnings.push('uuid present but not a GRUDGE prefix');
  }
  if (!draft.uuid) warnings.push('no uuid yet — ObjectStore pipeline mints on register');
  if (draft.kind === 'weapon' && !draft.layers?.skills?.skillUuids?.length) {
    warnings.push('weapon has no SKIL-* yet — scaffold from T0 or master');
  }
  const total = kind.layers.length + 1;
  const ok = total - missing.length;
  return {
    ok: missing.length === 0,
    score: `${ok}/${total}`,
    missing,
    warnings,
    kind: kind.id,
    jobs: kind.jobs
  };
}

/**
 * Export snapshot for download / ObjectStore handoff.
 * @param {object} draft
 */
export function exportDeployableSnapshot(draft) {
  const val = validateDeployableDraft(draft);
  return {
    schema: 'grudge.deployable.export.v1',
    exportedAt: new Date().toISOString(),
    draft: {
      ...draft,
      _local: undefined
    },
    validation: val,
    register: {
      note: 'Do not mint UUIDs in lab. Push JSON to ObjectStore pipeline.',
      pipelines: DEPLOYABLE_ENDPOINTS.pipelines,
      next: draft.kind === 'weapon' || draft.kind === 'armour'
        ? 'build:weapon-pipeline / generate:master'
        : draft.adminTab === 'creatures'
          ? 'register kit + AI row + D1 CDN paths'
          : 'buildable catalog + R2 mesh + purpose script'
    },
    categories: PREFAB_CATEGORIES,
    uuidPrefixes: GRUDGE_UUID_PREFIX
  };
}

/**
 * Summarize kinds for a given admin tab.
 * @param {string} tabId
 */
export function kindsForAdminTab(tabId) {
  return DEPLOYABLE_KINDS.filter((k) => k.adminTab === tabId);
}
