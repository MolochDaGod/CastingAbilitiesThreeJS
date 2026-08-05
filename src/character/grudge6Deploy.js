/**
 * grudge6 character deploy — Multiverse / grudge-character-correctness SSOT.
 *
 * Order (do not reorder):
 *  1. SkeletonUtils.clone + skeleton.pose
 *  2. SI fit while full kit still visible (bodyBox skips weapons)
 *  3. art-forward +Z once
 *  4. feet ground + pelvis XZ center
 *  5. mesh_ids equip (caller)
 *  6. body-only atlas (caller — never scramble weapon maps if separate)
 *  7. re-ground after equip / idle sample
 *
 * Production CDN GLBs are already body-fit ~1.8 m (aabbBody); fitToHuman is no-op
 * when height is already in band.
 */
import { Box3, DoubleSide, SRGBColorSpace, Vector3 } from 'three';
import { HUMAN_HEIGHT_M } from '../config/grudge6SSOT.js';

export { HUMAN_HEIGHT_M };
export const HEIGHT_BAND_MIN = 1.55;
export const HEIGHT_BAND_MAX = 2.15;

/**
 * Skinned body AABB for height/feet.
 * @param {import('three').Object3D} root
 * @param {boolean} [visibleOnly=false] NEVER true for deploy scale
 *   (mesh_ids hide most meshes → sword becomes “height”).
 */
export function bodyBox(root, visibleOnly = false) {
  const box = new Box3();
  let any = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (visibleOnly && !o.visible) return;
    // Skip pure weapon/shield parts when measuring human height
    if (!visibleOnly && /weapon|shield|quiver|bag|xtra|sword|staff|bow|axe|hammer|spear/i.test(o.name || '')) {
      return;
    }
    try {
      const b = new Box3().setFromObject(o, true);
      if (b.isEmpty() || !Number.isFinite(b.min.y)) return;
      if (!any) {
        box.copy(b);
        any = true;
      } else box.union(b);
    } catch {
      /* skip broken skin */
    }
  });
  if (!any) {
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      try {
        const b = new Box3().setFromObject(o, true);
        if (b.isEmpty()) return;
        if (!any) {
          box.copy(b);
          any = true;
        } else box.union(b);
      } catch {
        /* */
      }
    });
  }
  if (!any) box.setFromObject(root, true);
  return box;
}

export function measureHeight(root) {
  const size = new Vector3();
  bodyBox(root).getSize(size);
  return size.y;
}

/**
 * Uniform unit normalize only. Already SI (1.55–2.15 m) → leave bake alone.
 * Same path for every race including orc.
 */
export function fitToHuman(root, targetH = HUMAN_HEIGHT_M) {
  root.updateMatrixWorld(true);
  let h = measureHeight(root);
  if (h < 1e-4) return 1;

  let factor = 1;

  if (h > 50) {
    root.scale.multiplyScalar(0.01);
    root.updateMatrixWorld(true);
    h = measureHeight(root);
    factor *= 0.01;
  } else if (h < 0.05) {
    root.scale.multiplyScalar(100);
    root.updateMatrixWorld(true);
    h = measureHeight(root);
    factor *= 100;
  }

  if (h >= HEIGHT_BAND_MIN && h <= HEIGHT_BAND_MAX) {
    root.userData.deployScaleFactor = factor;
    root.userData.deployHeightM = h;
    root.userData.grudgeHeightFit = true;
    return factor;
  }

  if (h > 1e-4) {
    const s = targetH / h;
    root.scale.multiplyScalar(s);
    factor *= s;
    root.updateMatrixWorld(true);
    h = measureHeight(root);
  }

  root.userData.deployScaleFactor = factor;
  root.userData.deployHeightM = h;
  root.userData.grudgeHeightFit = true;
  return factor;
}

export function findPelvis(root) {
  return (
    root.getObjectByName('Bip001 Pelvis') ||
    root.getObjectByName('Bip001_Pelvis') ||
    root.getObjectByName('Bip001') ||
    null
  );
}

