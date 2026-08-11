/**
 * Back-slot mobility SSOT — windsurf (water only), capes/shells (land), wings (air).
 *
 * Windsurf is **not** a land deployable. It is a **water mobility vehicle**.
 * Land back items (capes, shells, packs) and air (wings, gliders) use different
 * deploy contracts on the same BackSlotEquip spine attach.
 *
 * Wings (next system):
 *  - holy_wings     — jump up → glide down (angel / holy)
 *  - traveler_wings — double jump → fly pose · **2 flaps** · then glide (WoW DF-like)
 *
 * @see character/BackSlotEquip.js
 * @see docs/WINDSURF_RIDE_SSOT.md
 * @see docs/BACK_SLOT_MOBILITY_SSOT.md
 */

/** Domain where deploy is legal */
/** @typedef {'water'|'land'|'air'|'cosmetic'} MobilityDomain */

/**
 * Deploy contract kinds (runtime host).
 * @typedef {'vehicle_water'|'glide_air'|'cosmetic_land'|'shell_land'} DeployKind
 */

/**
 * @typedef {object} BackMobilityDef
 * @property {string} id
 * @property {string} label
 * @property {MobilityDomain} domain
 * @property {DeployKind} deployKind
 * @property {boolean} deployable
 * @property {string|null} modelUrl          stow / back mesh
 * @property {string|null} [deployModelUrl]  full vehicle or open wings mesh
 * @property {string|null} [iconUrl]
 * @property {number} [stowLengthM]
 * @property {number[]} [stowOffset]
 * @property {number[]} [stowEulerDeg]
 * @property {boolean} [cloth]
 * @property {object} [flight]              air mobility knobs
 * @property {object} [waterBuffs]          passive water buffs (shark fin etc.)
 * @property {string} [notes]
 */

/** Flight knobs shared by wing prefabs */
export const FLIGHT_DEFAULTS = Object.freeze({
  /** Max flaps before forced glide (Traveler) */
  maxFlaps: 2,
  /** Upward boost per flap (m/s) */
  flapVy: 6.2,
  /** Glide sink rate (m/s, positive down) */
  glideSink: 1.4,
  /** Glide forward speed (m/s) */
  glideSpeed: 9.5,
  /** Traveler boosted glide speed with flaps remaining feel */
  travelerGlideSpeed: 14,
  /** Holy: single jump height boost into glide */
  holyJumpVy: 8.5,
  /** Min airtime before glide engages after jump (s) */
  glideEngageSec: 0.18
});

/**
 * Canonical back-slot catalog (equip ids).
 * @type {Record<string, BackMobilityDef>}
 */
