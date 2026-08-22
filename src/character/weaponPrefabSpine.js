/**
 * Weapon prefab spine — casting point, barrel, blade, blunt, special, physics, effect.
 *
 * Fleet SSOT: gameopen content/docs/WEAPON_PREFAB.md §3
 *             + artifacts/animator/src/three/arsenal/weaponPrefabSpine.ts
 *
 * Local sockets on a held weapon mesh. Not an avatar store. Not Railway player SSOT.
 * Guns fire from **barrel**. Staff/wand from **cast**. Melee residual from **tip**.
 */

/** @typedef {'grip'|'blade'|'tip'|'blunt'|'barrel'|'cast'|'special'|'physics'|'effect'} SpinePointId */

const pt = (y, x = 0, z = 0) => ({ pos: [x, y, z] });
const ptZ = (z, y = 0.05, x = 0) => ({ pos: [x, y, z] });

export const SPINE_POINT_IDS = Object.freeze([
  'grip',
  'blade',
  'tip',
  'blunt',
  'barrel',
  'cast',
  'special',
  'physics',
  'effect'
]);

/**
 * Casting weaponType / mesh profile → Open family string (spine defaults).
 * @param {string} [wt]
 */
export function familyFromWeaponType(wt) {
  const t = String(wt || '')
    .toUpperCase()
    .replace(/[-\s]/g, '_');
  if (/SHOTGUN|POPPY/.test(t)) return 'rifle';
  if (/RIFLE/.test(t)) return 'rifle';
  if (/GUN|PISTOL|HANDGUN|FLINT/.test(t)) return 'gun';
  if (/CROSSBOW/.test(t)) return 'crossbow';
  if (/BOW/.test(t)) return 'bow';
  if (/WAND/.test(t)) return 'wand';
  if (/TOME/.test(t)) return 'tome';
  if (/STAFF/.test(t)) return 'staff';
  if (/HAMMER|MACE/.test(t)) return 'hammer';
  if (/GREATAXE/.test(t)) return 'greataxe';
  if (/GREATSWORD/.test(t)) return 'greatsword';
  if (/SCYTHE/.test(t)) return 'scythe';
  if (/SPEAR/.test(t)) return 'spear';
  if (/DAGGER/.test(t)) return 'dagger';
  if (/AXE/.test(t)) return 'axe';
  if (/SHIELD/.test(t)) return 'shield';
  if (/TOOL/.test(t)) return 'axe';
  return 'sword';
}

/**
 * WeaponAttach profile → family.
 * @param {string} [profile]
 */
export function familyFromAttachProfile(profile) {
  const p = String(profile || '').toLowerCase();
  if (p === 'pistol') return 'gun';
  if (p === 'rifle') return 'rifle';
  if (p === 'wand' || p === 'staff' || p === 'bow' || p === 'shield') return p;
  return 'sword';
}

/**
 * SI local defaults after normalize (grip at origin).
 * Melee: +Y along length. Guns: +Z along bore.
 * @param {string} family
 */
export function defaultSpineForFamily(family) {
  const f = String(family || 'sword').toLowerCase();

  switch (f) {
    case 'dagger':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(0.27),
          tip: pt(0.45),
          blunt: pt(0.2),
          physics: { pos: [0, 0.25, 0], radius: 0.04, halfHeight: 0.2 },
          effect: pt(0.45)
        }
      };
    case 'greatsword':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(0.95),
          tip: pt(1.7),
          blunt: pt(0.5),
          physics: { pos: [0, 0.9, 0], radius: 0.06, halfHeight: 0.7 },
          effect: pt(1.7)
        }
      };
    case 'axe':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(0.9, 0, 0.12),
          tip: pt(1.0),
          blunt: pt(0.9),
          physics: { pos: [0, 0.55, 0], radius: 0.06, halfHeight: 0.45 },
          effect: pt(1.0)
        }
      };
    case 'greataxe':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(1.1, 0, 0.15),
          tip: pt(1.35),
          blunt: pt(1.1),
          physics: { pos: [0, 0.7, 0], radius: 0.07, halfHeight: 0.55 },
          effect: pt(1.35)
        }
      };
    case 'mace':
    case 'hammer':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blunt: pt(1.05),
          tip: pt(1.1),
          blade: pt(0.7),
          physics: { pos: [0, 0.7, 0], radius: 0.1, halfHeight: 0.35 },
          effect: pt(1.05)
        }
      };
    case 'spear':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(1.7),
          tip: pt(2.05),
          physics: { pos: [0, 1.0, 0], radius: 0.04, halfHeight: 0.9 },
          effect: pt(2.05)
        }
      };
    case 'scythe':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(1.2, 0, 0.25),
          tip: pt(1.5, 0, 0.4),
          special: pt(1.35, 0, 0.35),
          physics: { pos: [0, 0.9, 0], radius: 0.06, halfHeight: 0.7 },
          effect: pt(1.5, 0, 0.4)
        }
      };
    case 'staff':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          cast: pt(1.45),
          tip: pt(1.45),
          special: pt(0.9),
          physics: { pos: [0, 0.8, 0], radius: 0.05, halfHeight: 0.7 },
          effect: pt(1.45)
        }
      };
    case 'wand':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          cast: pt(0.55),
          tip: pt(0.55),
          physics: { pos: [0, 0.3, 0], radius: 0.03, halfHeight: 0.25 },
          effect: pt(0.55)
        }
      };
    case 'tome':
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          cast: pt(0.25, 0.1, 0.05),
          special: pt(0.2),
          physics: { pos: [0, 0.15, 0], radius: 0.12, halfHeight: 0.08 },
          effect: pt(0.25, 0.1, 0.05)
        }
      };
    case 'bow':
    case 'crossbow':
      return {
        forward: 'z+',
        align: 'z',
        status: 'placeholder',
        points: {
          grip: pt(0),
          barrel: ptZ(0.35, 0.08),
          special: ptZ(0.1, 0.2),
          physics: { pos: [0, 0.1, 0.15], radius: 0.06, halfHeight: 0.2 },
          effect: ptZ(0.35, 0.08)
        }
      };
    case 'gun':
    case 'pistol':
    case 'rifle':
      return {
        forward: 'z+',
        align: 'z',
        status: 'placeholder',
        points: {
          grip: pt(0),
          barrel: ptZ(0.36, 0.06),
          tip: ptZ(0.36, 0.06),
          special: ptZ(0.2, 0.04),
          physics: { pos: [0, 0.05, 0.15], radius: 0.04, halfHeight: 0.12 },
          effect: ptZ(0.36, 0.06)
        }
      };
    case 'shield':
      return {
        forward: 'z+',
        align: 'z',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blunt: { pos: [0, 0.15, 0.08] },
          special: { pos: [0, 0.2, 0.1] },
          physics: { pos: [0, 0.15, 0.05], radius: 0.28, halfHeight: 0.05 },
          effect: { pos: [0, 0.15, 0.08] }
        }
      };
    case 'sword':
    default:
      return {
        forward: 'y+',
        align: 'y',
        status: 'placeholder',
        points: {
          grip: pt(0),
          blade: pt(0.62),
          tip: pt(1.12),
          blunt: pt(0.35),
          physics: { pos: [0, 0.55, 0], radius: 0.05, halfHeight: 0.45 },
          effect: pt(1.12)
        }
      };
  }
}

