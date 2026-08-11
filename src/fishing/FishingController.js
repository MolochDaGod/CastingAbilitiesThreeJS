/**
 * 3D fishing profession controller — main-hand pole · lure cast · SCUM snag · Palworld bar.
 *
 * Extends harvest profession path (not a second combat engine):
 *  - Equip fishing pole (TOOL / t0-fishing-pole)
 *  - RMB aim toggle (arrow / aim marker on water)
 *  - LMB cast lure
 *  - Wait → bite → S/RMB snag → fight bar → catch loot
 *
 * @see docs/FISHING_PROFESSION_SSOT.md
 */

import { Vector3, Group, Mesh, MeshStandardMaterial, SphereGeometry, Box3 } from 'three';
import {
  poleById,
  lureById,
  rollFishSpecies,
  computeReelZoneWidth,
  computeLineMax,
  computeCastRange,
  FISHING_POLES
} from './fishingCatalog.js';
import { createFightState, stepFight, beginBite } from './fishingFight.js';
import { FishingUi } from '../ui/fishingUi.js';
import { WORLD } from '../config/worldScale.js';

const _v = new Vector3();

/**
 * @typedef {'idle'|'aim'|'cast'|'waiting'|'bite'|'fight'|'won'|'lost'} FishingPhase
 */

export class FishingController {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   character: object,
   *   camera: import('three').Camera,
   *   mouseAim: object,
   *   combatFocus?: object,
   *   assets?: object,
   *   terrain?: { sample?: (x:number,z:number)=>number },
   *   waterY?: number,
   *   onToast?: (s: string) => void,
   *   onCatch?: (loot: object) => void,
   *   getEquippedWeaponId?: () => string|null
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.character = opts.character;
    this.camera = opts.camera;
    this.mouseAim = opts.mouseAim;
    this.combatFocus = opts.combatFocus || null;
    this.assets = opts.assets || null;
    this.terrain = opts.terrain || null;
    this.waterY = opts.waterY ?? WORLD.waterY ?? -0.04;
    this.onToast = opts.onToast || (() => {});
    this.onCatch = opts.onCatch || (() => {});
    this.getEquippedWeaponId = opts.getEquippedWeaponId || (() => null);

    this.ui = new FishingUi();
    this.phase = /** @type {FishingPhase} */ ('idle');
    this.aiming = false;
    this.poleId = 't0-fishing-pole';
    this.lureId = 'lure_basic';
    this.fishingSkill = 1;
    this.fight = null;
    this.pendingFish = null;
    this.biteTimer = 0;
    this.castPos = new Vector3();
    this._lureMesh = null;
    this._fishMesh = null;
    this._line = null;
    this.group = new Group();
    this.group.name = 'FishingRuntime';
    this.scene.add(this.group);

