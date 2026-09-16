/**
 * Lab climb wall + ladder props for DRC traversal probes.
 * Tagged userData.climbable / userData.ladder — not a second physics system.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';

/**
 * @param {import('three').Scene} scene
 * @param {{ climbAt?: [number, number, number], ladderAt?: [number, number, number] }} [opts]
 * @returns {{ group: Group, climb: Mesh, ladder: Mesh }}
 */
export function spawnTraversalProps(scene, opts = {}) {
  const group = new Group();
  group.name = 'TraversalProps';

  const wallMat = new MeshStandardMaterial({
    color: 0x6b5a3e,
    roughness: 0.92,
    metalness: 0.05
  });
  const rungMat = new MeshStandardMaterial({
    color: 0x8a7350,
    roughness: 0.85,
    metalness: 0.08
  });

  const climbH = 3.2;
  const climb = new Mesh(new BoxGeometry(2.4, climbH, 0.35), wallMat);
  climb.name = 'ClimbWall';
  climb.castShadow = true;
  climb.receiveShadow = true;
  const [cx, cy, cz] = opts.climbAt || [6.5, climbH * 0.5, -4];
  climb.position.set(cx, cy, cz);
  climb.userData.climbable = true;
  climb.userData.grudgeRole = 'climbable';
  climb.userData.heightM = climbH;
  climb.userData.ledgeY = climbH * 0.5;

  const ladderH = 3.6;
  const ladder = new Mesh(new BoxGeometry(0.9, ladderH, 0.12), rungMat);
  ladder.name = 'Ladder';
  ladder.castShadow = true;
  const [lx, ly, lz] = opts.ladderAt || [9.2, ladderH * 0.5, -4];
  ladder.position.set(lx, ly, lz);
  ladder.userData.ladder = true;
  ladder.userData.grudgeRole = 'ladder';
  ladder.userData.heightM = ladderH;

  // Visual rungs (cosmetic)
  for (let i = 0; i < 7; i++) {
    const rung = new Mesh(
      new CylinderGeometry(0.04, 0.04, 0.85, 6),
      rungMat
    );
    rung.rotation.z = Math.PI * 0.5;
    rung.position.set(lx, 0.35 + i * 0.48, lz + 0.08);
    group.add(rung);
  }

  group.add(climb, ladder);
  scene.add(group);
  console.info(
    `[TraversalProps] climbable @ (${cx.toFixed(1)},${cz.toFixed(1)}) ladder @ (${lx.toFixed(1)},${lz.toFixed(1)})`
  );
  return { group, climb, ladder };
}
