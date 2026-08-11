/**
 * Grudge / Toon RTS asset config for this sandbox.
 *
 * Race kits / atlases: `grudge6SSOT.js` (Multiverse stone SSOT).
 * Mesh load: GLTFLoader + DRACO + Meshopt (AssetLoader).
 * Baked Bip001 clips: open.grudge-studio.com/anims/baked/…
 */

import {
  CDN,
  DEFAULT_RACE,
  GEAR_PRESETS_URL as SSOT_GEAR_PRESETS,
  HUMAN_HEIGHT_M,
  RACES as SSOT_RACES,
  atlasUrlForRace,
  kitUrlCandidates,
  kitUrlForRace
} from './grudge6SSOT.js';

export const ASSETS_CDN = CDN;
export const OPEN_HOST = 'https://open.grudge-studio.com';

// Decoder pins live in gltfPipeline only — re-export so importers stay stable
export {
  DRACO_DECODER_PATH,
  KTX2_TRANSCODER_PATH
} from '../loaders/gltfPipeline.js';

export const GEAR_PRESETS_URL = SSOT_GEAR_PRESETS;
export { DEFAULT_RACE, atlasUrlForRace, kitUrlCandidates, kitUrlForRace, HUMAN_HEIGHT_M };

/** Race kits + atlases — Toon RTS ★ play URLs. */
export const RACES = Object.fromEntries(
  Object.entries(SSOT_RACES).map(([id, r]) => [
    id,
    {
      id: r.id,
      label: r.label,
      prefix: r.prefix,
      kitUrl: r.kitGlb,
      atlasUrl: r.atlasUrl,
    },
  ]),
);

/**
 * Baked pack clips — each role is a candidate list (first URL that loads wins).
 *
 * HARD idle lesson (2026-08): open `magic/standing idle` is rotation-only but
 * **has no Hand tracks** and drives Spine1/Spine2. Toon bind leaves hands in a
 * broken rest while cast (`…1h cast spell…`) animates hands → cast looks formed,
 * idle does not. Prefer **prod** magic idle (hands + same bone set as cast).
 */
/**
 * Weapon locomotion + skill packs (Bip001 baked JSON).
 * Lab binds one active pack; skills fire roles (cast/attack/block).
 * Expand roles only when CDN clips exist — do not invent paths.
 */
