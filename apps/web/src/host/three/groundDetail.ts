/**
 * Textura para o chão (relva e areia) e céu com gradiente e nuvens, gerados em código.
 *
 * `detailGround(scene)` procura os chãos grandes (relva verde ou areia) e dá-lhes uma textura
 * (folhas de relva, manchas, grão de areia) que multiplica a cor de cada um — assim os mapas,
 * os desportos e os minijogos ficam todos com chão texturado sem mexer em cada cenário.
 */
import * as THREE from 'three';

function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Pseudoaleatório com semente (a textura é sempre igual). */
function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

let grassTex: THREE.CanvasTexture | null = null;
let sandTex: THREE.CanvasTexture | null = null;

/** Relva: base clara com manchas suaves e muitas folhinhas (tons de cinzento: multiplica a cor). */
export function grassTexture(): THREE.CanvasTexture {
  grassTex ??= canvas(512, (g, s) => {
    const r = rand(7);
    g.fillStyle = '#e9e9e9';
    g.fillRect(0, 0, s, s);
    // Manchas grandes (zonas mais claras e mais escuras)
    for (let i = 0; i < 40; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 30 + r() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const v = r() < 0.5 ? 200 : 255;
      grd.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
      grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grd;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) g.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
    }
    // Folhinhas de relva
    for (let i = 0; i < 5000; i++) {
      const x = r() * s;
      const y = r() * s;
      const len = 3 + r() * 6;
      const a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      const v = 150 + Math.floor(r() * 105);
      g.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  });
  return grassTex;
}

/** Areia: grão fino e algumas ondulações. */
export function sandTexture(): THREE.CanvasTexture {
  sandTex ??= canvas(512, (g, s) => {
    const r = rand(11);
    g.fillStyle = '#efefef';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14000; i++) {
      const v = 190 + Math.floor(r() * 65);
      g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.fillRect(r() * s, r() * s, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    g.strokeStyle = 'rgba(215,215,215,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const y0 = r() * s;
      g.beginPath();
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y0 + Math.sin(x / 40 + i) * 6);
      g.stroke();
    }
  });
  return sandTex;
}

/** Céu: gradiente (azul forte em cima → claro no horizonte) com nuvens suaves pintadas. */
export function skyTexture(top = '#3d8fe0', horizon = '#cfeeff'): THREE.CanvasTexture {
  const t = canvas(1024, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, top);
    grd.addColorStop(0.5, horizon);
    grd.addColorStop(1, horizon);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const r = rand(3);
    for (let i = 0; i < 26; i++) {
      const cx = r() * s;
      const cy = s * (0.22 + r() * 0.24);
      for (let k = 0; k < 7; k++) {
        const x = cx + (r() - 0.5) * 90;
        const y = cy + (r() - 0.5) * 18;
        const rad = 18 + r() * 34;
        const c = g.createRadialGradient(x, y, 0, x, y, rad);
        c.addColorStop(0, 'rgba(255,255,255,0.55)');
        c.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = c;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  });
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Que tipo de chão é esta cor (relva, areia ou nenhum). */
function kindOf(color: THREE.Color): 'grass' | 'sand' | null {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.h > 0.17 && hsl.h < 0.45 && hsl.s > 0.2 && hsl.l > 0.18) return 'grass';
  if (hsl.h > 0.07 && hsl.h < 0.17 && hsl.s > 0.25 && hsl.l > 0.5) return 'sand';
  return null;
}

/** Dá textura aos chãos grandes da cena (uma vez por malha). Uma telha de textura a cada ~5 m. */
export function detailGround(scene: THREE.Scene): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.groundDone) return;
    const mat = m.material as THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || !mat || (mat as THREE.MeshToonMaterial).map || !('color' in mat)) return;
    const geo = m.geometry;
    if (!geo.attributes.uv) return;
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    m.updateWorldMatrix(true, false);
    const scale = new THREE.Vector3().setFromMatrixScale(m.matrixWorld);
    const w = (box.max.x - box.min.x) * scale.x;
    const h = (box.max.y - box.min.y) * scale.y;
    const d = (box.max.z - box.min.z) * scale.z;
    // Chão: largo e baixo (ou um plano/círculo deitado).
    const flat = Math.min(w, Math.max(h, d)) > 14 && Math.min(h, d) < 3.2;
    if (!flat) return;
    const kind = kindOf(mat.color);
    if (!kind) return;
    // Escala da textura: as UV do plano/círculo vão de 0 a 1; as das extrusões estão em metros.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    let umin = Infinity;
    let umax = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      umin = Math.min(umin, uv.getX(i));
      umax = Math.max(umax, uv.getX(i));
    }
    const size = Math.max(w, d);
    const range = Math.max(1e-3, umax - umin);
    const rep = size / range / 5;
    const tex = (kind === 'grass' ? grassTexture() : sandTexture()).clone();
    tex.needsUpdate = true;
    tex.repeat.set(rep, rep);
    const copy = mat.clone();
    (copy as THREE.MeshToonMaterial).map = tex;
    // A textura é clara (multiplica): aclara um pouco a cor para não escurecer o chão.
    copy.color.multiplyScalar(1.08);
    m.material = copy;
    m.userData.groundDone = true;
  });
}
