/**
 * SI world scale for Casting Abilities stage.
 *
 * Yardstick: human hero ~1.8–2.0 m (Toon fit). Play extents grow with that
 * so locomotion, path cast, and ride paths read as a real yard, not a closet.
 *
 * MAP_SCALE 1.5 = ~50% larger than the original fog/pool stage (~38–40 m).
 */

/** Average adult / grudge6 fit height */
export const HUMAN_HEIGHT_M = 1.8;

/** Target tall-hero yardstick (orc upper band) */
export const HERO_HEIGHT_M = 2.0;

/**
 * Linear map scale vs the original sandbox (fogFar≈38, pool edge≈40).
 * 1.5 → playfield and fog pushed out ~50%.
 */
export const MAP_SCALE = 1.5;

/** Original design numbers (pre-scale) */
const ORIG = Object.freeze({
  fogNear: 10,
  fogFar: 38,
  floorPoolInner: 5,
  floorPoolOuter: 40,
  groundSize: 400,
  physicsHalf: 80,
  shadowExtent: 26,
  cameraDistance: 11.5,
  cameraMaxDistance: 30
});

export const WORLD = Object.freeze({
  mapScale: MAP_SCALE,
  humanHeightM: HUMAN_HEIGHT_M,
  heroHeightM: HERO_HEIGHT_M,

  /** Fog (metres) — slightly further than 1.0× scale so meadow/hero stay readable */
  fogNear: ORIG.fogNear * MAP_SCALE * 1.2,
  fogFar: ORIG.fogFar * MAP_SCALE * 1.45,

  /** Floor radial pool in Ground shader (metres) */
  floorPoolInner: ORIG.floorPoolInner * MAP_SCALE,
  floorPoolOuter: ORIG.floorPoolOuter * MAP_SCALE,

  /** Ground plane edge length (metres) — visible slab */
  groundSize: Math.max(ORIG.groundSize * 0.45, ORIG.floorPoolOuter * MAP_SCALE * 3),

  /** Water plane under/around stage (metres) — open-sea freeride ring */
  waterSize: ORIG.floorPoolOuter * MAP_SCALE * 7.5,
  /**
   * Sea surface Y (metres). SI: water line = 0.
   * Land hills rise above 0; seafloor sits below.
   */
  waterY: 0,

  /**
   * Ocean floor Y (metres) — horizon islands weld here; undersea collision.
   * Water surface stays at waterY (0); seafloor is a separate sand plane.
   */
  seafloorY: -5,

  /**
   * Stage island pad (metres):
   *  - Land = IslandHeightfield (mesh + Rapier + sample) — not forced planar y=0
   *  - islandRadius = dry pad before water hole in StageWater
   *  - shoreBand = land→water blend + visual shore tint
   *  - Aim/path use terrainGround.projectToTerrain (same sample)
   * @see docs/TERRAIN_PHYSICS_SSOT.md · docs/ISLAND_STAGE_SSOT.md
   */
  islandRadius: ORIG.floorPoolOuter * MAP_SCALE * 0.85,
  /** Width of visual shore ring inside islandRadius (metres) */
  shoreBand: 4.5 * MAP_SCALE,
  /** Beach tint mix strength 0..1 at shore */
  shoreTint: 0.55,
  /** Sand beach color (hex string for settings / materials) */
  sandColor: '#c2a86a',
  seafloorColor: '#8a7350',

  /** Rapier ground cuboid half-extents XZ */
  physicsGroundHalf: ORIG.physicsHalf * MAP_SCALE,

  /** Directional shadow ortho half-extent */
  shadowExtent: ORIG.shadowExtent * MAP_SCALE,

  /** Default camera distances (TPS/orbit) */
  cameraDistance: ORIG.cameraDistance * Math.sqrt(MAP_SCALE),
  cameraMaxDistance: ORIG.cameraMaxDistance * MAP_SCALE,
  cameraMinDistance: 3.5
});

/** Human capsule tuned for ~1.8–2.0 m heroes */
export const PLAYER_CAPSULE = Object.freeze({
  radius: 0.35,
  halfHeight: 0.55 // total ≈ 0.35*2 + 1.1 ≈ 1.8 m
});
