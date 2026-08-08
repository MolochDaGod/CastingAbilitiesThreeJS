import { Vector3, MathUtils } from 'three';

import { Renderer } from './Renderer.js';
import { Time } from './Time.js';
import { CameraRig } from './CameraRig.js';
import { frame } from './FrameUniforms.js';

import { Environment } from '../world/Environment.js';
import { Ground } from '../world/Ground.js';
import { StageWater } from '../world/StageWater.js';
import { DustMotes } from '../world/DustMotes.js';
import { ContactShadows } from '../world/ContactShadows.js';
import { WORLD } from '../config/worldScale.js';

import { AssetLoader } from '../loaders/AssetLoader.js';
import { CharacterController } from '../animation/CharacterController.js';
import { WalkController } from '../animation/WalkController.js';

import { InputManager } from '../input/InputManager.js';
import { PathDrawer } from '../input/PathDrawer.js';
import { MouseAim } from '../input/MouseAim.js';
import { Mesh, MeshBasicMaterial, RingGeometry, DoubleSide } from 'three';

import { ParticleEngine } from '../particles/ParticleEngine.js';
import { LightPool } from '../effects/LightPool.js';
import { DecalSystem } from '../effects/GroundDecals.js';
import { BurstSystem } from '../effects/BurstSphere.js';
import { CameraShake } from '../effects/CameraShake.js';
import { ScreenFlash } from '../effects/ScreenFlash.js';

import { AbilityManager } from '../abilities/AbilityManager.js';
import { PostProcessing } from '../postprocessing/PostProcessing.js';

import { HUD, LoadingScreen } from '../ui/HUD.js';
import { Editor } from '../ui/Editor.js';
import { InventoryPanel } from '../ui/InventoryPanel.js';
import { ShowcasePanel } from '../ui/ShowcasePanel.js';
import { DrcCombatController } from '../combat/DrcCombatController.js';
import { loadWeaponSkillsCatalog } from '../api/weaponSkillsCatalog.js';
import { loadSkillBindings } from '../combat/skillBindings.js';
import { loadPrefabCatalog, pickSamplePrefab, bagItemFromPresent } from '../loot/prefabAssets.js';
import { WorldDrops } from '../world/WorldDrops.js';
import { DropBag } from '../ui/DropBag.js';
import '../ui/dropBag.css';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { VfxDirector } from '../vfx/VfxDirector.js';
import { loadGeneratedCatalog, spawnGeneratedProp } from '../assets/generatedCatalog.js';

import { settings, ELEMENTS, MODES, MODE_META } from '../config/settings.js';
import { SessionState, INTERACTION_MODE, DRC_SESSION } from './SessionState.js';

const HDR_URL = './hdri/spruit_sunrise.hdr';