export const ANIM_PACKS = {
  magic: {
    // Prefer prod (has L/R Hand). Open standing idle is hand-less — avoid as primary.
    idle: [
      'prod:magic/standing-idle',
      'magic/standing idle' // last resort only
    ],
    cast: [
      'prod:magic/standing-1h-cast-spell-01',
      'magic/standing 1h cast spell 01',
      'magic/standing 2h cast spell 01'
    ],
    walk: ['prod:magic/standing-walk-forward', 'magic/Standing Walk Forward'],
    run: ['prod:magic/standing-run-forward', 'magic/Standing Run Forward'],
    /** Focus-mode lower body strafe (A/D while looking with mouse) */
    walkL: ['prod:magic/standing-walk-left', 'magic/standing-walk-left'],
    walkR: ['prod:magic/standing-walk-right', 'magic/standing-walk-right'],
    runL: ['prod:magic/standing-run-left', 'magic/standing-run-left'],
    runR: ['prod:magic/standing-run-right', 'magic/standing-run-right'],
    /** Jump one-shot (blend with locomotion) */
    jump: ['prod:magic/standing-jump', 'locomotion/jump']
  },
  sword_shield: {
    idle: ['sword_shield/sword and shield idle'],
    /**
     * Melee roles (see docs/MELEE_COMBO_SSOT.md):
     * - attack1–3 = grounded light combo (3 LMB clicks)
     * - attack / finisher = jump-dash finisher (CDN Bip001 “sword and shield attack”)
     * - finisherAir = drop-to-target when airborne
     * Mixamo sources baked same-origin; rematch → Bip001 at bind.
     */
    attack1: [
      'sword_shield/intoout',
      'sword_shield/one-hand-combo-hit1',
      'sword_shield/sword and shield slash'
    ],
    attack2: [
      'sword_shield/st1able-sword-inward-slash',
      'sword_shield/one-hand-combo-hit2',
      'sword_shield/sword and shield slash'
    ],
    attack3: [
      'sword_shield/11upward-thrust',
      'sword_shield/one-hand-combo-hit3',
      'sword_shield/sword and shield slash'
    ],
    /** Finisher (was misused as light attack): lunge / jump-dash */
    attack: ['sword_shield/sword and shield attack'],
    finisher: ['sword_shield/sword and shield attack'],
    finisherAir: ['sword_shield/dropto-target', 'sword_shield/sword and shield attack'],
    block: ['sword_shield/sword and shield block'],
    // Walk: open S&S walk 404s — prod magic walk is live SSOT fallback
    walk: [
      'prod:magic/standing-walk-forward',
      'sword_shield/sword and shield walk',
      'magic/standing walk forward'
    ],
    run: [
      'sword_shield/sword and shield run',
      'prod:magic/standing-run-forward',
      'magic/standing run forward'
    ],
    /** Melee focus strafe — no native S&S side walks; magic/longbow CDN */
    walkL: [
      'prod:magic/standing-walk-left',
      'magic/standing-walk-left',
      'longbow/standing-walk-left'
    ],
    walkR: [
      'prod:magic/standing-walk-right',
      'magic/standing-walk-right',
      'longbow/standing-walk-right'
    ],
    runL: [
      'prod:magic/standing-run-left',
      'magic/standing-run-left',
      'longbow/standing-run-left'
    ],
    runR: [
      'prod:magic/standing-run-right',
      'magic/standing-run-right',
      'longbow/standing-run-right'
    ],
    jump: ['prod:magic/standing-jump', 'locomotion/jump']
  },
  longbow: {
    idle: ['longbow/standing idle', 'longbow/standing idle 01', 'bow/standing idle', 'prod:magic/standing-idle'],
    attack: ['longbow/standing draw arrow', 'longbow/standing aim recoil', 'bow/draw arrow', 'sword_shield/sword and shield attack'],
    walk: ['longbow/standing walk forward', 'prod:magic/standing-walk-forward'],
    run: ['longbow/standing run forward', 'prod:magic/standing-run-forward'],
    walkL: [
      'prod:longbow/standing-walk-left',
      'longbow/standing-walk-left',
      'longbow/walk-left',
      'prod:magic/standing-walk-left'
    ],
    walkR: [
      'prod:longbow/standing-walk-right',
      'longbow/standing-walk-right',
      'longbow/walk-right',
      'prod:magic/standing-walk-right'
    ],
    runL: [
      'prod:longbow/standing-run-left',
      'longbow/standing-run-left',
      'prod:magic/standing-run-left'
    ],
    runR: [
      'prod:longbow/standing-run-right',
      'longbow/standing-run-right',
      'prod:magic/standing-run-right'
    ],
    jump: ['prod:magic/standing-jump', 'locomotion/jump'],
    // Directional dodges (Danger Room AA/DD/WW/X) — longbow pack primary
    dodgeL: ['longbow/standing dodge left', 'locomotion/dodge_l'],
    dodgeR: ['longbow/standing dodge right', 'locomotion/dodge_r'],
    dodgeF: ['longbow/standing dodge forward', 'locomotion/dodge_fwd'],
    dodgeB: ['longbow/standing dodge backward', 'locomotion/dodge_back'],
    block: ['sword_shield/sword and shield block'],
    parry: ['sword_shield/sword and shield block']
  },
  /**
   * T0 pistol / handgun pack (Bip001 baked on Open).
   *
   * Combat roles map Mixamo pistol gunplay + TPS Minecraft timing reference:
   *   minecraft_tps_model_*.glb — draw · fire · drawnidle · drawaim · fireaim
   *   gunplay.json ≈ spin / flourish fire (primary attack)
   *   drawing-gun.json ≈ holster → ready (draw)
   *   charged-pistol / pistol-whip ≈ power / melee skill
   *
   * Reference mesh (lab): public/models/reference/minecraft_tps_pistol.glb
   * Timing SSOT: config/pistolAnimSsot.js
   */
  pistol: {
    idle: ['pistol/idle', 'pistol/pistol idle', 'longbow/standing idle', 'prod:magic/standing-idle'],
    /** Primary fire — gunplay spin flourish; TPS fire is ~0.21s snap (timeScale in combat) */
    attack: [
      'pistol/gunplay',
      'pistol/charged-pistol',
      'pistol/pistol-whip',
      'longbow/standing aim recoil'
    ],
    /** Aim-ready / drawn idle feel */
    cast: ['pistol/drawing-gun', 'pistol/charged-pistol', 'pistol/gunplay'],
    /** Spin flourish (explicit role for skills / lab library) */
    gunplay: ['pistol/gunplay'],
    spin: ['pistol/gunplay'],
    draw: ['pistol/drawing-gun', 'pistol/gunplay'],
    skill1: ['pistol/drawing-gun', 'pistol/gunplay'],
    skill2: ['pistol/charged-pistol', 'pistol/gunplay'],
    skill3: ['pistol/pistol-whip', 'pistol/gunplay'],
    skill4: ['pistol/charged-pistol', 'pistol/pistol-whip'],
    skill5: ['pistol/pistol-whip', 'pistol/drawing-gun'],
    walk: ['pistol/walk-forward', 'pistol/pistol walk', 'prod:magic/standing-walk-forward'],
    run: ['pistol/run-forward', 'pistol/pistol run', 'prod:magic/standing-run-forward'],
    walkL: ['pistol/strafe-left', 'prod:magic/standing-walk-left', 'longbow/standing-walk-left'],
    walkR: ['pistol/strafe-right', 'prod:magic/standing-walk-right', 'longbow/standing-walk-right'],
    runL: ['pistol/strafe-left', 'prod:magic/standing-run-left'],
    runR: ['pistol/strafe-right', 'prod:magic/standing-run-right'],
    jump: ['pistol/pistol-jump', 'pistol/jump', 'prod:magic/standing-jump', 'locomotion/jump'],
    dodgeL: ['longbow/standing dodge left', 'locomotion/dodge_l'],
    dodgeR: ['longbow/standing dodge right', 'locomotion/dodge_r'],
    dodgeF: ['longbow/standing dodge forward', 'locomotion/dodge_fwd'],
    dodgeB: ['longbow/standing dodge backward', 'locomotion/dodge_back'],
    block: ['pistol/drawing-gun', 'sword_shield/sword and shield block'],
    parry: ['pistol/pistol-whip', 'sword_shield/sword and shield block']
  },
  /** Optional 8-way locomotion overlay (binds extra roles if CDN has clips) */
  locomotion_8way: {
    idle: ['prod:magic/standing-idle'],
    walk: ['locomotion/walk-forward', 'prod:magic/standing-walk-forward'],
    run: ['locomotion/run-forward', 'prod:magic/standing-run-forward'],
    walkL: ['prod:magic/standing-walk-left', 'longbow/standing-walk-left'],
    walkR: ['prod:magic/standing-walk-right', 'longbow/standing-walk-right'],
    runL: ['prod:magic/standing-run-left', 'longbow/standing-run-left'],
    runR: ['prod:magic/standing-run-right', 'longbow/standing-run-right'],
    jump: ['locomotion/jump', 'prod:magic/standing-jump']
  },
  /**
   * Shared combat mobility — always bound on hero load.
   * Rolls: Ghost Rider preferred (open …/ghost_rider/roll_*), locomotion fallbacks.
   * Dodges: longbow standing L/R/F/B (AA/DD/WW/X). Slide: prod running-slide.
   */
  /**
   * Hit reactions (Mixamo rematch) — knockback / launched.
   * Bound on hero load with combat_mobility.
   */
  reactions: {
    hitReact: ['reactions/knocked-up'],
    knockedUp: ['reactions/knocked-up']
  },
  combat_mobility: {
    // Ghost Rider rolls (user-preferred) → locomotion pack → longbow dodge as last resort
    rollL: [
      'ghost_rider/roll_left',
      'locomotion/roll_left',
      'longbow/standing dodge left',
      'locomotion/dodge_l'
    ],
    rollR: [
      'ghost_rider/roll_right',
      'locomotion/roll_right',
      'longbow/standing dodge right',
      'locomotion/dodge_r'
    ],
    rollF: [
      'ghost_rider/roll_forward',
      'locomotion/roll_forward',
      'longbow/standing dodge forward',
      'locomotion/dodge_fwd'
    ],
    rollB: [
      'ghost_rider/roll_back',
      'locomotion/roll_back',
      'longbow/standing dodge backward',
      'locomotion/dodge_back'
    ],
    // Sprint+Ctrl slide (prod bake on assets CDN)
    slide: ['prod:extra/running-slide', 'prod:extra/quick-roll-to-run'],
    dodgeL: ['longbow/standing dodge left', 'locomotion/dodge_l', 'ghost_rider/dodgeL'],
    dodgeR: ['longbow/standing dodge right', 'locomotion/dodge_r', 'ghost_rider/dodgeR'],
    dodgeF: ['longbow/standing dodge forward', 'locomotion/dodge_fwd', 'ghost_rider/dodgeF'],
    dodgeB: ['longbow/standing dodge backward', 'locomotion/dodge_back', 'ghost_rider/dodgeB'],
    parry: ['sword_shield/sword and shield block'],
    block: ['sword_shield/sword and shield block'],
    /**
     * Real flip clips (Open FBX rematch — see fbxClip.js).
     * Baked JSON preferred if present; FBX is author SSOT on open.grudge-studio.com.
     */
    frontflip: ['extra/front-flip', 'extra/running-forward-flip', 'extra/front-twist-flip'],
    backflip: ['striker/backflip', 'striker/back_flip_to_uppercut']
  }
};

