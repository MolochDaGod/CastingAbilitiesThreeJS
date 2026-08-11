/**
 * DevNode 3D viewport — place palette nodes on heightfield.
 * Preview only (no full combat/harvest runtime).
 */

import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  MOUSE,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IslandHeightfield } from '../world/IslandHeightfield.js';
import { projectToTerrain, terrainHandle } from '../world/terrainGround.js';
import {
  createEmptyNodeLayout,
  paletteEntry
} from '../world/nodePalette.js';
import { sharedGltfLoader } from '../loaders/gltfPipeline.js';

const _ndc = new Vector2();
const _hit = new Vector3();

export class DevNodeEditor {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.scene.background = new Color(0x0a1218);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 400);
    this.camera.position.set(18, 14, 22);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.5, 0);
    // LMB place · MMB orbit · RMB remove (not orbit)
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: null
    };
    this.controls.enablePan = true;

    this.scene.add(new AmbientLight(0xb0c4d8, 0.55));
    const sun = new DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(12, 22, 8);
    this.scene.add(sun);

    this.terrain = new IslandHeightfield({ amp: 0.75, flatCore: 9 });
    this.scene.add(this.terrain.mesh);
    this.terrainHandle = terrainHandle(this.terrain);

    const grid = new GridHelper(80, 40, 0x2a4050, 0x1a2830);
    grid.position.y = 0.02;
    this.scene.add(grid);

    this.nodeGroup = new Group();
    this.nodeGroup.name = 'DevNodePlaced';
    this.scene.add(this.nodeGroup);

    this.raycaster = new Raycaster();
    this.layout = createEmptyNodeLayout();
    /** @type {Map<string, Mesh|Group>} */
    this.markers = new Map();
    this.selectedPaletteId = 'node.rock_boulder';
    this.placeMode = true;
    this._meshCache = new Map();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    canvas.addEventListener('pointerdown', (e) => this._onPointer(e));
    this.resize();
    this._raf = 0;
    this._loop = this._loop.bind(this);
    this._loop();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 800;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 600;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setBiomeTerrain(terrainOpts) {
    if (!terrainOpts) return;
    // Rebuild terrain with biome knobs (simple — dispose old mesh)
    this.scene.remove(this.terrain.mesh);
    this.terrain.dispose();
    this.terrain = new IslandHeightfield({
      seed: terrainOpts.seed ?? 17,
      amp: terrainOpts.amp ?? 0.75,
      flatCore: terrainOpts.flatCore ?? 9
    });
    this.scene.add(this.terrain.mesh);
    this.terrainHandle = terrainHandle(this.terrain);
    this.layout.terrain = { ...terrainOpts };
    this._reliftAll();
  }

  setSelectedPalette(id) {
    this.selectedPaletteId = id;
  }

  get nodeCount() {
    return this.layout.nodes.length;
  }

  clearNodes() {
    for (const m of this.markers.values()) {
      this.nodeGroup.remove(m);
    }
    this.markers.clear();
    this.layout.nodes = [];
  }

  /**
   * @param {object} layout
   */
  loadLayout(layout) {
    this.clearNodes();
    this.layout = {
      ...createEmptyNodeLayout(layout.biomeId),
      ...layout,
      nodes: []
    };
    if (layout.terrain) this.setBiomeTerrain(layout.terrain);
    for (const n of layout.nodes || []) {
      this._addNode(n.paletteId, n.x, n.z, {
        yaw: n.yaw,
        scale: n.scale,
        id: n.id
      });
    }
  }

  exportLayout() {
    return {
      ...this.layout,
      mapId: this.layout.mapId || 'training_room',
      mapLabel: this.layout.mapLabel || 'Training Room · DevIsland',
      nodes: this.layout.nodes.map((n) => ({ ...n })),
      exportedAt: new Date().toISOString()
    };
  }

  _reliftAll() {
    for (const n of this.layout.nodes) {
      const y = this.terrain.sample(n.x, n.z);
      n.y = y;
      const m = this.markers.get(n.id);
      if (m) m.position.set(n.x, y, n.z);
    }
  }

  _onPointer(e) {
    if (e.button === 2) {
      e.preventDefault();
      this._removeNearest(e);
      return;
    }
    if (e.button !== 0) return;
    // Shift+LMB = orbit only (don't place)
    if (e.shiftKey) return;

    const rect = this.canvas.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(_ndc, this.camera);
    if (!projectToTerrain(this.raycaster, _hit, this.terrainHandle)) return;
    this._addNode(this.selectedPaletteId, _hit.x, _hit.z);
  }

  _removeNearest(e) {
    const rect = this.canvas.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(_ndc, this.camera);
    if (!projectToTerrain(this.raycaster, _hit, this.terrainHandle)) return;
    let best = null;
    let bestD = 2.5 * 2.5;
    for (const n of this.layout.nodes) {
      const d = (n.x - _hit.x) ** 2 + (n.z - _hit.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best) return;
    const m = this.markers.get(best.id);
    if (m) this.nodeGroup.remove(m);
    this.markers.delete(best.id);
    this.layout.nodes = this.layout.nodes.filter((n) => n.id !== best.id);
  }

  /**
   * @param {string} paletteId
   * @param {number} x
   * @param {number} z
   * @param {{ yaw?: number, scale?: number, id?: string }} [opts]
   */
  async _addNode(paletteId, x, z, opts = {}) {
    const entry = paletteEntry(paletteId);
    if (!entry) return;
    const id = opts.id || `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const y = this.terrain.sample(x, z);
    const yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    const scale = opts.scale ?? entry.defaultScale ?? 1;

    const marker = await this._makeMarker(entry, scale);
    marker.position.set(x, y, z);
    marker.rotation.y = yaw;
    marker.userData.nodeId = id;
    this.nodeGroup.add(marker);
    this.markers.set(id, marker);

    this.layout.nodes.push({
      id,
      paletteId,
      x,
      z,
      y,
      yaw,
      scale
    });
  }

  /**
   * @param {import('../world/nodePalette.js').NodePaletteEntry} entry
   * @param {number} scale
   */
  async _makeMarker(entry, scale) {
    const tint = new Color(entry.tint || '#88aacc');
    // Live mesh from pool
    if (entry.meshPool?.length) {
      const url = entry.meshPool[0];
      try {
        let src = this._meshCache.get(url);
        if (!src) {
          const gltf = await sharedGltfLoader().loadAsync(url);
          src = gltf.scene;
          this._meshCache.set(url, src);
        }
        const g = src.clone(true);
        g.scale.setScalar(scale);
        g.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return g;
      } catch {
        /* fall through stub */
      }
    }
    // Procedural / creature stubs
    if (entry.family === 'tree') {
      const g = new Group();
      const trunk = new Mesh(
        new CylinderGeometry(0.12 * scale, 0.22 * scale, 1.2 * scale, 6),
        new MeshStandardMaterial({ color: 0x4a3220, roughness: 1 })
      );
      trunk.position.y = 0.6 * scale;
      const crown = new Mesh(
        new ConeGeometry(0.55 * scale, 1.2 * scale, 7),
        new MeshStandardMaterial({ color: tint, roughness: 0.9 })
      );
      crown.position.y = 1.5 * scale;
      g.add(trunk, crown);
      return g;
    }
    if (entry.family === 'flower' || entry.family === 'hemp' || entry.family === 'herb') {
      const g = new Group();
      const stem = new Mesh(
        new CylinderGeometry(0.02, 0.03, 0.35 * scale, 4),
        new MeshStandardMaterial({ color: 0x3a6a30 })
      );
      stem.position.y = 0.18 * scale;
      const head = new Mesh(
        new SphereGeometry(0.12 * scale, 8, 6),
        new MeshStandardMaterial({ color: tint })
      );
      head.position.y = 0.38 * scale;
      g.add(stem, head);
      return g;
    }
    if (entry.family === 'animal_passive' || entry.family === 'pve_mob') {
      const body = new Mesh(
        new BoxGeometry(0.5 * scale, 0.7 * scale, 0.35 * scale),
        new MeshStandardMaterial({ color: tint, roughness: 0.85 })
      );
      body.position.y = 0.35 * scale;
      return body;
    }
    // Default rock-ish stub
    const rock = new Mesh(
      new SphereGeometry(0.35 * scale, 7, 5),
      new MeshStandardMaterial({ color: tint, roughness: 0.95 })
    );
    rock.position.y = 0.25 * scale;
    rock.scale.set(1.2, 0.7, 1);
    return rock;
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.terrain.dispose();
  }
}
