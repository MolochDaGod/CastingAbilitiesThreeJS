/**
 * Training Room · DevIsland harvest + training-dummy runtime (Casting lab).
 *
 * Same map as /devnode authoring — one island, not a second world.
 * - Spawns baked rock/ore/pebble GLBs + herb stubs on WORLD.islandRadius pad
 * - F / tryInteract: harvest nearest alive node within HARVEST_RANGE_M (5 m)
 * - Tool gate via equipped weapon (TOOL / t0-tool / pick tags)
 * - Swing → attack one-shot anim → HP drain → bag loot + world drop splash
 * - Training dummies register with CombatFocus as hostiles
 * - applyNodeLayout() consumes DevNode / Training Room JSON
 *
 * Extends App worldHarvest hook — does not fork combat or invent a second mixer.
 * @see trainingRoomMap.js · docs/TRAINING_ROOM_SSOT.md
 */

import {
  Box3,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  DoubleSide
} from 'three';
import { WORLD } from '../config/worldScale.js';
import {
  DEFAULT_DECOR_LAYOUT,
  DEFAULT_DUMMY_LAYOUT,
  DEFAULT_HARVEST_LAYOUT,
  DECOR_MESH_POOL,
  HARVEST_NODE_DEFS,
  HARVEST_RANGE_M,
  HARVEST_SWING_CD,
  pickMeshUrl,
  rollNodeLoot,
  toolLabel,
  toolMatches
} from './devIslandCatalog.js';
import { getEquippedWeapon } from '../combat/equippedWeaponRuntime.js';
import {
  TRAINING_ROOM_LABEL,
  TRAINING_ROOM_MAP_ID,
  paletteIdToHarvestDef
} from './trainingRoomMap.js';
import { resolveTrainingRoomMeshUrl } from './trainingRoomDeploy.js';
import { bagAdd } from '../ui/mainPanelSlots.js';
import { bagItemFromLoot } from '../ui/iconResolve.js';

const _v = new Vector3();
const _box = new Box3();

/**
 * @typedef {object} HarvestNode
 * @property {string} id
 * @property {import('./devIslandCatalog.js').HarvestNodeDef} def
 * @property {Group} root
 * @property {number} hp
 * @property {number} maxHp
 * @property {boolean} alive
 * @property {number} respawnAt
 * @property {number} x
 * @property {number} z
 * @property {Mesh|null} highlight
 * @property {import('three').Object3D|null} model
 */

export class DevIslandHarvest {
  /**
   * @param {{
   *   scene: import('three').Scene,
   *   assets: import('../loaders/AssetLoader.js').AssetLoader,
   *   character?: object,
   *   combatFocus?: import('../combat/CombatFocus.js').CombatFocus|null,
   *   worldDrops?: import('./WorldDrops.js').WorldDrops|null,
   *   dropBag?: { add: (item: object) => void }|null,
   *   onToast?: (s: string) => void,
   *   islandRadius?: number,
   *   rangeM?: number
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.assets = opts.assets;
    this.character = opts.character || null;
    this.combatFocus = opts.combatFocus || null;
    this.worldDrops = opts.worldDrops || null;
    this.dropBag = opts.dropBag || null;
    this.onToast = opts.onToast || (() => {});
    this.islandRadius = opts.islandRadius ?? WORLD.islandRadius ?? 51;
    this.rangeM = opts.rangeM ?? HARVEST_RANGE_M;
    /** Terrain height sample (IslandHeightfield) — feet on hills */
    this.heightSample =
      typeof opts.heightSample === 'function' ? opts.heightSample : (x, z) => 0;

    this.group = new Group();
    this.group.name = 'TrainingRoomHarvest';
    this.group.userData.mapId = TRAINING_ROOM_MAP_ID;
    this.scene.add(this.group);

    this.dummyGroup = new Group();
    this.dummyGroup.name = 'TrainingRoomDummies';
    this.scene.add(this.dummyGroup);

    /** Active layout source: default | storage | import */
    this.layoutSource = 'default';

