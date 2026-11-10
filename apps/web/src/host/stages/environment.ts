/** Peças de cenário partilhadas: céu, luzes, mar, palmeiras, nuvens. */
import * as THREE from 'three';
import { mesh, toon } from '../three/materials';
import type { Rng } from '@festa/game';

export function setupSky(scene: THREE.Scene, opts: { fog?: [number, number] } = {}): THREE.DirectionalLight {
  scene.background = new THREE.Color('#8fd8ff');
  const [near, far] = opts.fog ?? [90, 220];
  scene.fog = new THREE.Fog('#bde9ff', near, far);

  scene.add(new THREE.HemisphereLight('#e8f6ff', '#6a8f4a', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
  sun.position.set(30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -50;
  s.right = 50;
  s.top = 50;
  s.bottom = -50;
  s.near = 1;
  s.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return sun;
}

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly base: Float32Array;

  constructor(size = 400) {
    this.geometry = new THREE.PlaneGeometry(size, size, 60, 60);
    this.geometry.rotateX(-Math.PI / 2);
    this.base = Float32Array.from(this.geometry.attributes.position!.array);
    const mat = new THREE.MeshStandardMaterial({
      color: '#2fa8e0',
      roughness: 0.25,
      metalness: 0.05,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.position.y = -0.7;
    this.mesh.receiveShadow = true;
  }

  update(time: number): void {
    const pos = this.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3]!;
      const z = this.base[i * 3 + 2]!;
      pos.setY(i, Math.sin(x * 0.15 + time * 1.2) * 0.18 + Math.cos(z * 0.18 + time * 0.9) * 0.15);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

export function palmTree(rng: Rng, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = toon('#a8743f');
  const segments = 6;
  const lean = (rng.next() - 0.5) * 0.5;
  let y = 0;
  let x = 0;
  for (let i = 0; i < segments; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, 0.75, 8), trunkMat);
    x += lean * 0.25 * i * 0.3;
    seg.position.set(x, y + 0.37, 0);
    seg.rotation.z = -lean * 0.3;
    g.add(seg);
    y += 0.7;
  }
  const leafMat = toon(rng.next() < 0.5 ? '#3dbb5a' : '#2fa04e');
  const crown = new THREE.Group();
  crown.position.set(x, y, 0);
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const leaf = mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
    leaf.scale.set(1.5, 0.12, 0.45);
    leaf.position.set(1.1, -0.25, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / leaves) * Math.PI * 2 + rng.next() * 0.3;
    holder.rotation.z = -0.35;
    holder.add(leaf);
    crown.add(holder);
  }
  for (let i = 0; i < 3; i++) {
    const coco = mesh(new THREE.SphereGeometry(0.18, 8, 6), toon('#6b4423'));
    coco.position.set(Math.cos(i * 2.1) * 0.22, -0.25, Math.sin(i * 2.1) * 0.22);
    crown.add(coco);
  }
  g.add(crown);
  g.scale.setScalar(scale);
  return g;
}

export function bush(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(rng.pick(['#4cbf56', '#3aa64a', '#5fd36a']));
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.SphereGeometry(0.5 + rng.next() * 0.3, 10, 8), mat);
    s.position.set((i - 1) * 0.5, 0.3, (rng.next() - 0.5) * 0.4);
    g.add(s);
  }
  if (rng.next() < 0.5) {
    const flower = mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(rng.pick(['#ff6f91', '#ffd23f', '#ffffff'])));
    flower.position.set(0.2, 0.85, 0.2);
    g.add(flower);
  }
  return g;
}

export function rock(rng: Rng): THREE.Mesh {
  const r = mesh(new THREE.DodecahedronGeometry(0.4 + rng.next() * 0.5, 0), toon('#9aa3ad'));
  r.scale.y = 0.6;
  r.rotation.y = rng.next() * Math.PI;
  r.position.y = 0.15;
  return r;
}

export class Clouds {
  readonly group = new THREE.Group();
  private readonly speeds: number[] = [];

  constructor(rng: Rng, count = 12, radius = 90) {
    const mat = new THREE.MeshToonMaterial({ color: '#ffffff' });
    for (let i = 0; i < count; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + rng.next() * 2, 10, 8), mat);
        puff.position.set(k * 2.5, rng.next() * 1.2, rng.next() * 1.5);
        c.add(puff);
      }
      const a = rng.next() * Math.PI * 2;
      c.position.set(Math.cos(a) * radius * (0.5 + rng.next() * 0.5), 25 + rng.next() * 15, Math.sin(a) * radius * 0.6);
      this.group.add(c);
      this.speeds.push(0.5 + rng.next());
    }
  }

  update(dt: number): void {
    this.group.children.forEach((c, i) => {
      c.position.x += dt * this.speeds[i]!;
      if (c.position.x > 120) c.position.x = -120;
    });
  }
}

/** Estrela de 5 pontas em 3D. */
export function starMesh(size = 1, color = '#ffd23f'): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size : size * 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: size * 0.3,
    bevelEnabled: true,
    bevelThickness: size * 0.12,
    bevelSize: size * 0.1,
    bevelSegments: 2,
  });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    metalness: 0.3,
    roughness: 0.3,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
