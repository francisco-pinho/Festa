/**
 * Camada de realismo para os tabuleiros:
 *  - relva em 3D: milhares de tufos (uma só malha instanciada) a abanar ao vento, espalhados
 *    pelos relvados longe dos caminhos e das casas;
 *  - textura de terra/gravilha para os caminhos, com bordas gastas.
 */
import * as THREE from 'three';
import { getSpace, type Board } from '@festa/game';

/** Relógio partilhado pelos materiais com vento. */
const wind = { value: 0 };

function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Um tufo: 7 folhas finas e afuniladas, com a raiz mais escura (cores nos vértices). */
function tuftGeometry(): THREE.BufferGeometry {
  const r = rand(17);
  const pos: number[] = [];
  const col: number[] = [];
  const bend: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const h = 0.28 + r() * 0.3;
    const w = 0.035 + r() * 0.02;
    const ox = (r() - 0.5) * 0.18;
    const oz = (r() - 0.5) * 0.18;
    const lean = (r() - 0.5) * 0.25;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    const tipX = ox + cx * lean;
    const tipZ = oz + sz * lean;
    // Triângulo: base esquerda, base direita, ponta
    pos.push(ox - sz * w, 0, oz + cx * w, ox + sz * w, 0, oz - cx * w, tipX, h, tipZ);
    const dark = 0.55 + r() * 0.1;
    const light = 1.05 + r() * 0.15;
    col.push(dark, dark, dark, dark, dark, dark, light, light, light);
    bend.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('bend', new THREE.Float32BufferAttribute(bend, 1));
  g.computeVertexNormals();
  // As folhas apontam para cima na luz (fica mais suave do que a normal de cada triângulo).
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function windMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uWind;\nattribute float bend;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 wp = vec3(0.0);
        #endif
        float gust = sin(uWind * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.6 + sin(uWind * 3.1 + wp.z * 0.7) * 0.25;
        transformed.x += bend * gust * 0.09;
        transformed.z += bend * cos(uWind * 2.3 + wp.x * 0.5) * 0.05;`,
      );
  };
  mat.customProgramCacheKey = () => 'festa-grass';
  return mat;
}

/** É relva? (verde, como em groundDetail) */
function isGrass(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mat) || !mat || !('color' in mat)) return false;
  const hsl = { h: 0, s: 0, l: 0 };
  mat.color.getHSL(hsl);
  return hsl.h > 0.17 && hsl.h < 0.45 && hsl.s > 0.2 && hsl.l > 0.18;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * Espalha tufos de relva pelos relvados do tabuleiro (até `max`), longe dos caminhos e das casas.
 * Procura o chão com raios de cima para baixo; só fica onde o primeiro objeto atingido é relva grande.
 */
export function addGrassField(board: Board, group: THREE.Group, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, max = 7000): THREE.InstancedMesh | null {
  group.updateMatrixWorld(true);
  const grounds: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !isGrass(m)) return;
    const geo = m.geometry;
    geo.computeBoundingBox();
    const size = geo.boundingBox!.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.z, size.y) > 10) grounds.push(m);
  });
  if (!grounds.length) return null;
  // Tudo o que pode estar por cima do chão (casas, caminhos, adereços) tapa os raios.
  // (só o que está junto ao chão: as nuvens e as copas das árvores não contam)
  const blockers: THREE.Object3D[] = [];
  const box = new THREE.Box3();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || grounds.includes(m) || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    box.setFromObject(m);
    if (box.min.y < 2.5 && box.max.y > -0.3) blockers.push(m);
  });
  const segs: [number, number, number, number][] = [];
  for (const s of board.spaces)
    for (const n of s.next) {
      const t = getSpace(board, n);
      segs.push([s.x, s.z, t.x, t.z]);
    }
  const r = rand(29);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const pad = 12;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const d = bounds.maxZ - bounds.minZ + pad * 2;
  const mats: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tries = max * 2;
  for (let i = 0; i < tries && mats.length < max; i++) {
    // Pontos em grupos (manchas mais densas e zonas mais ralas, como relva a sério).
    const x = bounds.minX - pad + r() * w;
    const z = bounds.minZ - pad + r() * d;
    if (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin((x + z) * 0.07) * 0.6 < -0.55 && r() < 0.8) continue;
    let near = false;
    for (const sp of board.spaces) if (Math.hypot(sp.x - x, sp.z - z) < 1.5) { near = true; break; }
    if (near) continue;
    for (const [ax, az, bx, bz] of segs) if (distToSegment(x, z, ax, az, bx, bz) < 1.05) { near = true; break; }
    if (near) continue;
    ray.set(new THREE.Vector3(x, 30, z), down);
    const hit = ray.intersectObjects([...grounds, ...blockers], false)[0];
    if (!hit || !grounds.includes(hit.object as THREE.Mesh)) continue;
    if (hit.face && hit.face.normal.y < 0.7) continue; // só em cima (não nas paredes do relvado)
    const s = 0.7 + r() * 0.8;
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    mats.push(new THREE.Matrix4().compose(hit.point.clone().setY(hit.point.y - 0.01), q, new THREE.Vector3(s, s * (0.8 + r() * 0.5), s)));
    // Cor do relvado de baixo, com variação (mais seca ou mais viçosa).
    const base = ((hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    colors.push(new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.04, Math.min(1, hsl.s * (0.85 + r() * 0.3)), hsl.l * (0.78 + r() * 0.3)));
  }
  if (!mats.length) return null;
  const inst = new THREE.InstancedMesh(tuftGeometry(), windMaterial(), mats.length);
  mats.forEach((m, i) => {
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, colors[i]!);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.receiveShadow = true;
  inst.castShadow = false;
  inst.frustumCulled = false;
  inst.userData.noDeclutter = true;
  inst.onBeforeRender = () => {
    wind.value = performance.now() / 1000;
  };
  group.add(inst);
  return inst;
}

let pathTex: THREE.CanvasTexture | null = null;

/** Terra batida com gravilha e pedrinhas (cinzentos: multiplica a cor do caminho). */
export function pathTexture(): THREE.CanvasTexture {
  if (pathTex) return pathTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rand(41);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, S, S);
  // Manchas de terra mais escura
  for (let i = 0; i < 30; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 10 + r() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(170,170,170,0.35)');
    grd.addColorStop(1, 'rgba(170,170,170,0)');
    g.fillStyle = grd;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) g.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
  }
  // Grão
  for (let i = 0; i < 6000; i++) {
    const v = 175 + Math.floor(r() * 80);
    g.fillStyle = `rgba(${v},${v},${v},0.6)`;
    g.fillRect(r() * S, r() * S, 1 + r(), 1 + r());
  }
  // Pedrinhas com sombra e brilho
  for (let i = 0; i < 70; i++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 2 + r() * 4;
    const ry = rx * (0.6 + r() * 0.4);
    const rot = r() * Math.PI;
    g.fillStyle = 'rgba(110,110,110,0.45)';
    g.beginPath();
    g.ellipse(x + 1, y + 1.5, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
    const v = 200 + Math.floor(r() * 55);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  }
  pathTex = new THREE.CanvasTexture(c);
  pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
  pathTex.colorSpace = THREE.SRGBColorSpace;
  pathTex.anisotropy = 8;
  return pathTex;
}