/**
 * Application root: owns every subsystem and the frame loop.
 *
 * Wiring is one-directional. **Session orchestration** lives in SessionState:
 * mode / combat-equip / ride phase / element + derived gates. Controllers report
 * phase changes; App applies camera/inventory/HUD once on session.change.
 * Tweaks (numbers/colors) stay in settings.js.
 *
 * @see docs/SESSION_STATE_SSOT.md
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;

    /** Session SSOT — mode, drc, ride, element, gates */
    this.session = new SessionState();

    /* ---- core ---- */
    this.renderer = new Renderer(canvas);
    this.rig = new CameraRig(canvas);
    this.camera = this.rig.camera;

    this.environment = new Environment(this.renderer, this.camera);
    this.scene = this.environment.scene;

    /* ---- world (SI: ~2 m hero → map scale 1.5× original stage) ---- */
    // Apply world fog / camera extents once at boot
    settings.environment.fogNear = WORLD.fogNear;
    settings.environment.fogFar = WORLD.fogFar;
    settings.camera.distance = WORLD.cameraDistance;
    settings.camera.maxDistance = WORLD.cameraMaxDistance;
    settings.camera.minDistance = WORLD.cameraMinDistance;

    this.ground = new Ground(this.environment);
    this.water = new StageWater();
    this.dust = new DustMotes();
    this.contactShadows = new ContactShadows(this.renderer, {
      size: 2.6 * Math.sqrt(WORLD.mapScale),
      height: 2.4,
      blur: 2.0
    });

    this.scene.add(this.water.mesh, this.ground.mesh, this.dust.points, this.contactShadows.group);
    this.dust.setPixelRatio(this.renderer.gl.getPixelRatio());
    console.info(
      `[App] world SI mapScale=${WORLD.mapScale} ground=${WORLD.groundSize}m fogFar=${WORLD.fogFar}m water=${WORLD.waterSize}m`
    );

    /* ---- shared VFX services ---- */
    this.particles = new ParticleEngine(this.scene);
    this.lights = new LightPool(this.scene);
    this.decals = new DecalSystem(this.scene);
    this.bursts = new BurstSystem(this.scene);
    this.shake = new CameraShake(this.rig);
    this.flash = new ScreenFlash();

    this.abilities = new AbilityManager({
      scene: this.scene,
      camera: this.camera,
      environment: this.environment,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash
    });

    /* ---- character ---- */
    this.character = new CharacterController(this.environment);
    this.scene.add(this.character.root);

    // Walk mode: drawn path → windsurf ride (HoverboardRide + RideIK).
    this.walk = new WalkController(this.character, {
      scene: this.scene,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      water: this.water,
      session: this.session,
      assets: null // filled in load()
    });

    /* ---- input ---- */
    this.input = new InputManager(canvas);
    this.pathDrawer = new PathDrawer(this.camera);
    this.scene.add(this.pathDrawer.object3D);
    this.mouseAim = new MouseAim(this.camera);
    // Ground aim ring under crosshair (combat)
    const ringGeo = new RingGeometry(0.18, 0.32, 32);
    const ringMat = new MeshBasicMaterial({
      color: 0x7fd6ff,
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
      depthWrite: false
    });
    this.aimMarker = new Mesh(ringGeo, ringMat);
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.aimMarker.position.y = 0.04;
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);

    /* ---- post ---- */
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    /* ---- UI ---- */
    this.loading = new LoadingScreen();
    this.hud = new HUD(document.getElementById('hud'));
    this.editor = new Editor({
      onClear: () => this.clearEffects(),
      onToast: (message) => this.hud.showToast(message)
    });
    this.inventory = new InventoryPanel({
      character: this.character,
      onToast: (message) => this.hud.showToast(message),
      onEquip: () => {
        this.hud.setPlayerFrame?.({
          raceId: this.character.raceId,
          name: this.character.presetId || 'Hero'
        });
        this.hud.refreshSkillLabels?.();
      },
      onRace: async (raceId) => {
        await this.character.setRace(raceId);
        this.hud.setPlayerFrame?.({
          raceId,
          name: this.character.presetId || raceId
        });
        this.hud.showToast(`Race · ${raceId}`);
      },
      onMode: (mode) => this.setMode(mode),
      onMountToggle: () => {},
      getDrc: () => this.drc
    });

    this.showcase = new ShowcasePanel({
      character: this.character,
      getDrc: () => this.drc,
      onToast: (message) => this.hud.showToast(message),
      onRace: async (raceId) => {
        await this.character.setRace(raceId);
        this.hud.setPlayerFrame?.({ raceId, name: this.character.presetId || raceId });
      },
      onShowcaseMode: (on) => {
        // Orbit for review; combat returns to TPS when closed if still in combat
        if (on) {
          this.rig.setViewMode('orbit');
          this.drc.setSession?.('equip');
          this.inventory.setOpen?.(false);
        } else if (this.drc.session === 'combat') {
          this.rig.setViewMode('tps');
        }
        this.hud.refreshSkillLabels?.();
      },
      onBindingsChanged: () => this.hud.refreshSkillLabels?.()
    });

    this.dropBag = new DropBag({
      onToast: (m) => this.hud.showToast(m),
      onThrow: (item, cx, cy) => this._throwBagItem(item, cx, cy)
    });

    /** @type {WorldDrops|null} filled after assets load */
    this.worldDrops = null;
    this._prefabCatalog = null;

    this.physics = new PhysicsWorld();
    this.vfxDirector = new VfxDirector({
      scene: this.scene,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash
    });

    this.drc = new DrcCombatController({
      character: this.character,
      abilities: this.abilities,
      camera: this.camera,
      physics: null,
      vfx: this.vfxDirector,
      aim: this.mouseAim,
      sessionState: this.session,
      onToast: (message) => this.hud.showToast(message),
      // Side effects applied once via session.change — toast only here
      onSession: () => {}
    });

    this._bindEvents();
    this.session.on('change', (snap, prev, reason) => this._onSessionChange(snap, prev, reason));
    // Bootstrap: apply gates without double toast
    this.session.setMode(settings.mode, { silent: true });
    this.session.setDrc(settings.drc?.session || 'combat', { silent: true });
    this.session.setElement(ELEMENTS[0], { silent: true });
    this._onSessionChange(this.session.snapshot(), null, 'boot');
    this.selectElement(ELEMENTS[0]);

    this._focusPoint = new Vector3();
  }

  /**
   * Single place for camera / inventory / HUD / keys from SessionState.
   * Controllers must not scatter these side effects.
   * @param {import('./SessionState.js').SessionSnapshot} snap
   * @param {import('./SessionState.js').SessionSnapshot|null} prev
   * @param {string} reason
   */
  _onSessionChange(snap, prev, reason) {
    const g = snap.gates;
    const modeChanged = !prev || prev.mode !== snap.mode;
    const drcChanged = !prev || prev.drc !== snap.drc;
    const rideChanged = !prev || prev.ridePhase !== snap.ridePhase;

    // Leaving walk / equip cancels ride machine
    if (modeChanged && snap.mode !== INTERACTION_MODE.WALK) {
      this.walk?.cancel?.();
    }
    if (drcChanged && snap.drc === DRC_SESSION.EQUIP) {
      this.walk?.cancel?.();
    }

    // Camera view from gates
    if (g.tpsCamera) this.rig.setViewMode('tps');
    else if (g.orbitCamera) this.rig.setViewMode('orbit');

    this.input.setCombatKeys?.(g.combatKeys);
    this.pathDrawer.setCombatMinLength?.(
      snap.drc === DRC_SESSION.COMBAT && snap.mode === INTERACTION_MODE.CASTING
        ? settings.staffCast?.combatMinPathLength ?? 0.9
        : null
    );

    if (g.inventoryOk) this.inventory?.setOpen?.(true);
    else if (drcChanged || modeChanged) this.inventory?.setOpen?.(false);

    // HUD mirrors session (no local mode/session forks)
    this.hud.setMode?.(snap.mode);
    this.hud.setDrcSession?.(snap.drc);
    if (this.hud.blurb) this.hud.blurb.textContent = this.session.blurb();

    if (modeChanged && reason !== 'boot') {
      if (snap.mode === INTERACTION_MODE.WALK) {
        this.inventory?.setOpen?.(false);
        if (this._assets && !this.walk.scooter?.ready) {
          this.walk.load(this._assets).catch(() => {});
        }
        this.hud.showToast('Windsurf · Space = deploy · draw path = course · WASD steer');
      } else {
        const meta = MODE_META[snap.mode];
        if (meta) this.hud.showToast(`${meta.hint} — ${meta.blurb}`);
      }
      this.editor?.refresh?.();
    }

    if (rideChanged && snap.freeriding && reason !== 'boot') {
      // Freeride implies combat skills on board
      if (snap.drc !== DRC_SESSION.COMBAT) this.session.setDrc(DRC_SESSION.COMBAT);
    }
  }

  /* ------------------------------------------------------------------ */

  _bindEvents() {
    this.renderer.onResize((width, height, pixelRatio) => {
      this.rig.resize(width, height);
      this.post.setSize(width, height, pixelRatio);
      this.dust.setPixelRatio(pixelRatio);
    });

    this.input.on('draw:start', (pointer) => this.pathDrawer.begin(pointer));
    this.input.on('draw:move', (pointer) => this.pathDrawer.move(pointer));
    this.input.on('draw:end', () => this.pathDrawer.end());

    this.input.on('element', (index) => {
      // Combat: digits fire skills; also keep element aligned with staff slot
      if (this.session.gates.combatSkills || this.drc.inCombat) {
        const el = ELEMENTS[index];
        if (el) this.selectElement(el);
        this.drc.useSkill(index);
        return;
      }
      this.selectElement(ELEMENTS[index]);
    });
    this.input.on('action', (action) => this._handleAction(action));
    this.input.on('sandboxVfx', (effectId) => {
      if (this.drc.previewSandboxEffect(effectId)) {
        this.hud.showToast(`VFX · ${effectId}`);
      }
    });

    // Path stroke meaning from SessionState.gates (not scattered settings.mode checks)
    this.pathDrawer.on('cast', (curve, _pts, _n, length = 0, holdSec = 0) => {
      const g = this.session.gates;
      if (g.pathIsRide) {
        if (!this.walk.begin(curve)) this.hud.showToast('Path too short to ride');
        return;
      }
      if (this.drc.inCombat) {
        this.pathDrawer.setCombatMinLength?.(settings.staffCast?.combatMinPathLength ?? 0.9);
        this.drc.castPathAbility?.(curve, length || curve?.getLength?.() || 0, holdSec);
        return;
      }
      this.abilities.cast(curve);
      this.character.playCastFlourish?.();
      const end = curve?.getPoint?.(1) || curve?.points?.[curve.points.length - 1];
      if (end) {
        this.character.setCasting?.(true, { aimX: end.x, aimY: end.y + 0.2, aimZ: end.z });
      } else {
        this.character.setCasting?.(true);
      }
    });

    this.hud.onSelect = (element) => this.selectElement(element);
    this.hud.onSkillSlot = (slot) => {
      if (this.drc.inCombat) this.drc.useSkill(slot);
    };
    this.hud.onMelee = () => {
      if (this.drc.inCombat) this.drc.useMeleeStrike?.();
    };
    this.hud.onQuickAction = (actionId) => {
      if (actionId === 'interact' || actionId === 'fskill') {
        this._tryBestAction();
        return;
      }
      this.drc.performQuickAction?.(actionId);
    };
    this.hud.onMenu = (menuId) => this._handleHudMenu(menuId);
    this.hud.onMode = (mode) => this.setMode(mode);

    // Combat hotkeys: E = block · C = parry · F = best-next-action (pickup/harvest/attack)
    this.input.on('combatAction', (actionId) => {
      if (actionId === 'interact') {
        this._tryBestAction();
        return;
      }
      this.drc.performQuickAction?.(actionId);
    });

    // Canvas drag-drop from bag → throw world drop
    const canvas = this.canvas;
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropBag?.handleCanvasDrop?.(e);
    });
  }

  _handleHudMenu(menuId) {
    switch (menuId) {
      case 'lab':
      case 'inventory':
        this.showcase?.setOpen?.(false);
        this.inventory.toggle();
        break;
      case 'showcase':
        this.inventory.setOpen?.(false);
        this.showcase?.toggle?.();
        break;
      case 'bag':
        this.dropBag?.toggle?.();
        break;
      case 'loot':
        this.spawnWorldLoot?.(3);
        break;
      case 'editor':
        this.editor.toggle();
        break;
      case 'help':
        this.hud.toggleHelp();
        break;
      case 'clear':
        this.clearEffects();
        this.worldDrops?.clear?.();
        this.hud.showToast('Effects + world drops cleared');
        break;
      case 'mainpanel':
        window.open('https://ui.grudge-studio.com/main-panel.html?era=warlords', '_blank', 'noopener');
        break;
      default:
        break;
    }
  }

  /**
   * F — best next action (context priority):
   *  1. Pickup nearby world drop
   *  2. Harvest nearby node (when wired)
   *  3. Standard attack / melee residual (combat) or weapon attack (equip)
   * E stays block; C stays parry — never steal those for interact.
   * @returns {boolean}
   */
  _tryBestAction() {
    // 1) World loot pickup
    if (this.worldDrops) {
      const bag = this.worldDrops.tryPickup(this.character.position, 2.4);
      if (bag) {
        this.dropBag?.add(bag);
        this.hud.showToast(`Picked up ${bag.name || 'item'}`);
        return true;
      }
    }

    // 2) Harvest / gather (Mine-Loader / Open pattern — hook when nodes exist)
    if (typeof this.tryHarvest === 'function') {
      const harvested = this.tryHarvest();
      if (harvested) return true;
    }
    if (this.worldHarvest?.tryInteract) {
      const ok = this.worldHarvest.tryInteract(this.character.position, 2.4);
      if (ok) {
        this.hud.showToast(typeof ok === 'string' ? ok : 'Harvested');
        return true;
      }
    }

    // 3) Standard attack (melee residual from tip when in combat)
    if (this.drc?.inCombat) {
      const ok =
        this.drc.useMeleeStrike?.() ||
        this.drc.performQuickAction?.('primary') ||
        false;
      return !!ok;
    }
    if (this.character.playWeaponAttack?.()) {
      this.hud.showToast('Attack');
      return true;
    }
    this.hud.showToast('F · nothing nearby');
    return false;
  }

  /**
   * Throw bag item to screen/world aim.
   * @param {object} item
   * @param {number} clientX
   * @param {number} clientY
   */
  async _throwBagItem(item, clientX, clientY) {
    if (!this.worldDrops || !item) return;
    this.mouseAim.updateFromClient(clientX, clientY, this.character.position);
    const to = this.mouseAim.valid
      ? this.mouseAim.point.clone()
      : this.character.position.clone().add(new Vector3(0, 0, 2));
    const from = this.character.position.clone();
    from.y += 1.2;
    await this.worldDrops.throwFrom(item, from, to);
    this.hud.showToast(`Threw ${item.name}`);
  }

  /**
   * Spawn sample prefab drops near player (loot demo).
   * @param {number} [count]
   */
  async spawnWorldLoot(count = 3) {
    if (!this.worldDrops) {
      this.hud.showToast('Drops not ready');
      return;
    }
    try {
      if (!this._prefabCatalog) {
        this.hud.showToast('Loading weapon prefabs…');
        this._prefabCatalog = await loadPrefabCatalog();
      }
      const cat = this._prefabCatalog;
      const origin = this.character.position;
      for (let i = 0; i < count; i++) {
        const p = pickSamplePrefab(cat, { maxTier: 5 });
        if (!p) continue;
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const r = 1.8 + Math.random() * 2.2;
        const pos = new Vector3(
          origin.x + Math.cos(ang) * r,
          0,
          origin.z + Math.sin(ang) * r
        );
        await this.worldDrops.spawn(p, pos);
      }
      this.hud.showToast(`Spawned ${count} world drops (icon+glow · F pickup)`);
    } catch (err) {
      console.warn(err);
      this.hud.showToast(err?.message || 'Prefab catalog failed');
    }
  }

  _handleAction(action) {
    const index = ELEMENTS.indexOf(this.abilities.selected);
    switch (action) {
      case 'nextElement':
        this.selectElement(ELEMENTS[(index + 1) % ELEMENTS.length]);
        break;
      case 'prevElement':
        this.selectElement(ELEMENTS[(index - 1 + ELEMENTS.length) % ELEMENTS.length]);
        break;
      case 'toggleDrcSession':
        this.drc.toggleSession();
        break;
      case 'toggleHelp':
        this.hud.toggleHelp();
        break;
      case 'toggleEditor':
        this.editor.toggle();
        break;
      case 'toggleInventory':
        if (this.drc.inCombat) this.drc.setSession('equip');
        else {
          this.showcase?.setOpen?.(false);
          this.inventory.toggle();
          this.hud.showToast(this.inventory.open ? 'Inventory open' : 'Inventory closed');
        }
        break;
      case 'toggleShowcase':
        this.inventory.setOpen?.(false);
        this.showcase?.toggle?.();
        this.hud.showToast(this.showcase?.open ? 'Showcase open' : 'Showcase closed');
        break;
      case 'toggleDropBag':
        this.dropBag?.toggle?.();
        break;
      case 'spawnLoot':
        this.spawnWorldLoot?.(4);
        break;
      case 'weaponAttack':
        // Legacy path — same as F best-next-action
        this._tryBestAction();
        break;
      case 'clear':
        this.clearEffects();
        this.character.setCasting?.(false);
        this.hud.showToast('Effects cleared');
        break;
      case 'togglePause':
        this.paused = !this.paused;
        this.session.setPaused(this.paused);
        this.hud.showToast(this.paused ? 'Paused' : 'Resumed');
        break;
      case 'togglePose': {
        const pose = this.character.togglePose();
        this.editor.refresh();
        this.hud.showToast(pose === 'sitting' ? 'Meditation pose' : 'Standing idle');
        break;
      }
      case 'toggleMode':
        this.setMode(MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length]);
        break;
      default:
        break;
    }
  }

  selectElement(element) {
    if (!element) return;
    this.session.setElement(element);
    this.abilities.select(element);
    this.hud.setElement(element);
  }

  /**
   * Walk mode Space edge → frontflip + sail deploy freeride (back-slot windsurf).
   * Gate: session.gates.freerideDeploy
   */
  _pollWindsurfDeploy() {
    if (!this.session.gates.freerideDeploy) {
      this._wasWalkSpace = this.input.keys.has('Space');
      return;
    }
    const space = this.input.keys.has('Space');
    const pressed = space && !this._wasWalkSpace;
    this._wasWalkSpace = space;
    if (!pressed) return;
    if (!this.walk.scooter?.ready && this._assets) {
      this.walk.load(this._assets).catch(() => {});
    }
    this.walk.beginFreeride({ yaw: this.character.facing });
    this.hud.showToast('Windsurf · frontflip deploy · sail from back');
  }

  /**
   * Interaction mode via SessionState (settings.mode mirrored for editor).
   * Side effects: session.change → _onSessionChange.
   */
  setMode(mode) {
    this.session.setMode(mode);
  }

  clearEffects() {
    this.walk.cancel();
    this.abilities.clear();
    this.particles.reset();
    this.decals.clear();
    this.bursts.clear();
    this.lights.reset();
    this.shake.reset();
    this.flash.reset();
    this.pathDrawer.trail.hide();
  }

  /* ------------------------------------------------------------------ */

  /** Load assets, warm the shader cache, then start the loop. */
  async load() {
    const assets = new AssetLoader();

    this.loading.setProgress(0.05, 'Init Rapier physics…');
    try {
      await this.physics.init();
      this.drc.setPhysics(this.physics);
      this.walk.setPhysics?.(this.physics);
      this.physics.setPlayerFeet(0, 0, 0);
    } catch (err) {
      console.warn('[App] Rapier init failed — kinematic fallback', err);
    }

    this.loading.setProgress(0.15, 'Loading environment…');
    const hdr = await assets.loadHDR(HDR_URL);
    await this.environment.loadEnvironment(hdr);
    frame.uEnvMap.value = this.environment.equirect;

    this.loading.setProgress(0.45, 'Loading Toon RTS kit (GLTF + Draco)…');
    await this.character.load(assets, { raceId: 'WK', presetId: 'mage' });
    // Feet at origin; keep model local ground from scaffold
    this.character.placeAt?.(0, 0, 0);
    this.character.resetPlacement?.();
    this.hud.setPlayerFrame?.({
      name: this.character.presetId || 'Hero',
      raceId: this.character.raceId,
      hp01: 1,
      sta01: 1
    });
    this.hud.refreshSkillLabels?.();
    this.inventory.refresh();
    // Prefetch master weapon skills for Showcase (non-blocking)
    loadWeaponSkillsCatalog()
      .then((cat) => {
        console.info(`[App] weapon skills catalog v${cat.version} · ${cat.totalSkills} skills`);
        const binds = loadSkillBindings();
        console.info('[App] skill bindings', binds);
      })
      .catch((err) => console.warn('[App] weapon skills catalog', err));

    // Windsurf package always available for walk mode (RideIK + deck sockets)
    this._assets = assets;
    this.walk.ctx.assets = assets;
    this.loading.setProgress(0.7, 'Loading windsurf board…');
    try {
      await this.walk.load(assets);
      console.info('[App] windsurf ready=', this.walk.scooter?.ready);
    } catch (err) {
      console.warn('[App] ride asset load failed', err);
    }

    // World drops (prefab icon + glow + model on terrain/ocean)
    this.worldDrops = new WorldDrops({
      scene: this.scene,
      camera: this.camera,
      assets,
      waterY: WORLD.waterY,
      groundY: 0,
      onToast: (m) => this.hud.showToast(m)
    });
    loadPrefabCatalog()
      .then((cat) => {
        this._prefabCatalog = cat;
        console.info(`[App] weapon prefabs ${cat.total} (icon/model presentation)`);
      })
      .catch((err) => console.warn('[App] prefab catalog', err));

    this.generatedCatalog = null;
    if (/[?&]props=1\b/.test(location.search)) {
      this.loading.setProgress(0.78, 'Generated props catalog…');
      try {
        const cat = await loadGeneratedCatalog();
        this.generatedCatalog = cat;
        if (cat.assets?.length) {
          await spawnGeneratedProp(assets, this.scene, {
            name: 'rock',
            position: [3.5, 0, -2]
          });
        }
      } catch (err) {
        console.warn('[App] generated props catalog unavailable', err);
      }
    }

    this.loading.setProgress(0.85, 'Compiling shaders…');
    await this.renderer.gl.compileAsync(this.scene, this.camera);

    // Game state: combat + physics capsule at feet + TPS camera on hero
    this.drc.setSession('combat');
    this.physics?.setPlayerFeet?.(0, 0, 0);
    this.character.placeAt?.(0, 0, 0);
    this.rig.snapToCharacter?.(0, 0, 0, this.character.facing);
    this.rig.setAnchor(0, 0, 0);
    this.rig.setCharacterYaw(this.character.facing);

    const vis = this.character._countVisibleSkinned?.() ?? -1;
    console.info(
      `[App] spawn visSkinned=${vis} root=`,
      this.character.position.x,
      this.character.position.y,
      this.character.position.z,
      'height=',
      this.character.height
    );

    this.loading.setProgress(1, 'Ready — DRC combat');
    this.loading.hide();
    this.hud.showToast('DRC Combat · WASD · 1–4 skills · F strike · Q equip', 2800);

    this.start();
  }

  start() {
    this.time.reset();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }

  /* ------------------------------------------------------------------ */

  frame() {
    const gl = this.renderer.gl;
    gl.info.reset();

    const raw = this.time.tick();
    const dt = this.paused ? 0 : raw * settings.global.timeScale;
    this.elapsed += dt;

    /* ---- shared uniforms ---- */
    frame.uTime.value = this.elapsed;
    frame.uDelta.value = dt;
    frame.uShaderIntensity.value = settings.global.shaderIntensity;
    frame.uGlobalGlow.value = settings.global.glow;
    frame.uCameraNear.value = this.camera.near;
    frame.uCameraFar.value = this.camera.far;

    /* ---- simulation ---- */
    this.renderer.syncSettings();
    // The editor and the preset system write `settings.mode` directly.
    if (settings.mode !== this._mode) this.setMode(settings.mode);

    this.environment.setFocus(this.character.position.x, this.character.position.z);
    this.environment.update();

    // Mouse aim → ground crosshair + body face (combat)
    const aimOn = this.drc.inCombat && settings.aim?.enabled !== false;
    if (aimOn) {
      this.mouseAim.updateFromNdc(this.input.pointer, this.character.position);
      if (this.aimMarker && settings.aim?.groundMarker !== false) {
        this.aimMarker.visible = this.mouseAim.valid;
        if (this.mouseAim.valid) {
          this.aimMarker.position.x = this.mouseAim.point.x;
          this.aimMarker.position.z = this.mouseAim.point.z;
          // Pulse scale by distance
          const d = this.mouseAim.distanceTo(this.character.position);
          const s = MathUtils.clamp(0.7 + d * 0.04, 0.7, 1.6);
          this.aimMarker.scale.setScalar(s);
        }
      }
      this.hud.setCrosshairVisible?.(settings.aim?.crosshair !== false);
    } else {
      if (this.aimMarker) this.aimMarker.visible = false;
      this.hud.setCrosshairVisible?.(false);
    }

    // Editor may flip settings.mode / settings.drc.session — pull into session
    if (settings.mode !== this.session.mode) this.session.syncFromSettings();

    // Windsurf: keys + Space deploy (gates); camera/keys already from session.change
    this.walk.setKeys?.(this.input.keys);
    if (this.session.mode === INTERACTION_MODE.WALK) {
      this._pollWindsurfDeploy();
    }

    // SSOT order: walk.update → character.update (mixer) → walk.applyRiderIk
    if (this.session.mode === INTERACTION_MODE.WALK || this.walk.active) this.walk.update(dt);
    this.drc.update(dt, this.input.keys);
    this.character.update(dt);
    if (this.session.mode === INTERACTION_MODE.WALK || this.walk.active) {
      this.walk.applyRiderIk?.(dt);
    }
    this.worldDrops?.update?.(dt);

    this.ground.update(this.elapsed);
    this.water?.update?.(this.elapsed);
    this.dust.update(this.elapsed, this.character.position);

    this.pathDrawer.update(raw);
    this.abilities.update(dt);

    const focusAbility = this.abilities.focus;
    const casting = this.abilities.active.length > 0;
    if (casting && focusAbility?.position) {
      this.character.setCasting?.(true);
    } else {
      this.character.setCasting?.(false);
    }

    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);

    /* ---- camera: always track character feet (world — works while board-parented) ---- */
    const feet = this.character.getWorldPosition?.() || this.character.position;
    const px = feet.x;
    const py = feet.y;
    const pz = feet.z;
    const focus = this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * 0.4, 0, 1));
    this.rig.setAnchor(px, py, pz);
    this.rig.setCharacterYaw(this.character.facing);
    this.shake.update(raw);
    this.flash.update(raw);
    this.rig.update(raw);

    this.contactShadows.setPosition(px, pz);
    this.contactShadows.render(this.scene);

    /* ---- render ---- */
    // Exactly one cascade shadow update per frame (see Renderer).
    gl.shadowMap.needsUpdate = true;
    this.post.sync(this.elapsed, this.flash);
    this.post.render();

    this.hud.update(raw, () => ({
      particles: this.particles.countLive(this.elapsed),
      calls: gl.info.render.calls,
      abilities: this.abilities.active.length,
      stamina: this.drc.stamina,
      cooldown01: (slot) => {
        const skill = this.drc.skills.find((s) => s.slot === slot);
        return skill ? this.drc.cooldown01(skill.id) : 0;
      },
      meleeCd01: this.drc.cooldown01?.('drc_melee_strike') ?? 0,
      quickCd01: (actionId) => this.drc.quickCd01?.(actionId) ?? 0,
      player: {
        name: this.character.presetId || 'Hero',
        raceId: this.character.raceId,
        hp01: 1,
        sta01: (this.drc.stamina ?? 100) / 100
      },
      target: null
    }));
  }

  /* ------------------------------------------------------------------ */

  dispose() {
    this.stop();
    this.input.dispose();
    this.pathDrawer.dispose();
    this.abilities.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.bursts.dispose();
    this.lights.dispose();
    this.walk.dispose();
    this.character.dispose();
    this.water?.dispose?.();
    this.ground.dispose();
    this.dust.dispose();
    this.contactShadows.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.editor.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }
}
