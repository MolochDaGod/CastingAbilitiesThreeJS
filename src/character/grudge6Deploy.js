/**
 * @deprecated PLAY heroes use src/character/toonKitPlay.js (ObjectStore loadRaceKit parity).
 *
 * This file kept for diagnoseCharacterLook helpers only.
 * Do NOT use scaffoldGrudge6Kit / unifySkeletons for Toon RTS play —
 * partial head skins + pose() and unskinned mesh AABB caused head-at-feet.
 *
 * RIGHT SOURCE: info.grudge-studio.com/js/grudge6-kit.js
 */
import {
  Box3,
  DoubleSide,
  MeshStandardMaterial,
  Skeleton,
  SRGBColorSpace,
  Vector3
} from 'three';
import {
  BIP001_CORE_BONES,
  HUMAN_HEIGHT_M,
  validateBip001Bones
} from '../config/grudge6SSOT.js';

export { HUMAN_HEIGHT_M, validateBip001Bones };
export const HEIGHT_BAND_MIN = 1.55;
export const HEIGHT_BAND_MAX = 2.15;

const _size = new Vector3();
const _center = new Vector3();
const _origin = new Vector3();
const _ax = new Vector3();

// ── skeleton ──────────────────────────────────────────────────────────────

export function unifySkeletons(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);

  const canon = new Map();
  root.traverse((node) => {
    if (node.isBone && node.name && !canon.has(node.name)) canon.set(node.name, node);
  });
  if (canon.size === 0) {
    console.warn('[grudge6Deploy] unifySkeletons: no Bone nodes');
    return null;
  }

  let widest = null;
  let widestMesh = null;
  let unresolved = 0;
  let rebound = 0;
  const beforeIds = new Set();
  root.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) beforeIds.add(node.skeleton.uuid);
  });

  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton) return;
    const newBones = node.skeleton.bones.map((b) => {
      const c = canon.get(b.name);
      if (!c) unresolved++;
      return c ?? b;
    });
    const newSkel = new Skeleton(newBones, node.skeleton.boneInverses);
    node.bind(newSkel, node.bindMatrix);
    rebound++;
    if (!widest || newSkel.bones.length > widest.bones.length) {
      widest = newSkel;
      widestMesh = node;
    }
  });

  // Drop non-canonical Bone *instances* so AnimationMixer binds the shared tree.
  const canonSet = new Set(canon.values());
  const orphans = [];
  root.traverse((node) => {
    if (node.isBone && !canonSet.has(node)) orphans.push(node);
  });
  for (const bone of orphans) bone.parent?.remove(bone);

  // CRITICAL: never pose() every mesh. Head skins are 1-joint (Bip001 Head only).
  // pose() on a partial skeleton after unify rewrites shared bone matrices → head at feet.
  // Pose once from the widest body skeleton only (or skip — GLTF already in bind pose).
  if (widest) {
    widest.pose();
    widest.update();
  }

  console.info(
    `[grudge6Deploy] unify: ${beforeIds.size} Skeleton objs → 1 tree (${canon.size} named bones), ` +
      `rebound ${rebound}, pruned ${orphans.length}, poseFrom=${widestMesh?.name || '—'}(${widest?.bones.length || 0})` +
      (unresolved ? `, unresolved ${unresolved}` : '')
  );
  return widest;
}

export function countSkeletons(root) {
  const ids = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) ids.add(o.skeleton.uuid);
  });
  return ids.size;
}

// ── equip (Open applyGearPreset) ──────────────────────────────────────────

function meshKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^wk_|^brb_|^orc_|^elf_|^ud_|^dwf_/, '')
    .replace(/units_/g, '')
    .replace(/xtra_/g, '')
    .replace(/weapon_/g, 'weapon')
    .replace(/[^a-z0-9]/g, '');
}

function meshRole(key) {
  if (/weapon|sword|axe|bow|staff|spear|dagger|hammer|mace|pick|shield|quiver|bag|wood/.test(key)) {
    if (/shield/.test(key)) return 'shield';
    if (/quiver|bag|wood/.test(key)) return 'utility';
    return 'weapon';
  }
  if (/body/.test(key)) return 'body';
  if (/head|hat/.test(key)) return 'head';
  if (/arms/.test(key)) return 'arms';
  if (/legs/.test(key)) return 'legs';
  if (/shoulder/.test(key)) return 'shoulders';
  return null;
}

