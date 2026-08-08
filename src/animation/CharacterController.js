import {
  AnimationMixer,
  Box3,
  ClampToEdgeWrapping,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  SRGBColorSpace,
  Vector3
} from 'three';
import {
  ANIM_PACKS,
  DODGE_ROLE,
  ROLL_ROLE,
  DEFAULT_RACE,
  FALLBACK_PRESETS,
  GEAR_PRESETS_URL,
  bakedClipUrlsForRole
} from '../config/assets.js';
import { animPackForLoadout, activeWeaponSlot, packCombatBlurb } from '../config/weaponAnimPack.js';
import {
  atlasUrlForRace,
  kitUrlForRace,
  loadoutToMeshIds,
  logSSOT,
  isToonRtsKitUrl,
  raceDef,
  GRUDGE6_SSOT_VERSION
} from '../config/grudge6SSOT.js';
import { EquipmentManager } from '../character/EquipmentManager.js';
import {
  deployToonPlayKit,
  reGroundToonKit,
  applyMeshIdsExclusive,
  diagnoseCharacterLook,
  countSkeletons
} from '../character/toonKitPlay.js';
import { RideIK } from '../character/RideIK.js';
import { LAYER } from '../core/Layers.js';
import { settings } from '../config/settings.js';
import { disposeObject } from '../utils/dispose.js';
import { loadBakedClipJson, rematchClipToSkeleton } from './bakeClip.js';

const _castOrigin = new Vector3();
const _rideFwd = new Vector3();
const _rideLeft = new Vector3();
/** Local +X on tilt — backflip spin axis (pitch) */
const _flipAxis = new Vector3(1, 0, 0);

/**
 * Toon RTS / grudge6 combat hero — ObjectStore loadRaceKit parity ONLY.
 *
 * RIGHT SOURCE: info.grudge-studio.com/js/grudge6-kit.js + race-scenes
 *   Toon GLB → clone → mesh_ids → bone SI fit → yaw 0 → one mixer
 *
 * Purged (wrong paths that keep breaking Warlords heroes):
 *  - unifySkeletons + pose() on partial head skins → head at feet
 *  - setFromObject skinned mesh SI fit → explode / under-scale
 *  - facePlusZ π/2 on Toon play GLB
 *  - races bake / metaverse / FBX play fallback
 *  - SittingPose Mixamo / soft HandIK every frame
 *
 * RideIK only while WalkController ride is active.
 */
export class CharacterController {
  constructor(environment) {
    this.environment = environment;
    this.root = new Group();
    this.root.name = 'Character';

    this.tilt = new Group();
    this.tilt.name = 'CharacterTilt';
    this.root.add(this.tilt);

    this.mixer = null;
    this.actions = new Map();
    this.current = null;
    this.height = 1.8;
    this.headPosition = new Vector3(0, 1.5, 0);
    this.forwardAxis = new Vector3(0, 0, 1);

    this.equipment = null;
    /** @type {{ rHand?: object, lHand?: object, pelvis?: object }|null} */
    this.bones = null;
    this.raceId = DEFAULT_RACE;
    this.animPackId = 'magic';
    this.presetId = 'mage';
    this.presets = FALLBACK_PRESETS.slice();

    /** 'idle' | 'walk' | 'run' | 'cast_loop' | 'attack' */
    this.animState = 'idle';
    this._attackTimer = 0;
    this._oneShotTimer = 0;
    this._castingExternal = false;
    this._boundPacks = new Set();
    this._gait = 0;
    this._gaitLocked = false;

    this.sitting = null;
    /** @type {import('../character/RideIK.js').RideIK|null} */
    this.rideIk = null;
    this._rideActive = false;
    /** World heading for ride pole vectors (set by WalkController) */
    this._rideYaw = 0;
    this.ik = null;

    /** Procedural backflip on tilt (S+Space double jump) */
    this._flipActive = false;
    this._flipTime = 0;
    this._flipDuration = 0.55;
  }

