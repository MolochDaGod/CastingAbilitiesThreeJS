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

  /** Fog (metres) */
  fogNear: ORIG.fogNear * MAP_SCALE,
  fogFar: ORIG.fogFar * MAP_SCALE,

  /** Floor radial pool in Ground shader (metres) */
  floorPoolInner: ORIG.floorPoolInner * MAP_SCALE,
  floorPoolOuter: ORIG.floorPoolOuter * MAP_SCALE,

  /** Ground plane edge length (metres) — visible slab */
  groundSize: Math.max(ORIG.groundSize * 0.45, ORIG.floorPoolOuter * MAP_SCALE * 3),

  /** Water plane under/around stage (metres) */
  waterSize: ORIG.floorPoolOuter * MAP_SCALE * 4.5,
  waterY: -0.04,

  /** Stage island radius before water (metres) — visual only */
  islandRadius: ORIG.floorPoolOuter * MAP_SCALE * 0.85,

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