/** Nuclear hide: every Mesh/SkinnedMesh (Open hideAllKitMeshes). */
export function hideAllKitMeshes(group) {
  group.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    if (node.isBone) return;
    node.visible = false;
  });
}

/**
 * Hide all → exclusive role match for mesh_ids.
 * Spiked-blob = this was skipped or multi-body shown.
 * @returns {{ matched: number, shown: string[], missing: string[] }}
 */
export function applyExclusiveMeshIds(group, meshIds = [], { allowUtility = false } = {}) {
  hideAllKitMeshes(group);
  const wantKeys = (meshIds || []).map(meshKey).filter(Boolean);
  const missing = [];
  const shown = [];

  if (!wantKeys.length) {
    // bare body A fail-safe
    group.traverse((node) => {
      if (!node.isSkinnedMesh) return;
      if (/units_body_a|bodya/i.test(meshKey(node.name))) {
        node.visible = true;
        shown.push(node.name);
      }
    });
    return { matched: shown.length, shown, missing: ['empty-loadout'] };
  }

  const cands = [];
  group.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    const key = meshKey(node.name);
    if (!key) return;
    let score = 0;
    for (const w of wantKeys) {
      if (key === w) score = Math.max(score, 100);
      else if (key.endsWith(w) || w.endsWith(key)) score = Math.max(score, 70);
      else if (key.includes(w) || w.includes(key)) score = Math.max(score, 40);
    }
    if (score > 0) cands.push({ node, key, score, role: meshRole(key) });
  });
  cands.sort((a, b) => b.score - a.score);

  const taken = new Set();
  for (const c of cands) {
    const role = c.role || c.key;
    if (role === 'utility' && !allowUtility) continue;
    if (role !== 'utility' && taken.has(role)) continue;
    if (role !== 'utility') taken.add(role);
    c.node.visible = true;
    shown.push(c.node.name);
  }

  for (const w of wantKeys) {
    if (!cands.some((c) => c.score >= 70 && (c.key === w || c.key.endsWith(w) || w.endsWith(c.key)))) {
      missing.push(w);
    }
  }

  // Fail-safe body
  if (!shown.some((n) => /body/i.test(n))) {
    group.traverse((node) => {
      if (!node.isSkinnedMesh || shown.length > 8) return;
      if (/body/i.test(node.name) && !/weapon/i.test(node.name)) {
        node.visible = true;
        shown.push(node.name);
      }
    });
  }

  // Hard ban utility
  if (!allowUtility) {
    group.traverse((n) => {
      if ((!n.isMesh && !n.isSkinnedMesh) || !n.name) return;
      if (/xtra_|bag|wood|quiver/i.test(n.name)) n.visible = false;
    });
  }

  console.info(
    `[grudge6Deploy] equip exclusive shown=${shown.length} missing=${missing.length}`,
    shown.slice(0, 8)
  );
  return { matched: shown.length, shown, missing };
}

// ── measure / fit (Open fitCharacterHeight) ────────────────────────────────

/**
 * Body AABB for height/feet. Prefer non-precise box first — precise skinned
 * bounds on multi-skin Toon kits often inflate (~12m) and wreck SI fit.
 */
export function bodyBox(root, visibleOnly = true) {
  const box = new Box3();
  let any = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  root.updateMatrixWorld(true);

  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (visibleOnly && !o.visible) return;
    if (/weapon|shield|quiver|bag|xtra|sword|staff|bow|axe|hammer|spear/i.test(o.name || '')) {
      return;
    }
    try {
      // Non-precise first (world matrix * geometry bbox) — stable for grudge6
      const b = new Box3().setFromObject(o, false);
      if (b.isEmpty() || !Number.isFinite(b.min.y)) return;
      if (!any) {
        box.copy(b);
        any = true;
      } else box.union(b);
    } catch {
      /* */
    }
  });
  if (!any) box.setFromObject(root, false);
  return box;
}

