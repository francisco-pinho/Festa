/**
 * Vitrais do castelo, feitos em canvas ao arrancar (sem imagens):
 *  - o desenho (figuras de santos com auréola, fundo, cercadura, rosácea) é pintado numa camada;
 *  - depois é partido em pedaços irregulares de vidro (Voronoi numa grelha com jitter), cada pedaço
 *    com a cor do desenho no seu centro, um tom ligeiramente diferente e textura manchada (vidro antigo);
 *  - por cima, o chumbo (entre pedaços e a contornar as figuras) e a rendilhada de pedra, que em
 *    contraluz se vê escura.
 * Em 3D: o vidro brilha por si (luz de fora), dentro de uma moldura de pedra com peitoril.
 */
import * as THREE from 'three';
import { createRng } from '@festa/game';
import { mesh, toon } from '../three/materials';

export interface GlassArt {
  material: THREE.MeshBasicMaterial;
  map: THREE.Texture;
}

const LEAD = '#17120f';
const STONE_DARK = '#231d22';
const ROBES = ['#a3162b', '#1f7a3f', '#6b2aa3', '#c4561a', '#1d4fb8'];
const GROUNDS = ['#1a3c95', '#14306f', '#7d1420', '#173f86'];

/** Ogiva equilátera (largura w, de `top` até `bottom`), em coordenadas do canvas (y para baixo). */
function archPath(ctx: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number): void {
  const w = x1 - x0;
  const ys = top + w * 0.866;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  ctx.lineTo(x0, ys);
  ctx.arc(x1, ys, w, Math.PI, (4 * Math.PI) / 3);
  ctx.arc(x0, ys, w, -Math.PI / 3, 0);
  ctx.lineTo(x1, bottom);
  ctx.closePath();
}

/** Ruído de valor suave (para manchar o vidro). */
function valueNoise(seed: number) {
  const h = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/**
 * Parte a camada do desenho em pedaços de vidro. Cada pixel fica com a cor do desenho no centro
 * do seu pedaço (com um tom próprio do pedaço e manchas), chumbo entre pedaços, e a transparência
 * do desenho (o que está fora da janela fica transparente).
 */
function shatter(design: CanvasRenderingContext2D, W: number, H: number, cell: number, seed: number): ImageData {
  const src = design.getImageData(0, 0, W, H).data;
  const rng = createRng(seed);
  const gw = Math.ceil(W / cell) + 1;
  const gh = Math.ceil(H / cell) + 1;
  const sx = new Float32Array(gw * gh);
  const sy = new Float32Array(gw * gh);
  const tone = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      sx[k] = (i + 0.15 + rng.next() * 0.7) * cell;
      sy[k] = (j + 0.15 + rng.next() * 0.7) * cell;
      tone[k] = 0.82 + rng.next() * 0.36;
    }
  const noise = valueNoise(seed);
  const out = design.createImageData(W, H);
  const o = out.data;
  const lead = new THREE.Color(LEAD);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const alpha = src[p + 3]!;
      if (alpha < 8) continue;
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      let d1 = Infinity;
      let d2 = Infinity;
      let best = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
          const k = j * gw + i;
          const d = (sx[k]! - x) ** 2 + (sy[k]! - y) ** 2;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      // Chumbo onde dois pedaços se encontram.
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge < 1.3) {
        o[p] = lead.r * 255;
        o[p + 1] = lead.g * 255;
        o[p + 2] = lead.b * 255;
        o[p + 3] = alpha;
        continue;
      }
      const qx = Math.min(W - 1, Math.max(0, Math.round(sx[best]!)));
      const qy = Math.min(H - 1, Math.max(0, Math.round(sy[best]!)));
      let q = (qy * W + qx) * 4;
      if (src[q + 3]! < 8) q = p; // centro do pedaço fora da janela: usa a cor do próprio pixel
      // Tom do pedaço, manchas do vidro, e o pedaço um pouco mais escuro junto ao chumbo.
      const mottle = 0.86 + noise(x / 9, y / 9) * 0.2 + noise(x / 2.5, y / 2.5) * 0.06;
      const rim = Math.min(1, 0.78 + edge * 0.06);
      const f = tone[best]! * mottle * rim;
      o[p] = Math.min(255, src[q]! * f);
      o[p + 1] = Math.min(255, src[q + 1]! * f);
      o[p + 2] = Math.min(255, src[q + 2]! * f);
      o[p + 3] = alpha;
    }
  return out;
}