/** UI labels for pack picker (weapon locomotion + skills). */
export const ANIM_PACK_META = {
  magic: { label: 'Magic / staff', skills: 'cast', locomotion: 'walk·run·jump' },
  sword_shield: {
    label: 'Sword & shield',
    skills: 'combo×3 · finisher · block',
    locomotion: 'walk·run·jump'
  },
  longbow: { label: 'Longbow', skills: 'attack · dodge L/R/F/B', locomotion: 'walk·run·jump' },
  pistol: {
    label: 'Pistol / handgun',
    skills: 'gunplay(spin) · draw · charged · whip',
    locomotion: 'walk·run·strafe·jump'
  },
  locomotion_8way: { label: 'Locomotion 8-way', skills: '—', locomotion: 'walk·run·jump' },
  combat_mobility: {
    label: 'Shared rolls / dodges / slide / parry',
    skills: 'roll·dodge·slide·parry',
    locomotion: '—'
  }
};

/** Dodge role by direction for AA/DD/WW/X. */
export const DODGE_ROLE = Object.freeze({
  left: 'dodgeL',
  right: 'dodgeR',
  forward: 'dodgeF',
  back: 'dodgeB'
});

/** Roll role by direction for Ctrl+A/D (and optional F/B). Ghost Rider pack primary. */
export const ROLL_ROLE = Object.freeze({
  left: 'rollL',
  right: 'rollR',
  forward: 'rollF',
  back: 'rollB'
});