export function measureHeight(root) {
  bodyBox(root, true).getSize(_size);
  return _size.y;
}

export function forceUniformScale(root) {
  const s = (Math.abs(root.scale.x) + Math.abs(root.scale.y) + Math.abs(root.scale.z)) / 3;
  const u = Number.isFinite(s) && s > 1e-6 ? s : 1;
  root.scale.set(u, u, u);
}

export function findPelvis(root) {
  return (
    root.getObjectByName('Bip001 Pelvis') ||
    root.getObjectByName('Bip001_Pelvis') ||
    root.getObjectByName('Bip001') ||
    null
  );
}

/**
 * Fit kit to ~1.8 m. Production GLBs already body-bake to SI (~1.8 m); only
 * re-scale when measure is outside a sane band (avoids 12m false measure → 0.15×).
 */
export function fitCharacterHeight(model, targetM = HUMAN_HEIGHT_M, opts = {}) {
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  model.updateMatrixWorld(true);

  const nativeHeight = measureHeight(model) || 1;
  const pipeline = opts.pipeline || model.userData.importPipeline || 'glb-baked';

  let unitFix = 1;
  let fit = 1;

  // Already human-scale (convert bake) — do not shrink further
  if (nativeHeight >= 1.2 && nativeHeight <= 3.5) {
    unitFix = 1;
    fit = 1;
  } else if (nativeHeight >= 70 && nativeHeight <= 250) {
    // classic cm-as-m (~180)
    unitFix = 0.01;
    model.scale.setScalar(unitFix);
    model.updateMatrixWorld(true);
    const midH = measureHeight(model) || targetM;
    fit = Math.min(12, Math.max(0.02, targetM / midH));
  } else if (nativeHeight > 3.5 && nativeHeight < 40) {
    // inflated measure / leftover Unity residual — one residual fit
    fit = Math.min(12, Math.max(0.02, targetM / nativeHeight));
  } else if (nativeHeight < 0.4) {
    unitFix = 100;
    model.scale.setScalar(unitFix);
    model.updateMatrixWorld(true);
    const midH = measureHeight(model) || targetM;
    fit = Math.min(12, Math.max(0.02, targetM / midH));
  }

  const finalScale = unitFix * fit;
  model.scale.setScalar(finalScale);
  model.updateMatrixWorld(true);
  model.userData.grudgeUnitFix = unitFix;
  model.userData.grudgeNativeHeight = nativeHeight;
  model.userData.grudgeHeightFit = true;
  model.userData.deployScaleFactor = finalScale;
  model.userData.deployHeightM = measureHeight(model);

  // Pelvis XZ + feet Y
  const box2 = bodyBox(model, true);
  box2.getCenter(_center);
  const hips = findPelvis(model);
  if (hips) hips.getWorldPosition(_ax);
  else _ax.set(_center.x, 0, _center.z);
  model.getWorldPosition(_origin);
  model.position.x -= _ax.x - _origin.x;
  model.position.z -= _ax.z - _origin.z;
  model.updateMatrixWorld(true);
  const box3 = bodyBox(model, true);
  model.position.y -= box3.min.y;
  model.updateMatrixWorld(true);
  model.userData.deployHeightM = measureHeight(model);

  console.info(
    `[grudge6Deploy] fit pipeline=${pipeline} native=${nativeHeight.toFixed(2)}m ` +
      `scale=${finalScale.toFixed(4)} → h=${model.userData.deployHeightM.toFixed(2)}m`
  );

  return { scale: finalScale, nativeHeight, unitFix, height: model.userData.deployHeightM };
}

export function applyArtForwardPlusZ(model) {
  if (!model || model.userData.artForwardSet) return false;
  model.rotation.y = Math.PI / 2;
  model.userData.artForwardSet = true;
  model.userData.artForwardYaw = Math.PI / 2;
  return true;
}

export function reGroundAfterAnimSample(root, groundY = 0) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  root.updateMatrixWorld(true);
  const box = bodyBox(root, true);
  if (!Number.isFinite(box.min.y)) return 0;
  const dy = groundY - box.min.y;
  if (Math.abs(dy) > 1e-5) root.position.y += dy;
  return dy;
}