/** Figura de santo (túnica, manto, cabeça com auréola, mãos com um livro), centrada em cx. */
function saint(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, robe: string, mantle: string): void {
  const head = w * 0.17;
  const hy = top + head * 2.2;
  // Auréola.
  ctx.fillStyle = '#e8b923';
  ctx.beginPath();
  ctx.arc(cx, hy, head * 1.85, 0, Math.PI * 2);
  ctx.fill();
  // Túnica (trapézio) e manto (de um ombro até ao chão, do outro lado).
  const sh = hy + head * 1.2;
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, sh);
  ctx.lineTo(cx + w * 0.22, sh);
  ctx.lineTo(cx + w * 0.36, top + h);
  ctx.lineTo(cx - w * 0.36, top + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mantle;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.24, sh);
  ctx.quadraticCurveTo(cx + w * 0.05, sh + h * 0.35, cx + w * 0.3, top + h * 0.78);
  ctx.lineTo(cx + w * 0.36, top + h);
  ctx.lineTo(cx - w * 0.36, top + h);
  ctx.closePath();
  ctx.fill();
  // Cabeça, cabelo e mãos com o livro.
  ctx.fillStyle = '#e9cfa6';
  ctx.beginPath();
  ctx.arc(cx, hy, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3a20';
  ctx.beginPath();
  ctx.arc(cx, hy - head * 0.25, head * 1.02, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a2a12';
  ctx.fillRect(cx - w * 0.12, sh + h * 0.2, w * 0.24, w * 0.18);
  ctx.fillStyle = '#e9cfa6';
  ctx.beginPath();
  ctx.arc(cx - w * 0.12, sh + h * 0.24, w * 0.05, 0, Math.PI * 2);
  ctx.arc(cx + w * 0.12, sh + h * 0.24, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Contornos de chumbo das figuras (depois de partir o vidro). */
function saintLead(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number): void {
  const head = w * 0.17;
  const hy = top + head * 2.2;
  const sh = hy + head * 1.2;
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(cx, hy, head * 1.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, hy, head, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.22, sh);
  ctx.lineTo(cx + w * 0.22, sh);
  ctx.lineTo(cx + w * 0.36, top + h);
  ctx.lineTo(cx - w * 0.36, top + h);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.24, sh);
  ctx.quadraticCurveTo(cx + w * 0.05, sh + h * 0.35, cx + w * 0.3, top + h * 0.78);
  ctx.stroke();
  ctx.strokeRect(cx - w * 0.12, sh + h * 0.2, w * 0.24, w * 0.18);
  // Rosto: traços pintados a grisalha (olhos, nariz).
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.45, hy + head * 0.05);
  ctx.lineTo(cx - head * 0.15, hy + head * 0.05);
  ctx.moveTo(cx + head * 0.15, hy + head * 0.05);
  ctx.lineTo(cx + head * 0.45, hy + head * 0.05);
  ctx.moveTo(cx, hy + head * 0.1);
  ctx.lineTo(cx, hy + head * 0.4);
  ctx.stroke();
}

function finish(canvas: HTMLCanvasElement): GlassArt {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, fog: false, color: '#e6dfe8' });
  return { material, map };
}

