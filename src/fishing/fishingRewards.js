/**
 * Catch → recipe / form unlocks (lab localStorage; production later Railway bag).
 *
 * Aetherwing Turtle:
 *  - Worge race → unlock **form recipe** (worge aetherwing form)
 *  - Other races → unlock **mount recipe** (aetherwing turtle mount)
 *
 * Storage: grudge.casting.fishing.rewards.v1
 */

const STORAGE_KEY = 'grudge.casting.fishing.rewards.v1';

/**
 * @typedef {object} FishingRewardsState
 * @property {string[]} recipes  unlocked recipe ids
 * @property {string[]} forms
 * @property {string[]} mounts
 * @property {string[]} caught  species ids ever caught
 */

export function defaultRewardsState() {
  return { recipes: [], forms: [], mounts: [], caught: [] };
}

export function loadRewardsState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRewardsState();
    const j = JSON.parse(raw);
    return { ...defaultRewardsState(), ...j };
  } catch {
    return defaultRewardsState();
  }
}

export function saveRewardsState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private */
  }
  return state;
}

/**
 * Species catch reward table.
 * @type {Record<string, { recipes?: string[], formIfWorge?: string, mountIfNotWorge?: string, blurb: string }>}
 */
export const CATCH_REWARDS = Object.freeze({
  aetherwing_turtle: {
    blurb: 'Super rare · Worge form OR turtle mount recipe',
    formIfWorge: 'form_aetherwing_worge',
    mountIfNotWorge: 'mount_aetherwing_turtle',
    recipes: ['recp_aetherwing_saddle', 'recp_aetherwing_essence']
  },
  ocean_creature: {
    blurb: 'Passive titan · leviathan prey · rare materials',
    recipes: ['recp_ocean_creature_hide', 'recp_leviathan_scar']
  },
  glow_whale: {
    blurb: 'Glow whale · hard catch · light essence',
    recipes: ['recp_glow_whale_oil', 'recp_abyss_lantern']
  },
  pulbo_monstruo: {
    blurb: 'Deep rare · ink & tentacle craft',
    recipes: ['recp_pulbo_ink', 'recp_deep_tentacle']
  }
});

/**
 * @param {string} speciesId
 * @param {{ raceId?: string|null }} ctx
 * @returns {{ unlocked: string[], messages: string[], state: FishingRewardsState }}
 */
export function applyCatchRewards(speciesId, ctx = {}) {
  const state = loadRewardsState();
  const messages = [];
  const unlocked = [];
  if (!state.caught.includes(speciesId)) state.caught.push(speciesId);

  const def = CATCH_REWARDS[speciesId];
  if (!def) {
    saveRewardsState(state);
    return { unlocked, messages, state };
  }

  const race = String(ctx.raceId || '').toLowerCase();
  const isWorge = race.includes('worge');

  if (def.formIfWorge || def.mountIfNotWorge) {
    if (isWorge && def.formIfWorge) {
      if (!state.forms.includes(def.formIfWorge)) {
        state.forms.push(def.formIfWorge);
        unlocked.push(def.formIfWorge);
        messages.push(`Worge form recipe · ${def.formIfWorge}`);
      }
    } else if (def.mountIfNotWorge) {
      if (!state.mounts.includes(def.mountIfNotWorge)) {
        state.mounts.push(def.mountIfNotWorge);
        unlocked.push(def.mountIfNotWorge);
        messages.push(`Mount recipe · ${def.mountIfNotWorge}`);
      }
    }
  }

  // Always grant shared recipes
  for (const r of def.recipes || []) {
    if (!state.recipes.includes(r)) {
      state.recipes.push(r);
      unlocked.push(r);
      messages.push(`Recipe · ${r}`);
    }
  }

  saveRewardsState(state);
  return { unlocked, messages, state };
}

export function hasRecipe(id) {
  return loadRewardsState().recipes.includes(id);
}

export function hasMount(id) {
  return loadRewardsState().mounts.includes(id);
}

export function hasForm(id) {
  return loadRewardsState().forms.includes(id);
}