/** Feet on groundY; center XZ on Bip001 Pelvis (NOT pelvis-as-feet). */
export function groundFeetAndCenterXZ(root, groundY = 0) {
  root.updateMatrixWorld(true);
  let box = bodyBox(root);
  if (Number.isFinite(box.min.y)) {
    root.position.y += groundY - box.min.y;
  }

  const pelvis = findPelvis(root);
  if (pelvis) {
    const wp = new Vector3();
    pelvis.getWorldPosition(wp);
    const parent = root.parent;
    if (parent) {
      const local = parent.worldToLocal(wp.clone());
      root.position.x -= local.x;
      root.position.z -= local.z;
    } else {
      root.position.x -= wp.x;
      root.position.z -= wp.z;
    }
  }

  root.updateMatrixWorld(true);
  box = bodyBox(root);
  if (Number.isFinite(box.min.y)) {
    root.position.y += groundY - box.min.y;
  }
}

/** Toon RTS art faces +X → local +Z once. Idempotent. */
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
  const size = new Vector3();
  box.getSize(size);
  const height = size.y;
  const feetMinY = box.min.y;
  if (height < HEIGHT_BAND_MIN || height > HEIGHT_BAND_MAX) {
    errors.push(`height ${height.toFixed(2)} not in ${HEIGHT_BAND_MIN}–${HEIGHT_BAND_MAX}`);
  }
  if (Math.abs(feetMinY - groundY) > 0.12) {
    errors.push(`feet minY ${feetMinY.toFixed(3)} off ground`);
  }
  if (!findPelvis(root)) errors.push('no Bip001 Pelvis');
  return {
    ok: errors.length === 0,
    errors,
    height,
    feetMinY,
    scaleFactor: root.userData.deployScaleFactor ?? 1,
    artForward: !!root.userData.artForwardSet
  };
}

/**
 * Full deploy: pose skeletons → uniform unit normalize → art-forward → feet ground.
 * Call BEFORE mesh_ids equip.
 */
export function deployGrudge6Model(model, opts = {}) {
  model.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      o.skeleton.pose();
      o.skeleton.update();
    }
  });
  model.updateMatrixWorld(true);

  const beforeH = measureHeight(model);
  fitToHuman(model, opts.targetH ?? HUMAN_HEIGHT_M);
  if (opts.facePlusZ !== false) applyArtForwardPlusZ(model);
  groundFeetAndCenterXZ(model, opts.groundY ?? 0);
  const diag = diagnoseCharacterLook(model, opts.groundY ?? 0);
  diag.beforeHeight = beforeH;
  model.userData.characterDeployed = true;
  console.info(
    `[grudge6Deploy] before=${beforeH.toFixed(2)}m → after=${diag.height?.toFixed(2)}m ` +
      `factor×${(diag.scaleFactor ?? 1).toFixed(4)} feet=${diag.feetMinY?.toFixed(3)} ` +
      (diag.ok ? 'OK' : diag.errors.join('; '))
  );
  return diag;
}

/**
 * Paint race atlas onto body/armor skinned meshes only.
 * NEVER splat onto weapons/shields (scrambles UVs when materials differ).
 * Production GLB often already embeds WK_atlas.webp — still normalize colorSpace.
 *
 * @returns {number} materials touched
 */
export function applyBodyAtlas(root, atlas) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const name = o.name || '';
    if (/weapon|shield|quiver|bag|xtra|sword|bow|staff|axe|hammer|spear|pick/i.test(name)) {
      // Still fix colorSpace on embedded maps
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.map) {
          m.map.colorSpace = SRGBColorSpace;
          m.map.flipY = false;
          m.needsUpdate = true;
        }
      }
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (atlas) {
        m.map = atlas;
        m.color?.set?.(0xffffff);
      }
      if (m.map) {
        m.map.colorSpace = SRGBColorSpace;
        m.map.flipY = false;
      }
      m.vertexColors = false;
      m.metalness = Math.min(m.metalness ?? 0.1, 0.2);
      m.roughness = Math.max(m.roughness ?? 0.75, 0.55);
      m.side = DoubleSide;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

/** Shadow + frustum flags after deploy. */
export function prepMeshFlags(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
}