  /**
   * @param {import('../loaders/AssetLoader.js').AssetLoader} assets
   * @param {{ raceId?: string, presetId?: string }} [opts]
   */
  async load(assets, opts = {}) {
    this.assets = assets;
    this.raceId = opts.raceId || DEFAULT_RACE;
    this.presetId = opts.presetId || 'mage';
    logSSOT();

    await this._loadPresets();

    const race = raceDef(this.raceId);
    // PLAY: Toon RTS GLB only — no races-bake / metaverse / FBX fallback
    const kitUrl = kitUrlForRace(this.raceId);
    const atlasUrl = atlasUrlForRace(this.raceId);

    let gltf = null;
    try {
      gltf = await assets.loadGLTF(kitUrl);
    } catch (err) {
      console.error('[CharacterController] Toon RTS kit failed (no fallback)', kitUrl, err);
      throw err;
    }
    if (!gltf) throw new Error(`No Toon RTS race GLB: ${kitUrl}`);
    if (!isToonRtsKitUrl(kitUrl)) {
      throw new Error(`[CharacterController] refuse non-Toon play kit: ${kitUrl}`);
    }

    // Atlas optional — Toon embeds usually enough; only for missing maps
    const atlas = await assets.loadTexture(atlasUrl).catch((err) => {
      console.warn('[CharacterController] atlas failed (ok if embeds)', err);
      return null;
    });
    await assets.settled();

    if (atlas) {
      atlas.colorSpace = SRGBColorSpace;
      atlas.flipY = false;
      atlas.wrapS = ClampToEdgeWrapping;
      atlas.wrapT = ClampToEdgeWrapping;
      atlas.anisotropy = 8;
      atlas.needsUpdate = true;
      this.atlas = atlas;
    }

    // Clear previous kit
    while (this.tilt.children.length) {
      const c = this.tilt.children[0];
      this.tilt.remove(c);
      disposeObject(c);
    }

    // Preset → mesh_ids (no bag/wood/quiver in combat showcase)
    const preset = this.presets.find((p) => p.id === this.presetId) || this.presets[0];
    this.animPackId = this._packFromPreset(preset);
    const cleanLoadout = { ...(preset?.loadout || { body: 'A', arms: 'A', legs: 'A', head: 'A' }) };
    delete cleanLoadout.bag;
    delete cleanLoadout.wood;
    delete cleanLoadout.quiver;
    delete cleanLoadout.carry;
    delete cleanLoadout.showUtility;
    const meshIds = loadoutToMeshIds(race.prefix, cleanLoadout);

    // ★ ObjectStore loadRaceKit parity — no unify/pose, bone SI fit, yaw 0
    const deployed = deployToonPlayKit(gltf.scene, { meshIds });
    const kit = deployed.root;
    kit.name = `${race.short}_toon`;
    kit.userData.importUrl = kitUrl;
    kit.userData.playMesh = 'toon-rts';
    kit.userData.ssotVersion = GRUDGE6_SSOT_VERSION;
    const report = deployed.equip;

    this.equipment = new EquipmentManager(kit, { preserveVisibility: true });
    this.equipment.loadout = { ...cleanLoadout };
    this.equipment.carryMode = false;
    this.equipment.hideUtility();

    kit.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.layers.set(LAYER.WORLD);
      o.layers.enable(LAYER.CONTACT);
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) this.environment?.registerShadowCaster?.(m);
    });

    // root (world feet + yaw) → tilt → model
    this.tilt.add(kit);
    this.model = kit;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.tilt.position.set(0, 0, 0);
    this.tilt.quaternion.identity();

    this.height = deployed.height || kit.userData.deployHeightM || 1.8;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment.findBones();

    // Single AnimationMixer — Bip001 packs, position tracks stripped, bones-only rematch
    this.mixer = new AnimationMixer(kit);
    this.actions.clear();
    this._boundPacks.clear();

    await this._bindPack(this.animPackId);
    if (this.animPackId !== 'magic' && this.animPackId !== 'sword_shield') {
      await this._bindPack('magic');
    }
    // Shared longbow directional dodges + parry (Danger Room AA/DD/WW/X)
    await this._bindPack('combat_mobility');
    if (this.animPackId !== 'longbow') {
      // Prefer longbow pack dodge roles when combat_mobility already set names
      await this._bindPack('longbow');
    }

    if (this.actions.has('idle')) this.play('idle', 0);
    else if (this.actions.size) this.play([...this.actions.keys()][0], 0);

    this.mixer.update(1 / 30);
    reGroundToonKit(kit, 0);
    this.root.position.y = 0;
    this.height = kit.userData.deployHeightM || this.height;

    if (this.rideIk) this.rideIk.rebind(kit);
    else this.rideIk = new RideIK(kit);
    this._rideActive = false;

    const look = this.diagnoseLook();
    const vis = this._countVisibleSkinned();
    const uprightOk = deployed.upright !== false;
    console.info(
      `[CharacterController] toon-rts★ ${this.raceId}/${this.presetId} ` +
        `kit=${kitUrl.split('/').pop()} path=objectstore-parity ` +
        `h=${this.height.toFixed(2)}m equip=${report.matched} vis=${vis} clips=${this.actions.size} ` +
        `upright=${deployed.upright} headY=${deployed.headY?.toFixed(2)} footY=${deployed.footY?.toFixed(2)} ` +
        (uprightOk && vis >= 3 ? 'OK' : `WARN ${JSON.stringify(look.errors || [])}`),
    );

    return this;
  }

  /** Visible skinned pieces (body/arms/legs/head should be ≥3–4). */
  _countVisibleSkinned() {
    let n = 0;
    this.model?.traverse((o) => {
      if (o.isSkinnedMesh && o.visible) n++;
    });
    return n;
  }

  /** World AABB of visible body (for camera / debug). */
  getWorldBodyBox(out = new Box3()) {
    if (!this.model) return out.makeEmpty();
    this.root.updateMatrixWorld(true);
    out.makeEmpty();
    let any = false;
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      if (/weapon|shield|staff|sword|bow|axe|hammer/i.test(o.name || '')) return;
      try {
        const b = new Box3().setFromObject(o, true);
        if (b.isEmpty()) return;
        if (!any) {
          out.copy(b);
          any = true;
        } else out.union(b);
      } catch {
        /* */
      }
    });
    return out;
  }

  /** Snap root feet to world XZ (physics / spawn). */
  placeAt(x, y, z) {
    this.root.position.set(x, y ?? 0, z);
  }

  diagnoseLook() {
    if (!this.model) return { ok: false, reason: 'no-model' };
    const d = diagnoseCharacterLook(this.model, 0);
    const bones = this.equipment?.findBones?.() || this.bones || {};
    // Don't throw — boot must complete even if bone helpers missing
    let skelCount = 0;
    try {
      skelCount = countSkeletons(this.model);
    } catch {
      skelCount = -1;
    }
    const heightOk = (d.height ?? 0) >= 1.55 && (d.height ?? 0) <= 2.15;
    const feetOk = Math.abs((d.feetMinY ?? 99) - 0) < 0.12;
    return {
      ok: heightOk && feetOk && !!(bones.pelvis || d.bip001?.count >= 18),
      heightM: +(d.height ?? 0).toFixed(3),
      feetMinY: +(d.feetMinY ?? 0).toFixed(3),
      heightOk,
      feetOk,
      pelvis: !!bones.pelvis,
      rHand: !!bones.rHand,
      errors: d.errors || [],
      equipMatched: this.equipment?.loadout || {},
      skeletons: skelCount,
      bip001: d.bip001?.count ?? 0
    };
  }

  async _loadPresets() {
    try {
      const res = await fetch(GEAR_PRESETS_URL, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = json.presets || json;
      if (Array.isArray(list) && list.length) this.presets = list;
    } catch (err) {
      console.warn('[CharacterController] presets CDN fail; using fallbacks', err);
      this.presets = FALLBACK_PRESETS.slice();
    }
  }

  _packFromPreset(preset) {
    const pack = preset?.pack || 'magic';
    if (pack === 'magic' || pack.startsWith('magic')) return 'magic';
    if (pack.includes('sword') || pack.includes('shield') || pack === '2h_melee') return 'sword_shield';
    if (pack.includes('bow') || pack === 'longbow') return 'longbow';
    return ANIM_PACKS[pack] ? pack : 'magic';
  }

  /**
   * Swap Toon RTS race kit (all 6 races) — full reload, same preset when possible.
   * @param {string} raceId WK|ELF|BRB|ORC|UD|DWF
   */
  async setRace(raceId) {
    if (!this.assets) throw new Error('CharacterController.setRace: call load() first');
    const next = raceId || DEFAULT_RACE;
    if (next === this.raceId && this.model) return this;
    await this.load(this.assets, { raceId: next, presetId: this.presetId });
    return this;
  }

  /**
   * Bind / activate a weapon locomotion + skill anim pack.
   * @param {string} packId magic | sword_shield | longbow | locomotion_8way
   */
  async setAnimPack(packId) {
    const id = ANIM_PACKS[packId] ? packId : 'magic';
    this.animPackId = id;
    // Re-bind so primary role names (idle/walk/attack) match this pack
    this._boundPacks.delete(id);
    const pack = ANIM_PACKS[id];
    if (pack) {
      for (const role of Object.keys(pack)) {
        const prev = this.actions.get(role);
        if (prev) {
          try {
            prev.stop();
          } catch {
            /* ignore */
          }
          this.actions.delete(role);
        }
      }
    }
    await this._bindPack(id);
    if (this.actions.has('idle')) this.play('idle', 0.25);
    else if (this.actions.has(`${id}:idle`)) this.play(`${id}:idle`, 0.25);
    return id;
  }

  /** Bound clip roles for anim library UI. */
  listAnimRoles() {
    return [...this.actions.keys()].sort();
  }

  /** Play a library clip by role name (one-shot for attack/block/jump). */
  playLibraryClip(role) {
    if (!role || !this.actions.has(role)) return false;
    const once = /attack|block|parry|jump|cast|dodge|roll|slide/i.test(role);
    this.play(role, once ? 0.12 : 0.25);
    if (once) {
      const act = this.actions.get(role);
      const dur = act?.getClip?.()?.duration ?? 0.6;
      this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.95);
      this._gaitLocked = true;
      this.animState = /attack/i.test(role)
        ? 'attack'
        : /roll/i.test(role)
          ? 'roll'
          : /slide/i.test(role)
            ? 'slide'
            : /dodge/i.test(role)
              ? 'dodge'
              : this.animState;
    }
    return true;
  }

  /**
   * Directional dodge one-shot — longbow standing dodge L/R/F/B preferred.
   * @param {'left'|'right'|'forward'|'back'} dir
   * @returns {boolean}
   */
  playDodge(dir) {
    const role = DODGE_ROLE[dir] || 'dodgeB';
    const candidates = [role, `longbow:${role}`, `combat_mobility:${role}`];
    for (const name of candidates) {
      if (this.actions.has(name)) {
        this.play(name, 0.08);
        const act = this.actions.get(name);
        const dur = act?.getClip?.()?.duration ?? settings.drc?.dodgeDuration ?? 0.42;
        this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.92);
        this._gaitLocked = true;
        this.animState = 'dodge';
        return true;
      }
    }
    // Fallback: jump clip as mobility tell
    if (this.actions.has('jump')) {
      this.play('jump', 0.08);
      this._oneShotTimer = 0.35;
      this._gaitLocked = true;
      this.animState = 'dodge';
      return true;
    }
    return false;
  }

  /**
   * Directional roll one-shot — Ghost Rider roll_* preferred (Ctrl+A/D).
   * @param {'left'|'right'|'forward'|'back'} dir
   * @returns {boolean}
   */
  playRoll(dir) {
    const role = ROLL_ROLE[dir] || 'rollB';
    const candidates = [role, `combat_mobility:${role}`, DODGE_ROLE[dir], `longbow:${DODGE_ROLE[dir]}`];
    for (const name of candidates) {
      if (!name || !this.actions.has(name)) continue;
      this.play(name, 0.06);
      const act = this.actions.get(name);
      const dur = act?.getClip?.()?.duration ?? settings.drc?.rollDuration ?? 0.55;
      this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.92);
      this._gaitLocked = true;
      this.animState = 'roll';
      return true;
    }
    return this.playDodge(dir);
  }

  /**
   * Sprint slide one-shot — prod running-slide (Shift+Ctrl while sprint).
   * @returns {boolean}
   */
  playSlide() {
    for (const name of ['slide', 'combat_mobility:slide']) {
      if (!this.actions.has(name)) continue;
      this.play(name, 0.06);
      const act = this.actions.get(name);
      const dur = act?.getClip?.()?.duration ?? settings.drc?.slideDuration ?? 0.72;
      this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.92);
      this._gaitLocked = true;
      this.animState = 'slide';
      return true;
    }
    // Fallback: forward roll if slide bake missing
    return this.playRoll('forward');
  }

  /** Parry / block one-shot (sword_shield block clip as longbow has no parry bake). */
  playParry() {
    for (const name of ['parry', 'block', 'sword_shield:block', 'combat_mobility:parry']) {
      if (this.actions.has(name)) {
        this.play(name, 0.08);
        const act = this.actions.get(name);
        const dur = act?.getClip?.()?.duration ?? 0.45;
        this._oneShotTimer = Math.max(this._oneShotTimer, dur * 0.9);
        this._gaitLocked = true;
        this.animState = 'parry';
        return true;
      }
    }
    return false;
  }

  /** Summary for lab Character tab. */
  getLabSummary() {
    const race = raceDef(this.raceId);
    const loadout = this.equipment?.loadout || {};
    const weaponSlot = ['sword', 'axe', 'hammer', 'spear', 'staff', 'bow'].find(
      (s) => loadout[s] && loadout[s] !== 'none'
    );
    return {
      raceId: this.raceId,
      raceLabel: race?.label || this.raceId,
      raceShort: race?.short || '',
      kitUrl: kitUrlForRace(this.raceId),
      atlasUrl: atlasUrlForRace(this.raceId),
      presetId: this.presetId,
      animPackId: this.animPackId,
      heightM: this.height,
      weaponSlot: weaponSlot || null,
      weaponVariant: weaponSlot ? loadout[weaponSlot] : null,
      loadout: { ...loadout },
      clips: this.listAnimRoles(),
      rideActive: !!this._rideActive
    };
  }

  async _bindPack(packId) {
    if (this._boundPacks.has(packId)) return;
    const pack = ANIM_PACKS[packId];
    if (!pack) return;

    const roleMap = {
      idle: LoopRepeat,
      cast: LoopRepeat,
      attack: LoopOnce,
      block: LoopOnce,
      parry: LoopOnce,
      walk: LoopRepeat,
      run: LoopRepeat,
      jump: LoopOnce,
      dodgeL: LoopOnce,
      dodgeR: LoopOnce,
      dodgeF: LoopOnce,
      dodgeB: LoopOnce,
      rollL: LoopOnce,
      rollR: LoopOnce,
      rollF: LoopOnce,
      rollB: LoopOnce,
      slide: LoopOnce
    };

    for (const [role, rel] of Object.entries(pack)) {
      const name =
        this.actions.has(role) && packId !== this.animPackId ? `${packId}:${role}` : role;
      const urls = bakedClipUrlsForRole(rel);
      let loaded = false;
      /** @type {{ url: string, matched: import('three').AnimationClip }|null} */
      let fallbackNoHands = null;
      for (const url of urls) {
        try {
          const raw = await loadBakedClipJson(url);
          raw.name = name;
          const matched = rematchClipToSkeleton(this.model, raw, { stripPositions: true });
          if (!matched.tracks.length) {
            console.warn(`[CharacterController] empty tracks: ${url}`);
            continue;
          }
          // Prefer clips that drive hands for idle (prod standing-idle has hands;
          // open magic/standing idle does not → broken bind-pose hands on Toon).
          if (role === 'idle') {
            const hasHand = matched.tracks.some((t) => /Hand\.quaternion$/i.test(t.name));
            if (!hasHand) {
              if (!fallbackNoHands) fallbackNoHands = { url, matched };
              console.warn(
                `[CharacterController] idle without Hand tracks (try next): ${url}`
              );
              continue;
            }
          }
          this._registerClip(name, matched, roleMap[role] ?? LoopRepeat);
          console.info(`[CharacterController] clip ${name} ← ${url} tracks=${matched.tracks.length}`);
          loaded = true;
          break;
        } catch {
          /* try next URL */
        }
      }
      if (!loaded && fallbackNoHands) {
        this._registerClip(name, fallbackNoHands.matched, roleMap[role] ?? LoopRepeat);
        console.warn(
          `[CharacterController] idle fallback (no hands) ← ${fallbackNoHands.url}`
        );
        loaded = true;
      }
      if (!loaded) {
        console.warn(`[CharacterController] clip fail role=${role}`, rel);
      }
    }

    this._boundPacks.add(packId);
  }

  _registerClip(name, clip, loopMode) {
    if (!this.mixer) return;
    const action = this.mixer.clipAction(clip);
    action.setLoop(loopMode, loopMode === LoopOnce ? 1 : Infinity);
    action.clampWhenFinished = loopMode === LoopOnce;
    this.actions.set(name, action);
  }

  applyLoadout(loadout, meta = {}) {
    if (!this.model) return { matched: 0, missing: ['no-model'] };
    if (meta.presetId) this.presetId = meta.presetId;
    const race = raceDef(this.raceId);
    const clean = { ...loadout };
    delete clean.bag;
    delete clean.wood;
    delete clean.quiver;
    const meshIds = loadoutToMeshIds(race.prefix, clean);
    const report = applyMeshIdsExclusive(this.model, meshIds);
    this.equipment?.hideUtility?.();
    if (this.equipment) this.equipment.loadout = { ...clean };
    reGroundToonKit(this.model, 0);
    this.height = this.model.userData.deployHeightM || this.height;
    this.headPosition.set(0, this.height * 0.86, 0);
    this.bones = this.equipment?.findBones?.() || this.bones;

    // Weapon mesh → anim pack (staff→magic, bow→longbow, melee→sword_shield)
    const wantPack = animPackForLoadout(clean, meta.pack || this.animPackId);
    if (wantPack !== this.animPackId || meta.forcePack) {
      // Fire-and-forget bind; callers can await syncAnimPackFromLoadout
      this._pendingPack = wantPack;
      this.syncAnimPackFromLoadout({ packHint: meta.pack }).catch(() => {});
    } else if (this.actions.has('idle') && this.animState === 'idle') {
      this.play('idle', 0.2);
    }
    return report;
  }

  /**
   * Bind anim pack from current equipment loadout (weapon slot SSOT).
   * @param {{ packHint?: string }} [opts]
   */
  async syncAnimPackFromLoadout(opts = {}) {
    const loadout = this.equipment?.loadout || {};
    const pack = animPackForLoadout(loadout, opts.packHint || this.animPackId);
    const slot = activeWeaponSlot(loadout);
    await this.setAnimPack(pack);
    console.info(
      `[CharacterController] weapon pack ${pack} slot=${slot || 'none'} · ${packCombatBlurb(pack)}`
    );
    return pack;
  }

  applyPreset(presetId) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return null;
    this.presetId = presetId;
    this.animPackId = this._packFromPreset(preset);
    return this.applyLoadout(preset.loadout, { pack: preset.pack, presetId, forcePack: true });
  }

  /**
   * Combat one-shot for equipped weapon pack (attack vs cast).
   * @param {'attack'|'cast'|'block'} intent
   */
  playWeaponCombat(intent = 'attack') {
    const pack = this.animPackId || 'magic';
    if (intent === 'block') return this.playParry() || this.requestOneShot('block');
    if (pack === 'magic' || intent === 'cast') {
      return this.requestOneShot('cast') || this.requestOneShot('attack');
    }
    return this.requestOneShot('attack') || this.requestOneShot('cast');
  }

  play(name, fadeDuration = 0.35) {
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && next.isRunning()) return;

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);

    if (this.current && this.current !== next && fadeDuration > 0) {
      next.crossFadeFrom(this.current, fadeDuration, true);
    }
    next.play();
    this.current = next;
  }

  setCasting(isCasting) {
    this._castingExternal = !!isCasting;
  }

  /**
   * @param {0|1|2|number} level 0 idle, 1 walk, 2 run
   * @param {boolean} [sprinting]
   */
  setGait(level, sprinting = false) {
    if (this._gaitLocked) return;
    if (this._castingExternal && level === 0) return;
    const g = sprinting ? 2 : MathUtils.clamp(level | 0, 0, 2);
    if (g === this._gait && this.animState !== 'attack') return;
    this._gait = g;
    if (g === 0) {
      if (this.actions.has('idle') && this.animState !== 'cast_loop') {
        this.animState = 'idle';
        this.play('idle', 0.2);
      }
    } else if (g === 1) {
      const walk = this.actions.has('walk') ? 'walk' : this.actions.has('run') ? 'run' : null;
      if (walk) {
        this.animState = 'walk';
        this.play(walk, 0.18);
      }
    } else {
      const run = this.actions.has('run') ? 'run' : this.actions.has('walk') ? 'walk' : null;
      if (run) {
        this.animState = 'run';
        this.play(run, 0.15);
      }
    }
  }

  requestOneShot(role) {
    let name = null;
    if (role === 'attack') {
      name = this.actions.has('attack')
        ? 'attack'
        : this.actions.has('sword_shield:attack')
          ? 'sword_shield:attack'
          : this.actions.has('cast')
            ? 'cast'
            : null;
    } else if (role === 'cast') {
      name = this.actions.has('cast') ? 'cast' : this.actions.has('attack') ? 'attack' : null;
    } else if (role === 'block') {
      name = this.actions.has('block') ? 'block' : null;
    } else if (this.actions.has(role)) {
      name = role;
    }
    if (!name) return false;

    this._gaitLocked = true;
    this.animState = role === 'cast' ? 'cast_loop' : 'attack';
    this.play(name, 0.1);
    const duration = this.actions.get(name)?.getClip()?.duration ?? 0.8;
    this._oneShotTimer = duration + 0.04;
    this._attackTimer = this._oneShotTimer;
    return true;
  }

  playWeaponAttack() {
    return this.requestOneShot('attack');
  }

  playCastFlourish() {
    this.requestOneShot('cast');
  }

  /**
   * Jump one-shot (blend from gait). Falls back to short gait lock if no clip.
   * @param {number} [fade=0.08]
   */
  playJump(fade = 0.08) {
    if (this.actions.has('jump')) {
      this._gaitLocked = true;
      this.animState = 'jump';
      this.play('jump', fade);
      const duration = this.actions.get('jump')?.getClip()?.duration ?? 0.55;
      this._oneShotTimer = Math.min(duration, 0.7) + 0.02;
      this._attackTimer = this._oneShotTimer;
      return true;
    }
    // No clip: brief gait lock so feet don't moonwalk mid-air
    this._gaitLocked = true;
    this.animState = 'jump';
    this._oneShotTimer = 0.45;
    return false;
  }

  /**
   * Procedural backflip on tilt joint (no second mixer).
   * @param {number} duration seconds for full 360° spin about local X
   */
  playBackflip(duration = 0.55) {
    this._flipTime = 0;
    this._flipDuration = Math.max(0.2, duration);
    this._flipActive = true;
    // Prefer jump clip as body pose during flip
    this.playJump(0.05);
    return true;
  }

  /** Cancel procedural flip (land). */
  clearFlip() {
    this._flipActive = false;
    this._flipTime = 0;
    this.setLean(0);
  }

  /** World-space cast / projectile origin (hand container or approx chest). */
  getCastOrigin(out) {
    const target = out || _castOrigin;
    const hand = this.bones?.rHand;
    if (hand) {
      hand.getWorldPosition(target);
      return target;
    }
    this.root.getWorldPosition(target);
    target.y += this.height * 0.72;
    target.z += Math.cos(this.facing) * 0.25;
    target.x += Math.sin(this.facing) * 0.25;
    return target;
  }

  /**
   * Approx weapon tip: R_hand + offset along facing (grip→tip proxy).
   * Used for melee residual / Getsuga spawn (Open meleeStrikeFx pattern).
   * @param {import('three').Vector3} [out]
   * @param {number} [tipOffsetM] metres along blade from grip
   */
  getWeaponTip(out, tipOffsetM = 0.55) {
    const target = out || _castOrigin;
    this.getCastOrigin(target);
    const off = Number.isFinite(tipOffsetM) ? tipOffsetM : 0.55;
    // Blade roughly forward + slight up from hand (SI)
    target.x += Math.sin(this.facing) * off;
    target.z += Math.cos(this.facing) * off;
    target.y += off * 0.15;
    return target;
  }

  /**
   * Enable windsurf deck/boom IK. Only while WalkController ride is live.
   * DRC combat checks `_rideActive` and yields locomotion.
   * @param {boolean} active
   * @param {number} [yaw] board heading for knee/elbow poles
   */
  setRideActive(active, yaw) {
    this._rideActive = !!active;
    if (Number.isFinite(yaw)) this._rideYaw = yaw;
    if (this.rideIk) this.rideIk.setActive(this._rideActive);
    if (this._rideActive) {
      // Hold idle gait under ride — mixer still runs, IK overrides limbs
      this.setGait?.(0, false);
      this._gaitLocked = true;
    } else {
      this._gaitLocked = false;
    }
  }

  /**
   * World sockets from HoverboardRide.getIkWorldTargets().
   * @param {Record<string, import('three').Vector3|{x:number,y:number,z:number}>} worldSockets
   * @param {number} [yaw]
   */
  setRideSockets(worldSockets, yaw) {
    if (Number.isFinite(yaw)) this._rideYaw = yaw;
    if (!this.rideIk) return;
    this.rideIk.setTargets(worldSockets);
  }

  setPose(pose) {
    // Standing stance only on Bip001 (no Mixamo lotus)
    settings.character.pose = 'idle';
    return 'idle';
  }
  togglePose() {
    return this.setPose('idle');
  }
  get isSitting() {
    return false;
  }
  get poseWeight() {
    return 0;
  }

  setFacing(yaw) {
    this.root.rotation.y = yaw;
    if (this._rideActive) this._rideYaw = yaw;
  }

  get facing() {
    return this.root.rotation.y;
  }

  setLean(angle) {
    if (this._flipActive) return; // backflip owns tilt
    this.tilt.quaternion.setFromAxisAngle(this.forwardAxis, angle);
  }

  resetPlacement() {
    this.root.position.y = 0;
    this.setLean(0);
    this.setRideActive(false);
  }

  update(dt) {
    if (!this.mixer) return;

    // While riding, do not run combat one-shot / cast gait machine over limbs
    if (!this._rideActive) {
      if (this._oneShotTimer > 0) {
        this._oneShotTimer -= dt;
        this._attackTimer = this._oneShotTimer;
        if (this._oneShotTimer <= 0) {
          this._gaitLocked = false;
          if (this._castingExternal && this.actions.has('cast')) {
            this.animState = 'cast_loop';
            this.play('cast', 0.2);
          } else {
            const g = this._gait;
            this._gait = -1;
            this.setGait(g, g >= 2);
          }
        }
      } else if (!this._gaitLocked) {
        if (this._castingExternal && this.actions.has('cast') && this._gait === 0) {
          if (this.animState !== 'cast_loop') {
            this.animState = 'cast_loop';
            this.play('cast', 0.15);
          }
        } else if (this.animState === 'cast_loop' && !this._castingExternal) {
          this.animState = 'idle';
          if (this.actions.has('idle')) this.play('idle', 0.25);
        }
      }
    }

    this.mixer.timeScale = settings.global.animationSpeed;
    this.mixer.update(dt);

    // Procedural backflip: full revolution about local right (X) on tilt
    if (this._flipActive) {
      this._flipTime += dt;
      const u = MathUtils.clamp(this._flipTime / this._flipDuration, 0, 1);
      // Spin backward (negative pitch about local +X / right)
      const angle = -u * Math.PI * 2;
      this.tilt.quaternion.setFromAxisAngle(_flipAxis, angle);
      if (u >= 1) {
        this._flipActive = false;
        this.setLean(0);
      }
    }

    // Post-mixer: plant feet on deck + grip boom (walk ride only)
    if (this.rideIk && (this._rideActive || this.rideIk.weight > 1e-3)) {
      const yaw = this._rideYaw || this.facing;
      _rideFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      _rideLeft.set(Math.cos(yaw), 0, -Math.sin(yaw));
      this.rideIk.update(dt, {
        boardForward: _rideFwd,
        boardLeft: _rideLeft,
        hipDrop: settings.walk?.hipDrop ?? 0.1
      });
    }
  }

  get position() {
    return this.root.position;
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    disposeObject(this.root);
  }
}
