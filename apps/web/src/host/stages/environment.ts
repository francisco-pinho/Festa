/** Peças de cenário partilhadas: céu, luzes, mar, palmeiras, nuvens. */
import * as THREE from 'three';
import { skyTexture } from '../three/groundDetail';
import { mesh, toon } from '../three/materials';
import type { Rng } from '@festa/game';

export function setupSky(scene: THREE.Scene, opts: { fog?: [number, number] } = {}): THREE.DirectionalLight {
  // Céu com gradiente e nuvens (em vez de uma cor lisa).
  scene.background = skyTexture();
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

/** Mapa de normais da água (ondinhas): soma de ondas com frequências inteiras, por isso repete-se sem costuras. */
let waterNormals: THREE.CanvasTexture | null = null;
export function waterNormalMap(): THREE.CanvasTexture {
  if (waterNormals) return waterNormals;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  // Ondas: [freq x, freq y, amplitude, fase]
  const waves: [number, number, number, number][] = [];
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 18; i++) {
    const fx = Math.round((r() - 0.5) * 2 * (2 + i));
    const fy = Math.round((r() - 0.5) * 2 * (2 + i)) || 1;
    waves.push([fx, fy, 1 / (1 + i * 0.45), r() * Math.PI * 2]);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const [fx, fy, a, p] of waves) {
        const k = Math.cos(((fx * x + fy * y) / S) * Math.PI * 2 + p) * a;
        dx += k * fx;
        dy += k * fy;
      }
      const n = new THREE.Vector3(-dx * 0.06, -dy * 0.06, 1).normalize();
      const o = (y * S + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  waterNormals = new THREE.CanvasTexture(c);
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  return waterNormals;
}

/**
 * Água: ondas grandes calculadas na placa gráfica, ondinhas com dois mapas de normais a deslizar
 * em sentidos diferentes, reflexo do céu e efeito de Fresnel (vista de cima é mais escura e
 * transparente; ao longe, rasante, fica clara e espelhada), com brilhos do sol.
 * A cor de base é `material.color` (o sumo, por exemplo, troca-a por lava).
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor(size = 400) {
    this.geometry = new THREE.PlaneGeometry(size, size, 120, 120);
    this.geometry.rotateX(-Math.PI / 2);
    const normalMap = waterNormalMap();
    const rep = size / 9;
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#1782bd',
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.1,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uRep = { value: rep };
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uTime;\nvarying vec2 vWUv;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // Ondas grandes (soma de senos) e a normal correspondente.
          float wx = position.x, wz = position.z;
          float h = sin(wx * 0.15 + uTime * 1.2) * 0.16 + cos(wz * 0.18 + uTime * 0.9) * 0.13
                  + sin((wx + wz) * 0.31 + uTime * 1.7) * 0.05;
          float dhx = cos(wx * 0.15 + uTime * 1.2) * 0.024 + cos((wx + wz) * 0.31 + uTime * 1.7) * 0.0155;
          float dhz = -sin(wz * 0.18 + uTime * 0.9) * 0.0234 + cos((wx + wz) * 0.31 + uTime * 1.7) * 0.0155;
          transformed.y += h;
          vWUv = vec2(wx, wz);`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          {
            float wx = position.x, wz = position.z;
            float dhx = cos(wx * 0.15 + uTime * 1.2) * 0.024 + cos((wx + wz) * 0.31 + uTime * 1.7) * 0.0155;
            float dhz = -sin(wz * 0.18 + uTime * 0.9) * 0.0234 + cos((wx + wz) * 0.31 + uTime * 1.7) * 0.0155;
            objectNormal = normalize(vec3(-dhx, 1.0, -dhz));
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uTime;\nuniform float uRep;\nvarying vec2 vWUv;\nvoid main() {')
        // Duas camadas de ondinhas a deslizar em sentidos diferentes.
        .replace(
          '#include <normal_fragment_maps>',
          `{
            vec2 uvA = vWUv / 9.0 + vec2(uTime * 0.018, uTime * 0.011);
            vec2 uvB = vWUv / 5.3 * mat2(0.8, 0.6, -0.6, 0.8) - vec2(uTime * 0.013, -uTime * 0.02);
            vec3 nA = texture2D(normalMap, uvA).xyz * 2.0 - 1.0;
            vec3 nB = texture2D(normalMap, uvB).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(vec3((nA.xy + nB.xy) * normalScale, 1.0));
            normal = normalize(tbn * mapN);
          }
          // Fresnel: cor funda vista de cima, clara e mais opaca ao longe.
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, diffuseColor.rgb * 1.35 + vec3(0.05, 0.1, 0.1), fres);
          diffuseColor.a = mix(diffuseColor.a * 0.85, 1.0, fres);`,
        );
    };
    mat.customProgramCacheKey = () => 'festa-water';
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.position.y = -0.7;
    this.mesh.receiveShadow = true;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
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
