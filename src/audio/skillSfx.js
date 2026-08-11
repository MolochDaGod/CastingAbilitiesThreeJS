/**
 * Weapon skill + ability SFX for Casting Lab.
 * Local SSOT: public/audio/sfx/*.wav (user-provided).
 * Unlock on first gesture (browser autoplay policy).
 *
 * Roles:
 *  cast_ramp   — channel / cast start (ramp-up)
 *  cast_chant  — longer cast / blood·arcane·holy flavor
 *  parry       — C parry **attempt** melee/metal (not only success)
 *  parry_magic — magical ward / staff / lightning parry attempt
 *  burn        — soft **loop** while player has burn status (not fire impact)
 *  heal        — heal / regenerate (two variants, random)
 */

const BASE = '/audio/sfx';

/** @type {Record<string, string | string[]>} */
export const SKILL_SFX_URLS = {
  cast_ramp: `${BASE}/cast-ramp.wav`,
  cast_chant: `${BASE}/cast-chant.wav`,
  parry: `${BASE}/parry.wav`,
  parry_magic: `${BASE}/parry-magic.wav`,
  burn: `${BASE}/burn.wav`,
  heal: [`${BASE}/heal-a.wav`, `${BASE}/heal-b.wav`],
};

/** Optional CDN mirror later — same filenames under assets.grudge-studio.com/audio/casting/sfx/ */
export const SKILL_SFX_CDN_BASE = 'https://assets.grudge-studio.com/audio/casting/sfx';

/** @type {Map<string, HTMLAudioElement[]>} */
const pools = new Map();
let unlocked = false;
let muted = false;
let masterVol = 0.72;
let useCdnFallback = true;
/** Soft burn loop while player has burn status */
let burnLoop = null;
let burnLoopActive = false;

function resolveUrl(role, variantIndex = 0) {
  const entry = SKILL_SFX_URLS[role];
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const i = Math.max(0, variantIndex) % entry.length;
    return entry[i];
  }
  return entry;
}

function poolKey(url) {
  return url;
}

/**
 * @param {string} url
 * @returns {HTMLAudioElement}
 */
function acquire(url) {
  let list = pools.get(poolKey(url));
  if (!list) {
    list = [];
    pools.set(poolKey(url), list);
  }
  for (const a of list) {
    if (a.paused || a.ended) return a;
  }
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  audio.crossOrigin = 'anonymous';
  list.push(audio);
  // Cap concurrent clones per url
  if (list.length > 6) list.shift();
  return audio;
}

/**
 * Unlock / warm all role URLs (call after user gesture or on first play).
 * @returns {Promise<void>}
 */
export async function unlockSkillSfx() {
  if (unlocked) return;
  unlocked = true;
  const urls = new Set();
  for (const v of Object.values(SKILL_SFX_URLS)) {
    if (Array.isArray(v)) v.forEach((u) => urls.add(u));
    else urls.add(v);
  }
  await Promise.all(
    [...urls].map(
      (url) =>
        new Promise((resolve) => {
          try {
            const a = acquire(url);
            a.volume = 0.001;
            const p = a.play();
            if (p && typeof p.then === 'function') {
              p.then(() => {
                a.pause();
                a.currentTime = 0;
                a.volume = masterVol;
                resolve();
              }).catch(() => resolve());
            } else resolve();
          } catch {
            resolve();
          }
        })
    )
  );
}

export function setSkillSfxMuted(m) {
  muted = !!m;
  if (muted) setPlayerBurningSfx(false);
}

export function setSkillSfxVolume(v) {
  masterVol = Math.max(0, Math.min(1, Number(v) || 0));
}

/**
 * Play a role one-shot.
 * @param {string} role
 * @param {{ volume?: number, rate?: number, variant?: number }} [opts]
 * @returns {HTMLAudioElement|null}
 */
export function playSkillSfx(role, opts = {}) {
  if (muted) return null;
  const vol = (opts.volume != null ? opts.volume : 1) * masterVol;
  if (vol <= 0.001) return null;

  let url = resolveUrl(role, opts.variant ?? (role === 'heal' ? Math.floor(Math.random() * 2) : 0));
  if (!url) return null;

  try {
    if (!unlocked) {
      // Fire-and-forget unlock; still try play
      void unlockSkillSfx();
    }
    const audio = acquire(url);
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    audio.volume = Math.min(1, Math.max(0, vol));
    if (opts.rate != null && Number.isFinite(opts.rate)) {
      audio.playbackRate = Math.max(0.5, Math.min(2, opts.rate));
    } else {
      audio.playbackRate = 1;
    }
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Local 404 → optional CDN path by filename
        if (!useCdnFallback) return;
        const name = url.split('/').pop();
        if (!name) return;
        const cdn = `${SKILL_SFX_CDN_BASE}/${name}`;
        if (cdn === url) return;
        try {
          const a2 = acquire(cdn);
          a2.volume = audio.volume;
          a2.playbackRate = audio.playbackRate;
          void a2.play().catch(() => {});
        } catch {
          /* ignore */
        }
      });
    }
    return audio;
  } catch (e) {
    console.warn('[skillSfx] play failed', role, e);
    return null;
  }
}

/**
 * Map weapon skill / element → SFX roles for cast begin.
 * @param {{ element?: string, style?: string, id?: string, label?: string, isWard?: boolean }|null|undefined} skill
 * @param {{ duration?: number }} [ctx]
 */
