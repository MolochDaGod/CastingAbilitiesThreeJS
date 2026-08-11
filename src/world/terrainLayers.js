/**
 * Three-layer terrain SSOT (Casting lab + fleet grass islands).
 *
 * | Layer | Name | Role | Source patterns |
 * |-------|------|------|-----------------|
 * | **L0** | Height field | One `heightAt(x,z)` for mesh · feet · Rapier · aim · forest | snakey-locomotion, three-stylized Terrain |
 * | **L1** | Surface ground | Visual mesh / dirt-meadow colors on L0 | three-stylized grounds, IslandHeightfield |
 * | **L2** | Vegetation | Instanced grass + growing forest | three-stylized Grass, forestoutline.html, snakey trees |
 * | **L3** | Detail scatter | Rocks / harvest / wildflowers | DevIslandHarvest, three-stylized wildflowers |
 *
 * **Hard rules**
 * 1. One height function only — never a second heightmap for feet vs grass.
 * 2. Forest / grass sample L0 via `heightSample` callback.
 * 3. Water is a sibling layer (`StageWater`), not L1.
 * 4. SI: 1 unit = 1 m; human ~1.8 m yardstick for hill amp.
 *
 * Learn / study (do not vendor whole repos as parallel engines):
 *  - https://github.com/muratkamci/snakey-locomotion
 *  - https://github.com/Steve245270533/three-stylized
 *  - https://simonstorlschulke.github.io/threejs-examples/?scene=0  (infinite stream later)
 *  - Desktop forestoutline.html (instanced procedural trees + leaf texture)
 *
 * @see docs/THREE_LAYER_TERRAIN_SSOT.md
 * @see IslandHeightfield.js · GrowingForest.js · StylizedGrassLayer.js
 */

import { IslandHeightfield, heightAt, terrainOpts } from './IslandHeightfield.js';
import { GrowingForest } from './GrowingForest.js';
import { StylizedGrassLayer } from './StylizedGrassLayer.js';
import { settings } from '../config/settings.js';
import { WORLD } from '../config/worldScale.js';

/** Layer ids — same language as grudge-player-and-grass */
export const TERRAIN_LAYER = Object.freeze({
  L0_HEIGHT: 'L0_height',
  L1_SURFACE: 'L1_surface',
  L2_VEGETATION: 'L2_vegetation',
  L3_DETAIL: 'L3_detail',
  WATER: 'water'
});

/**
 * Build layered terrain for a scene.
 *
 * @param {{
 *   scene: import('three').Scene,
 *   heightfield?: IslandHeightfield|null,
 *   forest?: boolean,
 *   grass?: boolean,
 *   onToast?: (s: string) => void
 * }} opts
 */
export function mountTerrainLayers(opts) {
  const t = settings.terrain || {};
  const heightfield =
    opts.heightfield ??
    (t.enabled !== false ? new IslandHeightfield() : null);

  const heightSample = (x, z) =>
    heightfield?.sample?.(x, z) ?? heightAt(x, z, terrainOpts());

  /** @type {{ heightfield: IslandHeightfield|null, forest: GrowingForest|null, grass: StylizedGrassLayer|null, heightSample: Function }} */
  const layers = {
    heightfield,
    forest: null,
    grass: null,
    heightSample,
    layerIds: [TERRAIN_LAYER.L0_HEIGHT, TERRAIN_LAYER.L1_SURFACE]
  };

  if (heightfield?.mesh) {
    // Idempotent: App may already have added mesh at boot
    if (!heightfield.mesh.parent) opts.scene.add(heightfield.mesh);
    heightfield.mesh.userData.terrainLayer = TERRAIN_LAYER.L1_SURFACE;
    heightfield.mesh.userData.heightLayer = TERRAIN_LAYER.L0_HEIGHT;
  }

  if (opts.forest !== false && t.forestEnabled !== false && heightfield) {
    layers.forest = new GrowingForest({
      scene: opts.scene,
      heightSample,
      count: t.forestCount ?? 48,
      islandRadius: WORLD.islandRadius * 0.9,
      clearRadius: t.forestClearRadius ?? 11,
      seed: (t.seed ?? 17) + 900,
      onToast: opts.onToast
    });
    layers.layerIds.push(TERRAIN_LAYER.L2_VEGETATION);
  }

  if (opts.grass !== false && t.grassEnabled !== false && heightfield) {
    layers.grass = new StylizedGrassLayer({
      scene: opts.scene,
      heightSample,
      islandRadius: WORLD.islandRadius * 0.88,
      clearRadius: t.grassClearRadius ?? 6,
      density: t.grassDensity ?? 28,
      seed: (t.seed ?? 17) + 401,
      bladeMaxHeight: t.grassBladeMax ?? 0.55
    });
    if (!layers.layerIds.includes(TERRAIN_LAYER.L2_VEGETATION)) {
      layers.layerIds.push(TERRAIN_LAYER.L2_VEGETATION);
    }
  }

  layers.layerIds.push(TERRAIN_LAYER.L3_DETAIL);

  return layers;
}

/**
 * Agent-facing summary of learned sources → layers.
 */
export const TERRAIN_LEARNED = Object.freeze({
  L0: {
    name: 'Height field',
    patterns: [
      'snakey heightAt multi-band FBM',
      'three-stylized terrainDegree / seed',
      'Rapier Float32 heightfield'
    ],
    code: 'IslandHeightfield.heightAt / sample'
  },
  L1: {
    name: 'Surface ground',
    patterns: [
      'three-stylized dirt/meadow groundColor',
      'vertex meadow↔dirt↔shore colors'
    ],
    code: 'IslandHeightfield.mesh'
  },
  L2: {
    name: 'Vegetation',
    patterns: [
      'three-stylized instanced grass + wind',
      'forestoutline instanced trees + leaf sway/texture',
      'snakey reactive grass / tree climb surfaces (climb later)'
    ],
    code: 'StylizedGrassLayer · GrowingForest'
  },
  L3: {
    name: 'Detail',
    patterns: ['harvest rocks', 'wildflowers optional', 'decals'],
    code: 'DevIslandHarvest'
  },
  streaming: {
    name: 'Infinite tiles (later)',
    patterns: ['simonstorlschulke threejs-examples scene=0 infinite terrain'],
    code: 'chunk keys shared L0–L2 — not active on island pad'
  }
});
