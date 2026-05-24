import * as THREE from 'three';

export type ShapeType = 'character' | 'box' | 'cube' | 'tetrahedron';

export interface ShapeDef {
  type: ShapeType;
  labelKey: string;
  defaultScale: { x: number; y: number; z: number };
  buildMesh: (colorHex: number) => THREE.Group;
}

export const CHARACTER_PALETTE = [
  { color: 0x4a90d9, label: 'Blue' },
  { color: 0xe74c3c, label: 'Red' },
  { color: 0x2ecc71, label: 'Green' },
  { color: 0xf39c12, label: 'Orange' },
  { color: 0x9b59b6, label: 'Purple' },
  { color: 0x1abc9c, label: 'Teal' },
];

export function hexStringToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16) || 0x4a90d9;
}

// ── Shape builders ────────────────────────────────────────────────

function buildCharacterMesh(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d6c6, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.75, 12), bodyMat);
  torso.position.y = 0.75;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat);
  head.position.y = 1.3;
  head.castShadow = true;
  group.add(head);

  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), darkMat);
  lArm.position.set(-0.38, 1.05, 0);
  lArm.rotation.z = 0.15;
  lArm.castShadow = true;
  group.add(lArm);

  const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), darkMat);
  rArm.position.set(0.38, 1.05, 0);
  rArm.rotation.z = -0.15;
  rArm.castShadow = true;
  group.add(rArm);

  const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 8), darkMat);
  lLeg.position.set(-0.14, 0.3, 0);
  lLeg.castShadow = true;
  group.add(lLeg);

  const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 8), darkMat);
  rLeg.position.set(0.14, 0.3, 0);
  rLeg.castShadow = true;
  group.add(rLeg);

  const hatMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 12), hatMat);
  hat.position.y = 1.48;
  hat.castShadow = true;
  group.add(hat);

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeWhiteMat);
    white.position.set(side * 0.06, 1.35, 0.14);
    group.add(white);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyePupilMat);
    pupil.position.set(side * 0.06, 1.35, 0.175);
    group.add(pupil);
  }

  return group;
}

function buildBoxMesh(colorHex: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
  const geo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.3;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function buildCubeMesh(colorHex: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
  const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.35;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function buildTetrahedronMesh(colorHex: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, flatShading: true });
  const geo = new THREE.TetrahedronGeometry(0.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.35;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// ── Registry ──────────────────────────────────────────────────────

export const SHAPE_DEFS: ShapeDef[] = [
  { type: 'character', labelKey: 'director3d.character', defaultScale: { x: 1.2, y: 1.2, z: 1.2 }, buildMesh: buildCharacterMesh },
  { type: 'box', labelKey: 'director3d.shapeBox', defaultScale: { x: 1, y: 1, z: 1 }, buildMesh: buildBoxMesh },
  { type: 'cube', labelKey: 'director3d.shapeCube', defaultScale: { x: 1, y: 1, z: 1 }, buildMesh: buildCubeMesh },
  { type: 'tetrahedron', labelKey: 'director3d.shapeTetrahedron', defaultScale: { x: 1, y: 1, z: 1 }, buildMesh: buildTetrahedronMesh },
];

const builderMap = new Map<ShapeType, (colorHex: number) => THREE.Group>();
for (const def of SHAPE_DEFS) {
  builderMap.set(def.type, def.buildMesh);
}

export function buildMeshForType(type: ShapeType, colorHex: number): THREE.Group {
  const builder = builderMap.get(type);
  if (!builder) {
    return buildCharacterMesh(colorHex);
  }
  return builder(colorHex);
}

export function getShapeDef(type: ShapeType): ShapeDef | undefined {
  return SHAPE_DEFS.find((d) => d.type === type);
}
