/**
 * Player activity state machine (XState v5) — combat ↔ harvest, hand, loco.
 *
 * Owns pure state only. App listens for transitions and runs equip/stow side effects.
 * Does not invent a second mode store — extends playerActivity.js SSOT.
 *
 * @see playerActivity.js
 * @see docs/SESSION_STATE_SSOT.md
 */

import { createMachine, createActor, assign } from 'xstate';
import { HARVEST_TOOL_RADIAL } from './playerActivity.js';

/** @typedef {'combat'|'harvest'} ActivityMode */
/** @typedef {'weapon'|'tool'|'empty'} HandKind */
/** @typedef {'idle'|'walk'|'run'|'sprint'|'jump'|'harvest_swing'|'cast'|'attack'} LocoKind */

export const DEFAULT_TOOL_ID = 'pick';

/**
 * @param {string} toolId
 */
export function resolveToolDef(toolId) {
  return HARVEST_TOOL_RADIAL.find((t) => t.id === toolId) || HARVEST_TOOL_RADIAL[0];
}

/**
 * Pure machine: activity × hand × tool memory × loco tag.
 * Side effects (mesh equip) live in App actor subscription.
 */
export const playerActivityMachine = createMachine({
  id: 'playerActivity',
  initial: 'combat',
  types: {
    /* runtime JS — types as comments for consumers */
  },
  context: {
    /** Last combat weapon id (stashed when entering harvest) */
    combatWeaponId: null,
    /** Equipped harvest tool id */
    toolId: DEFAULT_TOOL_ID,
    /** Last non-back tool (R tap re-draws this; default pick) */
    lastToolId: DEFAULT_TOOL_ID,
    /** What the hands present */
    hand: /** @type {HandKind} */ ('weapon'),
    /** Coarse locomotion / action tag for anim gating */
    loco: /** @type {LocoKind} */ ('idle'),
    /** Seconds since last mode switch (UI / cooldowns) */
    modeAge: 0
  },
  states: {
    combat: {
      entry: assign({
        hand: 'weapon',
        modeAge: 0
      }),
      on: {
        ENTER_HARVEST: {
          target: 'harvest',
          actions: assign(({ context, event }) => {
            const toolId = event.toolId || context.lastToolId || DEFAULT_TOOL_ID;
            const def = resolveToolDef(toolId);
            const hand =
              toolId === 'hand' || !def?.weaponId ? (toolId === 'hand' ? 'empty' : 'tool') : 'tool';
            return {
              combatWeaponId:
                event.combatWeaponId !== undefined
                  ? event.combatWeaponId
                  : context.combatWeaponId,
              toolId,
              lastToolId: toolId === 'back_slot' ? context.lastToolId : toolId,
              hand: toolId === 'hand' ? 'empty' : hand,
              modeAge: 0
            };
          })
        },
        SET_COMBAT_WEAPON: {
          actions: assign({
            combatWeaponId: ({ event }) => event.weaponId ?? null
          })
        },
        SET_LOCO: {
          actions: assign({
            loco: ({ event }) => event.loco || 'idle'
          })
        },
        TICK: {
          actions: assign({
            modeAge: ({ context, event }) => context.modeAge + (event.dt || 0)
          })
        }
      }
    },
    harvest: {
      entry: assign({
        modeAge: 0
      }),
      on: {
        ENTER_COMBAT: {
          target: 'combat',
          actions: assign(({ context, event }) => ({
            combatWeaponId:
              event.combatWeaponId !== undefined
                ? event.combatWeaponId
                : context.combatWeaponId,
            hand: 'weapon',
            modeAge: 0
          }))
        },
        /** Hold-R radial pick */
        SELECT_TOOL: {
          actions: assign(({ context, event }) => {
            const toolId = event.toolId || context.toolId || DEFAULT_TOOL_ID;
            const hand =
              toolId === 'hand' ? 'empty' : toolId === 'back_slot' ? context.hand : 'tool';
            return {
              toolId,
              lastToolId: toolId === 'back_slot' ? context.lastToolId : toolId,
              hand
            };
          })
        },
        /**
         * Tap R (or re-draw): pull last used tool, default pick.
         * Auto-stows nothing else — already in harvest.
         */
        DRAW_LAST_TOOL: {
          actions: assign(({ context }) => {
            const toolId = context.lastToolId || DEFAULT_TOOL_ID;
            return {
              toolId,
              hand: toolId === 'hand' ? 'empty' : 'tool'
            };
          })
        },
        STOW_TOOL: {
          actions: assign({
            hand: 'empty'
          })
        },
        SET_LOCO: {
          actions: assign({
            loco: ({ event }) => event.loco || 'idle'
          })
        },
        TICK: {
          actions: assign({
            modeAge: ({ context, event }) => context.modeAge + (event.dt || 0)
          })
        }
      }
    }
  }
});

/**
 * Create + start actor. Returns control API for App.
 * @param {{
 *   onTransition?: (snap: import('xstate').SnapshotFrom<typeof playerActivityMachine>) => void
 * }} [opts]
 */
export function createPlayerActivityActor(opts = {}) {
  const actor = createActor(playerActivityMachine);
  if (typeof opts.onTransition === 'function') {
    actor.subscribe((snap) => {
      opts.onTransition(snap);
    });
  }
  actor.start();
  return actor;
}

/**
 * @param {import('xstate').SnapshotFrom<typeof playerActivityMachine>} snap
 * @returns {ActivityMode}
 */
export function activityFromSnap(snap) {
  return snap?.value === 'harvest' ? 'harvest' : 'combat';
}

/**
 * @param {import('xstate').SnapshotFrom<typeof playerActivityMachine>} snap
 */
export function toolIdFromSnap(snap) {
  return snap?.context?.toolId || DEFAULT_TOOL_ID;
}
