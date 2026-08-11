import { Vector3, MathUtils } from 'three';

import { Renderer } from './Renderer.js';
import { Time } from './Time.js';
import { CameraRig } from './CameraRig.js';
import { frame } from './FrameUniforms.js';

import { Environment } from '../world/Environment.js';
import { Ground } from '../world/Ground.js';
import { StageWater } from '../world/StageWater.js';
import { OpenSeaShells } from '../world/OpenSeaShells.js';
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
import {
  LinearSkillBridge,
  LINEAR_HOTKEYS,
  PRODUCT_TO_LINEAR
} from '../skillshot/LinearSkillBridge.js';
import { PostProcessing } from '../postprocessing/PostProcessing.js';

import { HUD, LoadingScreen } from '../ui/HUD.js';
import { Editor } from '../ui/Editor.js';
import { InventoryPanel } from '../ui/InventoryPanel.js';
import { AdminHub } from '../ui/AdminHub.js';
import { ShowcasePanel } from '../ui/ShowcasePanel.js';
import { DrcCombatController } from '../combat/DrcCombatController.js';
import { loadWeaponSkillsCatalog } from '../api/weaponSkillsCatalog.js';
import { loadSkillBindings } from '../combat/skillBindings.js';
import { loadPrefabCatalog, pickSamplePrefab, bagItemFromPresent } from '../loot/prefabAssets.js';
import { WorldDrops } from '../world/WorldDrops.js';
import { DevIslandHarvest } from '../world/DevIslandHarvest.js';
import { HARVEST_RANGE_M } from '../world/devIslandCatalog.js';
import { DropBag } from '../ui/DropBag.js';
import '../ui/dropBag.css';
import {
  applyWarlordsUiCssVars,
  preloadWarlordsUi
} from '../ui/warlordsUiSkin.js';
import {
  configureWarlordsCursors,
  setCursorIntent,
  preloadWarlordsCursors,
  intentFromInteractKind
} from '../ui/warlordsCursors.js';
import '../ui/warlords-dev-ui.css';
import { ModeRadial } from '../ui/ModeRadial.js';
import {
  RADIAL_HOLD_S,
  nextActivityMode,
  HARVEST_TOOL_RADIAL,
  MODE_LABEL,
  DEFAULT_HARVEST_TOOL
} from '../combat/playerActivity.js';
import {
  createPlayerActivityActor,
  activityFromSnap,
  toolIdFromSnap,
  DEFAULT_TOOL_ID
} from '../combat/playerActivityMachine.js';
import { getEquippedWeapon } from '../combat/equippedWeaponRuntime.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { VfxDirector } from '../vfx/VfxDirector.js';
import { loadGeneratedCatalog, spawnGeneratedProp } from '../assets/generatedCatalog.js';

