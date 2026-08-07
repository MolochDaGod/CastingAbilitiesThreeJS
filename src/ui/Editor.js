import GUI from 'lil-gui';
import { settings, ELEMENTS, ELEMENT_META, MODES } from '../config/settings.js';
import { PresetManager } from './PresetManager.js';
import {
  EFFECT_KINDS,
  EFFECT_MESH_IDS,
  buildActiveKindPrefab,
  buildEffectPrefab,
  downloadJson,
  STRAWBERRY_MODE_PRESETS,
  applyPrimitiveToSettings
} from '../vfx/effectPrefab.js';

/**
 * Real-time VFX editor.
 *
 * Every control binds straight to a field in `config/settings.js`. Because all
 * shaders, particle systems, lights and post passes *read* those fields each
 * frame, no controller needs an onChange handler: moving a slider updates
 * in-flight abilities, future casts, the environment and the post stack
 * simultaneously, with no rebuild and no shader recompilation.
 */
export class Editor {
  /**
   * @param {object} hooks { onClear, onToast }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.presets = new PresetManager();

    this.gui = new GUI({ title: 'VFX Editor', width: 320 });
    this.gui.domElement.style.setProperty('--title-height', '30px');

    this._presetState = { name: 'My preset', selected: this.presets.names[0] ?? '' };

    this._buildPresets();
    this._buildEffectPrefab();
    this._buildGlobal();
    this._buildTrail();
    for (const element of ELEMENTS) this._buildElement(element);
    this._buildEnvironment();
    this._buildPost();
    this._buildCamera();
    this._buildCharacter();
    this._buildWalk();

    // Element folders start closed — the global block is the common entry point.
    this.gui.folders.forEach((folder) => folder.close());
    this.globalFolder.open();
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  static range(folder, object, key, min, max, step, label) {
    return folder.add(object, key, min, max, step).name(label ?? key);
  }

  refresh() {
    this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  toggle() {
    this._hidden = !this._hidden;
    this.gui.show(!this._hidden);
  }

  /* ------------------------------------------------------------------ */
  /* folders                                                             */
  /* ------------------------------------------------------------------ */

  _buildPresets() {
    const folder = this.gui.addFolder('Presets');
    const state = this._presetState;

    let selector = folder
      .add(state, 'selected', this.presets.names.length ? this.presets.names : [''])
      .name('preset');

    // lil-gui rebuilds the controller when the option list changes, so the
    // reference has to be replaced rather than mutated.
    const refreshOptions = () => {
      const names = this.presets.names;
      selector = selector.options(names.length ? names : ['']).name('preset');
      selector.setValue(names.includes(state.selected) ? state.selected : (names[0] ?? ''));
    };

    folder.add(state, 'name').name('name');

    folder
      .add(
        {
          save: () => {
            this.presets.save(state.name);
            state.selected = state.name;
            refreshOptions();
            this.hooks.onToast?.(`Saved preset "${state.name}"`);
          }
        },
        'save'
      )
      .name('Save preset');

    folder
      .add(
        {
          load: () => {
            if (this.presets.load(state.selected)) {
              this.refresh();
              this.hooks.onToast?.(`Loaded "${state.selected}"`);
            }
          }
        },
        'load'
      )
      .name('Load preset');

    folder
      .add(
        {
          duplicate: () => {
            const copy = this.presets.duplicate(state.selected);
            if (copy) {
              state.selected = copy;
              refreshOptions();
              this.hooks.onToast?.(`Duplicated to "${copy}"`);
            }
          }
        },
        'duplicate'
      )
      .name('Duplicate');

    folder
      .add(
        {
          remove: () => {
            if (this.presets.remove(state.selected)) {
              refreshOptions();
              this.hooks.onToast?.('Preset deleted');
            }
          }
        },
        'remove'
      )
      .name('Delete');

    folder.add({ exportOne: () => this.presets.exportJSON() }, 'exportOne').name('Export current (JSON)');
    folder.add({ exportAll: () => this.presets.exportAll() }, 'exportAll').name('Export all presets');

    folder
      .add(
        {
          import: async () => {
            const result = await this.presets.importFromFile();
            refreshOptions();
            this.refresh();
            this.hooks.onToast?.(
              result.applied
                ? 'Settings imported'
                : result.imported.length
                  ? `Imported ${result.imported.length} preset(s)`
                  : 'Nothing imported'
            );
          }
        },
        'import'
      )
      .name('Import JSON…');

    folder
      .add(
        {
          reset: () => {
            this.presets.reset();
            this.refresh();
            this.hooks.onToast?.('Reset to defaults');
          }
        },
        'reset'
      )
      .name('Reset to defaults');

    this.presetFolder = folder;
  }