export function diagnoseCharacterLook(root, groundY = 0) {
  const errors = [];
  const box = bodyBox(root, true);
  box.getSize(_size);
  const height = _size.y;
  const feetMinY = box.min.y;
  if (height < HEIGHT_BAND_MIN || height > HEIGHT_BAND_MAX) {
    errors.push(`height ${height.toFixed(2)} not in ${HEIGHT_BAND_MIN}–${HEIGHT_BAND_MAX}`);
  }
  if (Math.abs(feetMinY - groundY) > 0.12) {
    errors.push(`feet minY ${feetMinY.toFixed(3)} off ground`);
  }
  const bip = validateBip001Bones(root);
  if (!findPelvis(root) && bip.count === 0) errors.push('no Bip001 Pelvis');
  // Height/feet are hard gates; Bip001 name-validate is soft (clips rematch separately)
  if (!bip.ok && bip.count < 12) errors.push(`Bip001 weak ${bip.count}/${bip.expected}`);
  return {
    ok: errors.length === 0,
    errors,
    height,
    feetMinY,
    scaleFactor: root.userData.deployScaleFactor ?? 1,
    artForward: !!root.userData.artForwardSet,
    bip001: bip
  };
}

// ── materials ─────────────────────────────────────────────────────────────

/** Neutralize metal / colorSpace on embedded maps (glb-baked path). */
export function restoreCharacterMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) {
        m.map.colorSpace = SRGBColorSpace;
        m.map.flipY = false;
      }
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        m.metalness = Math.min(m.metalness ?? 0, 0.08);
        m.roughness = Math.max(m.roughness ?? 0.7, 0.55);
        if (m.map) m.color?.setHex?.(0xffffff);
        m.needsUpdate = true;
      }
    }
  });
}

/**
 * Body/armor atlas only when maps missing. Never force-replace good GLB embeds
 * (Open: glb-baked scramble risk). Always skip weapons.
 */
export function applyBodyAtlasIfNeeded(root, atlas) {
  if (!root || !atlas) {
    restoreCharacterMaterials(root);
    return 0;
  }
  let mapped = 0;
  let total = 0;
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    total++;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m?.map)) mapped++;
  });
  const ratio = total ? mapped / total : 0;
  restoreCharacterMaterials(root);
  // If most skins already have maps, keep embeds
  if (ratio >= 0.5) {
    console.info(`[grudge6Deploy] keep embedded maps mapRatio=${ratio.toFixed(2)}`);
    return 0;
  }
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (/weapon|shield|quiver|bag|xtra|sword|bow|staff|axe|hammer|spear/i.test(o.name || '')) {
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.map = atlas;
      m.color?.setHex?.(0xffffff);
      m.map.colorSpace = SRGBColorSpace;
      m.map.flipY = false;
      m.metalness = 0.05;
      m.roughness = 0.7;
      m.side = DoubleSide;
      m.needsUpdate = true;
      n++;
    }
  });
  console.info(`[grudge6Deploy] atlas rebound mats=${n} (mapRatio was ${ratio.toFixed(2)})`);
  return n;
}

export function prepMeshFlags(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
}

// ── full scaffold (the missing step) ──────────────────────────────────────

/**
 * @deprecated PURGED for play. Use toonKitPlay.deployToonPlayKit (ObjectStore parity).
 * Calling this throws so wrong systems cannot re-enter Casting production path.
 */
export function scaffoldGrudge6Kit(_kit, _opts = {}) {
  throw new Error(
    '[grudge6Deploy] scaffoldGrudge6Kit PURGED — use toonKitPlay.deployToonPlayKit ' +
      '(ObjectStore loadRaceKit parity). unify+pose/mesh-AABB/facePlusZ path is banned for play.',
  );
}

/** @deprecated PURGED for play. Use toonKitPlay.deployToonPlayKit. */
export function deployGrudge6Model(_model, _opts = {}) {
  throw new Error(
    '[grudge6Deploy] deployGrudge6Model PURGED — use toonKitPlay.deployToonPlayKit.',
  );
}

export function applyBodyAtlas(root, atlas) {
  return applyBodyAtlasIfNeeded(root, atlas);
}