export const BACK_MOBILITY_CATALOG = Object.freeze({
  none: {
    id: 'none',
    label: 'None',
    domain: 'cosmetic',
    deployKind: 'cosmetic_land',
    deployable: false,
    modelUrl: null
  },

  /** Water vehicle only — never deploy on dry land */
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    domain: 'water',
    deployKind: 'vehicle_water',
    deployable: true,
    modelUrl: './models/ride/back_fly_windsurf.glb',
    deployModelUrl: './models/ride/windsurf_package.glb',
    stowLengthM: 0.58,
    stowOffset: [0.02, 0.06, -0.14],
    stowEulerDeg: [8, 180, 0],
    cloth: true,
    notes:
      'Water mobility only. Stow = para/sail back pack; deploy vehicle = windsurf_package + manifest sockets.'
  },

  /** Land cosmetic / passive mobility shell */
  cape: {
    id: 'cape',
    label: 'Cape',
    domain: 'land',
    deployKind: 'cosmetic_land',
    deployable: false,
    modelUrl: null,
    cloth: true,
    notes: 'Land back cosmetic — cloth follow; no vehicle. Mesh TBD from armor back pack.'
  },

  shell: {
    id: 'shell',
    label: 'Back Shell',
    domain: 'land',
    deployKind: 'shell_land',
    deployable: false,
    modelUrl: null,
    notes: 'Land shell / pack — armor silhouette; no air deploy.'
  },

  /**
   * Shark Fin — passive water utility (Poly by Google).
   * Stow on spine; always-on buffs while equipped (no vehicle deploy).
   *  - Swim on / under water **100% faster** (×2)
   *  - **No aggro** from sharks
   *  - **Breathe** underwater (no drown)
   */
  shark_fin: {
    id: 'shark_fin',
    label: 'Shark Fin',
    domain: 'water',
    deployKind: 'cosmetic_land',
    deployable: false,
    modelUrl: './models/ride/shark_fin.glb',
    stowLengthM: 0.55,
    stowOffset: [0.0, 0.12, -0.18],
    stowEulerDeg: [15, 180, 0],
    cloth: false,
    waterBuffs: {
      /** Surface + submerged loco speed multiplier (1 = base, 2 = 100% faster) */
      swimSpeedMul: 2.0,
      /** Combat / fauna: sharks do not aggro the wearer */
      sharkAggroImmune: true,
      /** No oxygen drain / drown while submerged */
      breatheUnderwater: true
    },
    notes:
      'Back slot · Poly by Google shark fin. Passive: 2× swim (on & under water), shark aggro immune, underwater breath.'
  },

  /**
   * Holy Wings — jump up, then glide down.
   * Prefab ready; mesh path when animated wings asset lands in public/models/ride/wings/.
   */
  holy_wings: {
    id: 'holy_wings',
    label: 'Holy Wings',
    domain: 'air',
    deployKind: 'glide_air',
    deployable: true,
    modelUrl: './models/ride/wings/holy_wings_stow.glb',
    deployModelUrl: './models/ride/wings/holy_wings_open.glb',
    stowLengthM: 0.72,
    stowOffset: [0, 0.1, -0.16],
    stowEulerDeg: [0, 180, 0],
    flight: {
      mode: 'holy',
      /** Jump once → auto enter glide at apex */
      jumpToGlide: true,
      maxFlaps: 0,
      jumpVy: FLIGHT_DEFAULTS.holyJumpVy,
      glideSink: FLIGHT_DEFAULTS.glideSink,
      glideSpeed: FLIGHT_DEFAULTS.glideSpeed,
      anims: {
        open: 'wings/holy-open',
        glide: 'wings/holy-glide',
        flap: null,
        close: 'wings/holy-close'
      }
    },
    notes:
      'Jump (Space) from ground or air → rise · at apex open wings · glide down. No multi-flap.'
  },

  /**
   * Traveler Wings — double jump → fly pose · two flaps · then glide (DF-like).
   */
  traveler_wings: {
    id: 'traveler_wings',
    label: "Traveler's Wings",
    domain: 'air',
    deployKind: 'glide_air',
    deployable: true,
    modelUrl: './models/ride/wings/traveler_wings_stow.glb',
    deployModelUrl: './models/ride/wings/traveler_wings_open.glb',
    stowLengthM: 0.78,
    stowOffset: [0, 0.1, -0.18],
    stowEulerDeg: [0, 180, 0],
    flight: {
      mode: 'traveler',
      /** Second air jump enters fly pose */
      doubleJumpToFly: true,
      maxFlaps: FLIGHT_DEFAULTS.maxFlaps,
      flapVy: FLIGHT_DEFAULTS.flapVy,
      glideSink: FLIGHT_DEFAULTS.glideSink * 0.85,
      glideSpeed: FLIGHT_DEFAULTS.travelerGlideSpeed,
      anims: {
        open: 'wings/traveler-open',
        flyPose: 'wings/traveler-fly',
        flap: 'wings/traveler-flap',
        glide: 'wings/traveler-glide',
        close: 'wings/traveler-close'
      }
    },
    notes:
      'Air Space (double jump) → fly pose. Space again = flap (max 2). After flaps = glide down. Faster than Holy.'
  }
});

/**
 * Windsurf vehicle part sockets (deployed package) — SI travel frame +Z nose.
 * Mesh nodes are often unnamed Sketchfab Tube; parts are **socket + bbox heuristics**.
 */
