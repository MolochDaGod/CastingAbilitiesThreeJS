/**
 * SSOT SOURCE: ObjectStore/js/grudge6-weapon-hold-pose.js
 * Keep in sync — do not invent a second hold-pose stack in Casting.
 * Play equip: CharacterController after mixer.update → applyWeaponHoldPose.
 */
/**
 * grudge6 weapon hold pose SSOT â€” post-mixer residual on hand sockets.
 *
 * Stack (do not fork):
 *   1. Attach weapon to R/L_hand_container (kit or lab)
 *   2. Static gripOffset / gripEuler (grudge6-lab-weapons applyGripTransform)
 *   3. **This file** â€” after AnimationMixer.update, gait residual on hands
 *   4. Optional 2H secondary-hand IK later (P1)
 *
 * Call sites (same function, no parallel stack):
 *   - main-panel-hero-viewport tick (paperdoll idle)
 *   - play equip / combat CharacterController after mixer.update
 *
 * @example
 *   mixer.update(dt);
 *   applyWeaponHoldPose(mixer, gait, kind);
 */

/** @typedef {'idle'|'walk'|'run'|'sprint'} HoldGait */
/** @typedef {{ pos?: [number, number, number], euler?: [number, number, number] }} HoldSidePose */

/**
 * Per-kind Â· per-gait residual (radians / metres) applied AFTER mixer.
 * Positive euler.x â‰ˆ tip forward/down; euler.z â‰ˆ roll in palm.
 * Dual off-hand uses `off` when present, else mirrored `main`.
 */
