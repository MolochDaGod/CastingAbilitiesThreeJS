/**
 * Prevent impossible mesh swaps / T-pose / mixamorig-on-Bip001 / whole-body GLB as "equip".
 * Equip = mesh_ids visibility on the SAME Toon kit. Race change = full setRace reload.
 * @see docs/MESH_SWAP_BLEND_CORRECT_SSOT.md · skill grudge-character-correctness
 */

const BIP_MARKERS = [
  ['Bip001 Pelvis', 'Bip001_Pelvis', 'Pelvis'],
  ['Bip001 L Foot', 'Bip001_L_Foot'],
  ['Bip001 R Foot', 'Bip001_R_Foot'],
  ['Bip001 Head', 'Bip001_Head'],
];

function findNamed(root, names) {
  if (!root) return null;
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

export function kitBoneReport(root) {
  const bones = {};
  let mixamo = 0;
  let bip = 0;
  if (root) {
    root.traverse((o) => {
      const n = o.name || '';
      if (/mixamorig/i.test(n)) mixamo++;
      if (/^Bip001/i.test(n)) bip++;
    });
  }
  for (const names of BIP_MARKERS) {
    bones[names[0]] = !!findNamed(root, names);
  }
  return { bones, mixamo, bip };
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[], report: object }}
 */
export function verifyPlayKit(root) {
  const errors = [];
  const warnings = [];
  if (!root) {
    return { ok: false, errors: ['no-root'], warnings, report: {} };
  }
  const contract = root.userData?.warlordsPlayContract;
  if (!contract) warnings.push('missing-warlordsPlayContract');
  if (root.userData?.importPipeline && root.userData.importPipeline !== 'toon-rts-glb') {
    errors.push(`importPipeline=${root.userData.importPipeline} (play must be toon-rts-glb)`);
  }
  const br = kitBoneReport(root);
  if (br.mixamo && !br.bip) errors.push('mixamorig-kit-on-play-path');
  if (br.mixamo && br.bip) errors.push('mixed-mixamo-and-bip001');
  if (!br.bones['Bip001 Pelvis']) errors.push('no-bip001-pelvis');
  if (!br.bones['Bip001 L Foot'] && !br.bones['Bip001 R Foot']) errors.push('no-bip001-feet');
  const h = Number(root.userData?.deployHeightM);
  if (Number.isFinite(h) && (h < 1.45 || h > 2.2)) {
    errors.push(`height-out-of-si ${h.toFixed(2)}m`);
  }
  return { ok: errors.length === 0, errors, warnings, report: br };
}

/**
 * Equip must stay on this kit. Reject whole-GLB / Mixamo / empty body.
 */
export function verifyMeshSwap(root, meshIds = []) {
  const base = verifyPlayKit(root);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const ids = (meshIds || []).map((id) => String(id || ''));
  for (const id of ids) {
    if (/\.glb|\.gltf|\.fbx/i.test(id)) {
      errors.push(`impossible-swap-url ${id} — use mesh_ids not a second body`);
    }
    if (/mixamorig|meshy|capsule/i.test(id)) {
      errors.push(`banned-mesh-id ${id}`);
    }
  }
  if (ids.length && !ids.some((id) => /body/i.test(id))) {
    warnings.push('no-body-in-mesh-ids');
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    report: base.report,
  };
}

export function verifyClipBind(root, clip) {
  const errors = [];
  const warnings = [];
  if (!clip?.tracks?.length) {
    return { ok: false, errors: ['empty-clip'], warnings };
  }
  const names = clip.tracks.map((t) => t.name || '');
  const mix = names.filter((n) => /mixamorig/i.test(n)).length;
  const pos = names.filter((n) => /\.position$/.test(n)).length;
  const quat = names.filter((n) => /\.quaternion$/.test(n)).length;
  if (mix && kitBoneReport(root).bip) {
    errors.push('clip-mixamorig-on-bip001');
  }
  if (pos > 0) warnings.push(`position-tracks=${pos} (must strip before bind)`);
  if (quat < 4) errors.push('too-few-rotation-tracks');
  return { ok: errors.length === 0, errors, warnings, report: { mix, pos, quat } };
}