/** Janela gótica de duas lancetas com um óculo por cima (proporção 1 : `ratio`). */
export function lancetArt(seed: number, ratio = 3.4): GlassArt {
  const W = 300;
  const H = Math.round(W * ratio);
  const rng = createRng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rng.next() * a.length)]!;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const m = 2;
  // 1) Desenho.
  ctx.save();
  archPath(ctx, m, W - m, m, H - m);
  ctx.clip();
  ctx.fillStyle = pick(GROUNDS);
  ctx.fillRect(0, 0, W, H);
  // Losangos no fundo (padrão de "grisaille" colorido).
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < H; y += 26)
    for (let x = (y / 26) % 2 ? 13 : 0; x < W; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.fill();
    }
  // Cercadura: faixa vermelha com contas douradas.
  ctx.lineWidth = W * 0.09;
  ctx.strokeStyle = '#9e1b25';
  archPath(ctx, m, W - m, m, H - m);
  ctx.stroke();
  ctx.fillStyle = '#e0b030';
  for (let y = H * 0.12; y < H - 10; y += 22) {
    for (const x of [W * 0.022, W * 0.978]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Duas lancetas: um santo em cada, sob um dossel dourado; faixa de inscrição em baixo.
  const lights = [W * 0.27, W * 0.73];
  const lw = W * 0.42;
  const figTop = H * 0.36;
  const figH = H * 0.47;
  for (const cx of lights) {
    ctx.fillStyle = '#d9a52a';
    ctx.fillRect(cx - lw * 0.42, figTop - H * 0.04, lw * 0.84, H * 0.02);
    saint(ctx, cx, figTop, lw, figH, pick(ROBES), pick(ROBES));
    ctx.fillStyle = '#3b6b2a';
    ctx.fillRect(cx - lw * 0.42, figTop + figH, lw * 0.84, H * 0.025);
  }
  ctx.fillStyle = '#e7d7a8';
  ctx.fillRect(W * 0.08, H * 0.9, W * 0.84, H * 0.035);
  // Óculo: rosa pequena no topo.
  const oy = H * 0.2;
  const or = W * 0.2;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#a3162b' : '#e0b030';
    ctx.beginPath();
    ctx.moveTo(W / 2, oy);
    ctx.arc(W / 2, oy, or, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#1d4fb8';
  ctx.beginPath();
  ctx.arc(W / 2, oy, or * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 2) Vidro em pedaços.
  ctx.putImageData(shatter(ctx, W, H, 11, seed * 7 + 3), 0, 0);
  // 3) Chumbo das figuras e a rendilhada de pedra (escura em contraluz).
  ctx.save();
  archPath(ctx, m, W - m, m, H - m);
  ctx.clip();
  for (const cx of lights) saintLead(ctx, cx, figTop, lw, figH);
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(W / 2, oy, or, 0, Math.PI * 2);
  ctx.arc(W / 2, oy, or * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(a) * or * 0.4, oy + Math.sin(a) * or * 0.4);
    ctx.lineTo(W / 2 + Math.cos(a) * or, oy + Math.sin(a) * or);
    ctx.stroke();
  }
  // Barras de ferro horizontais (as "saddle bars" que seguram os painéis).
  ctx.strokeStyle = '#0d0a0a';
  ctx.lineWidth = 3.5;
  for (let y = H * 0.32; y < H; y += H * 0.085) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Rendilhada: mainel ao meio, as duas ogivas das lancetas e o aro do óculo.
  ctx.strokeStyle = STONE_DARK;
  ctx.lineWidth = W * 0.045;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, H * 0.36);
  ctx.stroke();
  archPath(ctx, W * 0.06, W / 2, H * 0.27, H * 0.37);
  ctx.stroke();
  archPath(ctx, W / 2, W * 0.94, H * 0.27, H * 0.37);
  ctx.stroke();
  ctx.lineWidth = W * 0.035;
  ctx.beginPath();
  ctx.arc(W / 2, oy, or + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return finish(canvas);
}

/** Rosácea: anéis de pétalas e medalhões, com rendilhada em estrela. */
export function roseArt(seed: number): GlassArt {
  const S = 420;
  const rng = createRng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const c = S / 2;
  const R = S * 0.49;
  const n = 12;
  const ring = (r0: number, r1: number, colors: string[], offset = 0) => {
    for (let i = 0; i < n; i++) {
      const a0 = ((i + offset) / n) * Math.PI * 2;
      const a1 = ((i + 1 + offset) / n) * Math.PI * 2;
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.beginPath();
      ctx.arc(c, c, r1, a0, a1);
      ctx.arc(c, c, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  ring(R * 0.82, R, ['#9e1b25', '#1a3c95']);
  ring(R * 0.45, R * 0.82, ['#1d4fb8', '#14306f', '#173f86'], 0.5);
  // Medalhões nas pétalas (cada um com uma cor).
  const med = ['#a3162b', '#1f7a3f', '#e0b030', '#6b2aa3'];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    ctx.fillStyle = med[Math.floor(rng.next() * med.length)]!;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.63, c + Math.sin(a) * R * 0.63, R * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e0b030';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a3162b';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2e3b0';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.putImageData(shatter(ctx, S, S, 10, seed * 5 + 1), 0, 0);
  // Chumbo dos medalhões e rendilhada em estrela.
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.63, c + Math.sin(a) * R * 0.63, R * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const r of [R * 0.12, R * 0.3]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = STONE_DARK;
  ctx.lineWidth = S * 0.025;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.45, c + Math.sin(a) * R * 0.45);
    ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    ctx.stroke();
  }
  for (const r of [R * 0.45, R * 0.82]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Ogiva em THREE.Shape (y para cima, base em y = 0, centrada em x). */
function archShape(w: number, h: number): THREE.Path {
  const hs = h - w * 0.866;
  const p = new THREE.Shape();
  p.moveTo(-w / 2, 0);
  p.lineTo(-w / 2, hs);
  p.absarc(w / 2, hs, w, Math.PI, (2 * Math.PI) / 3, true);
  p.absarc(-w / 2, hs, w, Math.PI / 3, 0, true);
  p.lineTo(w / 2, 0);
  p.closePath();
  return p;
}

const stoneMat = toon('#7d7484');

/** Janela alta: vidro (w × h, base em y = 0) numa moldura de pedra com peitoril; virada para +z. */
export function lancetWindow(art: GlassArt, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), art.material);
  glass.position.y = h / 2;
  g.add(glass);
  const b = 0.75;
  const outer = archShape(w + b * 2, h + b * 1.6) as THREE.Shape;
  outer.holes.push(archShape(w, h));
  const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.7, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1, curveSegments: 16 });
  const frame = mesh(frameGeo, stoneMat, { cast: false, receive: true });
  g.add(frame);
  const sill = mesh(new THREE.BoxGeometry(w + b * 2.6, 0.45, 1.3), stoneMat, { cast: false, receive: true });
  sill.position.set(0, -0.15, 0.45);
  g.add(sill);
  return g;
}

/** Rosácea: vidro (diâmetro d) num aro de pedra; centrada na origem, virada para +z. */
export function roseWindow(art: GlassArt, d: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(d, d), art.material));
  const rim = mesh(new THREE.TorusGeometry(d / 2 + 0.25, 0.5, 8, 40), stoneMat, { cast: false });
  rim.position.z = 0.2;
  g.add(rim);
  return g;
}