export const WEAPON_HOLD_POSE = {
  sword: {
    idle: {
      main: { pos: [0, 0, 0], euler: [0.06, 0.02, 0.1] },
      off: { pos: [0, 0, 0], euler: [0.06, -0.02, -0.1] },
    },
    walk: {
      main: { pos: [0, 0, 0], euler: [0.12, 0.04, 0.12] },
      off: { pos: [0, 0, 0], euler: [0.12, -0.04, -0.12] },
    },
    run: {
      main: { pos: [0, 0.005, 0], euler: [0.18, 0.06, 0.14] },
      off: { pos: [0, 0.005, 0], euler: [0.18, -0.06, -0.14] },
    },
  },
  dagger: {
    idle: {
      main: { pos: [0, 0, 0.01], euler: [0.08, 0.05, 0.18] },
      off: { pos: [0, 0, 0.01], euler: [0.08, -0.05, -0.18] },
    },
    walk: {
      main: { pos: [0, 0, 0.01], euler: [0.14, 0.06, 0.2] },
      off: { pos: [0, 0, 0.01], euler: [0.14, -0.06, -0.2] },
    },
    run: {
      main: { pos: [0, 0.004, 0.012], euler: [0.2, 0.08, 0.22] },
      off: { pos: [0, 0.004, 0.012], euler: [0.2, -0.08, -0.22] },
    },
  },
  knife: {
    idle: {
      main: { pos: [0, 0, 0.01], euler: [0.08, 0.05, 0.18] },
      off: { pos: [0, 0, 0.01], euler: [0.08, -0.05, -0.18] },
    },
    walk: {
      main: { pos: [0, 0, 0.01], euler: [0.14, 0.06, 0.2] },
      off: { pos: [0, 0, 0.01], euler: [0.14, -0.06, -0.2] },
    },
    run: {
      main: { pos: [0, 0.004, 0.012], euler: [0.2, 0.08, 0.22] },
      off: { pos: [0, 0.004, 0.012], euler: [0.2, -0.08, -0.22] },
    },
  },
  mace: {
    idle: {
      main: { pos: [0, 0, 0], euler: [0.05, 0.02, 0.08] },
      off: { pos: [0, 0, 0], euler: [0.05, -0.02, -0.08] },
    },
    walk: {
      main: { pos: [0, 0, 0], euler: [0.1, 0.03, 0.1] },
      off: { pos: [0, 0, 0], euler: [0.1, -0.03, -0.1] },
    },
    run: {
      main: { pos: [0, 0.004, 0], euler: [0.16, 0.05, 0.12] },
      off: { pos: [0, 0.004, 0], euler: [0.16, -0.05, -0.12] },
    },
  },
  hammer: {
    idle: {
      main: { pos: [0, 0, 0], euler: [0.05, 0.02, 0.08] },
      off: { pos: [0, 0, 0], euler: [0.05, -0.02, -0.08] },
    },
    walk: {
      main: { pos: [0, 0, 0], euler: [0.1, 0.03, 0.1] },
      off: { pos: [0, 0, 0], euler: [0.1, -0.03, -0.1] },
    },
    run: {
      main: { pos: [0, 0.004, 0], euler: [0.16, 0.05, 0.12] },
      off: { pos: [0, 0.004, 0], euler: [0.16, -0.05, -0.12] },
    },
  },
  axe: {
    idle: {
      main: { pos: [0, 0, 0], euler: [0.07, 0.03, 0.12] },
      off: { pos: [0, 0, 0], euler: [0.07, -0.03, -0.12] },
    },
    walk: {
      main: { pos: [0, 0, 0], euler: [0.13, 0.04, 0.14] },
      off: { pos: [0, 0, 0], euler: [0.13, -0.04, -0.14] },
    },
    run: {
      main: { pos: [0, 0.005, 0], euler: [0.2, 0.06, 0.16] },
      off: { pos: [0, 0.005, 0], euler: [0.2, -0.06, -0.16] },
    },
  },
  spear: {
    idle: { main: { pos: [0, 0.02, 0], euler: [0.35, 0, 0.05] } },
    walk: { main: { pos: [0, 0.02, 0], euler: [0.42, 0.02, 0.06] } },
    run: { main: { pos: [0, 0.025, 0], euler: [0.5, 0.03, 0.08] } },
  },
  greatsword: {
    idle: { main: { pos: [0, 0.01, 0], euler: [0.15, 0.04, 0.08] } },
    walk: { main: { pos: [0, 0.012, 0], euler: [0.22, 0.05, 0.1] } },
    run: { main: { pos: [0, 0.015, 0], euler: [0.3, 0.06, 0.12] } },
  },
  greataxe: {
    idle: { main: { pos: [0, 0.01, 0], euler: [0.14, 0.04, 0.1] } },
    walk: { main: { pos: [0, 0.012, 0], euler: [0.2, 0.05, 0.12] } },
    run: { main: { pos: [0, 0.015, 0], euler: [0.28, 0.06, 0.14] } },
  },
  staff: {
    idle: { main: { pos: [0, 0.02, 0], euler: [0.25, 0, 0.04] } },
    walk: { main: { pos: [0, 0.02, 0], euler: [0.32, 0.02, 0.05] } },
    run: { main: { pos: [0, 0.025, 0], euler: [0.4, 0.03, 0.06] } },
  },
  wand: {
    idle: { main: { pos: [0, 0, 0.01], euler: [0.1, 0.04, 0.12] } },
    walk: { main: { pos: [0, 0, 0.01], euler: [0.16, 0.05, 0.14] } },
    run: { main: { pos: [0, 0.004, 0.012], euler: [0.22, 0.06, 0.16] } },
  },
  bow: {
    idle: { main: { pos: [0, 0.01, 0], euler: [0.2, 0.1, -0.15] } },
    walk: { main: { pos: [0, 0.012, 0], euler: [0.28, 0.12, -0.18] } },
    run: { main: { pos: [0, 0.015, 0], euler: [0.35, 0.14, -0.2] } },
  },
  crossbow: {
    idle: { main: { pos: [0, 0.01, 0.02], euler: [0.15, 0.05, 0.05] } },
    walk: { main: { pos: [0, 0.012, 0.02], euler: [0.2, 0.06, 0.06] } },
    run: { main: { pos: [0, 0.014, 0.025], euler: [0.28, 0.08, 0.08] } },
  },
  pistol: {
    idle: { main: { pos: [0, 0, 0.02], euler: [0.12, 0.08, 0.15] } },
    walk: { main: { pos: [0, 0, 0.02], euler: [0.18, 0.1, 0.16] } },
    run: { main: { pos: [0, 0.004, 0.025], euler: [0.24, 0.12, 0.18] } },
  },
  tome: {
    idle: { main: { pos: [0.02, 0.02, 0.04], euler: [-0.2, 0.1, 0.35] } },
    walk: { main: { pos: [0.02, 0.02, 0.04], euler: [-0.18, 0.12, 0.35] } },
    run: { main: { pos: [0.02, 0.025, 0.04], euler: [-0.15, 0.14, 0.32] } },
  },
  grimoire: {
    idle: { main: { pos: [0.02, 0.02, 0.04], euler: [-0.2, 0.1, 0.35] } },
    walk: { main: { pos: [0.02, 0.02, 0.04], euler: [-0.18, 0.12, 0.35] } },
    run: { main: { pos: [0.02, 0.025, 0.04], euler: [-0.15, 0.14, 0.32] } },
  },
};