    this._input = {
      reelIn: false,
      slack: false,
      moveRight: 0,
      moveLeft: 0,
      snag: false,
      lmbHeld: false,
      rmbHeld: false
    };
    this._lureBobT = 0;
  }

  /** True when pole is main-hand fishing tool */
  isPoleEquipped() {
    const id = String(this.getEquippedWeaponId() || '').toLowerCase();
    if (id.includes('fish') || id.includes('pole') || id === 't0-fishing-pole') return true;
    // also allow TOOL on water with fishing intent
    return FISHING_POLES.some((p) => p.id === id);
  }

  get active() {
    return this.phase !== 'idle' || this.aiming;
  }

  /** Profession mode: player chose to fish (or pole out near water) */
  beginProfession() {
    // Lab: Shift+F starts even without catalog equip — force pole id
    const eq = this.getEquippedWeaponId?.();
    if (eq && String(eq).toLowerCase().includes('fish')) this.poleId = eq;
    else if (!this.isPoleEquipped()) {
      this.poleId = 't0-fishing-pole';
      this.onToast('Fishing lab pole · equip t0-fishing-pole when catalog ready');
    }
    this.phase = 'aim';
    this.aiming = true;
    // Reuse focus-style aim (arrow / mouse aim)
    try {
      this.combatFocus.focusEnabled = true;
      this.combatFocus.emit?.('focus', true);
    } catch {
      /* optional */
    }
    this.ui.setActive(true);
    this.ui.render({ phase: 'aim' });
    this.onToast('Fishing · aim · LMB cast lure · S snag · wheel reel');
    void this._ensurePoleMesh();
    return true;
  }

  async _ensurePoleMesh() {
    if (this._poleAttach || !this.assets?.loadGLTF) return;
    const pole = poleById(this.poleId);
    try {
      const gltf = await this.assets.loadGLTF(pole.meshUrl);
      const root = (gltf.scene || gltf.scenes?.[0])?.clone?.(true);
      if (!root) return;
      root.name = 'FishingPoleAttach';
      const box = new Box3().setFromObject(root);
      const size = box.getSize(new Vector3());
      const max = Math.max(size.x, size.y, size.z, 1e-3);
      root.scale.setScalar(1.4 / max);
      // Parent to R_hand if available
      const hand =
        this.character?.equipment?.findBones?.()?.rHand ||
        this.character?.bones?.rHand;
      if (hand) {
        hand.add(root);
        root.position.set(0.02, 0.05, 0.08);
        root.rotation.set(-0.4, 0.2, 0.1);
      } else {
        this.character?.root?.add?.(root);
        root.position.set(0.25, 1.1, 0.15);
      }
      this._poleAttach = root;
    } catch (e) {
      console.warn('[Fishing] pole mesh', e);
    }
  }

  endProfession() {
    this.phase = 'idle';
    this.aiming = false;
    this.fight = null;
    this.pendingFish = null;
    this._clearMeshes();
    this.ui.setActive(false);
    this.ui.render({ phase: 'idle' });
  }

  toggleAim() {
    if (!this.isPoleEquipped()) {
      this.onToast('Equip fishing pole first');
      return;
    }
    if (this.phase === 'fight' || this.phase === 'bite' || this.phase === 'waiting') return;
    if (this.phase === 'aim' || this.aiming) {
      this.aiming = false;
      this.phase = 'idle';
      this.ui.setActive(false);
      this.onToast('Fishing aim off');
    } else {
      this.beginProfession();
    }
  }

  /**
   * LMB: cast lure if aiming, else zone move when fighting.
   */
  onPrimaryDown() {
    if (this.phase === 'fight') {
      this._input.lmbHeld = true;
      return true;
    }
    if (this.phase === 'aim' || this.aiming) {
      this.castLure();
      return true;
    }
    return false;
  }

  onPrimaryUp() {
    this._input.lmbHeld = false;
  }

  /**
   * RMB: aim toggle when idle; snag when bite; zone left when fight.
   */
  onSecondaryDown() {
    if (this.phase === 'bite') {
      this._input.snag = true;
      return true;
    }
    if (this.phase === 'fight') {
      this._input.rmbHeld = true;
      return true;
    }
    if (this.phase === 'idle' || this.phase === 'aim') {
      this.toggleAim();
      return true;
    }
    return false;
  }

  onSecondaryUp() {
    this._input.rmbHeld = false;
  }

  /** S key snag */
  onSnagKey() {
    if (this.phase === 'bite') {
      this._input.snag = true;
      return true;
    }
    return false;
  }

  /**
   * Wheel: deltaY > 0 reel in (down), < 0 slack (up)
   */
  onWheel(deltaY) {
    if (this.phase !== 'fight') return false;
    if (deltaY > 0) {
      this._input.reelIn = true;
      this._input.slack = false;
    } else if (deltaY < 0) {
      this._input.slack = true;
      this._input.reelIn = false;
    }
    // pulse one frame of strong input
    this._wheelPulse = 0.08;
    return true;
  }

  castLure() {
    const pole = poleById(this.poleId);
    const abilities = pole.abilities || [];
    const range = computeCastRange(pole, abilities);
    const feet = this.character.getWorldPosition?.(_v) || this.character.position;
    const aim = this.mouseAim?.point || feet;
    const dx = aim.x - feet.x;
    const dz = aim.z - feet.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      this.onToast('Aim farther on the water');
      return;
    }
    if (dist > range) {
      this.onToast(`Out of cast range (${range.toFixed(0)} m)`);
      return;
    }
    // Prefer water / shore: below island radius edge or waterY
    const R = WORLD.islandRadius;
    const rAim = Math.hypot(aim.x, aim.z);
    if (rAim < R * 0.55) {
      this.onToast('Cast toward lake / sea (shore or open water)');
      // allow near lake scenery anyway with soft warn
    }

    const t = Math.min(1, range / Math.max(dist, 0.01));
    this.castPos.set(feet.x + dx * t, this.waterY + 0.05, feet.z + dz * t);
    const landY = this.terrain?.sample?.(this.castPos.x, this.castPos.z);
    if (Number.isFinite(landY) && landY > this.waterY + 0.35 && rAim < R * 0.85) {
      // still land — sink to water ring
      this.castPos.y = this.waterY + 0.05;
    }

    this.phase = 'cast';
    this.ui.setActive(true);
    this.ui.render({ phase: 'cast' });
    this._spawnLure(this.castPos);
    this.character.requestOneShot?.('cast') || this.character.playWeaponCombat?.('cast');

    // brief cast anim then waiting
    setTimeout(() => {
      if (this.phase !== 'cast') return;
      this.phase = 'waiting';
      const lure = lureById(this.lureId);
      const wait = (2.2 + Math.random() * 4.5) / (lure.biteMul || 1);
      this.biteTimer = wait;
      this.ui.render({ phase: 'waiting', hint: 'Waiting… keep still' });
      this.onToast('Lure in the water…');
    }, 450);
  }

  _spawnLure(pos) {
    this._clearLureOnly();
    const geo = new SphereGeometry(0.07, 10, 10);
    const mat = new MeshStandardMaterial({
      color: 0xff6a22,
      emissive: 0x441100,
      emissiveIntensity: 0.4,
      roughness: 0.45
    });
    this._lureMesh = new Mesh(geo, mat);
    this._lureMesh.position.copy(pos);
    this._lureMesh.name = 'FishingLure';
    this.group.add(this._lureMesh);
  }

  async _spawnFishVisual(species) {
    this._clearFishOnly();
    if (!this.assets?.loadGLTF || !species?.meshUrl) return;
    try {
      const gltf = await this.assets.loadGLTF(species.meshUrl);
      const root = (gltf.scene || gltf.scenes?.[0])?.clone?.(true);
      if (!root) return;
      // SI: fish packs vary — fit to ~0.35–0.9 m
      root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(root);
      const size = box.getSize(new Vector3());
      const max = Math.max(size.x, size.y, size.z, 1e-3);
      const target = 0.35 + (species.difficulty || 0.2) * 0.7;
      root.scale.setScalar(target / max);
      root.position.copy(this.castPos);
      root.position.y = this.waterY + 0.08;
      this._fishMesh = root;
      this.group.add(root);
    } catch (e) {
      console.warn('[Fishing] fish mesh', e);
    }
  }

  _clearLureOnly() {
    if (this._lureMesh) {
      this.group.remove(this._lureMesh);
      this._lureMesh.geometry?.dispose?.();
      this._lureMesh.material?.dispose?.();
      this._lureMesh = null;
    }
  }

  _clearFishOnly() {
    if (this._fishMesh) {
      this.group.remove(this._fishMesh);
      this._fishMesh = null;
    }
  }

  _clearMeshes() {
    this._clearLureOnly();
    this._clearFishOnly();
  }

  /**
   * @param {number} dt
   * @param {Set<string>} keys
   */
  update(dt, keys) {
    if (this.phase === 'idle' && !this.aiming) return;

    // Keyboard hold moves for fight
    if (this.phase === 'fight') {
      this._input.moveRight = this._input.lmbHeld || keys?.has?.('KeyD') ? 1 : 0;
      this._input.moveLeft = this._input.rmbHeld || keys?.has?.('KeyA') ? 1 : 0;
      if (keys?.has?.('KeyW')) this._input.reelIn = true;
      if (keys?.has?.('KeyS') && this.phase === 'fight') this._input.slack = true;
    }

    if (this.phase === 'waiting') {
      this.biteTimer -= dt;
      this._lureBobT += dt;
      if (this._lureMesh) {
        this._lureMesh.position.y = this.waterY + 0.04 + Math.sin(this._lureBobT * 3) * 0.03;
      }
      if (this.biteTimer <= 0) {
        const fish = rollFishSpecies({
          lureId: this.lureId,
          fishingSkill: this.fishingSkill
        });
        this.pendingFish = fish;
        const pole = poleById(this.poleId);
        let biteWin = 0.75 + (pole.abilities?.includes('quick_snag') ? 0.12 : 0);
        biteWin += Math.max(0, 0.2 - fish.difficulty * 0.15);
        this.fight = createFightState({
          zoneWidth: computeReelZoneWidth(pole, fish, pole.abilities),
          fishSpeed: fish.speed,
          fishStrength: fish.strength,
          lineMax: computeLineMax(pole, pole.abilities),
          control: pole.control
        });
        beginBite(this.fight, biteWin);
        this.phase = 'bite';
        this.ui.render({ phase: 'bite', fight: this.fight, hint: 'BITE! S or RMB to snag' });
        this.onToast(`Bite! ${fish.label}`);
        void this._spawnFishVisual(fish);
      } else {
        this.ui.render({ phase: 'waiting', fight: this.fight });
      }
    } else if (this.phase === 'bite' || this.phase === 'fight') {
      if (this.phase === 'bite' && this.fight) {
        stepFight(this.fight, dt, { snag: this._input.snag });
        this._input.snag = false;
        if (this.fight.phase === 'fight') {
          this.phase = 'fight';
          this.onToast('Hooked! Wheel down reel · up slack · LMB/RMB zone');
        } else if (this.fight.phase === 'lost') {
          this._lose(this.fight._loseReason);
        }
      } else if (this.phase === 'fight' && this.fight) {
        const wheelOn = (this._wheelPulse || 0) > 0;
        if (wheelOn) this._wheelPulse -= dt;
        stepFight(this.fight, dt, {
          reelIn: this._input.reelIn || (wheelOn && this._input.reelIn),
          slack: this._input.slack,
          moveRight: this._input.moveRight,
          moveLeft: this._input.moveLeft
        });
        // clear one-shot wheel unless still scrolling
        if (!wheelOn) {
          this._input.reelIn = keys?.has?.('KeyW') || false;
          this._input.slack = keys?.has?.('KeyS') || false;
        }
        if (this.fight.phase === 'won') this._win();
        else if (this.fight.phase === 'lost') this._lose(this.fight._loseReason);
      }
      this.ui.render({ phase: this.phase, fight: this.fight });
    } else if (this.phase === 'aim') {
      this.ui.setActive(true);
      this.ui.render({ phase: 'aim' });
    }

    // Animate hooked fish toward shore slightly during fight
    if (this._fishMesh && this.fight && this.phase === 'fight') {
      const feet = this.character.getWorldPosition?.(_v) || this.character.position;
      const t = this.fight.progress * 0.35;
      this._fishMesh.position.lerpVectors(this.castPos, feet, t);
      this._fishMesh.position.y = this.waterY + 0.1;
      this._fishMesh.rotation.y += dt * 2;
    }
  }

  _win() {
    const fish = this.pendingFish;
    this.phase = 'won';
    const w =
      fish.weightKg[0] + Math.random() * (fish.weightKg[1] - fish.weightKg[0]);
    const loot = {
      id: `raw_${fish.id}`,
      name: fish.label,
      speciesId: fish.id,
      weightKg: +w.toFixed(2),
      rarity: fish.rarity,
      value: fish.value,
      meshUrl: fish.meshUrl,
      profession: 'fishing',
      qty: 1
    };
    this.ui.render({
      phase: 'won',
      fight: this.fight,
      catchLabel: `${fish.label} · ${loot.weightKg} kg · ${fish.rarity}`
    });
    this.onToast(`Caught ${fish.label} (${loot.weightKg} kg)!`);
    this.onCatch(loot);
    this.fishingSkill = Math.min(100, this.fishingSkill + 0.5 + fish.difficulty);
    setTimeout(() => {
      this._clearMeshes();
      this.phase = 'aim';
      this.aiming = true;
      this.fight = null;
      this.pendingFish = null;
      this.ui.render({ phase: 'aim', hint: 'Cast again · LMB' });
    }, 2200);
  }

  _lose(reason) {
    this.phase = 'lost';
    const msg =
      reason === 'line_broke' ? 'Line snapped!' : reason === 'missed_snag' ? 'Missed the snag' : 'Got away';
    this.onToast(msg);
    this.ui.render({ phase: 'lost', fight: this.fight, catchLabel: msg });
    setTimeout(() => {
      this._clearMeshes();
      this.phase = 'aim';
      this.aiming = true;
      this.fight = null;
      this.pendingFish = null;
      this.ui.render({ phase: 'aim' });
    }, 1600);
  }

  dispose() {
    this.endProfession();
    this.ui.dispose();
    this.group.removeFromParent();
  }
}

export default FishingController;