/** Fallback loadouts if CDN presets fail (mage-first for casting).
 *  Letters match Toon RTS human kit: Body A–E, Arms A–D, Legs A–C, head A–I, staff A–C.
 */
export const FALLBACK_PRESETS = [
  {
    id: 'mage',
    label: 'Mage',
    description: 'Robes and a staff.',
    pack: 'magic',
    // Conservative A/B set so every race kit has matching mesh_ids
    loadout: { body: 'A', arms: 'A', legs: 'A', head: 'A', staff: 'A' }
  },
  {
    id: 'knight',
    label: 'Knight',
    description: 'Heavy plate, sword & shield.',
    pack: 'sword_shield',
    loadout: {
      body: 'C',
      arms: 'C',
      legs: 'C',
      head: 'D',
      shoulders: 'B',
      sword: 'A',
      shield: 'A'
    }
  },
  {
    id: 'berserker',
    label: 'Berserker',
    description: 'Light armor, axe.',
    pack: 'sword_shield',
    loadout: { body: 'B', arms: 'B', legs: 'B', head: 'B', axe: 'A' }
  },
  {
    id: 'archer',
    label: 'Archer',
    description: 'Cloth + leather, bow (quiver only via carry).',
    pack: 'longbow',
    loadout: {
      body: 'A',
      arms: 'A',
      legs: 'A',
      head: 'A',
      bow: '_default'
    }
  },
  {
    id: 'tank',
    label: 'Tank',
    description: 'Maximum plate, hammer & tower shield.',
    pack: 'sword_shield',
    loadout: {
      body: 'E',
      arms: 'D',
      legs: 'C',
      head: 'F',
      shoulders: 'B',
      hammer: 'A',
      shield: 'B'
    }
  }
];

