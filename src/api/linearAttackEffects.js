/**
 * Beautiful linear attack effect specs — one per element.
 *
 * Rides on SkillProjectileSystem + VfxDirector (no second engine). Catalog
 * skills that match these patterns automatically render with all FX layers.
 *
 * Rules:
 * - travelEffectId / impactEffectId must exist in vfxCatalog.js
 * - meshUrl must be in D1 asset_registry or error silently (fallback procedural)
 * - MM speeds tune projectile feel (100 MM = 1 m/s)
 * - Freeze/stun/element props ride on ProjectileHit and skill catalog rows, not invented here
 */

export const LINEAR_ATTACK_EFFECTS = Object.freeze({
  ice_lance: {
    element: 'ice',
    meshUrl: 'models/vfx/ice/lance-crystal.glb', // fallback: procedural cone
    mmSpeed: 420, // 4.2 m/s
    gravity: -2, // slight arc
    travelEffectId: 'ice_lance_trail',
    impactEffectId: 'ice_lance_shatter',
    size: 0.42,
    color: 0x9fdcff,
    hints: ['frozen', 'shatters on impact', 'slow projectile']
  },

  lightning_bolt: {
    element: 'lightning',
    meshUrl: 'models/vfx/lightning/bolt-glow.glb', // fallback: UV orb
    mmSpeed: 520, // 5.2 m/s
    gravity: 0, // flat trajectory
    travelEffectId: 'lightning_bolt_arc',
    impactEffectId: 'lightning_chain', // chains to nearby if AOE
    size: 0.28,
    color: 0xffff00,
    hints: ['instant feel', 'branching arcs on travel', 'chains in AOE']
  },

  fire_pillar: {
    element: 'fire',
    meshUrl: null, // weapon residual only (no travel mesh)
    delivery: 'weapon', // melee swing, not projectile
    travelEffectId: 'fire_slash_trail', // ember scatter along blade arc
    impactEffectId: 'fire_slash_burn', // ground residual
    residualEffectId: 'fire_slash_burn', // lingering field
    size: 0.85,
    color: 0xff6a1e,
    hints: ['melee swing VFX', 'embers trail weapon tip', 'ground burn persists']
  },

  earth_spike: {
    element: 'earth',
    meshUrl: 'models/vfx/rocks/rock-0.glb', // randomized via pickEarthRock
    mmSpeed: 380, // 3.8 m/s, heavy
    gravity: -8, // high arc
    knockbackMm: 180,
    knockupVy: 1.2,
    travelEffectId: 'earth_spike_trail',
    impactEffectId: 'earth_spike_erupt',
    size: 0.55,
    color: 0xc4a574,
    hints: ['heavy projectile', 'ground eruption on land', 'knockback feel']
  },

  water_stream: {
    element: 'water',
    meshUrl: null, // procedural bubbles
    mmSpeed: 300, // 3.0 m/s, slowest
    gravity: -3, // gentle arc
    travelEffectId: 'water_stream_flow',
    impactEffectId: 'water_splash',
    size: 0.22, // bubbles small
    color: 0x6ec8ff,
    hints: ['soft travel feel', 'bubble trail', 'splash AOE on impact']
  }
});

/**
 * Map element → linear attack effect spec. Consumed by elementalLinearCast to
 * select mesh, speed, FX layers.
 * @param {string} element
 * @returns {object|null}
 */
export function linearAttackEffectForElement(element) {
  const key = String(element || '').toLowerCase().replace(/-|_/g, '_');
  if (key === 'lightning' || key === 'electric' || key === 'storm') {
    return LINEAR_ATTACK_EFFECTS.lightning_bolt;
  }
  if (key === 'ice' || key === 'frost') {
    return LINEAR_ATTACK_EFFECTS.ice_lance;
  }
  if (key === 'fire' || key === 'flame') {
    return LINEAR_ATTACK_EFFECTS.fire_pillar;
  }
  if (key === 'earth' || key === 'nature' || key === 'stone') {
    return LINEAR_ATTACK_EFFECTS.earth_spike;
  }
  if (key === 'water' || key === 'wave') {
    return LINEAR_ATTACK_EFFECTS.water_stream;
  }
  return null;
}
