/**
 * 3D fishing profession controller — main-hand pole · lure cast · SCUM snag · Palworld bar.
 *
 * Extends harvest profession path (not a second combat engine):
 *  - Equip fishing pole (TOOL / t0-fishing-pole … T5)
 *  - Skill tree + rod stats + SWG RGB meals → fight/cast/nautical mods
 *  - RMB aim · LMB cast · S/RMB snag · wheel reel/slack
 *
 * @see docs/FISHING_PROFESSION_SSOT.md
 */

import { Vector3, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import {
  poleById,
  lureById,
  rollFishSpecies,
  computeReelZoneWidth,
  computeLineMax,
  computeCastRange,
  catchXp,
  FISHING_POLES,
  FISHING_LURES
} from './fishingCatalog.js';
import { createFightState, stepFight, beginBite } from './fishingFight.js';
import {
  loadProfessionState,
  saveProfessionState,
  grantFishingXp,
  resolveProfessionMods,
  eatMeal,
  unlockTreeNode
} from './professionState.js';
import { applyCatchRewards } from './fishingRewards.js';
import { rodById } from './fishingRodTypes.js';
import {
  applyFishWorldScale,
  applyPoleWorldScale,
  applyLureWorldScale,
  resolveLengthM
} from './fishScale.js';
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
   *   getEquippedWeaponId?: () => string|null,
   *   getRaceId?: () => string|null
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
    this.getRaceId = opts.getRaceId || (() => null);

    this.prof = loadProfessionState();
    this._elapsed = 0;

    this.ui = new FishingUi();
    this.phase = /** @type {FishingPhase} */ ('idle');
    this.aiming = false;
    this.poleId = this.prof.poleId || 't0-fishing-pole';
    this.lureId = this.prof.lureId || 'lure_basic';
    this.fight = null;
    this.pendingFish = null;
    this.biteTimer = 0;
    this.castPos = new Vector3();
    this._lureMesh = null;
    this._fishMesh = null;
    this._line = null;
    this._poleAttach = null;
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

  /** Combined tree + rod + meal modifiers */
  getMods() {
    // Keep pole id in sync with equipped / profession state
    if (this.prof.poleId) this.poleId = this.prof.poleId;
    return resolveProfessionMods(this.prof, this._elapsed);
  }

  /** Freeride / boat / swim speed multiplier (skill tree + meals + rod) */
  getNauticalSpeedMul() {
    return this.getMods().nauticalSpeedMul || 1;
  }

  /** True when pole is main-hand fishing tool */
  isPoleEquipped() {
    const id = String(this.getEquippedWeaponId() || '').toLowerCase();
    if (id.includes('fish') || id.includes('pole') || id === 't0-fishing-pole') return true;
    return FISHING_POLES.some((p) => p.id === id);
  }

  get active() {
    return this.phase !== 'idle' || this.aiming;
  }

  get fishingSkill() {
    return this.prof.level || 1;
  }

  /** Profession mode: player chose to fish (or pole out near water) */
  beginProfession() {
    const eq = this.getEquippedWeaponId?.();
    if (eq && (String(eq).toLowerCase().includes('fish') || FISHING_POLES.some((p) => p.id === eq))) {
      this.poleId = eq;
      this.prof.poleId = eq;
      saveProfessionState(this.prof);
    } else if (!this.isPoleEquipped()) {
      this.poleId = this.prof.poleId || 't0-fishing-pole';
      this.onToast('Fishing lab pole · equip t0-fishing-pole when catalog ready');
    }
    this.phase = 'aim';
    this.aiming = true;
    try {
      this.combatFocus.focusEnabled = true;
      this.combatFocus.emit?.('focus', true);
    } catch {
      /* optional */
    }
    this.ui.setActive(true);
    this._renderHud('aim');
    const mods = this.getMods();
    this.onToast(
      `Fishing Lv${mods.level} · nautical ×${mods.nauticalSpeedMul.toFixed(2)} · LMB cast · S snag`
    );
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
      applyPoleWorldScale(root, pole.poleLengthM ?? rodById(this.poleId)?.poleLengthM ?? 1.6);
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

  /** Equip lure if rod lureSlotTier allows */
  setLureId(id) {
    const lure = lureById(id);
    if (!lure) return false;
    const pole = poleById(this.poleId);
    const maxTier = pole.lureSlotTier ?? pole.tier ?? 0;
    if ((lure.tier || 0) > maxTier) {
      this.onToast(`${lure.label} needs rod lure tier ${lure.tier}+ (this rod: ${maxTier})`);
      return false;
    }
    this.lureId = id;
    this.prof.lureId = id;
    saveProfessionState(this.prof);
    this.onToast(`Lure · ${lure.label} · sizes ${lure.sizeClass?.join('/') || '?'}`);
    return true;
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
    if (!this.isPoleEquipped() && this.phase === 'idle') {
      // Lab allow Shift+F path even without equip
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

  onSnagKey() {
    if (this.phase === 'bite') {
      this._input.snag = true;
      return true;
    }
    return false;
  }

  onWheel(deltaY) {
    if (this.phase !== 'fight') return false;
    if (deltaY > 0) {
      this._input.reelIn = true;
      this._input.slack = false;
    } else if (deltaY < 0) {
      this._input.slack = true;
      this._input.reelIn = false;
    }
    this._wheelPulse = 0.08;
    return true;
  }

  /** Set rod from profession UI / equip */
  setPoleId(id) {
    if (!poleById(id)) return false;
    this.poleId = id;
    this.prof.poleId = id;
    saveProfessionState(this.prof);
    // Force remount next begin
    if (this._poleAttach) {
      this._poleAttach.removeFromParent?.();
      this._poleAttach = null;
    }
    return true;
  }

  unlockNode(nodeId) {
    const ok = unlockTreeNode(this.prof, nodeId);
    if (ok) this.onToast(`Skill · ${nodeId}`);
    return ok;
  }

  eatMeal(mealId) {
    const ok = eatMeal(this.prof, mealId, this._elapsed);
    if (ok) {
      const m = this.getMods();
      this.onToast(`Meal · nautical ×${m.nauticalSpeedMul.toFixed(2)}`);
      this.ui.renderMealBuffs?.(m.mealBuffs, this.prof.meals);
    }
    return ok;
  }

  castLure() {
    const mods = this.getMods();
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
    const R = WORLD.islandRadius;
    const rAim = Math.hypot(aim.x, aim.z);
    if (rAim < R * 0.55) {
      this.onToast('Cast toward lake / sea (shore or open water)');
    }

    const t = Math.min(1, range / Math.max(dist, 0.01));
    this.castPos.set(feet.x + dx * t, this.waterY + 0.05, feet.z + dz * t);
    const landY = this.terrain?.sample?.(this.castPos.x, this.castPos.z);
    if (Number.isFinite(landY) && landY > this.waterY + 0.35 && rAim < R * 0.85) {
      this.castPos.y = this.waterY + 0.05;
    }

    this.phase = 'cast';
    this.ui.setActive(true);
    this._renderHud('cast');
    this._spawnLure(this.castPos);
    this.character.requestOneShot?.('cast') || this.character.playWeaponCombat?.('cast');

    setTimeout(() => {
      if (this.phase !== 'cast') return;
      this.phase = 'waiting';
      const lure = lureById(this.lureId);
      const biteMul = (lure.biteMul || 1) * (mods.biteMul || 1);
      const wait = (2.2 + Math.random() * 4.5) / biteMul;
      this.biteTimer = wait;
      this._renderHud('waiting', { hint: 'Waiting… keep still' });
      this.onToast('Lure in the water…');
    }, 450);
  }

  _spawnLure(pos) {
    this._clearLureOnly();
    const lure = lureById(this.lureId);
    // Prefer GLB lure; fallback orange sphere
    void this._spawnLureMesh(pos, lure);
  }

  async _spawnLureMesh(pos, lure) {
    this._clearLureOnly();
    if (this.assets?.loadGLTF && lure?.meshUrl) {
      try {
        const gltf = await this.assets.loadGLTF(lure.meshUrl);
        const root = (gltf.scene || gltf.scenes?.[0])?.clone?.(true);
        if (root) {
          applyLureWorldScale(root, lure.meshLengthM ?? 0.12);
          root.position.copy(pos);
          root.name = 'FishingLure';
          this._lureMesh = root;
          this.group.add(root);
          return;
        }
      } catch (e) {
        console.warn('[Fishing] lure mesh', e);
      }
    }
    const geo = new SphereGeometry(0.06, 10, 10);
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
      // SI water size: lengthM, elongated silhouette
      applyFishWorldScale(root, species);
      const len = resolveLengthM(species);
      root.position.copy(this.castPos);
      // Sit slightly under surface; titans deeper
      const depth = Math.min(0.45, 0.06 + len * 0.04);
      root.position.y = this.waterY - depth * 0.35 + 0.05;
      root.name = `Fish_${species.id}`;
      this._fishMesh = root;
      this.group.add(root);
    } catch (e) {
      console.warn('[Fishing] fish mesh', e);
    }
  }

  _clearLureOnly() {
    if (this._lureMesh) {
      this.group.remove(this._lureMesh);
      // Sphere fallback only
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

  _renderHud(phase, extra = {}) {
    const mods = this.getMods();
    this.ui.render({
      phase,
      fight: this.fight,
      prof: {
        level: mods.level,
        xp: this.prof.xp,
        skillPoints: this.prof.skillPoints,
        pole: rodById(this.poleId)?.label || this.poleId,
        lure: lureById(this.lureId)?.label || this.lureId,
        nautical: mods.nauticalSpeedMul,
        maxSize: mods.maxSizeRank,
        meals: this.prof.meals
      },
      ...extra
    });
  }

  /**
   * @param {number} dt
   * @param {Set<string>} keys
   */
  update(dt, keys) {
    this._elapsed += dt;
    // Tick meal expiry quietly
    if (this._elapsed % 2 < dt) {
      resolveProfessionMods(this.prof, this._elapsed);
    }

    if (this.phase === 'idle' && !this.aiming) return;

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
        const mods = this.getMods();
        const fish = rollFishSpecies({
          lureId: this.lureId,
          poleId: this.poleId,
          fishingSkill: this.prof.level,
          rareBias: mods.rareBias,
          legendaryBias: mods.legendaryBias,
          treeMaxSizeRank: mods.tree?.maxSizeRank || mods.maxSizeRank || 1
        });
        this.pendingFish = fish;
        const pole = poleById(this.poleId);
        const rodMods = mods.rodMods || {};
        let biteWin = rodMods.biteWindowS || 0.75;
        biteWin += Math.max(0, 0.2 - fish.difficulty * 0.15);
        const treeZone = mods.tree?.zoneMul || 1;
        // Bigger fish pull harder / slightly narrower zone already in catalog
        this.fight = createFightState({
          zoneWidth: computeReelZoneWidth(pole, fish, pole.abilities, treeZone),
          fishSpeed: fish.speed,
          fishStrength: fish.strength,
          lineMax: computeLineMax(pole, pole.abilities, mods.tree?.lineMul || 1),
          control: pole.control || 1,
          reelSpeed: rodMods.reelSpeed || 1,
          preyOfLeviathans: !!fish.preyOfLeviathans,
          behavior: fish.behavior || null,
          hardCatch: !!fish.hardCatch
        });
        beginBite(this.fight, biteWin);
        this.phase = 'bite';
        this._renderHud('bite', { hint: 'BITE! S or RMB to snag' });
        const len = resolveLengthM(fish);
        let toast = `Bite! ${fish.label} · ${fish.sizeClass} · ${len.toFixed(2)} m · ₡${fish.value}`;
        if (fish.preyOfLeviathans) toast += ' · ⚠ leviathans hunt this';
        this.onToast(toast);
        void this._spawnFishVisual(fish);
      } else {
        this._renderHud('waiting');
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
        const mods = this.getMods();
        const reelMul = mods.rodMods?.reelSpeed || 1;
        stepFight(this.fight, dt, {
          reelIn: this._input.reelIn || (wheelOn && this._input.reelIn),
          slack: this._input.slack,
          moveRight: this._input.moveRight,
          moveLeft: this._input.moveLeft,
          reelSpeedMul: reelMul
        });
        if (this.fight.leviathanEvent) {
          this.onToast(this.fight.leviathanEvent);
          this.fight.leviathanEvent = null;
        }
        if (!wheelOn) {
          this._input.reelIn = keys?.has?.('KeyW') || false;
          this._input.slack = keys?.has?.('KeyS') || false;
        }
        if (this.fight.phase === 'won') this._win();
        else if (this.fight.phase === 'lost') this._lose(this.fight._loseReason);
      }
      this._renderHud(this.phase);
    } else if (this.phase === 'aim') {
      this.ui.setActive(true);
      this._renderHud('aim');
    }

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
    const mods = this.getMods();
    this.phase = 'won';
    const w =
      fish.weightKg[0] + Math.random() * (fish.weightKg[1] - fish.weightKg[0]);
    // Titan/huge never multi-catch
    let qty = Math.max(1, Math.floor(mods.catchQty || 1));
    if (fish.sizeClass === 'huge' || fish.sizeClass === 'titan') qty = 1;
    const len = resolveLengthM(fish);
    const loot = {
      id: `raw_${fish.id}`,
      name: fish.label,
      speciesId: fish.id,
      weightKg: +w.toFixed(2),
      lengthM: len,
      sizeClass: fish.sizeClass,
      rarity: fish.rarity,
      value: fish.value * qty,
      meshUrl: fish.meshUrl,
      profession: 'fishing',
      qty
    };
    this._renderHud('won', {
      catchLabel: `${fish.label} ×${qty} · ${len.toFixed(2)} m · ${loot.weightKg} kg · ${fish.rarity} · ₡${loot.value}`
    });
    this.onToast(`Caught ${fish.label} (${len.toFixed(2)} m · ${loot.weightKg} kg)!`);
    this.onCatch(loot);

    // Super-rare recipe / form / mount unlocks (Aetherwing turtle etc.)
    try {
      const raceId =
        this.getRaceId?.() ||
        this.character?.raceId ||
        this.character?.race ||
        null;
      const rw = applyCatchRewards(fish.id, { raceId });
      for (const m of rw.messages) this.onToast(m);
      if (rw.unlocked.length) loot.unlocks = rw.unlocked;
    } catch (e) {
      console.warn('[Fishing] rewards', e);
    }

    grantFishingXp(this.prof, catchXp(fish, qty));
    this.onToast(`Fishing Lv${this.prof.level} · SP ${this.prof.skillPoints}`);

    setTimeout(() => {
      this._clearMeshes();
      this.phase = 'aim';
      this.aiming = true;
      this.fight = null;
      this.pendingFish = null;
      this._renderHud('aim', { hint: 'Cast again · LMB' });
    }, 2200);
  }

  _lose(reason) {
    this.phase = 'lost';
    const msg =
      reason === 'line_broke'
        ? 'Line snapped!'
        : reason === 'missed_snag'
          ? 'Missed the snag'
          : reason === 'leviathan_stole'
            ? 'Leviathan stole your catch!'
            : 'Got away';
    this.onToast(msg);
    this._renderHud('lost', { catchLabel: msg });
    // Small fail XP so progress isn't zero
    grantFishingXp(this.prof, 3);
    setTimeout(() => {
      this._clearMeshes();
      this.phase = 'aim';
      this.aiming = true;
      this.fight = null;
      this.pendingFish = null;
      this._renderHud('aim');
    }, 1600);
  }

  dispose() {
    this.endProfession();
    this.ui.dispose();
    this.group.removeFromParent();
  }
}

export default FishingController;