  /**
   * Shared effect primitives — intensity / AOE / speed / size / color / mesh.
   * Export JSON prefabs for Warlords skill import. Melee residual = F strike.
   */
  _buildEffectPrefab() {
    const folder = this.gui.addFolder('⚡ Effect Prefab');
    const e = settings.effect;
    const r = settings.residual;
    const R = Editor.range;

    folder
      .add(e, 'activeKind', EFFECT_KINDS)
      .name('active kind')
      .onChange(() => this.hooks.onToast?.(`Authoring · ${e.activeKind}`));

    R(folder, e, 'intensity', 0, 2, 0.01, 'intensity');
    R(folder, e, 'aoe', 0, 8, 0.05, 'aoe (m)');
    R(folder, e, 'speed', 0, 40, 0.1, 'speed (m/s)');
    R(folder, e, 'size', 0.1, 3, 0.01, 'size (SI)');
    folder.addColor(e, 'color').name('color');
    folder.add(e, 'meshId', EFFECT_MESH_IDS).name('mesh id');
    R(folder, e, 'duration', 0.05, 4, 0.01, 'duration (s)');
    folder.add(e, 'attach', ['R_hand', 'L_hand', 'root', 'feet', 'weapon_tip']).name('attach');

    const residual = folder.addFolder('Melee residual (F)');
    residual.add(r, 'enabled').name('enabled');
    R(residual, r, 'range', 1, 10, 0.05, 'range (m)');
    R(residual, r, 'speed', 4, 30, 0.1, 'wave speed');
    R(residual, r, 'meshScale', 0.35, 2.2, 0.01, 'mesh scale');
    R(residual, r, 'contactRadius', 0.2, 2.5, 0.05, 'contact radius');
    R(residual, r, 'aoeRadius', 0, 4, 0.05, 'aoe radius');
    R(residual, r, 'intensity', 0, 2, 0.01, 'intensity');
    residual.addColor(r, 'color').name('color');
    residual.add(r, 'variant', ['slashblue', 'slashred', 'slashpurple', 'slashyellow']).name('slash mesh');
    R(residual, r, 'tipOffset', 0.15, 1.4, 0.01, 'tip offset (m)');
    R(residual, r, 'hitFrameDelay', 0, 0.5, 0.01, 'hit frame delay');

    const berry = folder.addFolder('Strawberry modes (learn)');
    for (const [mode, preset] of Object.entries(STRAWBERRY_MODE_PRESETS)) {
      berry
        .add(
          {
            apply: () => {
              applyPrimitiveToSettings({ ...preset, color: preset.color || e.color });
              this.refresh();
              this.hooks.onToast?.(`Strawberry · ${mode}`);
            }
          },
          'apply'
        )
        .name(`Apply ${mode}`);
    }

    folder
      .add(
        {
          exportSolo: () => {
            const prefab = buildActiveKindPrefab();
            downloadJson(prefab, `${prefab.id}.json`);
            this.hooks.onToast?.(`Exported ${prefab.id}`);
          }
        },
        'exportSolo'
      )
      .name('Export active kind JSON');

    folder
      .add(
        {
          exportMelee: () => {
            const prefab = buildEffectPrefab('drc_melee_strike');
            downloadJson(prefab, 'prefab_drc_melee_strike.json');
            this.hooks.onToast?.('Exported melee residual prefab');
          }
        },
        'exportMelee'
      )
      .name('Export melee residual JSON');

    folder
      .add(
        {
          exportFire: () => {
            const prefab = buildEffectPrefab('drc_fire_bolt');
            downloadJson(prefab, 'prefab_drc_fire_bolt.json');
            this.hooks.onToast?.('Exported fire bolt prefab');
          }
        },
        'exportFire'
      )
      .name('Export fire bolt JSON');

    folder
      .add(
        {
          exportAll: () => {
            const ids = [
              'drc_melee_strike',
              'drc_fire_bolt',
              'drc_water_lash',
              'drc_earth_spike',
              'drc_wind_tempest'
            ];
            const pack = {
              source: 'casting-lab',
              version: '1.0.0',
              exportedAt: new Date().toISOString(),
              prefabs: ids.map((id) => buildEffectPrefab(id))
            };
            downloadJson(pack, 'casting-effect-prefabs.json');
            this.hooks.onToast?.(`Exported ${pack.prefabs.length} prefabs`);
          }
        },
        'exportAll'
      )
      .name('Export all skill prefabs');

    this.effectFolder = folder;
  }

  _buildGlobal() {
    const folder = this.gui.addFolder('Global');
    const g = settings.global;
    const R = Editor.range;

    R(folder, g, 'timeScale', 0.05, 2, 0.01, 'time scale');
    R(folder, g, 'speed', 0.1, 4, 0.01, 'ability speed');
    R(folder, g, 'lifetime', 0.1, 4, 0.01, 'lifetime');
    R(folder, g, 'glow', 0, 5, 0.01, 'glow intensity');
    R(folder, g, 'shaderIntensity', 0, 2, 0.01, 'shader intensity');
    R(folder, g, 'opacity', 0, 2, 0.01, 'opacity');
    R(folder, g, 'noiseStrength', 0, 3, 0.01, 'noise strength');
    R(folder, g, 'noiseFrequency', 0.1, 4, 0.01, 'noise frequency');
    R(folder, g, 'noiseSpeed', 0, 4, 0.01, 'noise speed');
    R(folder, g, 'turbulence', 0, 4, 0.01, 'turbulence');
    R(folder, g, 'randomness', 0, 2, 0.01, 'randomness');
    R(folder, g, 'distortion', 0, 3, 0.01, 'distortion strength');
    R(folder, g, 'fresnel', 0, 3, 0.01, 'fresnel strength');

    const particles = folder.addFolder('Particles');
    R(particles, g, 'particleCount', 0, 3, 0.01, 'count');
    R(particles, g, 'particleLifetime', 0.1, 3, 0.01, 'lifetime');
    R(particles, g, 'particleSpeed', 0.1, 3, 0.01, 'speed');
    R(particles, g, 'particleSize', 0.1, 3, 0.01, 'size');
    R(particles, g, 'emissionRate', 0, 3, 0.01, 'emission rate');

    const lighting = folder.addFolder('Lighting & impact');
    R(lighting, g, 'lightIntensity', 0, 4, 0.01, 'light intensity');
    R(lighting, g, 'lightRadius', 0.1, 4, 0.01, 'light radius');
    R(lighting, g, 'explosionIntensity', 0, 3, 0.01, 'explosion intensity');
    R(lighting, g, 'cameraShake', 0, 3, 0.01, 'camera shake');
    R(lighting, g, 'animationSpeed', 0, 3, 0.01, 'animation speed');

    this.globalFolder = folder;
  }