export function playForWeaponSkillCast(skill, ctx = {}) {
  const el = String(skill?.element || skill?.abilityElement || '').toLowerCase();
  const id = String(skill?.id || skill?.label || '').toLowerCase();
  const dur = Number(ctx.duration) || 0;

  if (skill?.isWard || /parry|block|guard|ward/.test(id)) {
    playSkillSfx('parry', { volume: 0.85 });
    return 'parry';
  }
  if (/heal|regen|restore|holy.?light|mend/.test(id + el) || el === 'holy') {
    playSkillSfx('heal', { volume: 0.8 });
    return 'heal';
  }
  if (el === 'fire' || /burn|flame|inferno|fire/.test(id)) {
    playSkillSfx('cast_ramp', { volume: 0.7, rate: 1.05 });
    return 'cast_ramp';
  }
  // Longer channels or blood/dark/arcane get chant layer
  if (dur >= 0.55 || el === 'arcane' || /blood|shaman|shadow|death|dark|void/.test(id)) {
    playSkillSfx('cast_chant', { volume: 0.75 });
    return 'cast_chant';
  }
  playSkillSfx('cast_ramp', { volume: 0.78 });
  return 'cast_ramp';
}

/**
 * Path / ability cast (element spline).
 * @param {string} element
 */
export function playForElementCast(element) {
  const el = String(element || '').toLowerCase();
  if (el === 'fire') {
    playSkillSfx('cast_ramp', { volume: 0.72 });
    return;
  }
  if (el === 'holy' || el === 'nature') {
    playSkillSfx('heal', { volume: 0.55, rate: 1.1 });
    return;
  }
  if (el === 'arcane' || el === 'storm') {
    playSkillSfx('cast_chant', { volume: 0.65 });
    return;
  }
  playSkillSfx('cast_ramp', { volume: 0.7 });
}

/**
 * Impact / residual by element or skill.
 * Note: fire impact does **not** use burn.wav — that file is the soft burn loop on the player.
 * @param {string} [element]
 * @param {{ skill?: object, kind?: string }} [opts]
 */
export function playForImpact(element, opts = {}) {
  const el = String(element || opts.skill?.element || '').toLowerCase();
  const kind = String(opts.kind || '').toLowerCase();
  if (el === 'holy' || kind === 'heal') {
    playSkillSfx('heal', { volume: 0.7 });
    return;
  }
  // Fire / bomb / residual: cast-ramp crackle only (burn loop is status-driven)
  if (el === 'fire' || kind === 'fire' || kind === 'bomb' || kind === 'residual' || kind === 'melee') {
    playSkillSfx('cast_ramp', { volume: kind === 'fire' || kind === 'bomb' ? 0.45 : 0.32, rate: 1.25 });
  }
}

/**
 * Parry **attempt** (keydown / quick action) — always play when player tries.
 * @param {{ magic?: boolean }|boolean} [opts] magic=true → lightning/wizard parry-magic.wav
 */
export function playParrySfx(opts = {}) {
  const magic = opts === true || opts?.magic === true;
  if (magic) {
    return playSkillSfx('parry_magic', { volume: 0.88, rate: 1.0 });
  }
  return playSkillSfx('parry', { volume: 0.9 });
}

export function playHealSfx() {
  return playSkillSfx('heal', { volume: 0.85 });
}

/**
 * Soft burning noise while the player is on fire (status).
 * Loops quietly; stops when burn status ends.
 * @param {boolean} active
 * @param {{ volume?: number }} [opts]
 */
export function setPlayerBurningSfx(active, opts = {}) {
  const want = !!active && !muted;
  if (want === burnLoopActive && burnLoop) {
    if (want && opts.volume != null) {
      burnLoop.volume = Math.min(1, Math.max(0, opts.volume * masterVol));
    }
    return burnLoop;
  }
  burnLoopActive = want;

  if (!want) {
    if (burnLoop) {
      try {
        burnLoop.pause();
        burnLoop.currentTime = 0;
        burnLoop.loop = false;
      } catch {
        /* ignore */
      }
      burnLoop = null;
    }
    return null;
  }

  try {
    if (!unlocked) void unlockSkillSfx();
    const url = resolveUrl('burn');
    if (!url) return null;
    const audio = acquire(url);
    audio.loop = true;
    // Soft under-player crackle — not impact loudness
    audio.volume = Math.min(1, Math.max(0, (opts.volume != null ? opts.volume : 0.22) * masterVol));
    audio.playbackRate = 0.92;
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    burnLoop = audio;
    return audio;
  } catch (e) {
    console.warn('[skillSfx] burn loop', e);
    burnLoop = null;
    burnLoopActive = false;
    return null;
  }
}

/** @deprecated Prefer setPlayerBurningSfx — burn.wav is status loop, not impact */
export function playBurnSfx() {
  return setPlayerBurningSfx(true, { volume: 0.22 });
}

/** Wire document gesture unlock once. */
export function installSkillSfxGestureUnlock() {
  if (typeof document === 'undefined') return;
  const once = () => {
    void unlockSkillSfx();
    document.removeEventListener('pointerdown', once);
    document.removeEventListener('keydown', once);
  };
  document.addEventListener('pointerdown', once, { passive: true });
  document.addEventListener('keydown', once, { passive: true });
}

export const SkillSfx = {
  play: playSkillSfx,
  playForWeaponSkillCast,
  playForElementCast,
  playForImpact,
  playParry: playParrySfx,
  playHeal: playHealSfx,
  playBurn: playBurnSfx,
  setPlayerBurning: setPlayerBurningSfx,
  unlock: unlockSkillSfx,
  setMuted: setSkillSfxMuted,
  setVolume: setSkillSfxVolume,
  installGestureUnlock: installSkillSfxGestureUnlock,
  URLS: SKILL_SFX_URLS,
};

export default SkillSfx;