const R_HAND_NAMES = [
  'R_hand_container',
  'Bip001 R Hand',
  'Bip001_R_Hand',
  'mixamorig:RightHand',
  'mixamorigRightHand',
];
const L_HAND_NAMES = [
  'L_hand_container',
  'Bip001 L Hand',
  'Bip001_L_Hand',
  'mixamorig:LeftHand',
  'mixamorigLeftHand',
];

/**
 * Normalize gait labels from panel (idle) and play (0/1/2, walk/run/sprint).
 * @param {string|number|null|undefined} gait
 * @returns {HoldGait}
 */
export function normalizeHoldGait(gait) {
  if (gait == null) return 'idle';
  if (typeof gait === 'number') {
    if (gait >= 3 || gait === 2.5) return 'sprint';
    if (gait >= 2) return 'run';
    if (gait >= 1) return 'walk';
    return 'idle';
  }
  const s = String(gait).toLowerCase();
  if (/sprint|dash/.test(s)) return 'sprint';
  if (/run|jog/.test(s)) return 'run';
  if (/walk|locom|move|patrol/.test(s)) return 'walk';
  return 'idle';
}

/**
 * Map kit equip slot / catalog kind â†’ hold table key.
 * @param {string|null|undefined} kindOrSlot
 */
export function normalizeHoldKind(kindOrSlot) {
  const k = String(kindOrSlot || 'sword').toLowerCase();
  if (/greatsword|2h.?sword/.test(k)) return 'greatsword';
  if (/greataxe|2h.?axe/.test(k)) return 'greataxe';
  if (/spear|lance|pole/.test(k)) return 'spear';
  if (/dagger|knife/.test(k)) return k.includes('knife') ? 'knife' : 'dagger';
  if (/mace|club/.test(k)) return 'mace';
  if (/hammer|maul/.test(k)) return 'hammer';
  if (/axe/.test(k)) return 'axe';
  if (/sword|blade|saber/.test(k)) return 'sword';
  if (/staff|stave/.test(k)) return 'staff';
  if (/wand/.test(k)) return 'wand';
  if (/crossbow/.test(k)) return 'crossbow';
  if (/bow|longbow/.test(k)) return 'bow';
  if (/pistol|handgun|flint|gun|rifle/.test(k)) return 'pistol';
  if (/tome|grimoire|codex|book/.test(k)) return /grimoire/.test(k) ? 'grimoire' : 'tome';
  if (/pick/.test(k)) return 'hammer';
  if (WEAPON_HOLD_POSE[k]) return k;
  return 'sword';
}

/**
 * Resolve kind from EquipmentManager (kit) state.
 * @param {{ equipped?: Record<string, string>, equippedOffhand?: { slot?: string }|null }} equip
 */
export function resolveHoldKindFromEquip(equip) {
  if (!equip) return 'sword';
  const eq = equip.equipped || {};
  for (const slot of ['sword', 'dagger', 'axe', 'mace', 'hammer', 'spear', 'pick', 'bow', 'staff']) {
    if (eq[slot]) return normalizeHoldKind(slot);
  }
  if (equip.equippedOffhand?.slot) return normalizeHoldKind(equip.equippedOffhand.slot);
  return 'sword';
}

function findNamed(root, names) {
  if (!root) return null;
  for (const n of names) {
    const o = root.getObjectByName?.(n);
    if (o) return o;
  }
  let hit = null;
  const re = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  root.traverse?.((o) => {
    if (hit) return;
    if (re.test(String(o.name || ''))) hit = o;
  });
  return hit;
}

/**
 * Lookup residual for kind+gait. sprint falls back to run.
 * @returns {{ main?: HoldSidePose, off?: HoldSidePose }}
 */
export function getHoldPose(kind, gait) {
  const k = normalizeHoldKind(kind);
  const g0 = normalizeHoldGait(gait);
  const g = g0 === 'sprint' ? 'run' : g0;
  const table = WEAPON_HOLD_POSE[k] || WEAPON_HOLD_POSE.sword;
  return table[g] || table.idle || {};
}