  _buildTrail() {
    const folder = this.gui.addFolder('Cast trail');
    const t = settings.trail;
    const R = Editor.range;

    R(folder, t, 'width', 0.05, 3, 0.01, 'trail width');
    R(folder, t, 'length', 0.05, 1, 0.01, 'trail length');
    R(folder, t, 'opacity', 0, 2, 0.01, 'trail opacity');
    R(folder, t, 'glow', 0, 10, 0.01, 'trail glow');
    folder.addColor(t, 'colorInner').name('inner colour');
    folder.addColor(t, 'colorOuter').name('outer colour');
    R(folder, t, 'flowSpeed', 0, 6, 0.01, 'flow speed');
    R(folder, t, 'noiseStrength', 0, 2, 0.01, 'noise strength');
    R(folder, t, 'noiseFrequency', 0.1, 8, 0.01, 'noise frequency');
    R(folder, t, 'dissolveSpeed', 0.1, 6, 0.01, 'dissolve speed');
    R(folder, t, 'taper', 0, 1, 0.01, 'taper');
    R(folder, t, 'softness', 0.02, 1, 0.01, 'softness');
    R(folder, t, 'sparkle', 0, 3, 0.01, 'sparkle');
    R(folder, t, 'height', 0.01, 1, 0.01, 'hover height');

    const input = folder.addFolder('Drawing');
    R(input, settings.input, 'minPointDistance', 0.02, 1, 0.01, 'jitter filter');
    R(input, settings.input, 'minPathLength', 0.2, 8, 0.1, 'min path length');
    R(input, settings.input, 'smoothing', 0, 0.95, 0.01, 'smoothing');
    R(input, settings.input, 'curveTension', 0, 1, 0.01, 'curve tension');
    R(input, settings.input, 'samplesPerUnit', 0.5, 8, 0.1, 'samples / unit');
  }

