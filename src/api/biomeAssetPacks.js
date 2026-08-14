/**
 * Biome asset packs — curated D1-registry pack prefixes for world deployment.
 *
 * SSOT chain: R2 bucket `grudge-assets` → CDN https://assets.grudge-studio.com/
 * → D1 `grudge-assets-db.asset_registry` (searchable index, NOT browser-
 * queryable) → **this curated bake** (pack prefixes + exemplar keys verified
 * against the registry 2026-08-13).
 *
 * Load through gltfPipeline.loadSharedGlbScene(biomeAssetUrl(key)) — cached,
 * retried, clone-per-call. Normalize by bounding box on placement (registry
 * models vary in authored scale) and keep a procedural fallback.
 *
 * Registry keyword counts (2026-08): trees 132 · stones 234 · ore/crystal 103
 * · flora 103 · fish 27 · sky creatures 102 · land animals 57.
 */

export const BIOME_CDN_BASE = 'https://assets.grudge-studio.com/';

/** @param {string} r2Key */
export function biomeAssetUrl(r2Key) {
  return `${BIOME_CDN_BASE}${String(r2Key || '').replace(/^\/+/, '')}`;
}

/**
 * Curated packs per biome group. `prefix` = registry r2_key prefix families;
 * `exemplars` are known-good keys for immediate use / smoke tests.
 * Full listings come from the D1 registry at bake time (asset_registry WHERE
 * r2_key LIKE '<prefix>%') — do not hand-extend exemplars past ~a dozen.
 */
export const BIOME_PACKS = Object.freeze({
  trees: {
    prefixes: ['models/nature/', 'models/modular_terrain/', 'models/foliage/'],
    /** Harvestable: Resource_* has _Cut variants for felled state */
    harvest: ['models/rts_quaternius/Resource_Tree1.glb', 'models/rts_quaternius/Resource_Tree_Group_Cut.glb'],
    exemplars: [
      'models/nature/CommonTree_1.glb',
      'models/nature/Pine_3.glb',
      'models/nature/DeadTree_2.glb',
      'models/modular_terrain/hilly/Hilly_Prop_Tree_Oak_1.glb',
      'models/modular_terrain/beach/Beach_Prop_Tree_Palm_1.glb',
      'models/pirate_quaternius/Environment_PalmTree_1.glb'
    ]
  },
  stones: {
    prefixes: ['models/nature/', 'models/modular_terrain/', 'models/fortress/'],
    exemplars: ['models/rts_quaternius/Resource_Stones.glb']
  },
  ore: {
    prefixes: ['models/rts_quaternius/', 'models/rpg_items/'],
    exemplars: ['models/rpg_items/Gems.glb']
  },
  flora: {
    prefixes: ['models/nature/', 'models/foliage/'],
    exemplars: []
  },
  fish: {
    prefixes: ['models/characters/', 'models/monsters/', 'models/wildlife/'],
    exemplars: []
  },
  skyAnimals: {
    prefixes: ['models/monsters/', 'models/characters/'],
    exemplars: []
  },
  landAnimals: {
    prefixes: ['models/characters/', 'models/monsters/', 'models/wildlife/', 'models/farm_animals/'],
    exemplars: []
  }
});