/**
 * Mirror main pose â†’ off when off table missing (1H dual).
 * @param {HoldSidePose|undefined} main
 * @returns {HoldSidePose|null}
 */
function mirrorMain(main) {
  if (!main) return null;
  const e = main.euler || [0, 0, 0];
  const p = main.pos || [0, 0, 0];
  return {
    pos: [-(p[0] || 0), p[1] || 0, p[2] || 0],
    euler: [e[0] || 0, -(e[1] || 0), -(e[2] || 0)],
  };
}

/**
 * Apply one side residual onto a hand bone/container (post-mixer).
 * Mixer rewrites bone locals each frame â€” residual is additive after update.
 *
 * @param {import('three').Object3D|null} hand
 * @param {HoldSidePose|null|undefined} pose
 * @param {*} THREE
 */
function applySideResidual(hand, pose, THREE) {
  if (!hand || !pose || !THREE) return;
  const e = pose.euler || [0, 0, 0];
  const p = pose.pos || [0, 0, 0];
  if (e[0] || e[1] || e[2]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0] || 0, e[1] || 0, e[2] || 0, 'XYZ'));
    hand.quaternion.multiply(q);
  }
  if (p[0] || p[1] || p[2]) {
    hand.position.x += p[0] || 0;
    hand.position.y += p[1] || 0;
    hand.position.z += p[2] || 0;
  }
}

/**
 * Post-mixer weapon hold pose.
 *
 * @param {import('three').AnimationMixer|import('three').Object3D|null} mixer
 *   AnimationMixer (preferred) or character root Object3D
 * @param {string|number} gait idle|walk|run|sprint or 0|1|2
 * @param {string} kind weapon kind / kit slot (sword, dagger, staff, â€¦)
 * @param {{
 *   THREE?: any,
 *   hand?: 'main'|'off'|'both',
 *   offKind?: string|null,
 *   root?: import('three').Object3D|null
 * }} [opts]
 * @returns {boolean} true if a residual was applied
 */
export function applyWeaponHoldPose(mixer, gait, kind, opts = {}) {
  if (!mixer && !opts.root) return false;
  const THREE = opts.THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null);
  if (!THREE || !THREE.Quaternion || !THREE.Euler) {
    // Without THREE we cannot build residual quaternions
    return false;
  }

  let root = opts.root || null;
  if (!root && mixer) {
    if (typeof mixer.getRoot === 'function') {
      try {
        root = mixer.getRoot();
      } catch {
        root = null;
      }
    }
    if (!root && mixer.isObject3D) root = mixer;
    if (!root && mixer.root) root = mixer.root;
  }
  if (!root) return false;

  const pose = getHoldPose(kind, gait);
  const handMode = opts.hand || 'both';
  let applied = false;

  if (handMode === 'main' || handMode === 'both') {
    const rHand = findNamed(root, R_HAND_NAMES);
    if (rHand && pose.main) {
      applySideResidual(rHand, pose.main, THREE);
      applied = true;
    }
  }

  if (handMode === 'off' || handMode === 'both') {
    const lHand = findNamed(root, L_HAND_NAMES);
    if (lHand) {
      const offKind = opts.offKind != null ? opts.offKind : kind;
      // Prefer offKind table when dual different weapons; else same kind off / mirror
      let offPose = pose.off;
      if (opts.offKind && normalizeHoldKind(opts.offKind) !== normalizeHoldKind(kind)) {
        offPose = getHoldPose(offKind, gait).off || getHoldPose(offKind, gait).main;
        if (offPose && !getHoldPose(offKind, gait).off) {
          offPose = mirrorMain(offPose);
        }
      } else if (!offPose) {
        offPose = mirrorMain(pose.main);
      }
      if (offPose) {
        applySideResidual(lHand, offPose, THREE);
        applied = true;
      }
    }
  }

  return applied;
}

// UMD-ish global for non-module main-panel forks
if (typeof globalThis !== 'undefined') {
  globalThis.Grudge6WeaponHoldPose = {
    WEAPON_HOLD_POSE,
    normalizeHoldGait,
    normalizeHoldKind,
    resolveHoldKindFromEquip,
    getHoldPose,
    applyWeaponHoldPose,
  };
}