import { settings, ELEMENTS, MODES, MODE_META } from '../config/settings.js';
import { SessionState, INTERACTION_MODE, DRC_SESSION } from './SessionState.js';
import {
  resolvePlayerIdentity,
  displayNameForKit
} from '../player/playerIdentity.js';
import { raceDef } from '../config/grudge6SSOT.js';
import { CombatFocus } from '../combat/CombatFocus.js';
import {
  skillNeedsGroundMarker,
  inferDeliveryPattern,
  deliveryNeedsGroundMarker
} from '../combat/skillDelivery.js';
import { skillBySlot, skillForFKey } from '../combat/drcSkills.js';

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

    /**
     * Linear skillshots (LinearAbilityCastingThreeJS learnings):
     * ice/thunder/meteor/beam/snare/glacier + MOBA aim indicators.
     * Coexists with path-cast fire/storm/ice/nature/holy/arcane pools.
     */
    this.linearSkills = new LinearSkillBridge({
      scene: this.scene,
      camera: this.camera,
      environment: this.environment,
      particles: this.particles,
      lights: this.lights,
      decals: this.decals,
      bursts: this.bursts,
      shake: this.shake,
      flash: this.flash,
      character: null, // filled after CharacterController
      onToast: (m) => this.hud?.showToast?.(m)
    });

    /* ---- character ---- */
    this.character = new CharacterController(this.environment);
    this.scene.add(this.character.root);
    this.linearSkills.ctx.character = this.character;

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
    this.combatFocus = new CombatFocus();
    this.rig.setCombatFocus?.(this.combatFocus);
    this.combatFocus.on('toast', (msg) => this.hud.showToast(msg));
    this.combatFocus.on('focus', (on) => {
      this.hud.setCrosshairVisible?.(!!on);
      this.hud.root?.classList.toggle('hud--focus', !!on);
      this._applyMouseLockForFocus(!!on);
      // Focus play: purge editor / admin / equip chrome so look is pure combat
      if (on) {
        this.editor?.close?.();
        if (this.adminHub?.open) this.adminHub.setOpen?.(false);
        if (this.drc?.session === 'equip') this.drc.setSession?.('combat');
        if (this.session.mode === INTERACTION_MODE.WALK && !this.session.riding) {
          // Stay walk only if freeriding; land combat wants casting mode for TPS
          // Keep current mode if freeriding skills
        } else if (this.session.mode !== INTERACTION_MODE.CASTING && !this.session.freeriding) {
          this.session.setMode?.(INTERACTION_MODE.CASTING, { silent: true });
        }
        this.rig.setViewMode?.('tps');
        this.rig.enterFocusLook?.();
        if (settings.aim?.softLockOnFocus !== false) {
          const feet = this.character?.position || this.character?.root?.position;
          const fwd = this.rig.getCameraForward?.(new Vector3());
          if (feet) {
            this.combatFocus.acquireBest?.(feet, fwd) ||
              this.combatFocus.acquireNearest?.(feet, fwd);
          }
        }
        const t = this.combatFocus.selectedTarget;
        if (t) {
          this.hud.setTargetFrame?.({
            name:
              t.mesh?.userData?.displayName ||
              t.mesh?.name ||
              t.kind ||
              'Target',
            hp01: Number.isFinite(t.mesh?.userData?.hp01)
              ? t.mesh.userData.hp01
              : 1,
            present: true
          });
          this.hud.root?.classList.add('hud--softlock');
        }
        this.hud.showToast?.(
          t
            ? `Focus · soft-lock ${t.mesh?.userData?.displayName || t.mesh?.name || 'target'} · LMB attack`
            : 'Focus · mouse look · crosshair · Tab cycle · LMB attack',
          2200
        );
      } else {
        this.hud.root?.classList.remove('hud--softlock');
      }
    });
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
    // Warlords-era bag shells + pirate cursor theme (dev island gameplay chrome)
    applyWarlordsUiCssVars(document.documentElement);
    void preloadWarlordsUi();
    void preloadWarlordsCursors();
    configureWarlordsCursors({
      theme: 'pirate',
      enabled: true,
      target: canvas,
      root: document.body
    });
    setCursorIntent('default');

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
        this._syncPlayerFrame();
        this.hud.refreshSkillLabels?.();
      },
      onRace: async (raceId) => {
        await this.character.setRace(raceId);
        if (this._playerIdentity) {
          this._playerIdentity.raceId = raceId;
          // Keep custom name; refresh kit default when name came from kit
          if (
            this._playerIdentity.source === 'kit' ||
            this._playerIdentity.source === 'kit-default'
          ) {
            this._playerIdentity.displayName = displayNameForKit(
              raceId,
              this._playerIdentity.roleId
            );
            this._playerIdentity.raceLabel = raceDef(raceId).label;
          }
        }
        this._syncPlayerFrame();
        this.hud.showToast(`Race · ${raceDef(raceId).label}`);
      },
      onMode: (mode) => this.setMode(mode),
      onMountToggle: () => {},
      getDrc: () => this.drc
    });
    // Admin F1 + deep links open Main Panel tabs
    if (typeof window !== 'undefined') {
      window.__castingInventory = this.inventory;
    }

    /** F1–F5 admin tools: player · assets · creatures · prefabs · world */
    this.adminHub = new AdminHub({
      character: this.character,
      getDrc: () => this.drc,
      session: this.session,
      onToast: (message) => this.hud.showToast(message),
      onOpenInventoryPrefabs: () => {
        this.showcase?.setOpen?.(false);
        this.inventory.openTab?.('prefabs');
      },
      onHelp: () => this.hud.toggleHelp(),
      spawnLoot: (n) => this.spawnWorldLoot?.(n),
      respawnHarvest: async () => {
        await this.worldHarvest?.spawnDefaultLayout?.();
        await this.worldHarvest?.spawnDecor?.();
      },
      equipHarvestTool: () => this._equipHarvestTool?.(),
      respawnDummies: () => this.worldHarvest?.spawnTrainingDummies?.()
    });

    this.showcase = new ShowcasePanel({
      character: this.character,
      getDrc: () => this.drc,
      onToast: (message) => this.hud.showToast(message),
      onRace: async (raceId) => {
        await this.character.setRace(raceId);
        if (this._playerIdentity) {
          this._playerIdentity.raceId = raceId;
          if (
            this._playerIdentity.source === 'kit' ||
            this._playerIdentity.source === 'kit-default'
          ) {
            this._playerIdentity.displayName = displayNameForKit(
              raceId,
              this._playerIdentity.roleId
            );
          }
        }
        this._syncPlayerFrame();
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

    /** Activity: combat | harvest (Open Hold-Q parity) — XState owns pure mode/hand/tool */
    this.activityMode = 'combat';
    this.harvestToolId = DEFAULT_HARVEST_TOOL || DEFAULT_TOOL_ID || 'pick';
    this._combatWeaponId = null;
    this.activityActor = createPlayerActivityActor({
      onTransition: (snap) => {
        this.activityMode = activityFromSnap(snap);
        this.harvestToolId = toolIdFromSnap(snap);
        this.input.setActivityMode?.(this.activityMode);
      }
    });
    this.modeRadial = new ModeRadial();
    this._qHold = { armed: false, t: 0, open: false };
    this._rHold = { armed: false, t: 0, open: false };
    this.input.setActivityMode?.(this.activityMode);

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
      combatFocus: this.combatFocus,
      sessionState: this.session,
      scene: this.scene,
      onToast: (message) => this.hud.showToast(message),
      onCastBar: (st) => this.hud.setCastBar?.(st),
      // Side effects applied once via session.change — toast only here
      onSession: () => {}
    });
    // Warm fire/ice summon projectiles (extracted SI meshes)
    this.drc.projectiles?.warm?.().catch?.(() => {});

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
        this.hud.showToast('Windsurf · Space deploy vehicle · E get off · WASD steer · draw path = course');
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

    // LMB: skillshot confirm · focus→attack · free→select · else path draw
    this.input.getLmbMode = () => this._lmbMode();
    this.input.on('lmb:attack', () => {
      if (this.linearSkills?.aim?.isArmed) {
        this.linearSkills.confirm();
        return;
      }
      this._onLmbAttack();
    });
    this.input.on('lmb:select', (ptr) => {
      if (this.linearSkills?.aim?.isArmed) {
        this.linearSkills.aim.point(ptr);
        this.linearSkills.confirm();
        return;
      }
      this._onLmbSelect(ptr);
    });
    this.input.on('draw:start', (pointer) => {
      if (this.linearSkills?.aim?.isArmed) {
        this.linearSkills.aim.point(pointer);
        this.linearSkills.confirm();
        return;
      }
      this.pathDrawer.begin(pointer);
    });
    this.input.on('draw:move', (pointer) => {
      if (this.linearSkills?.aim?.isArmed) {
        this.linearSkills.aim.point(pointer);
        return;
      }
      this.pathDrawer.move(pointer);
    });
    this.input.on('draw:end', () => {
      if (this.linearSkills?.aim?.isArmed) return;
      this.pathDrawer.end();
    });

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
    this.input.on('action', (action, detail) => this._handleAction(action, detail));
    this.input.on('sandboxVfx', (effectId) => {
      if (this.drc.previewSandboxEffect(effectId)) {
        this.hud.showToast(`VFX · ${effectId}`);
      }
    });
    // Linear skillshots (Alt+Shift+Q/E/R/F/V/G)
    this.input.on('linearSkill', (id) => {
      const feet = this.character?.position || this.character?.root?.position;
      if (!feet || !this.linearSkills) return;
      this.linearSkills.select(id);
      this.linearSkills.arm(feet);
      // Intensity follows settings.global.shaderIntensity if present
      const inten = settings.global?.shaderIntensity ?? 1;
      this.linearSkills.applyIntensity(inten);
    });

    // Path stroke meaning from SessionState.gates (not scattered settings.mode checks)
    this.pathDrawer.on('cast', (curve, _pts, _n, length = 0, holdSec = 0) => {
      const g = this.session.gates;
      // Freeride: path = cast (ranged/staff), never re-deploy course
      if (g.pathIsRide && !this.session.freeriding) {
        if (!this.walk.begin(curve)) this.hud.showToast('Path too short to ride');
        return;
      }
      if (this.drc.inCombat || this.session.freeriding) {
        this.pathDrawer.setCombatMinLength?.(settings.staffCast?.combatMinPathLength ?? 0.9);
        const ok = this.drc.castPathAbility?.(curve, length || curve?.getLength?.() || 0, holdSec);
        if (!ok) {
          this.abilities.cast(curve);
          this.character.playCastFlourish?.();
        }
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
      // F slot = weapon skill (not residual)
      if (this.drc.inCombat) this.drc.useWeaponSkillF?.();
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
      case 'admin':
        this.adminHub?.openTab?.('prefabs');
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
   * F — context priority then weapon skill:
   *  1. Pickup nearby world drop
   *  2. Harvest nearest node within 5 m (tool in hand when required)
   *  3. Equipped weapon skill (primary / Showcase F bind) — cast times + prefabs
   * Class abilities deferred. Residual is not F.
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

    // 2) Harvest — always try if node in range; harvest mode prioritizes over skills
    const wantHarvest =
      this.activityMode === 'harvest' ||
      this.worldHarvest?.nearestAlive?.(this.character.position, HARVEST_RANGE_M);
    if (wantHarvest) {
      if (typeof this.tryHarvest === 'function') {
        const harvested = this.tryHarvest();
        if (harvested) return true;
      }
      if (this.worldHarvest?.tryInteract) {
        const ok = this.worldHarvest.tryInteract(
          this.character.position,
          HARVEST_RANGE_M
        );
        if (ok) return true;
      }
      if (this.activityMode === 'harvest') {
        this.hud.showToast('No harvest node ≤5 m');
        return true;
      }
    }

    // 3) Weapon skill F (prefab + cast bar path) — combat mode
    if (this.drc?.inCombat) {
      return !!(
        this.drc.useWeaponSkillF?.() ||
        this.drc.performQuickAction?.('fskill') ||
        false
      );
    }
    if (this.character.playWeaponAttack?.()) {
      this.hud.showToast('Equip combat (Q) for weapon skills');
      return true;
    }
    this.hud.showToast('F · nothing nearby');
    return false;
  }

  /**
   * Explicit harvest attempt (nearest ≤5 m). Used by F chain + Admin.
   * @returns {boolean}
   */
  tryHarvest() {
    if (!this.worldHarvest) return false;
    const pos = this.character?.position || this.character?.root?.position;
    if (!pos) return false;
    const ok = this.worldHarvest.tryHarvestNearest(pos, HARVEST_RANGE_M);
    return !!ok;
  }

  /**
   * Equip t0-tool for mine/chop harvest swings (sword_shield attack anim).
   */
  async _equipHarvestTool() {
    try {
      const { equipWeaponById } = await import('../combat/equippedWeaponRuntime.js');
      const { setActiveSkillTree } = await import('../combat/drcSkills.js');
      await equipWeaponById('t0-tool', {
        character: this.character,
        onToast: (m) => this.hud.showToast(m)
      });
      setActiveSkillTree?.('equipped');
      this.hud.refreshSkillLabels?.();
      this.hud.showToast('Tool equipped · F harvest nearest ≤5 m');
    } catch (err) {
      this.hud.showToast(err?.message || 't0-tool equip failed');
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
      this.hud.showToast(`Spawned ${count} world drops (icon+glow · F pickup)`);
    } catch (err) {
      console.warn(err);
      this.hud.showToast(err?.message || 'Prefab catalog failed');
    }
  }

  _handleAction(action, detail) {
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
      case 'qHoldStart':
        this._beginQHold();
        break;
      case 'qHoldEnd':
        this._endQHold();
        break;
      case 'rHoldStart':
        this._beginRHold();
        break;
      case 'rHoldEnd':
        this._endRHold();
        break;
      case 'toggleHelp':
        this.hud.toggleHelp();
        break;
      case 'adminTab': {
        // F1–F4 · ] World → Admin Hub
        const key = typeof detail === 'string' ? detail : 'F4';
        this.adminHub?.openByKey?.(key);
        break;
      }
      case 'toggleAutoTraverse': {
        const on = this.drc?.toggleAutoTraverse?.();
        // Freeride: keep board thrust via auto KeyW inject in input.keys
        if (on) this.input?.keys?.add?.('KeyW');
        else this.input?.keys?.delete?.('KeyW');
        break;
      }
      case 'cycleTarget': {
        // Tab / Shift+Tab soft-lock (grudge-combat-targeting)
        if (settings.aim?.tabCycleTargets === false) break;
        const feet = this.character?.position || this.character?.root?.position;
        if (!feet || !this.combatFocus) break;
        const reverse = !!(detail && detail.reverse);
        // Focus + soft lock engage when cycling
        if (!this.combatFocus.focusEnabled) {
          this.combatFocus.focusEnabled = true;
          this.combatFocus.showCrosshair = true;
          this.combatFocus.softLockEnabled = true;
          this.combatFocus.emit('focus', true);
          this._applyMouseLockForFocus?.(true);
        }
        this.combatFocus.softLockEnabled = true;
        const fwd = this.rig.getCameraForward?.(new Vector3());
        this.combatFocus.cycleTarget(feet, reverse, fwd);
        // HUD target frame
        const t = this.combatFocus.selectedTarget;
        if (t) {
          const label =
            t.mesh?.userData?.displayName ||
            t.mesh?.name ||
            t.kind ||
            'Target';
          this.hud.setTargetFrame?.({
            name: label,
            hp01: Number.isFinite(t.mesh?.userData?.hp01)
              ? t.mesh.userData.hp01
              : 1,
            present: true
          });
        } else {
          this.hud.setTargetFrame?.(null);
        }
        break;
      }
      case 'closeAdmin':
        this.linearSkills?.cancel?.();
        if (this.adminHub?.open) {
          this.adminHub.setOpen(false);
          this.hud.showToast('Admin closed');
        }
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
   * Combat LMB routing (grudge-combat-targeting):
   *  focus ON  → attack
   *  focus OFF → select (unlocked mouse)
   *  casting / walk path → draw
   * @returns {'draw'|'attack'|'select'}
   */
  _lmbMode() {
    // Skillshot armed → free cursor confirm (not path draw)
    if (this.linearSkills?.aim?.isArmed) return 'select';
    // Freeride + ranged/staff: non-focus path cast (unlocked cursor)
    if (this.session?.freeriding && this._isRangedOrStaffEquipped()) {
      return 'draw';
    }
    if (!this.drc?.inCombat) return 'draw';
    // Walk land (not mounted): draw course for windsurf path
    if (this.session?.mode === INTERACTION_MODE.WALK && !this.session?.riding) return 'draw';
    if (this.session?.mode === INTERACTION_MODE.WALK && this.session?.freeriding) {
      return this._isRangedOrStaffEquipped() ? 'draw' : 'select';
    }
    if (this.combatFocus?.focusEnabled) return 'attack';
    return 'select';
  }

  /**
   * Staff / bow / wand / magic = freeride non-focus cast path.
   */
  _isRangedOrStaffEquipped() {
    const w = getEquippedWeapon?.() || this.character?.weapon || null;
    const id = `${w?.id || ''} ${w?.weaponType || ''} ${w?.animPack || ''}`.toLowerCase();
    if (/staff|wand|bow|longbow|crossbow|gun|pistol|rifle|magic|tome|spell/.test(id)) return true;
    const pack = this.character?.animPack || this.character?.activePack || '';
    if (/magic|longbow|pistol|bow/.test(String(pack))) return true;
    // Default staff casting lab
    if (!w) return true;
    return false;
  }

  /* ── Hold Q / R radials (Open parity) ───────────────────────── */

  _beginQHold() {
    this._qHold = { armed: true, t: 0, open: false };
  }

  _endQHold() {
    if (!this._qHold?.armed && !this._qHold?.open) return;
    if (this._qHold.open) {
      const aim = this.modeRadial?.getAimId?.();
      if (aim === 'mode_harvest') this.setActivityMode('harvest');
      else if (aim === 'mode_combat') this.setActivityMode('combat');
      this.modeRadial?.hide?.();
    } else if (this._qHold.armed && this._qHold.t < RADIAL_HOLD_S) {
      // Tap Q → toggle combat ↔ harvest
      this.setActivityMode(nextActivityMode(this.activityMode));
    }
    this._qHold = { armed: false, t: 0, open: false };
  }

  _beginRHold() {
    if (this.activityMode !== 'harvest') return;
    this._rHold = { armed: true, t: 0, open: false };
  }

  _endRHold() {
    if (!this._rHold?.armed && !this._rHold?.open) return;
    if (this._rHold.open) {
      const aim = this.modeRadial?.getAimId?.();
      if (aim) this._selectHarvestTool(aim);
      this.modeRadial?.hide?.();
    } else if (this._rHold.armed && this._rHold.t < RADIAL_HOLD_S) {
      // Tap R → draw last used tool (default pick) without radial
      this._drawLastHarvestTool();
    }
    this._rHold = { armed: false, t: 0, open: false };
  }

  /**
   * @param {'combat'|'harvest'} mode
   */
  async setActivityMode(mode) {
    const next = mode === 'harvest' ? 'harvest' : 'combat';
    const prev = this.activityMode;
    if (next === prev) {
      this.hud.showToast?.(`${MODE_LABEL[next]} mode`);
      return;
    }

    if (next === 'harvest') {
      // Stow combat weapon memory → draw last tool (default pick)
      const eq = getEquippedWeapon?.();
      const combatId = eq?.id || this._combatWeaponId || null;
      this._combatWeaponId = combatId;
      this.activityActor?.send?.({
        type: 'ENTER_HARVEST',
        combatWeaponId: combatId,
        toolId: this.harvestToolId || DEFAULT_TOOL_ID
      });
      await this._applyHandForHarvest(this.harvestToolId || DEFAULT_TOOL_ID);
    } else {
      // Stow tool → restore combat weapon
      this.activityActor?.send?.({
        type: 'ENTER_COMBAT',
        combatWeaponId: this._combatWeaponId
      });
      await this._applyHandForCombat();
      if (this.drc?.session === 'equip') {
        this.drc.setSession?.('combat');
      }
    }

    this.activityMode = next;
    this.input.setActivityMode?.(next);
    this.hud.showToast?.(
      `${MODE_LABEL[next]} mode · Hold Q switch · ${
        next === 'harvest'
          ? 'F nearest · Hold R tools · Tap R last tool'
          : 'F skill · 1–4 · weapon restored'
      }`
    );
    this.hud.root?.classList.toggle('hud--harvest', next === 'harvest');
  }

  /** Tap R / machine DRAW_LAST_TOOL — pull last tool, default pick. */
  async _drawLastHarvestTool() {
    if (this.activityMode !== 'harvest') return;
    this.activityActor?.send?.({ type: 'DRAW_LAST_TOOL' });
    const toolId =
      this.activityActor?.getSnapshot?.()?.context?.toolId ||
      this.harvestToolId ||
      DEFAULT_TOOL_ID;
    await this._selectHarvestTool(toolId, { quiet: false, fromTapR: true });
  }

  /**
   * Harvest enter: put away weapon mesh, equip tool.
   * @param {string} toolId
   */
  async _applyHandForHarvest(toolId) {
    await this._selectHarvestTool(toolId || DEFAULT_TOOL_ID, { quiet: true });
  }

  /** Combat enter: restore stashed weapon (or default staff/sword). */
  async _applyHandForCombat() {
    const id = this._combatWeaponId;
    try {
      const { equipWeaponById, unequipWeapon } = await import(
        '../combat/equippedWeaponRuntime.js'
      );
      const { setActiveSkillTree } = await import('../combat/drcSkills.js');
      if (id) {
        await equipWeaponById(id, {
          character: this.character,
          onToast: (m) => this.hud.showToast(m)
        });
        setActiveSkillTree?.('equipped');
      } else {
        // Default combat hand: wand/staff for casting lab if nothing stashed
        try {
          await equipWeaponById('t0-wand', {
            character: this.character,
            onToast: () => {}
          });
          setActiveSkillTree?.('equipped');
        } catch {
          unequipWeapon?.({ character: this.character, onToast: () => {} });
        }
      }
      this.hud.refreshSkillLabels?.();
    } catch (e) {
      this.hud.showToast?.(e?.message || 'Restore weapon failed');
    }
  }

  /**
   * @param {string} toolId
   * @param {{ quiet?: boolean, fromTapR?: boolean }} [opts]
   */
  async _selectHarvestTool(toolId, opts = {}) {
    const def = HARVEST_TOOL_RADIAL.find((t) => t.id === toolId);
    if (!def) return;
    this.activityActor?.send?.({ type: 'SELECT_TOOL', toolId });
    this.harvestToolId = toolId;
    if (toolId === 'back_slot') {
      this.setMode('walk');
      if (!opts.quiet) this.hud.showToast('Back slot · Surf (M) · Space deploy windsurf');
      return;
    }
    if (toolId === 'hand') {
      try {
        const { unequipWeapon } = await import('../combat/equippedWeaponRuntime.js');
        unequipWeapon({ character: this.character, onToast: (m) => this.hud.showToast(m) });
      } catch {
        /* ok */
      }
      if (!opts.quiet) this.hud.showToast('Hands · gather herbs / pebbles');
      return;
    }
    if (def.weaponId) {
      try {
        const { equipWeaponById } = await import('../combat/equippedWeaponRuntime.js');
        const { setActiveSkillTree } = await import('../combat/drcSkills.js');
        await equipWeaponById(def.weaponId, {
          character: this.character,
          onToast: opts.quiet ? () => {} : (m) => this.hud.showToast(m)
        });
        setActiveSkillTree?.('equipped');
        this.hud.refreshSkillLabels?.();
        if (!opts.quiet) {
          this.hud.showToast(
            opts.fromTapR
              ? `Tool · ${def.label} (last) · F harvest ≤5 m`
              : `Tool · ${def.label} · F harvest nearest ≤5 m`
          );
        }
      } catch (e) {
        this.hud.showToast(e?.message || `Equip ${def.label} failed`);
      }
    }
  }

  _tickRadials(dt) {
    const cx = this.input?.clientX ?? window.innerWidth * 0.5;
    const cy = this.input?.clientY ?? window.innerHeight * 0.5;

    if (this._qHold?.armed || this._qHold?.open) {
      this._qHold.t += dt;
      if (this._qHold.t >= RADIAL_HOLD_S && !this._qHold.open) {
        this._qHold.open = true;
        // Unlock cursor for wedge aim
        if (this.combatFocus?.focusEnabled) {
          this.combatFocus.focusEnabled = false;
          this.combatFocus.emit?.('focus', false);
        }
        setCursorIntent('default', { force: true });
        this.modeRadial.show({
          kind: 'mode',
          current: this.activityMode,
          aimId: this.activityMode === 'harvest' ? 'mode_harvest' : 'mode_combat'
        });
      }
      if (this._qHold.open) this.modeRadial.aimFromPointer(cx, cy);
    }

    if (this._rHold?.armed || this._rHold?.open) {
      this._rHold.t += dt;
      if (this._rHold.t >= RADIAL_HOLD_S && !this._rHold.open) {
        this._rHold.open = true;
        if (this.combatFocus?.focusEnabled) {
          this.combatFocus.focusEnabled = false;
          this.combatFocus.emit?.('focus', false);
        }
        setCursorIntent('default', { force: true });
        this.modeRadial.show({
          kind: 'tool',
          current: this.activityMode,
          toolId: this.harvestToolId,
          aimId: this.harvestToolId
        });
      }
      if (this._rHold.open) this.modeRadial.aimFromPointer(cx, cy);
    }
  }

  _onLmbAttack() {
    // Focus mode: primary attack (weapon pack / residual)
    const ok =
      this.drc.useMeleeStrike?.() ||
      this.drc.performQuickAction?.('primary') ||
      this.character.playWeaponCombat?.('attack') ||
      this.character.playWeaponCombat?.('cast');
    if (!ok) this.hud.showToast('Attack');
  }

  /**
   * World ground reticle — only for aim / AoE / placement skills.
   * Screen crosshair (HUD) is independent and only shows in focus mode.
   * @returns {boolean}
   */
  _shouldShowGroundAimMarker() {
    if (settings.aim?.groundMarker === false) return false;

    // Staff path stroke = placement / wall / aoe / stream
    if (
      settings.aim?.groundMarkerOnPathDraw !== false &&
      this.pathDrawer?.active
    ) {
      return true;
    }

    // Active cast whose delivery needs a ground point
    const cast = this.drc?._cast;
    if (cast) {
      const sk = cast.skill || cast.drcSkill || {
        id: cast.skillId,
        label: cast.label,
        style: cast.style,
        pathMode: cast.pathMode,
        effects: cast.effects,
        element: cast.element
      };
      if (skillNeedsGroundMarker(sk)) return true;
      if (cast.delivery && deliveryNeedsGroundMarker(cast.delivery)) return true;
      if (cast.pathMode && deliveryNeedsGroundMarker(`path_${cast.pathMode}`)) {
        return true;
      }
    }

    // Hotbar skill being charged / selected for placement (1–4)
    // Only while LMB held or cast bar active — not idle focus look
    const lmb =
      this.input?.keys?.has?.('Mouse0') ||
      this.input?.pointerButtons?.has?.(0) ||
      this.input?.mouseDown === true;
    if (lmb || this.drc?.isCasting) {
      // Prefer cast skill; else F / last slot skill if placement type
      const fSkill = skillForFKey?.() || null;
      if (fSkill && skillNeedsGroundMarker(fSkill) && this.drc?.isCasting) {
        return true;
      }
      for (let slot = 0; slot < 4; slot++) {
        const sk = skillBySlot?.(slot);
        if (sk && skillNeedsGroundMarker(sk) && this.drc?.isCasting) return true;
      }
    }

    // Explicit placement preview while drawing path is enough; idle focus = no ring
    return false;
  }

  /**
   * Free aim: LMB selects target (soft lock). Mouse stays unlocked.
   * @param {import('three').Vector2} ptr NDC
   */
  _onLmbSelect(ptr) {
    document.exitPointerLock?.();
    setCursorIntent('default');
    const picked = this.combatFocus?.pickFromNdc?.(this.camera, ptr);
    if (picked) {
      const t = this.combatFocus.selectedTarget;
      const label =
        t?.mesh?.userData?.displayName ||
        t?.mesh?.name ||
        (t?.kind === 'hostile' ? 'Hostile' : t?.kind) ||
        'Target';
      if (t?.kind === 'hostile' || t?.mesh?.userData?.trainingDummy) {
        setCursorIntent('attack');
      }
      this.hud.showToast(`Target · ${label}`);
      this.hud.setTargetFrame?.({
        name: label,
        hp01: Number.isFinite(t?.mesh?.userData?.hp01)
          ? t.mesh.userData.hp01
          : 1,
        present: true
      });
    } else {
      this.combatFocus?.clearTarget?.();
      this.hud.showToast('No target');
      this.hud.setTargetFrame?.(null);
    }
  }

  /**
   * Focus ON = remove OS mouse; mouse becomes look + center crosshair aim.
   * Focus OFF = unlock cursor for free select / UI.
   * @param {boolean} focusOn
   */
  _applyMouseLockForFocus(focusOn) {
    document.body?.classList.toggle('focus-aim', !!focusOn);
    if (!focusOn) {
      if (document.pointerLockElement) document.exitPointerLock?.();
      setCursorIntent('select', {
        force: true,
        label: 'Free aim',
        lmb: 'Select target',
        rmb: 'Focus look (toggle)'
      });
      this.hud.setCrosshairVisible?.(false);
      return;
    }
    // Hide cursor + tip; screen-center crosshair is the reticle
    setCursorIntent('none', { force: true, tooltip: false });
    if (this.canvas) {
      this.canvas.style.cursor = 'none';
      // Pointer lock (RMB toggle is a user gesture). Fallback: free mouse delta look.
      const tryLock = () => {
        try {
          this.canvas.requestPointerLock?.();
        } catch {
          /* policy */
        }
      };
      tryLock();
      // Retry once after tick if browser delayed grant
      window.setTimeout(() => {
        if (this.combatFocus?.focusEnabled && document.pointerLockElement !== this.canvas) {
          tryLock();
        }
      }, 40);
    }
    this.hud.setCrosshairVisible?.(true);
  }

  /**
   * Unlocked cursor: harvest / loot / target drives pirate intent + LMB/RMB tip.
   * Cursors are ~28px (baked). Focus lock hides cursor (crosshair only).
   */
  _updateInteractCursor() {
    if (this.combatFocus?.focusEnabled) {
      setCursorIntent('none', { force: true, tooltip: false });
      return;
    }
    if (document.pointerLockElement) return;
    const pos = this.character?.position || this.character?.root?.position;
    if (!pos) return;

    const lmbMode = this._lmbMode?.() || 'select';
    const rmbAlways = 'Focus look (toggle)';

    // World drop in pickup range
    if (this.worldDrops?.items?.length) {
      let nearDrop = false;
      for (const it of this.worldDrops.items) {
        if (it.throw) continue;
        const dx = it.root.position.x - pos.x;
        const dz = it.root.position.z - pos.z;
        if (dx * dx + dz * dz <= 2.4 * 2.4) {
          nearDrop = true;
          break;
        }
      }
      if (nearDrop) {
        setCursorIntent('pickup', {
          label: 'Loot drop',
          lmb: lmbMode === 'attack' ? 'Attack' : 'Select drop',
          rmb: rmbAlways,
          extra: 'F · pick up'
        });
        return;
      }
    }

    // Harvest nearest ≤5 m
    if (this.worldHarvest?.nearestAlive) {
      const hit = this.worldHarvest.nearestAlive(pos, HARVEST_RANGE_M);
      if (hit?.node) {
        const name = hit.node.def?.label || hit.node.def?.classId || 'node';
        setCursorIntent('harvest', {
          label: name,
          lmb: lmbMode === 'draw' ? 'Draw path' : 'Select node',
          rmb: rmbAlways,
          extra: `F · harvest (${hit.dist.toFixed(1)} m)`
        });
        return;
      }
    }

    // Soft-lock hostile → attack cursor
    const t = this.combatFocus?.selectedTarget;
    if (t && (t.kind === 'hostile' || t.mesh?.userData?.trainingDummy)) {
      setCursorIntent('attack', {
        label: t.mesh?.userData?.displayName || t.mesh?.name || 'Hostile',
        lmb: lmbMode === 'attack' ? 'Attack (focus on)' : 'Select target',
        rmb: rmbAlways
      });
      return;
    }

    // LMB mode drives default / draw / select tips
    if (lmbMode === 'draw') {
      setCursorIntent('draw', {
        label: this.session?.freeriding ? 'Freeride cast' : 'Path draw',
        lmb: this.session?.mode === 'walk' && !this.session?.freeriding
          ? 'Draw windsurf course'
          : 'Draw cast path',
        rmb: rmbAlways
      });
      return;
    }
    if (lmbMode === 'attack') {
      setCursorIntent('slash', {
        label: 'Combat',
        lmb: 'Primary attack',
        rmb: rmbAlways
      });
      return;
    }

    setCursorIntent('select', {
      label: this.activityMode === 'harvest' ? 'Harvest mode' : 'Ready',
      lmb: 'Select target',
      rmb: rmbAlways,
      extra: this.activityMode === 'harvest' ? 'Hold R · tools · F harvest' : 'Hold Q · mode'
    });
  }

  /** Push honest name/race into HUD + tight bar. */
  _syncPlayerFrame() {
    const id = this._playerIdentity;
    const raceId = this.character?.raceId || id?.raceId || 'WK';
    const name =
      id?.displayName ||
      displayNameForKit(raceId, id?.roleId || this.character?.presetId) ||
      'Warlord';
    const maxM = this.drc?.maxMana || 100;
    const maxS = this.drc?.maxStamina || 100;
    const maxH = this.drc?.maxHealth || 100;
    const hp01 =
      this.drc?.health != null
        ? Math.max(0, Math.min(1, this.drc.health / maxH))
        : 1;
    this.hud.setPlayerFrame?.({
      name,
      raceId,
      hp01,
      mana01: (this.drc?.mana ?? maxM) / maxM,
      sta01: (this.drc?.stamina ?? maxS) / maxS
    });
  }

  /**
   * Walk mode:
   *  - Space (edge) while **not** riding → deploy windsurf vehicle (frontflip + board)
   *  - E (edge) while freeride/ride → get off: unparent, remove board, land loco
   * Gate: session.gates.freerideDeploy for Space; riding for E
   */
  _pollWindsurfDeploy() {
    const keys = this.input.keys;
    // ` auto traverse: hold forward while freeride / land sprint-run
    if (this.drc?.isAutoTraverse?.()) {
      keys.add('KeyW');
      this._autoInjectedW = true;
    } else if (this._autoInjectedW) {
      keys.delete('KeyW');
      this._autoInjectedW = false;
    }
    const space = keys.has('Space');
    const eKey = keys.has('KeyE');
    const spacePressed = space && !this._wasWalkSpace;
    const ePressed = eKey && !this._wasWalkE;
    this._wasWalkSpace = space;
    this._wasWalkE = eKey;

    // Get off vehicle — board removed, controller back to normal
    if (
      ePressed &&
      this.walk?.active &&
      (this.walk.freeriding || this.walk.phase === 'ride' || this.walk.phase === 'freeride')
    ) {
      if (this.walk.requestDismount?.()) {
        this.hud.showToast('Windsurf · dismount · board stowed');
      }
      return;
    }

    // Space while freeriding = hop (WalkController freerideJump) — do not redeploy
    if (
      this.walk?.freeriding ||
      this.walk?.phase === 'freeride' ||
      this.session?.freeriding
    ) {
      return;
    }

    if (!this.session.gates.freerideDeploy) return;
    if (!spacePressed) return;
    if (!this.walk.scooter?.ready && this._assets) {
      this.walk.load(this._assets).catch(() => {});
    }
    this.walk.beginFreeride({ yaw: this.character.facing });
    this.hud.showToast('Windsurf vehicle · feet/hands IK · E = get off');
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
    this.linearSkills?.clear?.();
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

    // Identity from URL / Foundry handoff — never hardcode "Hero"
    const id = resolvePlayerIdentity();
    this._playerIdentity = id;
    this.loading.setProgress(
      0.45,
      `Loading ${id.raceLabel} kit…`
    );
    await this.character.load(assets, {
      raceId: id.raceId,
      presetId: id.roleId || 'mage'
    });
    // Feet at origin; keep model local ground from scaffold
    this.character.placeAt?.(0, 0, 0);
    this.character.resetPlacement?.();
    this.hud.setPlayerFrame?.({
      name: id.displayName,
      raceId: this.character.raceId || id.raceId,
      hp01: 1,
      mana01: 1,
      sta01: 1
    });
    this.hud.setAllies?.([]);
    this.hud.setTargetFrame?.(null);
    this.hud.refreshSkillLabels?.();
    this.inventory.refresh();
    if (id.source === 'url' || id.source === 'handoff') {
      this.hud.showToast?.(`${id.displayName} · ${id.raceLabel}`, 2200);
    }
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

    // Dev Island: baked rocks + harvest + training dummies (replaces empty lab pad content)
    this.loading.setProgress(0.74, 'Dev island harvest…');
    try {
      this.worldHarvest = new DevIslandHarvest({
        scene: this.scene,
        assets,
        character: this.character,
        combatFocus: this.combatFocus,
        worldDrops: this.worldDrops,
        dropBag: this.dropBag,
        onToast: (m) => this.hud.showToast(m),
        islandRadius: WORLD.islandRadius,
        rangeM: HARVEST_RANGE_M
      });
      await this.worldHarvest.init();
      console.info(
        `[App] DevIsland map · harvest=${this.worldHarvest.nodeCount} decor=${this.worldHarvest.decorCount} dummies=${this.worldHarvest.dummies?.length || 0} F≤${HARVEST_RANGE_M}m padR=${WORLD.islandRadius.toFixed(0)}`
      );
      this.hud.showToast?.(
        `Dev Island · ${this.worldHarvest.nodeCount} nodes · open sea · M→Space windsurf`,
        3200
      );
    } catch (err) {
      console.warn('[App] DevIsland harvest failed', err);
      this.worldHarvest = null;
      this.hud.showToast?.('Dev Island map failed — check /models/dev-island', 4000);
    }

    // Horizon islands (CDN) + open-sea water ring — freeride backdrop
    this.loading.setProgress(0.76, 'Open sea shells…');
    try {
      this.openSea = new OpenSeaShells({ scene: this.scene, assets });
      await this.openSea.init();
    } catch (err) {
      console.warn('[App] OpenSeaShells', err);
      this.openSea = null;
    }

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
    // Backflip setup: hold camera yaw (do not follow reverse body)
    if (this.character?.isBackflip || this.drc?._flipHoldYaw != null) {
      const hold =
        this.character?._flipCameraHoldYaw ??
        this.drc?._flipHoldYaw ??
        this.character?.facing ??
        0;
      this.rig.setHoldCharacterYaw?.(hold);
    } else {
      this.rig.setHoldCharacterYaw?.(null);
      this.rig.setCharacterYaw(this.character?.facing ?? 0);
    }

    const vis = this.character._countVisibleSkinned?.() ?? -1;
    console.info(
      `[App] spawn visSkinned=${vis} root=`,
      this.character.position.x,
      this.character.position.y,
      this.character.position.z,
      'height=',
      this.character.height
    );

    this.loading.setProgress(1, 'Ready — Dev Island');
    this.loading.hide();
    this.hud.showToast(
      `Dev Island · F harvest ≤${HARVEST_RANGE_M}m (tool) · pickup · combat skill · Tab targets`,
      3800
    );

    // T0 starter equip: ?sword=1 | ?wand=1 | ?t0=t0-axe1h (any catalog id)
    {
      const m = location.search.match(/[?&]t0=([a-z0-9-]+)/i);
      const legacy =
        /[?&]sword=1\b/.test(location.search)
          ? 't0-sword'
          : /[?&]wand=1\b/.test(location.search)
            ? 't0-wand'
            : /[?&]sapling=1\b/.test(location.search)
              ? 't0-nature-staff'
              : null;
      const t0Id = m?.[1] || legacy;
      if (t0Id) {
        try {
          const { equipWeaponById } = await import('../combat/equippedWeaponRuntime.js');
          const { setActiveSkillTree, getActiveSkills } = await import('../combat/drcSkills.js');
          const { T0_ALL_WEAPON_IDS } = await import('../api/t0WeaponCatalog.js');
          const id = T0_ALL_WEAPON_IDS.includes(t0Id) ? t0Id : t0Id.startsWith('t0-') ? t0Id : null;
          if (id) {
            const result = await equipWeaponById(id, {
              character: this.character,
              onToast: (m) => this.hud.showToast(m)
            });
            setActiveSkillTree('equipped');
            this.drc.skills = getActiveSkills();
            const labels = (result.hotbar || []).map((s) => s.label).join(' · ');
            this.hud.showToast(`${result.weapon?.name || id} T0 · ${labels}`, 4000);
          }
        } catch (err) {
          console.warn('[App] t0 equip', t0Id, err);
        }
      }
    }

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
    // Editor / presets may write settings.mode
    if (settings.mode !== this.session.mode) this.session.syncFromSettings();

    this.environment.setFocus(this.character.position.x, this.character.position.z);
    this.environment.update();

    // Mouse aim + soft lock — focus works in combat or when focus already on
    const aimOn =
      settings.aim?.enabled !== false &&
      (this.drc.inCombat || !!this.combatFocus?.focusEnabled);
    const feetPos = this.character.getWorldPosition?.() || this.character.position;
    if (aimOn) {
      // Focus: camera-center ray → hit + soft-lock cone (auto-aim help).
      // Free: NDC pointer for select / ground pick.
      if (this.combatFocus?.focusEnabled) {
        let softPt = this.combatFocus.getSoftLockPoint?.() || null;
        // Keep soft-lock sticky: re-acquire directional best if lost
        if (!softPt && settings.aim?.softLockOnFocus !== false) {
          const fwd0 = this.rig.getCameraForward?.(new Vector3());
          this.combatFocus.acquireBest?.(feetPos, fwd0);
          softPt = this.combatFocus.getSoftLockPoint?.() || null;
        }
        this.mouseAim.updateFocusAim?.(feetPos, {
          softTarget: softPt,
          softBlend: settings.aim?.softLockBlend,
          maxSoftAngleDeg: settings.aim?.softLockMaxAngleDeg
        }) || this.mouseAim.updateFromCenter?.(feetPos);
        // Body / launch XZ from camera look (action TPS)
        this.rig?.getCameraForward?.(this.mouseAim.forward);
        if (this.mouseAim.forward.lengthSq() > 1e-6) {
          this.mouseAim.forward.y = 0;
          if (this.mouseAim.forward.lengthSq() > 1e-6) {
            this.mouseAim.forward.normalize();
            this.mouseAim.yaw = Math.atan2(this.mouseAim.forward.x, this.mouseAim.forward.z);
            this.mouseAim.right.set(this.mouseAim.forward.z, 0, -this.mouseAim.forward.x);
          }
        }
        this.mouseAim._refreshLaunch?.(feetPos);
      } else {
        this.mouseAim.updateFromNdc(this.input.pointer, feetPos);
        if (this.combatFocus?.selectedTarget) {
          this.combatFocus.resolveAimPoint(feetPos, this.mouseAim.point, this.mouseAim.point);
          this.mouseAim._fromPlayer?.(feetPos);
          this.mouseAim._refreshLaunch?.(feetPos);
        }
      }
      // Ground ring ≠ screen crosshair. Only for placement / AoE / path skills.
      if (this.aimMarker) {
        const showGround = this._shouldShowGroundAimMarker();
        this.aimMarker.visible = showGround && !!this.mouseAim.valid;
        if (this.aimMarker.visible) {
          this.aimMarker.position.x = this.mouseAim.point.x;
          this.aimMarker.position.z = this.mouseAim.point.z;
          this.aimMarker.position.y = 0.05;
          const d = this.mouseAim.distanceTo(feetPos);
          const s = MathUtils.clamp(0.7 + d * 0.04, 0.7, 1.6);
          this.aimMarker.scale.setScalar(s);
          this.aimMarker.material.opacity = this.combatFocus?.focusEnabled ? 0.95 : 0.75;
          this.aimMarker.material.color?.setHex?.(
            this.combatFocus?.selectedTarget ? 0xff6a55 : 0x7fd6ff
          );
        }
      }
      // Screen-center HUD only in focus (or settings.crosshair force) — not the ground ring
      const showXh =
        settings.aim?.crosshair !== false && !!this.combatFocus?.focusEnabled;
      this.hud.setCrosshairVisible?.(!!showXh);
      const soft = !!this.combatFocus?.selectedTarget;
      // Spread opens slightly when free-running / closes when soft-lock snug
      const moving =
        this.drc?._grounded &&
        (this.input.keys.has('KeyW') ||
          this.input.keys.has('KeyA') ||
          this.input.keys.has('KeyS') ||
          this.input.keys.has('KeyD'));
      const sprinting = !!this.drc?._sprinting;
      const spread = soft ? 0.1 : moving ? (sprinting ? 0.55 : 0.32) : 0.06;
      // Range ring vs soft-lock target (animator rangeState)
      let rangeState = 'none';
      if (soft && this.combatFocus?.selectedTarget?.point && feetPos) {
        const tp = this.combatFocus.selectedTarget.point;
        const dx = tp.x - feetPos.x;
        const dz = tp.z - feetPos.z;
        const dist = Math.hypot(dx, dz);
        const optMin = settings.aim?.optimalRangeMin ?? 2.5;
        const optMax = settings.aim?.optimalRangeMax ?? 12;
        if (dist < optMin) rangeState = 'close';
        else if (dist > optMax) rangeState = 'far';
        else rangeState = 'optimal';
      }
      this.hud.setCrosshairState?.({
        focus: !!this.combatFocus?.focusEnabled,
        softLock: soft,
        fire: !!this.drc?._cast,
        spread,
        rangeState
      });
      this.rig?.setSprinting?.(sprinting);
      // XState loco tag (anim / harvest gates read actor snapshot)
      {
        let loco = 'idle';
        if (this.drc?._cast) loco = 'cast';
        else if (!this.drc?._grounded) loco = 'jump';
        else if (sprinting) loco = 'sprint';
        else if (moving) loco = 'run';
        else if (this.activityMode === 'harvest' && this.worldHarvest?.lastSwingAt) {
          loco = 'harvest_swing';
        }
        if (this._lastLoco !== loco) {
          this._lastLoco = loco;
          this.activityActor?.send?.({ type: 'SET_LOCO', loco });
        }
      }
      this.hud.root?.classList.toggle('hud--focus', !!this.combatFocus?.focusEnabled);
      this.hud.root?.classList.toggle('hud--softlock', soft);
    } else {
      if (this.aimMarker) this.aimMarker.visible = false;
      this.hud.setCrosshairVisible?.(false);
      this.hud.root?.classList.remove('hud--focus', 'hud--softlock');
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
    this.worldHarvest?.update?.(
      dt,
      this.character?.position || this.character?.root?.position
    );
    // Pirate cursor intents when mouse unlocked (harvest / loot / attack)
    this._updateInteractCursor?.();
    this._tickRadials?.(dt);

    this.ground.update(this.elapsed);
    this.water?.update?.(this.elapsed);
    this.dust.update(this.elapsed, this.character.position);

    this.pathDrawer.update(raw);
    this.abilities.update(dt);
    // Linear skillshots (MOBA aim + pooled VFX)
    {
      const feet = this.character?.position || this.character?.root?.position;
      this.linearSkills?.update?.(dt, feet, this.input.pointer);
    }

    // Cast channel owns pose while bar is active; ability travel can keep cast soft-lock
    const channeling = this.drc.isCasting;
    const focusAbility = this.abilities.focus;
    const abilityTravel = this.abilities.active.length > 0;
    if (channeling) {
      const st = this.drc.getCastBarState?.();
      this.character.setCasting?.(true, this.drc._cast?.aim || null);
      this.hud.setCastBar?.(st);
    } else if (abilityTravel && focusAbility?.position) {
      this.character.setCasting?.(true);
      this.hud.setCastBar?.(null);
    } else {
      // Do not clear cast pose mid-frame if DRC just finished (ability may start next frame)
      if (!channeling) this.character.setCasting?.(false);
      this.hud.setCastBar?.(null);
    }

    this.particles.flush();
    this.decals.update(dt);
    this.bursts.update(dt);
    this.lights.update(dt);

    /* ---- camera: feet + soft-lock look (production TPS angles) ---- */
    const feet = this.character.getWorldPosition?.() || this.character.position;
    const px = feet.x;
    const py = feet.y;
    const pz = feet.z;
    const focus = this.abilities.focus;
    if (focus) this.rig.lookAt(focus.position, MathUtils.clamp(1 - focus.u * 0.4, 0, 1));
    this.rig.setAnchor(px, py, pz);
    // Camera yaw ownership:
    //  · Focus ON → mouse owns camera (characterYaw); body lag-follows look
    //  · Focus OFF → body facing drives orbit base (free / tank)
    if (this.character?.isBackflip || this.drc?._flipHoldYaw != null) {
      const hold =
        this.character?._flipCameraHoldYaw ??
        this.drc?._flipHoldYaw ??
        this.character?.facing ??
        0;
      this.rig.setHoldCharacterYaw?.(hold);
    } else {
      this.rig.setHoldCharacterYaw?.(null);
      if (!this.combatFocus?.focusEnabled) {
        this.rig.setCharacterYaw(this.character?.facing ?? 0);
      }
    }

    // Soft lock ON in focus: frame target + subtle yaw assist (action auto-aim)
    const softPtCam = this.combatFocus?.getSoftLockPoint?.();
    if (this.combatFocus?.focusEnabled && softPtCam) {
      this.rig.setSoftLock?.(softPtCam, 1);
      this.rig.applySoftLockYawAssist?.(dt, feet);
      this.hud.root?.classList.add('hud--softlock');
      const t = this.combatFocus.selectedTarget;
      if (t) {
        this.hud.setTargetFrame?.({
          name:
            t.mesh?.userData?.displayName ||
            t.mesh?.name ||
            t.kind ||
            'Target',
          hp01: Number.isFinite(t.mesh?.userData?.hp01) ? t.mesh.userData.hp01 : 1,
          present: true
        });
      }
    } else if (
      this.combatFocus?.focusEnabled &&
      settings.aim?.softLockOnFocus !== false
    ) {
      const fwd = this.rig.getCameraForward?.(new Vector3());
      this.combatFocus.acquireBest?.(feet, fwd);
      const p2 = this.combatFocus?.getSoftLockPoint?.();
      this.rig.setSoftLock?.(p2 || null, p2 ? 1 : 0);
      if (p2) this.rig.applySoftLockYawAssist?.(dt, feet);
    } else {
      this.rig.setSoftLock?.(null, 0);
      this.hud.root?.classList.remove('hud--softlock');
    }
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

    const maxM = this.drc.maxMana || 100;
    const maxS = this.drc.maxStamina || 100;
    const maxH = this.drc.maxHealth || 100;
    const hp01 =
      this.drc.health != null
        ? Math.max(0, Math.min(1, this.drc.health / maxH))
        : 1;
    const id = this._playerIdentity;
    const displayName =
      id?.displayName ||
      displayNameForKit(this.character.raceId, this.character.presetId) ||
      'Warlord';

    // Live soft-lock target (was hard-null — frame lied as always empty)
    let targetInfo = null;
    const st = this.combatFocus?.selectedTarget;
    if (st) {
      const label =
        st.mesh?.userData?.displayName ||
        st.mesh?.name ||
        (st.kind === 'hostile' ? 'Hostile' : st.kind) ||
        'Target';
      targetInfo = {
        name: label,
        hp01: Number.isFinite(st.mesh?.userData?.hp01)
          ? st.mesh.userData.hp01
          : 1,
        present: true
      };
    }

    this.hud.update(raw, () => ({
      particles: this.particles.countLive(this.elapsed),
      calls: gl.info.render.calls,
      abilities: this.abilities.active.length,
      stamina: this.drc.stamina,
      mana: this.drc.mana,
      castIntensity: this.drc.lastCastIntensity ?? 1,
      cooldown01: (slot) => {
        const skill = this.drc.skills.find((s) => s.slot === slot);
        return skill ? this.drc.cooldown01(skill.id) : 0;
      },
      meleeCd01: this.drc.cooldown01?.('drc_melee_strike') ?? 0,
      quickCd01: (actionId) => this.drc.quickCd01?.(actionId) ?? 0,
      player: {
        name: displayName,
        raceId: this.character.raceId || id?.raceId,
        hp01,
        mana01: (this.drc.mana ?? maxM) / maxM,
        sta01: (this.drc.stamina ?? maxS) / maxS
      },
      target: targetInfo
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