export const WINDSURF_PARTS = Object.freeze({
  board: {
    id: 'board',
    label: 'Board / deck',
    sockets: ['deckCenter', 'footL', 'footR', 'mastBase'],
    /** Stern←→bow along +Z */
    color: 0x4a90d9,
    notes: 'Rigid body under feet; IK feet plant here'
  },
  front: {
    id: 'front',
    label: 'Front / bow',
    sockets: ['bowTip'],
    color: 0x3dff9a,
    notes: 'Nose into travel +Z (artYaw 0)'
  },
  sail: {
    id: 'sail',
    label: 'Sail / boom',
    sockets: ['sailPeak', 'sailRail', 'sailBoomL', 'sailBoomR', 'mastBase'],
    color: 0xffc14a,
    notes: 'Cloth sail + hand boom grips; SailCloth vertex wind'
  },
  engine: {
    id: 'engine',
    label: 'Engine / stern mount',
    sockets: ['engineMount'],
    color: 0xff5a5a,
    notes: 'Aft mount (−Z); thrust visual / future prop'
  }
});

/**
 * @param {string} id
 * @returns {BackMobilityDef|null}
 */
export function getBackMobility(id) {
  return BACK_MOBILITY_CATALOG[id] || null;
}

/**
 * Passive water buffs from equipped back-slot item (shark fin, etc.).
 * @param {string|null|undefined} itemId
 * @returns {{
 *   swimSpeedMul: number,
 *   sharkAggroImmune: boolean,
 *   breatheUnderwater: boolean,
 *   id: string|null
 * }}
 */
export function getBackWaterBuffs(itemId) {
  const def = getBackMobility(itemId);
  const b = def?.waterBuffs || null;
  return {
    id: def?.id || null,
    swimSpeedMul: Number(b?.swimSpeedMul) > 0 ? Number(b.swimSpeedMul) : 1,
    sharkAggroImmune: !!b?.sharkAggroImmune,
    breatheUnderwater: !!b?.breatheUnderwater
  };
}

/**
 * Can this item deploy at current surface?
 * @param {BackMobilityDef|null} def
 * @param {{ onWater?: boolean, onLand?: boolean, airborne?: boolean }} surface
 */
export function canDeployBackItem(def, surface = {}) {
  if (!def?.deployable) return { ok: false, reason: 'not deployable' };
  if (def.domain === 'water') {
    // Passive water items (shark_fin) are equip-only, not deploy vehicles
    if (def.id === 'shark_fin') return { ok: false, reason: 'passive water buff — always on while equipped' };
    if (surface.onWater) return { ok: true };
    return { ok: false, reason: 'Windsurf is water-only — move to ocean / wet shore' };
  }
  if (def.domain === 'air') {
    // Wings equip on land; deploy/flight is air-state
    return { ok: true };
  }
  if (def.domain === 'land') {
    if (surface.onLand !== false) return { ok: true };
    return { ok: false, reason: 'Land back item' };
  }
  return { ok: false, reason: 'unknown domain' };
}

/**
 * Traveler flap budget state machine helpers.
 * @param {{ flapsLeft: number, mode: string }} st
 * @param {'doubleJump'|'flap'|'glide'|'land'} event
 */
export function reduceTravelerFlight(st, event) {
  const next = { ...st };
  if (event === 'doubleJump') {
    next.mode = 'fly';
    next.flapsLeft = FLIGHT_DEFAULTS.maxFlaps;
    return next;
  }
  if (event === 'flap' && next.mode === 'fly' && next.flapsLeft > 0) {
    next.flapsLeft -= 1;
    if (next.flapsLeft <= 0) next.mode = 'glide';
    return next;
  }
  if (event === 'glide') {
    next.mode = 'glide';
    next.flapsLeft = 0;
    return next;
  }
  if (event === 'land') {
    next.mode = 'idle';
    next.flapsLeft = 0;
    return next;
  }
  return next;
}

/** Expected asset drop paths (when you locate animated wing packs) */
export const WING_ASSET_DROP = Object.freeze({
  holy: {
    stow: 'public/models/ride/wings/holy_wings_stow.glb',
    open: 'public/models/ride/wings/holy_wings_open.glb',
    anims: 'public/anims/baked/wings/holy-*.json'
  },
  traveler: {
    stow: 'public/models/ride/wings/traveler_wings_stow.glb',
    open: 'public/models/ride/wings/traveler_wings_open.glb',
    anims: 'public/anims/baked/wings/traveler-*.json'
  },
  searchHints: [
    'D:/Games/Models/**/*wing*',
    'D:/Games/Models/**/*angel*',
    'D:/Games/Models/**/*glider*',
    'Desktop grudgeproduction / ObjectStore armor back',
    'GrudgeBuilder icons/armor/wings/wing_*.png (icons only until mesh found)'
  ]
});
