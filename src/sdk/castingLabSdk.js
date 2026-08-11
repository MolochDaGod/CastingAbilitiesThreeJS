/**
 * Casting Lab public SDK surface — import/export contract for fleet games.
 *
 * Use this module (or `package.json` export `./sdk`) when Open / Warlords /
 * satellites need lab systems without deep-importing App internals.
 *
 * Does **not** invent a parallel combat engine. Re-exports existing SSOT.
 *
 * @example
 * import {
 *   sharedGltfLoader,
 *   bindKtx2,
 *   compileProductionWeaponSkill,
 *   mountTerrainLayers,
 *   CASTING_LAB_CONTRACT
 * } from './sdk/castingLabSdk.js';
 *
 * @see docs/CASTING_SDK_EXPORT_SSOT.md
 * @see public/api/v1/casting-lab-contract.json
 */

// ── Loaders ──────────────────────────────────────────────────────────
export {
  DRACO_DECODER_PATH,
  KTX2_TRANSCODER_PATH,
  bindKtx2,
  isKtx2Bound,
  makeGltfLoader,
  sharedGltfLoader,
  getSharedDracoLoader,
  gltfPipelineStatus,
  disposeGltfPipeline
} from '../loaders/gltfPipeline.js';

export { AssetLoader } from '../loaders/AssetLoader.js';

// ── Weapon skills · production ───────────────────────────────────────
export {
  compileProductionWeaponSkill,
  compileProductionWeaponSkillAsync,
  productionToDrcSkill,
  assessProductionReadiness,
  compileWeaponSkillBar,
  warmProductionOverrides,
  loadProductionOverride,
  getCachedProductionOverride,
  defaultPhysicsForStyle,
  PRODUCTION_SKILL_OVERRIDE_TEMPLATE
} from '../combat/weaponSkillProduction.js';

export {
  parseCatalogEffects,
  SkillStatusSystem
} from '../combat/skillStatusSystem.js';

export {
  planElementalLinearCast,
  fireLinearFromPlan,
  ELEMENTAL_LINEAR_LEARNED,
  PRODUCT_TO_LINEAR
} from '../combat/elementalLinearCast.js';

export {
  enrichSkillDelivery,
  inferDeliveryPattern,
  resolveDeliveryPose,
  resolveSkillProjectileMesh,
  STAFF_ORB_MESH_BY_ELEMENT,
  STAFF_CHARGE_MESH,
  SUMMON_MESH_BY_ELEMENT,
  DELIVERY_META
} from '../combat/skillDelivery.js';

export {
  bindFromCatalogSkill,
  staffBindFor,
  enrichStaffSkill
} from '../combat/staffWeaponSkillsBind.js';

export {
  CASTING_ELEMENT_PHASE_VFX,
  normalizeElement,
  staffWeaponIdForElement
} from '../combat/elementWeaponSkills.js';

// ── VFX ──────────────────────────────────────────────────────────────
export {
  STAFF_ORB_BY_ELEMENT,
  STAFF_NORMAL_ATTACK,
  STAFF_CHARGE,
  staffOrbForElement,
  staffProjectileMeshUrl,
  applyElementalOrbMaterials,
  isStaffNormalAttack,
  staffOrbWarmUrls
} from '../vfx/staffOrbVfx.js';

export {
  EARTH_ROCK_MESHES,
  ARROW_SYSTEMS,
  FREEZE_NOVA,
  WATER_BUBBLE,
  pickEarthRocks,
  inferElementAttackKind,
  createWaterBubbleMaterial
} from '../vfx/elementAttackVfx.js';

// ── Terrain ──────────────────────────────────────────────────────────
export {
  TERRAIN_LAYER,
  TERRAIN_LEARNED,
  mountTerrainLayers
} from '../world/terrainLayers.js';

export {
  IslandHeightfield,
  heightAt,
  terrainOpts,
  isDryLand,
  bakeHeightGrid
} from '../world/IslandHeightfield.js';

export { projectToTerrain, surfaceY, terrainHandle } from '../world/terrainGround.js';
export { StylizedGrassLayer } from '../world/StylizedGrassLayer.js';
export { GrowingForest } from '../world/GrowingForest.js';

// ── World scale ──────────────────────────────────────────────────────
export { WORLD } from '../config/worldScale.js';

// ── Fleet contract stamp ─────────────────────────────────────────────
/** Machine-readable contract version (bump when export surface breaks). */
export const CASTING_LAB_SDK_VERSION = '1.1.0';

/**
 * Static contract for ObjectStore / Open / agents (mirror public/api/v1 JSON).
 */
export const CASTING_LAB_CONTRACT = Object.freeze({
  id: 'casting-lab',
  version: CASTING_LAB_SDK_VERSION,
  productHost: 'casting.grudge.studio',
  vercelHost: 'casting-abilities-threejs.vercel.app',
  three: '^0.185',
  rapier: '@dimforge/rapier3d-compat',
  loaders: {
    draco: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
    ktx2: 'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/basis/',
    meshopt: true,
    entry: 'src/loaders/gltfPipeline.js'
  },
  skills: {
    catalog: 'master-weaponSkills + t0-weapons',
    production: 'src/combat/weaponSkillProduction.js',
    statuses: 'src/combat/skillStatusSystem.js',
    linear: 'src/combat/elementalLinearCast.js',
    overrides: 'public/skills/production/<id>.json'
  },
  terrain: {
    layers: ['L0_height', 'L1_surface', 'L2_vegetation', 'L3_detail', 'water'],
    sample: 'IslandHeightfield.sample',
    doc: 'docs/THREE_LAYER_TERRAIN_SSOT.md'
  },
  character: {
    playKit: 'toonKitPlay / loadRaceKit',
    mixer: 1,
    siHumanM: 1.8
  },
  export: {
    module: 'src/sdk/castingLabSdk.js',
    packageExport: './sdk',
    contractJson: '/api/v1/casting-lab-contract.json'
  },
  docs: [
    'docs/CASTING_LAB_SSOT.md',
    'docs/CASTING_SDK_EXPORT_SSOT.md',
    'docs/WEAPON_SKILL_PRODUCTION_SSOT.md',
    'docs/LOADER_DRACO_KTX2_AUDIT.md',
    'docs/SYSTEMS_HEALTH_AUDIT.md',
    'docs/THREE_LAYER_TERRAIN_SSOT.md',
    'docs/SSOT_INDEX.md'
  ]
});