/** Primary combat socket for residual / projectile by family. */
export function primaryCombatPointId(family) {
  const f = String(family || 'sword').toLowerCase();
  if (f === 'gun' || f === 'pistol' || f === 'rifle' || f === 'bow' || f === 'crossbow') {
    return 'barrel';
  }
  if (f === 'staff' || f === 'wand' || f === 'tome') return 'cast';
  if (f === 'mace' || f === 'hammer' || f === 'shield') return 'blunt';
  return 'tip';
}

/**
 * Merge prefab JSON spine over family defaults.
 * @param {{ family?: string, spine?: object, mesh?: { spine?: object }, weaponType?: string }} src
 */
export function resolveWeaponSpine(src = {}) {
  const family = src.family || familyFromWeaponType(src.weaponType || src.weaponTypeId) || 'sword';
  const base = defaultSpineForFamily(family);
  const override = src.spine || src.mesh?.spine || null;
  if (!override || override.status === 'missing') {
    return { ...base, family };
  }
  return {
    family,
    forward: override.forward || base.forward,
    align: override.align || base.align,
    status: override.status || base.status,
    points: {
      ...base.points,
      ...(override.points || {})
    }
  };
}

/**
 * @param {object} src
 * @param {SpinePointId} id
 */
export function resolveSpinePoint(src, id) {
  const spine = resolveWeaponSpine(src);
  const p = spine.points[id];
  if (p) return p;
  if (id === 'effect') {
    return (
      spine.points.tip ||
      spine.points.cast ||
      spine.points.barrel ||
      spine.points.blunt ||
      spine.points.grip ||
      pt(0)
    );
  }
  if (id === 'tip') {
    return spine.points.cast || spine.points.barrel || spine.points.blunt || pt(1);
  }
  if (id === 'cast') {
    return spine.points.tip || spine.points.special || pt(1);
  }
  if (id === 'barrel') {
    return spine.points.tip || ptZ(0.3);
  }
  if (id === 'blunt') {
    return spine.points.tip || spine.points.blade || pt(0.8);
  }
  if (id === 'blade') {
    return spine.points.tip || pt(0.6);
  }
  if (id === 'physics') {
    return spine.points.blunt || spine.points.blade || { pos: [0, 0.5, 0], radius: 0.06, halfHeight: 0.4 };
  }
  return spine.points.grip || pt(0);
}

/**
 * Skill VFX startAnchor → spine point.
 * @param {string|null|undefined} anchor
 * @returns {SpinePointId}
 */
export function spinePointForVfxAnchor(anchor) {
  const a = String(anchor || 'weaponTip').toLowerCase();
  if (a === 'muzzle' || a === 'barrel' || a === 'bore') return 'barrel';
  if (a === 'cast' || a === 'orb' || a === 'staff' || a === 'wand') return 'cast';
  if (a === 'blunt' || a === 'crush' || a === 'impact') return 'blunt';
  if (a === 'blade' || a === 'edge') return 'blade';
  if (a === 'special' || a === 'aux') return 'special';
  if (a === 'hand' || a === 'grip' || a === 'root') return 'grip';
  if (a === 'physics' || a === 'collider') return 'physics';
  if (a === 'effect' || a === 'vfx') return 'effect';
  if (a === 'feet' || a === 'ground') return 'effect';
  if (a === 'weapon_tip' || a === 'weapontip' || a === 'tip') return 'tip';
  return 'tip';
}

/**
 * @param {object} src
 */
export function spineExportFragment(src) {
  const spine = resolveWeaponSpine(src);
  const out = {};
  for (const id of Object.keys(spine.points || {})) {
    const p = spine.points[id];
    if (p) out[id] = p.pos;
  }
  return out;
}