/**
 * Resolve one relative path (or `prod:pack/file`) to absolute URL candidates.
 * @param {string} rel
 * @returns {string[]}
 */
export function bakedClipUrl(rel) {
  return bakedClipUrls(rel)[0];
}

/**
 * Absolute URL candidates for a baked clip.
 * - `prod:magic/standing-idle` → assets…/prod/anims/magic/standing-idle.json
 * - `magic/standing idle` → open…/anims/baked/magic/standing%20idle.json (+ assets mirror)
 * @param {string} rel
 * @returns {string[]}
 */
export function bakedClipUrls(rel) {
  const raw = String(rel || '').replace(/^\/+/, '').replace(/\.json$/i, '');
  if (!raw) return [];

  if (raw.startsWith('prod:')) {
    const path = raw.slice(5).replace(/^\/+/, '');
    const enc = path
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    return [
      // same-origin first (fleet rule)
      `./anims/baked/${enc}.json`,
      `${ASSETS_CDN}/prod/anims/${enc}.json`,
      // dash→space open fallback for same logical clip
      `${OPEN_HOST}/anims/baked/${enc.replace(/-/g, '%20')}.json`
    ];
  }

  const enc = raw
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  // Same-origin public/anims/baked first (Mixamo combo bakes + offline), then Open CDN.
  return [
    `./anims/baked/${enc}.json`,
    `${OPEN_HOST}/anims/baked/${enc}.json`,
    `${ASSETS_CDN}/anims/baked/${enc}.json`
  ];
}

/**
 * Flatten pack role value (string | string[]) into ordered absolute URLs.
 * @param {string|string[]} roleEntry
 * @returns {string[]}
 */
export function bakedClipUrlsForRole(roleEntry) {
  const list = Array.isArray(roleEntry) ? roleEntry : [roleEntry];
  const out = [];
  const seen = new Set();
  for (const rel of list) {
    for (const url of bakedClipUrls(rel)) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** SI human target height (metres). */
export const TARGET_HEIGHT_M = HUMAN_HEIGHT_M;

/** Armor / weapon slots used by EquipmentManager + inventory panel. */
/** Inventory UI slots — utility listed last (carry-only, hidden by default). */
export const EQUIP_SLOTS = [
  'body',
  'arms',
  'legs',
  'head',
  'shoulders',
  'sword',
  'axe',
  'hammer',
  'spear',
  'staff',
  'bow',
  'shield'
  // bag / wood / quiver intentionally omitted from default equip UI
];

export const WEAPON_SLOTS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow'];