  _buildElement(element) {
    const meta = ELEMENT_META[element];
    const folder = this.gui.addFolder(`${meta.glyph}  ${meta.label}`);
    const c = settings[element];
    const R = Editor.range;

    R(folder, c, 'speed', 0.5, 40, 0.1, 'speed');
    R(folder, c, 'lifetime', 0.2, 10, 0.1, 'lifetime');

    const build = {
      fire: () => {
        const flight = folder.addFolder('Flight');
        R(flight, c, 'flightHeight', 0, 8, 0.01, 'cruise height');
        R(flight, c, 'flightArc', 0, 5, 0.01, 'arc');

        const shape = folder.addFolder('Flame shape');
        R(shape, c, 'flameWidth', 0.05, 3, 0.01, 'tube radius');
        R(shape, c, 'headSize', 1, 5, 0.01, 'fireball size');
        R(shape, c, 'flameHeight', 1, 6, 0.01, 'updraft stretch');
        R(shape, c, 'streamLength', 0.5, 20, 0.1, 'stream length');
        R(shape, c, 'wakeSpread', 0, 3, 0.01, 'wake spread');
        R(shape, c, 'wakeRise', 0, 3, 0.01, 'wake rise');
        R(shape, c, 'bulge', 0, 0.8, 0.01, 'silhouette lobes');
        R(shape, c, 'bulgeScale', 0.1, 2, 0.01, 'lobe frequency');
        R(shape, c, 'detachment', 0, 1.5, 0.01, 'tail break-up');
        R(shape, c, 'softness', 0.05, 1, 0.01, 'softness');

        const turb = folder.addFolder('Turbulence');
        R(turb, c, 'vortex', 0, 3, 0.01, 'vortex roll-up');
        R(turb, c, 'ringFrequency', 0, 3, 0.01, 'vortices per metre');
        R(turb, c, 'ringSpeed', 0, 6, 0.01, 'vortex speed');
        R(turb, c, 'flameCurl', 0, 5, 0.01, 'swirl');
        R(turb, c, 'flameTurbulence', 0, 6, 0.01, 'turbulence');
        R(turb, c, 'flameWarp', 0, 2, 0.01, 'domain warp');
        R(turb, c, 'tongueStretch', 0.15, 2, 0.01, 'tongue stretch');
        R(turb, c, 'streamStretch', 0.15, 2, 0.01, 'streamwise stretch');
        R(turb, c, 'lick', 0, 5, 0.01, 'fringe shear');
        R(turb, c, 'wisps', 0, 2, 0.01, 'wisps');
        R(turb, c, 'shred', 0, 3, 0.01, 'fringe shred');
        R(turb, c, 'flameSpeed', 0, 8, 0.01, 'flow speed');
        R(turb, c, 'buoyancy', 0, 6, 0.01, 'buoyancy');
        R(turb, c, 'flicker', 0, 2, 0.01, 'flicker');
        R(turb, c, 'noiseStrength', 0, 3, 0.01, 'noise strength');
        R(turb, c, 'noiseFrequency', 0.1, 6, 0.01, 'noise frequency');
        R(turb, c, 'detailOctaves', 2, 5, 1, 'detail octaves');

        const heat = folder.addFolder('Temperature & radiance');
        R(heat, c, 'tempCore', 1500, 6000, 10, 'core temp (K)');
        R(heat, c, 'tempEdge', 800, 3000, 10, 'edge temp (K)');
        R(heat, c, 'emissionCurve', 1, 8, 0.05, 'radiance curve');
        R(heat, c, 'heatFocus', 0.4, 4, 0.01, 'heat focus');
        R(heat, c, 'heatFalloff', 0.2, 4, 0.01, 'heat falloff');
        R(heat, c, 'heatFollow', 0, 1, 0.01, 'heat follows noise');
        R(heat, c, 'tailHeat', 0, 1.5, 0.01, 'wake temperature');
        R(heat, c, 'scatter', 0, 4, 0.01, 'firelight scatter');
        R(heat, c, 'scatterFalloff', 0.2, 8, 0.05, 'scatter falloff');
        R(heat, c, 'glow', 0, 10, 0.01, 'glow');

        const render = folder.addFolder('Volume rendering');
        R(render, c, 'volumeDensity', 0, 4, 0.01, 'density');
        R(render, c, 'soot', 0, 6, 0.01, 'soot absorption');
        R(render, c, 'coreClarity', 0.02, 1, 0.01, 'core clarity');
        R(render, c, 'opacity', 0, 2, 0.01, 'opacity');
        R(render, c, 'volumeSteps', 6, 72, 1, 'raymarch steps');

        const colors = folder.addFolder('Fire gradient');
        R(colors, c, 'paletteBlend', 0, 1, 0.01, 'palette vs physics');
        colors.addColor(c, 'colorCore').name('core');
        colors.addColor(c, 'colorMid').name('mid');
        colors.addColor(c, 'colorEdge').name('edge');
        colors.addColor(c, 'colorSmoke').name('smoke');

        const embers = folder.addFolder('Embers & smoke');
        R(embers, c, 'emberRate', 0, 400, 1, 'ember rate');
        R(embers, c, 'emberCount', 0, 3, 0.01, 'ember count');
        R(embers, c, 'emberSize', 0.01, 0.6, 0.005, 'ember size');
        R(embers, c, 'emberSpeed', 0, 10, 0.05, 'ember speed');
        R(embers, c, 'emberLifetime', 0.1, 5, 0.05, 'ember lifetime');
        R(embers, c, 'sparkRate', 0, 200, 1, 'spark rate');
        R(embers, c, 'sparkSpeed', 0, 20, 0.1, 'spark speed');
        R(embers, c, 'smokeDensity', 0, 2, 0.01, 'smoke density');
        R(embers, c, 'smokeSpeed', 0, 5, 0.01, 'smoke speed');
        R(embers, c, 'smokeSize', 0.1, 5, 0.01, 'smoke size');
        R(embers, c, 'smokeLifetime', 0.2, 8, 0.05, 'smoke lifetime');

        const impact = folder.addFolder('Heat & explosion');
        R(impact, c, 'heatDistortion', 0, 4, 0.01, 'heat distortion');
        R(impact, c, 'distortionRadius', 0.2, 6, 0.05, 'distortion radius');
        R(impact, c, 'explosionSize', 0.2, 10, 0.05, 'explosion size');
        R(impact, c, 'explosionBrightness', 0, 8, 0.05, 'explosion brightness');
        R(impact, c, 'explosionShake', 0, 3, 0.01, 'explosion shake');
        R(impact, c, 'explosionFlash', 0, 2, 0.01, 'screen flash');
      },

      water: () => {
        const flight = folder.addFolder('Flight');
        R(flight, c, 'height', 0, 4, 0.01, 'cruise height');
        R(flight, c, 'surge', 0, 2, 0.01, 'surge amplitude');
        R(flight, c, 'surgeLength', 0, 6, 0.01, 'surges along body');
        R(flight, c, 'surgeSpeed', 0, 10, 0.01, 'surge speed');
        R(flight, c, 'wakeSag', 0, 3, 0.01, 'wake sag');

        const volume = folder.addFolder('Water body');
        R(volume, c, 'radius', 0.05, 3, 0.01, 'tube radius');
        R(volume, c, 'headSize', 1, 5, 0.01, 'crest size');
        R(volume, c, 'crest', 1, 4, 0.01, 'crest stretch');
        R(volume, c, 'streamLength', 0.5, 24, 0.1, 'body length');
        R(volume, c, 'waveAmplitude', 0, 1.5, 0.01, 'wave amplitude');
        R(volume, c, 'waveFrequency', 0.1, 8, 0.01, 'wave frequency');
        R(volume, c, 'chop', 0, 3, 0.01, 'chop');
        R(volume, c, 'flowSpeed', 0, 6, 0.01, 'flow speed');
        R(volume, c, 'noiseFrequency', 0.1, 6, 0.01, 'noise frequency');
        R(volume, c, 'swirl', 0, 4, 0.01, 'swirl');
        R(volume, c, 'detail', 0, 2, 0.01, 'ripple detail');
        R(volume, c, 'streamStretch', 0.2, 10, 0.05, 'streamwise stretch');
        R(volume, c, 'crestSharpness', 0, 2, 0.01, 'crest creases');
        R(volume, c, 'volumeSteps', 8, 64, 1, 'raymarch steps');

        const surface = folder.addFolder('Surface');
        R(surface, c, 'transparency', 0, 1.5, 0.01, 'transparency');
        R(surface, c, 'depthDensity', 0, 4, 0.01, 'depth density');
        R(surface, c, 'refraction', 0, 4, 0.01, 'refraction strength');
        R(surface, c, 'fresnel', 0, 5, 0.01, 'fresnel');
        R(surface, c, 'envIntensity', 0, 4, 0.01, 'reflection');
        R(surface, c, 'skyReflection', 0, 3, 0.01, 'sky reflection');
        R(surface, c, 'specular', 0, 6, 0.01, 'sun glint');
        R(surface, c, 'translucency', 0, 4, 0.01, 'translucency');
        R(surface, c, 'foam', 0, 5, 0.01, 'foam amount');
        R(surface, c, 'foamSharpness', 0.2, 6, 0.01, 'foam sharpness');
        R(surface, c, 'shred', 0, 1.5, 0.01, 'edge break-up');
        R(surface, c, 'shredDepth', 0.02, 2, 0.01, 'break-up depth');
        R(surface, c, 'glow', 0, 6, 0.01, 'glow');
        R(surface, c, 'opacity', 0, 2, 0.01, 'opacity');
        surface.addColor(c, 'colorDeep').name('deep');
        surface.addColor(c, 'colorShallow').name('shallow');
        surface.addColor(c, 'colorFoam').name('foam');

        const spray = folder.addFolder('Spray, foam & mist');
        R(spray, c, 'dropletRate', 0, 800, 1, 'droplet count/s');
        R(spray, c, 'dropletSize', 0.005, 0.5, 0.005, 'droplet size');
        R(spray, c, 'dropletSpeed', 0, 10, 0.05, 'droplet speed');
        R(spray, c, 'dropletLifetime', 0.1, 5, 0.05, 'droplet lifetime');
        R(spray, c, 'sprayRate', 0, 600, 1, 'spray count/s');
        R(spray, c, 'spraySpeed', 0, 20, 0.1, 'spray speed');
        R(spray, c, 'foamRate', 0, 200, 1, 'foam count/s');
        R(spray, c, 'foamSize', 0.05, 3, 0.01, 'foam size');
        R(spray, c, 'foamLifetime', 0.1, 6, 0.05, 'foam lifetime');
        R(spray, c, 'mistDensity', 0, 2, 0.01, 'mist density');
        R(spray, c, 'mistSize', 0.1, 5, 0.01, 'mist size');
        R(spray, c, 'mistLifetime', 0.2, 6, 0.05, 'mist lifetime');
        R(spray, c, 'wakeRate', 0, 30, 0.5, 'wake ripples/s');

        const impact = folder.addFolder('Splash');
        R(impact, c, 'splashSize', 0.2, 12, 0.05, 'splash size');
        R(impact, c, 'splashIntensity', 0, 5, 0.01, 'splash intensity');
        R(impact, c, 'crownJets', 0, 40, 1, 'crown jets');
        R(impact, c, 'foamSpread', 0, 20, 0.1, 'foam spread');
        R(impact, c, 'foamLingering', 0.5, 12, 0.1, 'foam lifetime');
        R(impact, c, 'rippleSize', 0.5, 20, 0.1, 'ripple size');
        R(impact, c, 'rippleSpeed', 0.1, 4, 0.01, 'ripple speed');
        R(impact, c, 'explosionShake', 0, 3, 0.01, 'shake');
        R(impact, c, 'explosionFlash', 0, 2, 0.01, 'screen flash');
      },

      earth: () => {
        const crust = folder.addFolder('Crust');
        R(crust, c, 'crustWidth', 0.5, 10, 0.05, 'crust width');
        R(crust, c, 'crustDensity', 0.2, 3, 0.01, 'plate density');
        R(crust, c, 'plateSize', 0.2, 3, 0.01, 'plate size');
        R(crust, c, 'plateThickness', 0.02, 1, 0.01, 'plate thickness');
        R(crust, c, 'paintTime', 0.03, 1.5, 0.01, 'paint time');

        const fracture = folder.addFolder('Fracture');
        R(fracture, c, 'crackDelay', 0.02, 3, 0.01, 'crack delay');
        R(fracture, c, 'crackSharpness', 0.05, 1.5, 0.01, 'crack snap');
        R(fracture, c, 'plateTilt', 0, 1.6, 0.01, 'plate tilt');
        R(fracture, c, 'plateLift', 0, 1.5, 0.01, 'plate lift');
        R(fracture, c, 'plateSpread', 0, 1.5, 0.01, 'plate spread');

        const rocks = folder.addFolder('Rocks');
        R(rocks, c, 'rockCount', 0.1, 3, 0.01, 'rock count');
        R(rocks, c, 'rockSpacing', 0.2, 4, 0.01, 'rock spacing');
        R(rocks, c, 'rockSize', 0.1, 3, 0.01, 'rock size');
        R(rocks, c, 'rockRandomness', 0, 2, 0.01, 'boulder randomness');
        R(rocks, c, 'riseHeight', 0.1, 4, 0.01, 'rise height');
        R(rocks, c, 'riseSpeed', 0.5, 14, 0.05, 'rise speed');
        R(rocks, c, 'sinkDelay', 0, 4, 0.01, 'sink delay');
        R(rocks, c, 'tumble', 0, 4, 0.01, 'tumble');
        rocks.addColor(c, 'colorRock').name('rock');
        rocks.addColor(c, 'colorRockDark').name('rock dark');
        rocks.addColor(c, 'colorMoss').name('moss');

        const ground = folder.addFolder('Ground damage');
        R(ground, c, 'crackWidth', 0, 2, 0.01, 'crack width');
        R(ground, c, 'crackDepth', 0, 3, 0.01, 'crack depth');
        R(ground, c, 'groundDisplacement', 0, 2, 0.01, 'ground displacement');
        R(ground, c, 'glow', 0, 4, 0.01, 'crack glow');

        const debris = folder.addFolder('Dust & debris');
        R(debris, c, 'dustAmount', 0, 3, 0.01, 'dust amount');
        R(debris, c, 'dustLifetime', 0.2, 6, 0.05, 'dust lifetime');
        R(debris, c, 'dustSize', 0.1, 5, 0.01, 'dust size');
        R(debris, c, 'debrisRate', 0, 300, 1, 'debris rate');
        R(debris, c, 'debrisVelocity', 0, 20, 0.1, 'debris velocity');
        R(debris, c, 'debrisSize', 0.01, 0.6, 0.005, 'debris size');
        R(debris, c, 'debrisLifetime', 0.1, 5, 0.05, 'debris lifetime');
        R(debris, c, 'pebbleRate', 0, 200, 1, 'pebble rate');

        const impact = folder.addFolder('Tower');
        R(impact, c, 'towerHeight', 0.5, 20, 0.05, 'tower height');
        R(impact, c, 'towerWidth', 0.1, 5, 0.01, 'tower width');
        R(impact, c, 'towerRiseTime', 0.1, 4, 0.01, 'rise time');
        R(impact, c, 'towerHold', 0, 8, 0.05, 'hold time');
        R(impact, c, 'towerRocks', 0, 60, 1, 'base rocks');
        R(impact, c, 'towerRockRadius', 0.2, 8, 0.05, 'base rock radius');
        R(impact, c, 'shakeIntensity', 0, 4, 0.01, 'shake intensity');
        R(impact, c, 'shakeDuration', 0.1, 4, 0.01, 'shake duration');
        R(impact, c, 'explosionFlash', 0, 2, 0.01, 'screen flash');
      },

      wind: () => {
        const spiral = folder.addFolder('Spiral');
        R(spiral, c, 'ribbonCount', 1, 8, 1, 'sheet count');
        R(spiral, c, 'ribbonWidth', 0.05, 6, 0.01, 'sheet width');
        R(spiral, c, 'ribbonOpacity', 0, 2, 0.01, 'ribbon opacity');
        R(spiral, c, 'ribbonLength', 1, 24, 0.1, 'ribbon length');
        R(spiral, c, 'spiralRadius', 0.05, 4, 0.01, 'spiral radius');
        // Past a half turn the roll puts a zero-width seam in view.
        R(spiral, c, 'sheetTwist', 0, 3.14, 0.01, 'sheet roll');
        R(spiral, c, 'rotationSpeed', 0, 20, 0.05, 'rotation speed');
        R(spiral, c, 'vortexStrength', 0, 5, 0.01, 'vortex strength');
        R(spiral, c, 'swirlSpeed', 0, 8, 0.01, 'swirl speed');
        R(spiral, c, 'filamentCount', 1, 64, 1, 'hairlines/sheet');
        R(spiral, c, 'filamentSharpness', 0, 1, 0.01, 'hairline sharpness');
        R(spiral, c, 'turbulence', 0, 3, 0.01, 'turbulence');
        R(spiral, c, 'haze', 0, 2, 0.01, 'vapour haze');
        R(spiral, c, 'opacity', 0, 2, 0.01, 'opacity');
        R(spiral, c, 'glow', 0, 5, 0.01, 'glow');
        R(spiral, c, 'fresnel', 0, 5, 0.01, 'fresnel');
        R(spiral, c, 'distortion', 0, 4, 0.01, 'distortion');
        R(spiral, c, 'noiseStrength', 0, 3, 0.01, 'noise strength');
        R(spiral, c, 'noiseFrequency', 0.1, 6, 0.01, 'noise frequency');
        spiral.addColor(c, 'colorInner').name('inner colour');
        spiral.addColor(c, 'colorOuter').name('outer colour');

        const debris = folder.addFolder('Leaves & dust');
        R(debris, c, 'leafCount', 0, 200, 1, 'leaf count/s');
        R(debris, c, 'leafSize', 0.02, 0.8, 0.005, 'leaf size');
        R(debris, c, 'leafSpin', 0, 12, 0.05, 'leaf spin');
        R(debris, c, 'leafLifetime', 0.2, 6, 0.05, 'leaf lifetime');
        R(debris, c, 'dustAmount', 0, 3, 0.01, 'dust amount');
        R(debris, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
        R(debris, c, 'dustRate', 0, 400, 1, 'dust rate');

        const impact = folder.addFolder('Tornado');
        R(impact, c, 'tornadoHeight', 1, 20, 0.1, 'tornado height');
        R(impact, c, 'tornadoRadius', 0.2, 8, 0.05, 'tornado radius');
        R(impact, c, 'tornadoDuration', 0.2, 6, 0.05, 'tornado duration');
        R(impact, c, 'tornadoNeck', 0.04, 0.8, 0.01, 'funnel neck');
        R(impact, c, 'tornadoShells', 1, 4, 1, 'funnel shells');
        R(impact, c, 'tornadoRoughness', 0, 0.5, 0.01, 'funnel roughness');
        R(impact, c, 'tornadoLean', 0, 1.5, 0.01, 'funnel lean');
        R(impact, c, 'burstIntensity', 0, 5, 0.01, 'burst intensity');
        R(impact, c, 'explosionShake', 0, 3, 0.01, 'shake');
        R(impact, c, 'explosionFlash', 0, 2, 0.01, 'screen flash');
      }
    };

    build[element]?.();

    const light = folder.addFolder('Dynamic light');
    Editor.range(light, c, 'lightIntensity', 0, 80, 0.1, 'light intensity');
    Editor.range(light, c, 'lightRadius', 0.5, 40, 0.1, 'light radius');
    light.addColor(c, 'lightColor').name('light colour');
  }

  _buildEnvironment() {
    const folder = this.gui.addFolder('Environment');
    const e = settings.environment;
    const R = Editor.range;

    R(folder, e, 'sunIntensity', 0, 8, 0.01, 'key intensity');
    folder.addColor(e, 'sunColor').name('key colour');
    R(folder, e, 'sunAzimuth', 0, Math.PI * 2, 0.01, 'key azimuth');
    R(folder, e, 'sunElevation', 0.05, 1.5, 0.01, 'key elevation');
    R(folder, e, 'ambientIntensity', 0, 3, 0.01, 'ambient');
    folder.addColor(e, 'ambientColor').name('ambient colour');
    R(folder, e, 'hemiIntensity', 0, 3, 0.01, 'hemisphere');
    R(folder, e, 'envIntensity', 0, 3, 0.01, 'env (IBL)');
    R(folder, e, 'shadowRadius', 0, 8, 0.05, 'shadow softness');
    R(folder, e, 'shadowBias', -0.01, 0.001, 0.0001, 'shadow bias');
    R(folder, e, 'contactShadow', 0, 1.5, 0.01, 'contact shadow');

    const rim = folder.addFolder('Rim light');
    R(rim, e, 'rimIntensity', 0, 4, 0.01, 'rim intensity');
    rim.addColor(e, 'rimColor').name('rim colour');
    R(rim, e, 'rimAzimuth', 0, Math.PI * 2, 0.01, 'rim azimuth');
    R(rim, e, 'rimElevation', 0.05, 1.5, 0.01, 'rim elevation');
    rim.addColor(e, 'hemiSkyColor').name('hemi sky');
    rim.addColor(e, 'hemiGroundColor').name('hemi bounce');

    const fog = folder.addFolder('Backdrop, fog & dust');
    fog.addColor(e, 'backgroundColor').name('backdrop');
    fog.addColor(e, 'fogColor').name('fog colour');
    R(fog, e, 'fogNear', 1, 120, 1, 'fog near');
    R(fog, e, 'fogFar', 10, 400, 1, 'fog far');
    R(fog, e, 'dustAmount', 0, 3, 0.01, 'floating dust');

    const floor = folder.addFolder('Stage floor');
    floor.addColor(e, 'floorColor').name('floor colour');
    floor.addColor(e, 'floorTint').name('floor tint');
    R(floor, e, 'floorRoughness', 0.05, 1, 0.01, 'roughness');
    R(floor, e, 'floorSheen', 0, 1, 0.01, 'sheen');
    R(floor, e, 'floorPool', 0, 1, 0.01, 'light pool');
  }

  _buildPost() {
    const folder = this.gui.addFolder('Post processing');
    const p = settings.post;
    const R = Editor.range;

    folder.add(p, 'enabled').name('enabled');
    R(folder, p, 'exposure', 0.1, 3, 0.01, 'exposure');
    R(folder, p, 'bloomStrength', 0, 3, 0.01, 'bloom intensity');
    R(folder, p, 'bloomRadius', 0, 1.5, 0.01, 'bloom radius');
    R(folder, p, 'bloomThreshold', 0, 2, 0.01, 'bloom threshold');
    R(folder, p, 'contrast', 0.5, 2, 0.01, 'contrast');
    R(folder, p, 'saturation', 0, 2.5, 0.01, 'saturation');
    R(folder, p, 'temperature', -0.5, 0.5, 0.01, 'temperature');
    R(folder, p, 'lift', -0.2, 0.2, 0.005, 'lift');
    R(folder, p, 'gain', 0.5, 2, 0.01, 'gain');
    R(folder, p, 'vignette', 0, 1.5, 0.01, 'vignette');
    R(folder, p, 'chromaticAberration', 0, 3, 0.01, 'chromatic aberration');
    R(folder, p, 'grain', 0, 0.2, 0.001, 'film grain');
    R(folder, p, 'flashStrength', 0, 2, 0.01, 'impact flash');
  }

  _buildCamera() {
    const folder = this.gui.addFolder('Camera');
    const c = settings.camera;
    const R = Editor.range;

    // The wheel writes `distance` straight into settings, so the slider listens.
    R(folder, c, 'distance', 1, 40, 0.1, 'distance').listen();
    R(folder, c, 'minDistance', 1, 20, 0.1, 'min distance');
    R(folder, c, 'maxDistance', 4, 40, 0.1, 'max distance');
    R(folder, c, 'zoomSpeed', 0.1, 3, 0.01, 'zoom speed');
    R(folder, c, 'fov', 20, 90, 0.5, 'field of view');
    R(folder, c, 'targetHeight', 0, 4, 0.01, 'target height');
    R(folder, c, 'minPolar', 0.05, 1.5, 0.01, 'min pitch');
    R(folder, c, 'maxPolar', 0.2, 1.55, 0.01, 'max pitch');
    R(folder, c, 'damping', 0.001, 0.5, 0.001, 'follow damping');
    R(folder, c, 'autoFrame', 0, 1, 0.01, 'auto framing');

    folder.add({ clear: () => this.hooks.onClear?.() }, 'clear').name('Clear effects (C)');
  }

  _buildCharacter() {
    const folder = this.gui.addFolder('Character');
    const c = settings.character;
    const R = Editor.range;

    // The controller polls `pose` every frame, so the dropdown needs no handler.
    folder.add(c, 'pose', ['idle', 'sitting']).name('pose (T)');
    R(folder, c, 'blendTime', 0.05, 3, 0.01, 'blend time');
    R(folder, settings.global, 'animationSpeed', 0.1, 3, 0.01, 'idle speed');

    // Everything below re-bakes the seated pose when it changes.
    R(folder, c, 'breathing', 0, 3, 0.01, 'breathing');
    R(folder, c, 'breathRate', 0.05, 1, 0.01, 'breaths / sec');
    R(folder, c, 'legSpread', 0.6, 1.4, 0.01, 'leg spread');
    R(folder, c, 'torsoLean', -20, 20, 0.5, 'torso lean');
    R(folder, c, 'seatClearance', 0, 0.08, 0.002, 'seat clearance');
    R(folder, c, 'handHeight', 0, 0.25, 0.005, 'hand height');
    folder.add(c, 'handsOnKnees').name('hands on knees');
  }

  _buildWalk() {
    const folder = this.gui.addFolder('◎  Walk mode');
    const c = settings.walk;
    const R = Editor.range;

    // App polls `settings.mode` every frame, so this needs no handler either.
    folder.add(settings, 'mode', MODES).name('mode (M)');

    const leap = folder.addFolder('Leap');
    R(leap, c, 'jumpSpeed', 1, 20, 0.1, 'leap speed');
    R(leap, c, 'jumpHeight', 0, 6, 0.05, 'leap height');
    R(leap, c, 'jumpMin', 0.1, 2, 0.05, 'min duration');
    R(leap, c, 'jumpMax', 0.2, 3, 0.05, 'max duration');
    R(leap, c, 'tuck', 0, 1, 0.01, 'fold at');
    R(leap, c, 'poseBlend', 0.05, 2, 0.01, 'pose blend');
    R(leap, c, 'landShake', 0, 3, 0.01, 'landing shake');

    const ride = folder.addFolder('Ride');
    R(ride, c, 'speed', 0.5, 16, 0.1, 'ride speed');
    R(ride, c, 'accel', 0.01, 3, 0.01, 'spin-up time');
    R(ride, c, 'brake', 0.05, 3, 0.01, 'braking time');
    R(ride, c, 'dismountTime', 0.1, 2, 0.01, 'dismount time');
    R(ride, c, 'hover', 0, 0.5, 0.005, 'ground clearance');
    R(ride, c, 'seatSink', 0, 1, 0.01, 'seat sink');
    R(ride, c, 'bob', 0, 0.3, 0.005, 'bounce');
    R(ride, c, 'bobRate', 0.2, 8, 0.05, 'bounces / sec');
    R(ride, c, 'lean', 0, 60, 0.5, 'bank angle');
    R(ride, c, 'leanRate', 0.2, 6, 0.05, 'full-bank turn rate');
    R(ride, c, 'leanDamping', 0.00005, 0.2, 0.00005, 'bank follow');
    R(ride, c, 'turnDamping', 0.000001, 0.01, 0.000001, 'turn follow');
    ride.add(c, 'returnHome').name('leap home after');

    const ball = folder.addFolder('Air ball');
    R(ball, c, 'radius', 0.1, 1.5, 0.01, 'radius');
    R(ball, c, 'squash', 0, 0.6, 0.01, 'squash');
    R(ball, c, 'spin', 0, 8, 0.01, 'swirl speed');
    // Non-integer band counts leave a seam where the longitude wraps.
    R(ball, c, 'bands', 2, 20, 1, 'streamlines');
    R(ball, c, 'twist', 0, 8, 0.01, 'pole-to-pole twist');
    R(ball, c, 'filamentSharp', 0, 1, 0.01, 'strand sharpness');
    R(ball, c, 'turbulence', 0, 3, 0.01, 'turbulence');
    R(ball, c, 'haze', 0, 2, 0.01, 'vapour haze');
    R(ball, c, 'wobble', 0, 0.5, 0.01, 'silhouette wobble');
    R(ball, c, 'fresnel', 0, 5, 0.01, 'fresnel');
    R(ball, c, 'opacity', 0, 2, 0.01, 'opacity');
    R(ball, c, 'glow', 0, 5, 0.01, 'glow');
    ball.addColor(c, 'colorInner').name('inner colour');
    ball.addColor(c, 'colorOuter').name('outer colour');

    const debris = folder.addFolder('Dust & light');
    R(debris, c, 'dustRate', 0, 600, 1, 'dust rate');
    R(debris, c, 'dustSize', 0.05, 3, 0.01, 'dust size');
    R(debris, c, 'dustLifetime', 0.1, 4, 0.05, 'dust lifetime');
    R(debris, c, 'lightIntensity', 0, 40, 0.1, 'light intensity');
    R(debris, c, 'lightRadius', 0.5, 30, 0.1, 'light radius');
    debris.addColor(c, 'lightColor').name('light colour');

    this.walkFolder = folder;
  }

  dispose() {
    this.gui.destroy();
  }
}
