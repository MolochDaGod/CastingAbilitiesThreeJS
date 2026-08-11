import { FireAbility } from './FireAbility.js';
import { WaterAbility } from './WaterAbility.js';
import { EarthAbility } from './EarthAbility.js';
import { WindAbility } from './WindAbility.js';
import { ELEMENTS, abilityKeyForElement } from '../config/settings.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { playForElementCast } from '../audio/skillSfx.js';

/**
 * Ability pool keys (class implementations). Product ELEMENTS map via abilityKeyForElement:
 * fire→fire, ice→water, nature→earth, storm|holy|arcane→wind.
 */
const ABILITY_TYPES = {
  fire: FireAbility,
  water: WaterAbility,
  earth: EarthAbility,
  wind: WindAbility
};

const MAX_CONCURRENT = 8;

/**
 * Spawns, updates and recycles abilities.
 *
 * Instances are pooled per ability key: casting fire fifty times constructs at most
 * a handful of FireAbility objects, and every one of them keeps its meshes and
 * materials for the lifetime of the app. Nothing is built during a cast.
 */
export class AbilityManager {
  /**
   * @param {object} context shared systems handed to every ability:
   *   { scene, camera, environment, particles, lights, decals, bursts, shake, flash }
   */
  constructor(context) {
    this.ctx = context;
    this.active = [];
    /** @type {string} product element id (ELEMENTS) */
    this.selected = ELEMENTS[0];

    this.pools = new Map();
    for (const [key, Type] of Object.entries(ABILITY_TYPES)) {
      this.pools.set(
        key,
        new ObjectPool(() => {
          const ability = new Type(this.ctx);
          this.ctx.scene.add(ability.group);
          ability.group.visible = false;
          return ability;
        })
      );
    }
  }

  /** @param {string} element product element (fire|storm|ice|nature|holy|arcane) or legacy */
  select(element) {
    if (!element) return;
    const key = abilityKeyForElement(element);
    if (!ABILITY_TYPES[key]) return;
    this.selected = ELEMENTS.includes(element) ? element : element;
  }

  /**
   * Cast the currently selected element along `curve`.
   * @param {import('three').Curve} curve
   * @param {string} [element] product or legacy element id
   * @returns {import('./Ability.js').Ability|null}
   */
  cast(curve, element = this.selected) {
    const key = abilityKeyForElement(element);
    if (!ABILITY_TYPES[key]) return null;

    // Retire the oldest cast rather than letting the scene grow without bound.
    if (this.active.length >= MAX_CONCURRENT) {
      const oldest = this.active.shift();
      oldest.destroy();
      this.pools.get(oldest.element).release(oldest);
    }

    const ability = this.pools.get(key).acquire();
    ability.spawn(curve);
    this.active.push(ability);
    try {
      playForElementCast(element || this.selected || key);
    } catch (_) {}
    return ability;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ability = this.active[i];
      ability.update(dt);
      if (ability.isFinished) {
        this.active.splice(i, 1);
        ability.destroy();
        this.pools.get(ability.element).release(ability);
      }
    }
  }

  /** Cancel everything currently in flight. */
  clear() {
    for (const ability of this.active) {
      ability.destroy();
      this.pools.get(ability.element).release(ability);
    }
    this.active.length = 0;
  }

  /** The most recently cast, still-travelling ability — used to frame the camera. */
  get focus() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].isActive) return this.active[i];
    }
    return null;
  }

  dispose() {
    this.clear();
    for (const pool of this.pools.values()) pool.dispose((ability) => ability.dispose());
    this.pools.clear();
  }
}
