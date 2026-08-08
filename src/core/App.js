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

const HDR_URL = './hdri/spruit_sunrise.hdr';

/**
 * Application root: owns every subsystem and the frame loop.
 *
 * The wiring is deliberately one-directional — App builds the systems, hands
 * each ability a context object of the shared services, and then does nothing
 * but order the per-frame updates. No subsystem reaches back into App.
 */
export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = new Time();
    this.elapsed = 0;
    this.paused = false;
    this._raf = 0;

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
      onToast: (message) => this.hud.showToast(message),
      onSession: (session) => this._onDrcSession(session)
    });

    this._bindEvents();
    this._mode = null;
    this.setMode(settings.mode);
    this.selectElement(ELEMENTS[0]);
    this._onDrcSession(this.drc.session);

    this._focusPoint = new Vector3();
  }

  _onDrcSession(session) {
    settings.drc.session = session;
    // Combat → TPS follow (OrbitControls off). Equip → orbit + inventory.
    this.rig.setViewMode(session === 'combat' ? 'tps' : 'orbit');
    this.input.setCombatKeys?.(session === 'combat');
    this.pathDrawer.setCombatMinLength?.(
      session === 'combat' ? settings.staffCast?.combatMinPathLength ?? 0.9 : null
    );
    if (session === 'equip') {
      this.inventory.setOpen(true);
      this.walk?.cancel?.();
    } else {
      this.inventory.setOpen(false);
    }
    this.hud.setDrcSession?.(session);
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
      // In DRC combat, digits 1–4 are weapon skills; element cycle stays on E
      if (this.drc.inCombat) {
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

    // Path stroke: walk = ride; combat = staff place/stream; casting = free element cast.
    this.pathDrawer.on('cast', (curve, _pts, _n, length = 0, holdSec = 0) => {
      if (settings.mode === 'walk') {
        if (!this.walk.begin(curve)) this.hud.showToast('Path too short to ride');
        return;
      }
      if (this.drc.inCombat) {
        // LMB hold-draw: AOE place · ice spikes · wall · stream (staffCast SSOT)
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
      this.drc.performQuickAction?.(actionId);
    };
    this.hud.onMenu = (menuId) => this._handleHudMenu(menuId);
    this.hud.onMode = (mode) => this.setMode(mode);

    // Danger Room combat hotkeys (X/C/E/R/F/J/H/V)
    // E near a drop = pickup into bag (overrides guard when successful)
    this.input.on('combatAction', (actionId) => {
      if (actionId === 'block' && this.worldDrops) {
        const bag = this.worldDrops.tryPickup(this.character.position, 2.4);
        if (bag) {
          this.dropBag?.add(bag);
          return;
        }
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
      this.hud.showToast(`Spawned ${count} world drops (icon+glow · E pickup)`);
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
        // F = melee residual (attack + Getsuga from tip) — not digit slot 4 / not Space
        if (this.drc.inCombat) {
          this.drc.useMeleeStrike?.() || this.drc.useSkill(3);
        } else if (this.character.playWeaponAttack?.()) {
          this.hud.showToast('Weapon attack');
        } else this.hud.showToast('No attack clip');
        break;
      case 'clear':
        this.clearEffects();
        this.character.setCasting?.(false);
        this.hud.showToast('Effects cleared');
        break;
      case 'togglePause':
        this.paused = !this.paused;
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
    this.abilities.select(element);
    this.hud.setElement(element);
  }

  /**
   * Switch between casting and walking.
   *
   * `settings.mode` is the source of truth — the editor writes it directly and
   * the frame loop notices — so this is also the sync point for presets and
   * "reset to defaults".
   */
  setMode(mode) {
    const next = MODES.includes(mode) ? mode : MODES[0];
    const changed = this._mode !== next;
    this._mode = next;
    settings.mode = next;

    if (next !== 'walk') {
      this.walk.cancel();
    } else {
      // Path-ride: leave combat WASD, use orbit for draw; keep inventory closed
      if (this.drc.inCombat) this.drc.setSession('equip');
      this.inventory?.setOpen?.(false);
      this.rig.setViewMode('orbit');
      if (this._assets && !this.walk.scooter?.ready) {
        this.walk.load(this._assets).catch(() => {});
      }
    }
    this.hud.setMode(next);
    if (changed) this.hud.showToast(`${MODE_META[next].hint} — ${MODE_META[next].blurb}`);
    this.editor.refresh();
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

    // Walk ride owns root while active; DRC yields when character._rideActive
    if (settings.mode === 'walk' || this.walk.active) this.walk.update(dt);
    this.drc.update(dt, this.input.keys);
    // Mixer then RideIK (CharacterController.update runs post-mixer IK)
    this.character.update(dt);
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

    /* ---- camera: always track character feet (world root) ---- */
    const px = this.character.position.x;
    const py = this.character.position.y;
    const pz = this.character.position.z;
    const focus = this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * 0.4, 0, 1));
    this.rig.setAnchor(px, py, pz);
    this.rig.setCharacterYaw(this.character.facing);
    this.shake.update(raw);
    this.flash.update(raw);
    this.rig.update(raw);

    this.contactShadows.setPosition(this.character.position.x, this.character.position.z);
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