    /** @type {HarvestNode[]} */
    this.nodes = [];
    /** @type {Group[]} */
    this.dummies = [];
    this._meshCache = new Map();
    this._swingCd = 0;
    this._highlightNode = null;
    this._ready = false;
    this._busy = false;
  }

  get ready() {
    return this._ready;
  }

  get nodeCount() {
    return this.nodes.filter((n) => n.alive).length;
  }

  /**
   * Boot Training Room map: optional DevNode layout, else default harvest+decor+dummies.
   * @param {{ layout?: object|null }} [opts]
   */
  async init(opts = {}) {
    const layout = opts.layout || null;
    if (layout?.nodes?.length) {
      await this.applyNodeLayout(layout);
      this.layoutSource = layout.source || 'import';
    } else {
      await this.spawnDefaultLayout();
      await this.spawnDecor();
      this.spawnTrainingDummies();
      this.layoutSource = 'default';
    }
    this._ready = true;
    console.info(
      `[${TRAINING_ROOM_LABEL}] harvest=${this.nodes.length} decor=${this.decorCount} dummies=${this.dummies.length} src=${this.layoutSource} range=${this.rangeM}m padR=${this.islandRadius.toFixed(1)}`
    );
    return this;
  }

  /**
   * Apply DevNode / Training Room layout JSON (cartesian nodes).
   * Harvestable palette → spawnNode; cliffs → decor; pve_dummy → dummies.
   * @param {object} layout
   */
  async applyNodeLayout(layout) {
    this.clearNodes();
    this.clearDummies();
    if (!this._decor) this._decor = [];
    for (const d of this._decor) {
      this.group.remove(d);
      this._disposeObject(d);
    }
    this._decor.length = 0;

    const nodes = layout?.nodes || [];
    const jobs = [];
    let di = 0;
    for (const n of nodes) {
      const pid = n.paletteId || '';
      const defId = paletteIdToHarvestDef(pid);
      if (defId && HARVEST_NODE_DEFS[defId]) {
        jobs.push(
          this.spawnNode(HARVEST_NODE_DEFS[defId], n.x, n.z, di++).then((node) => {
            if (node?.root && n.yaw != null) node.root.rotation.y = n.yaw;
            if (node?.root && n.scale != null && n.scale !== 1) {
              node.root.scale.setScalar(n.scale);
            }
          })
        );
        continue;
      }
      if (pid === 'node.pve_dummy' || pid.includes('pve_dummy')) {
        const dummy = this._makeDummy(n.label || 'Training dummy');
        const y = this.heightSample(n.x, n.z) || 0;
        dummy.position.set(n.x, y, n.z);
        if (n.yaw != null) dummy.rotation.y = n.yaw;
        this.dummyGroup.add(dummy);
        this.dummies.push(dummy);
        this.combatFocus?.addSelectable?.(dummy, 'hostile');
        continue;
      }
      if (
        pid.startsWith('node.cliff') ||
        pid.includes('cliff') ||
        pid.includes('wall') ||
        pid.includes('arch') ||
        pid.includes('column')
      ) {
        jobs.push(this._spawnDecorAt(n, di++));
      }
      // tree / flower / animal / hemp = play preview via forest/grass layers — skip mesh here
    }
    await Promise.all(jobs.filter(Boolean));
    // If layout had no dummies, keep a minimal combat pad
    if (!this.dummies.length) this.spawnTrainingDummies();
  }

  /**
   * @param {{ x: number, z: number, yaw?: number, scale?: number, paletteId?: string }} n
   * @param {number} seed
   */
  async _spawnDecorAt(n, seed = 0) {
    const url =
      DECOR_MESH_POOL[seed % DECOR_MESH_POOL.length] || DECOR_MESH_POOL[0];
    if (!url) return;
    try {
      const model = await this._loadModel(url, n.scale ?? 1.2);
      if (!model) return;
      const root = new Group();
      root.name = `decor_layout_${seed}`;
      root.userData.decor = true;
      const landY = this.heightSample(n.x, n.z) || 0;
      root.position.set(n.x, landY, n.z);
      root.rotation.y = n.yaw ?? 0;
      root.add(model);
      try {
        _box.setFromObject(root);
        if (Number.isFinite(_box.min.y)) root.position.y += landY - _box.min.y;
      } catch {
        root.position.y = landY;
      }
      this.group.add(root);
      if (!this._decor) this._decor = [];
      this._decor.push(root);
    } catch (err) {
      console.warn('[TrainingRoom] decor layout fail', url, err?.message || err);
    }
  }

  get decorCount() {
    return this._decor?.length || 0;
  }

  /**
   * Shore rockforms / walls — map silhouette, not harvestable.
   */
  async spawnDecor() {
    if (!this._decor) this._decor = [];
    for (const d of this._decor) {
      this.group.remove(d);
      this._disposeObject(d);
    }
    this._decor.length = 0;
    const jobs = DEFAULT_DECOR_LAYOUT.map(async (slot, i) => {
      const url = DECOR_MESH_POOL[slot.mesh % DECOR_MESH_POOL.length];
      if (!url) return;
      try {
        const model = await this._loadModel(url, slot.scale ?? 1.2);
        if (!model) return;
        const root = new Group();
        root.name = `decor_${i}`;
        root.userData.decor = true;
        root.position.set(
          Math.cos(slot.angle) * this.islandRadius * (slot.r ?? 0.82),
          0,
          Math.sin(slot.angle) * this.islandRadius * (slot.r ?? 0.82)
        );
        root.rotation.y = slot.yaw ?? 0;
        root.add(model);
        try {
          _box.setFromObject(root);
          if (Number.isFinite(_box.min.y)) root.position.y -= _box.min.y;
        } catch {
          /* ok */
        }
        this.group.add(root);
        this._decor.push(root);
      } catch (err) {
        console.warn('[DevIsland] decor fail', url, err?.message || err);
      }
    });
    await Promise.all(jobs);
  }

  /**
   * Clear + re-place default harvest ring.
   */
  async spawnDefaultLayout() {
    this.clearNodes();
    const layout = DEFAULT_HARVEST_LAYOUT;
    const jobs = layout.map((slot, i) => {
      const def = HARVEST_NODE_DEFS[slot.defId];
      if (!def) return null;
      const r = this.islandRadius * (slot.r ?? 0.4);
      const x = Math.cos(slot.angle) * r;
      const z = Math.sin(slot.angle) * r;
      return this.spawnNode(def, x, z, i);
    });
    await Promise.all(jobs.filter(Boolean));
  }

  /**
   * @param {import('./devIslandCatalog.js').HarvestNodeDef|string} defOrId
   * @param {number} x
   * @param {number} z
   * @param {number} [seed]
   */
  async spawnNode(defOrId, x, z, seed = 0) {
    const def =
      typeof defOrId === 'string' ? HARVEST_NODE_DEFS[defOrId] : defOrId;
    if (!def) return null;

    const root = new Group();
    root.name = `harvest_${def.id}_${this.nodes.length}`;
    const landY = this.heightSample(x, z) || 0;
    root.position.set(x, landY, z);
    root.userData.harvestNode = true;
    root.userData.defId = def.id;
    root.userData.classId = def.classId;

    let model = null;
    const url = pickMeshUrl(def, seed + def.id.length);
    if (url) {
      try {
        model = await this._loadModel(url, def.scale ?? 1);
        if (model) root.add(model);
      } catch (err) {
        console.warn('[DevIsland] mesh fail', url, err?.message || err);
      }
    }
    if (!model) {
      model = this._makeStub(def);
      root.add(model);
    }

    // Snap mesh soles to terrain surface (local min.y → landY)
    try {
      _box.setFromObject(root);
      if (Number.isFinite(_box.min.y)) {
        root.position.y += landY - _box.min.y;
      }
    } catch {
      root.position.y = landY;
    }

    // Soft interact ring (hidden until nearest)
    const ring = new Mesh(
      new RingGeometry(0.55, 0.72, 32),
      new MeshBasicMaterial({
        color: new Color(def.tint || '#88ccff'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    root.add(ring);

    this.group.add(root);

    /** @type {HarvestNode} */
    const node = {
      id: root.name,
      def,
      root,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      respawnAt: 0,
      x,
      z,
      highlight: ring,
      model
    };
    this.nodes.push(node);
    return node;
  }

  clearNodes() {
    for (const n of this.nodes) {
      this.group.remove(n.root);
      this._disposeObject(n.root);
    }
    this.nodes.length = 0;
    this._highlightNode = null;
  }

  /**
   * Training dummies — simple SI targets for combat focus / Tab cycle.
   */
  spawnTrainingDummies() {
    this.clearDummies();
    for (const slot of DEFAULT_DUMMY_LAYOUT) {
      const r = this.islandRadius * (slot.r ?? 0.32);
      const x = Math.cos(slot.angle) * r;
      const z = Math.sin(slot.angle) * r;
      const dummy = this._makeDummy(slot.label || 'Training dummy');
      const y = this.heightSample(x, z) || 0;
      dummy.position.set(x, y, z);
      this.dummyGroup.add(dummy);
      this.dummies.push(dummy);
      this.combatFocus?.addSelectable?.(dummy, 'hostile');
    }
  }

  clearDummies() {
    for (const d of this.dummies) {
      this.combatFocus?.removeSelectable?.(d);
      this.dummyGroup.remove(d);
      this._disposeObject(d);
    }
    this.dummies.length = 0;
  }

  /**
   * Nearest alive node within range (XZ).
   * @param {Vector3|{x:number,z:number}} pos
   * @param {number} [range]
   * @returns {{ node: HarvestNode, dist: number }|null}
   */
  nearestAlive(pos, range = this.rangeM) {
    let best = null;
    let bestD = range;
    const px = pos.x ?? 0;
    const pz = pos.z ?? 0;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const dx = n.x - px;
      const dz = n.z - pz;
      const d = Math.hypot(dx, dz);
      if (d <= bestD) {
        bestD = d;
        best = n;
      }
    }
    return best ? { node: best, dist: bestD } : null;
  }

  /**
   * App.worldHarvest.tryInteract — F best-next-action hook.
   * @param {Vector3} playerPos
   * @param {number} [radius] ignored if smaller than product 5 m — use this.rangeM
   * @returns {string|false}
   */
  tryInteract(playerPos, radius) {
    const r = Math.max(radius || 0, this.rangeM);
    return this.tryHarvestNearest(playerPos, r);
  }

  /**
   * Harvest nearest node within range with tool in hand (if required).
   * @param {Vector3|{x:number,z:number}} playerPos
   * @param {number} [range]
   * @returns {string|false} toast message or false
   */
  tryHarvestNearest(playerPos, range = this.rangeM) {
    if (this._busy || this._swingCd > 0) return false;
    const hit = this.nearestAlive(playerPos, range);
    if (!hit) return false;

    const { node, dist } = hit;
    const weapon = getEquippedWeapon();
    if (!toolMatches(weapon, node.def)) {
      this.onToast(`Need ${toolLabel(node.def)} · ${node.def.label} (${dist.toFixed(1)} m)`);
      return `Need ${toolLabel(node.def)}`;
    }

    // Face node + play tool / attack swing
    this._faceToward(playerPos, node);
    this._playHarvestAnim(weapon);

    this._swingCd = HARVEST_SWING_CD;
    node.hp -= 1;

    if (node.hp > 0) {
      this._pulseHighlight(node, 0.55);
      const msg = `${node.def.label} · ${node.hp}/${node.maxHp} · ${dist.toFixed(1)} m`;
      this.onToast(msg);
      return msg;
    }

    // Depleted
    this._breakNode(node);
    const loot = rollNodeLoot(node.def);
    for (const raw of loot) {
      // Icons: lab minerals + CDN 496 fallbacks
      const bag = bagItemFromLoot(raw);
      this.dropBag?.add?.(bag);
      // Also Main Panel bag (I inventory) for equip / deposit / RMB menu
      try {
        bagAdd({
          id: bag.id,
          name: bag.name,
          kind: bag.kind || 'mat',
          category: bag.category,
          tier: bag.tier,
          qty: bag.qty || 1,
          icon: bag.icon,
          iconUrl: bag.iconUrl
        });
      } catch {
        /* bag full — drop bag still has it */
      }
      // Splash one unit as world drop near node for pickup demo
      if (this.worldDrops && bag.iconUrl) {
        const ox = (Math.random() - 0.5) * 0.8;
        const oz = (Math.random() - 0.5) * 0.8;
        const landY = this.heightSample(node.x, node.z) || 0;
        this.worldDrops
          .spawn(
            {
              id: bag.id,
              name: bag.name,
              tier: bag.tier,
              qty: 1,
              iconUrl: bag.iconUrl,
              category: bag.category,
              glowColor: 0xc9a227,
              borderColor: 0xe8d48b
            },
            { x: node.x + ox, y: landY, z: node.z + oz },
            { skipModel: true }
          )
          .catch(() => {});
      }
    }
    const names = loot.map((l) => `${l.name}×${l.qty}`).join(', ') || 'loot';
    const msg = `Harvested ${node.def.label} → ${names}`;
    this.onToast(msg);
    return msg;
  }

  /**
   * Frame tick — CD, respawn, nearest highlight.
   * @param {number} dt
   * @param {Vector3|{x:number,z:number}|null} [playerPos]
   */
  update(dt, playerPos = null) {
    if (this._swingCd > 0) this._swingCd = Math.max(0, this._swingCd - dt);
    const now = performance.now() / 1000;

    for (const n of this.nodes) {
      if (!n.alive && n.respawnAt > 0 && now >= n.respawnAt) {
        this._respawnNode(n);
      }
      // Subtle idle bob on live models
      if (n.alive && n.model) {
        n.model.rotation.y += dt * 0.05;
      }
    }

    // Highlight nearest in range
    if (playerPos) {
      const hit = this.nearestAlive(playerPos, this.rangeM);
      const next = hit?.node || null;
      if (this._highlightNode !== next) {
        if (this._highlightNode?.highlight) {
          this._highlightNode.highlight.material.opacity = 0;
        }
        this._highlightNode = next;
      }
      if (next?.highlight) {
        const pulse = 0.35 + 0.25 * Math.sin(now * 4);
        next.highlight.material.opacity = pulse;
        const ok = toolMatches(getEquippedWeapon(), next.def);
        next.highlight.material.color.set(ok ? next.def.tint || '#88ccff' : '#ff6644');
      }
    }
  }

  /* ── internals ─────────────────────────────────────────────── */

  /**
   * @param {string} url
   * @param {number} scale
   */
  async _loadModel(url, scale = 1) {
    // Same-origin public/ on casting deploy; optional CDN when preferCdn
    url = resolveTrainingRoomMeshUrl(url) || url;
    let tpl = this._meshCache.get(url);
    if (!tpl) {
      const gltf = await this.assets.loadGLTF(url);
      tpl = gltf.scene || gltf.scenes?.[0];
      if (!tpl) return null;
      this._meshCache.set(url, tpl);
    }
    const clone = tpl.clone(true);
    clone.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        if (c.material) {
          c.material = c.material.clone?.() || c.material;
        }
      }
    });
    // Fit to SI prop height (~0.9–1.8 m) — author packs may be cm or unitless
    _box.setFromObject(clone);
    const size = new Vector3();
    _box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    // If mesh already ~1–2 m, only apply scale; if huge (cm), compress hard
    let target = 1.35 * scale;
    if (maxDim > 8) target = 1.5 * scale; // classic 100× / big export
    else if (maxDim < 0.25) target = 1.1 * scale; // tiny author
    const s = target / maxDim;
    clone.scale.setScalar(s);
    clone.position.set(0, 0, 0);
    clone.updateMatrixWorld(true);
    return clone;
  }

  /**
   * @param {import('./devIslandCatalog.js').HarvestNodeDef} def
   */
  _makeStub(def) {
    const g = new Group();
    g.name = `stub_${def.classId}`;
    if (def.classId === 'herb' || def.classId === 'fiber') {
      const stem = new Mesh(
        new CylinderGeometry(0.04, 0.06, 0.55, 6),
        new MeshStandardMaterial({ color: 0x3d6b3a, roughness: 0.7 })
      );
      stem.position.y = 0.28;
      const leaf = new Mesh(
        new SphereGeometry(0.22, 8, 6),
        new MeshStandardMaterial({
          color: new Color(def.tint || '#4caf6a'),
          roughness: 0.85
        })
      );
      leaf.position.y = 0.55;
      leaf.scale.set(1.2, 0.55, 1);
      g.add(stem, leaf);
    } else {
      const rock = new Mesh(
        new BoxGeometry(0.9, 0.7, 0.85),
        new MeshStandardMaterial({
          color: new Color(def.tint || '#888'),
          roughness: 0.95
        })
      );
      rock.position.y = 0.35;
      rock.rotation.y = 0.4;
      g.add(rock);
    }
    return g;
  }

  /**
   * @param {string} label
   */
  _makeDummy(label) {
    const root = new Group();
    root.name = label;
    root.userData.displayName = label;
    root.userData.selectable = 'hostile';
    root.userData.hp01 = 1;
    root.userData.kind = 'hostile';
    root.userData.trainingDummy = true;

    const body = new Mesh(
      new CylinderGeometry(0.28, 0.32, 1.5, 10),
      new MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 })
    );
    body.position.y = 0.9;
    body.castShadow = true;

    const head = new Mesh(
      new SphereGeometry(0.22, 10, 8),
      new MeshStandardMaterial({ color: 0xc4a574, roughness: 0.7 })
    );
    head.position.y = 1.85;

    const post = new Mesh(
      new CylinderGeometry(0.08, 0.1, 0.35, 6),
      new MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
    );
    post.position.y = 0.15;

    root.add(post, body, head);
    return root;
  }

  /**
   * @param {HarvestNode} node
   */
  _breakNode(node) {
    node.alive = false;
    node.hp = 0;
    node.root.visible = false;
    const delay = node.def.respawnS ?? 30;
    node.respawnAt = performance.now() / 1000 + delay;
  }

  /**
   * @param {HarvestNode} node
   */
  _respawnNode(node) {
    node.alive = true;
    node.hp = node.maxHp;
    node.respawnAt = 0;
    node.root.visible = true;
    if (node.highlight) node.highlight.material.opacity = 0;
  }

  /**
   * @param {HarvestNode} node
   * @param {number} opacity
   */
  _pulseHighlight(node, opacity) {
    if (node.highlight) node.highlight.material.opacity = opacity;
  }

  /**
   * @param {Vector3|{x:number,z:number}} playerPos
   * @param {HarvestNode} node
   */
  _faceToward(playerPos, node) {
    const ch = this.character;
    if (!ch) return;
    const dx = node.x - (playerPos.x ?? 0);
    const dz = node.z - (playerPos.z ?? 0);
    if (Math.hypot(dx, dz) < 0.01) return;
    const yaw = Math.atan2(dx, dz);
    if (typeof ch.facing === 'number') ch.facing = yaw;
    if (ch.root) ch.root.rotation.y = yaw;
  }

  /**
   * Tool swing = attack one-shot (sword_shield / TOOL pack).
   * @param {object|null} weapon
   */
  _playHarvestAnim(weapon) {
    const ch = this.character;
    if (!ch) return;
    // Prefer attack role (tool skills map mine/chop → attack1)
    if (typeof ch.playWeaponAttack === 'function') {
      ch.playWeaponAttack();
      return;
    }
    if (typeof ch.requestOneShot === 'function') {
      ch.requestOneShot('attack') || ch.requestOneShot('attack1');
    }
    void weapon;
  }

  /**
   * @param {import('three').Object3D} obj
   */
  _disposeObject(obj) {
    obj.traverse((c) => {
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
        else c.material.dispose?.();
      }
    });
  }

  dispose() {
    this.clearNodes();
    this.clearDummies();
    this.scene.remove(this.group);
    this.scene.remove(this.dummyGroup);
  }
}
