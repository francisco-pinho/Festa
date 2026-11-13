/**
 * Camada de pormenor dos tabuleiros (à la Mario Party Jamboree): marcos grandes, vida e textura.
 *
 * Tudo o que aqui se põe mede primeiro a distância livre aos caminhos, às casas, às lojas e aos
 * percursos das viagens (`Kit.clearance`), por isso nada tapa nem pisa o caminho.
 *  - comum: base de pedra/metal debaixo de cada casa e bordas ao longo dos caminhos;
 *  - ilha: lagoa com cascata, colinas, cabanas na aldeia, chapéus de sol na praia, farol, gaivotas,
 *    caranguejos, tochas tiki e selva mais cerrada;
 *  - vulcão: vulcão a sério (rocha irregular, rios de lava, fumo), chão com fendas de lava, poças de
 *    lava, colunas de basalto, fumarolas, a ponte de lava em tábuas e abutres;
 *  - castelo: muralhas com ameias, escadas com degraus e base de pedra, fosso com ponte levadiça,
 *    estandartes e janelas nas torres, archotes, poço, névoa no chão e morcegos;
 *  - parque: fonte com repuxos, torre de queda, barco pirata, bandeirinhas na avenida, candeeiros,
 *    canteiros e fogo de artifício;
 *  - cidade: lancis, passadeiras, terraços (ar condicionado, depósitos, antenas), painéis animados,
 *    árvores em vasos, monorail elevado e prédios ao fundo.
 */
import * as THREE from 'three';
import { createRng, getSpace, type Board, type Rng, type Space } from '@festa/game';
import { canvasTexture, mesh, toon, toonUnique } from '../three/materials';
import { PROPS, pickProp, prop } from '../three/props';
import { palmTree, waterNormalMap } from './environment';
import { boundsOf, interactiveSpaces, distToSegment, segmentsOf, tunnelCurve } from './boardThemes';
import { bunting, swayBunting } from '../minigames/scenery';

export interface BoardExtras {
  update(dt: number, time: number): void;
  setFlags(flags: Record<string, boolean>): void;
}

const TILE_R = 1.15;

interface Seg3 {
  a: Space;
  b: Space;
}

interface Kit {
  board: Board;
  group: THREE.Group;
  rng: Rng;
  segs: [number, number, number, number][];
  segs3: Seg3[];
  /** Distância livre num ponto (até ao caminho, casas, lojas, viagens). */
  clearance(x: number, z: number): number;
  spots(o: { n: number; area: { minX: number; maxX: number; minZ: number; maxZ: number }; min: number; sep: number; inside?: (x: number, z: number) => boolean; step?: number; max?: number }): { x: number; z: number; c: number }[];
  /** Ocupa uma zona (para os próximos `spots` não porem lá nada). */
  claim(x: number, z: number, r: number): void;
  /** Tira a decoração antiga (árvores, pedras…) que caia dentro de uma zona nova. */
  clearDeco(x: number, z: number, r: number): void;
  updaters: ((dt: number, time: number) => void)[];
  flagers: ((flags: Record<string, boolean>) => void)[];
}

export function addBoardExtras(board: Board, group: THREE.Group): BoardExtras {
  const segs = segmentsOf(board);
  const segs3: Seg3[] = [];
  for (const s of board.spaces)
    for (const n of s.next) {
      if (board.tunnels.some((t) => t.from === s.id && t.to === n)) continue;
      segs3.push({ a: s, b: getSpace(board, n) });
    }
  const obstacles: { x: number; z: number; r: number }[] = [];
  for (const s of board.spaces) obstacles.push({ x: s.x, z: s.z, r: TILE_R + 0.4 });
  for (const sh of board.shops) {
    const s = getSpace(board, sh.spaceId);
    obstacles.push({ x: s.x, z: s.z, r: 5 });
  }
  for (const s of interactiveSpaces(board)) obstacles.push({ x: s.x, z: s.z, r: 3 });
  for (const t of board.tunnels) {
    for (const id of [t.from, t.to]) {
      const s = getSpace(board, id);
      obstacles.push({ x: s.x, z: s.z, r: t.kind === 'cave' ? 5.5 : 3.5 });
    }
    if (t.kind === 'cart' || t.kind === 'coaster') for (const p of tunnelCurve(board, t).getSpacedPoints(80)) obstacles.push({ x: p.x, z: p.z, r: 2.2 });
  }
  const clearance = (x: number, z: number) => {
    let c = Infinity;
    for (const [ax, az, bx, bz] of segs) c = Math.min(c, distToSegment(x, z, ax, az, bx, bz) - 0.85);
    for (const o of obstacles) c = Math.min(c, Math.hypot(o.x - x, o.z - z) - o.r);
    return c;
  };
  const kit: Kit = {
    board,
    group,
    rng: createRng(board.id.length * 977 + 31),
    segs,
    segs3,
    clearance,
    spots(o) {
      const step = o.step ?? 2;
      const cand: { x: number; z: number; c: number }[] = [];
      for (let x = o.area.minX; x <= o.area.maxX; x += step)
        for (let z = o.area.minZ; z <= o.area.maxZ; z += step) {
          if (o.inside && !o.inside(x, z)) continue;
          const c = Math.min(clearance(x, z), o.max ?? Infinity);
          if (c >= o.min) cand.push({ x, z, c });
        }
      cand.sort((p, q) => q.c - p.c);
      const out: { x: number; z: number; c: number }[] = [];
      for (const p of cand) {
        if (out.length >= o.n) break;
        if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < Math.max(o.sep, q.c + p.c * 0.5))) continue;
        out.push(p);
      }
      return out;
    },
    claim(x, z, r) {
      obstacles.push({ x, z, r });
    },
    clearDeco(x, z, r) {
      for (const o of [...group.children]) {
        if (!o.userData.deco && !o.userData.prop) continue;
        if (Math.hypot(o.position.x - x, o.position.z - z) < r) group.remove(o);
      }
    },
    updaters: [],
    flagers: [],
  };
  switch (board.theme) {
    case 'island':
      island(kit);
      break;
    case 'volcano':
      volcano(kit);
      break;
    case 'castle':
      castle(kit);
      break;
    case 'park':
      park(kit);
      break;
    case 'city':
      city(kit);
      break;
  }
  return {
    update: (dt, time) => {
      for (const u of kit.updaters) u(dt, time);
    },
    setFlags: (flags) => {
      for (const f of kit.flagers) f(flags);
    },
  };
}

// ── Peças comuns ──────────────────────────────────────────

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Base debaixo de cada casa (pedra, metal, madeira…), um pouco maior do que a casa. */
function tileBases(k: Kit, color: string, rim: string): void {
  const n = k.board.spaces.length;
  const base = new THREE.InstancedMesh(new THREE.CylinderGeometry(TILE_R + 0.24, TILE_R + 0.36, 0.2, 32), toonUnique(color), n);
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(TILE_R + 0.2, 0.07, 6, 36), toonUnique(rim), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  k.board.spaces.forEach((s, i) => {
    const y = s.y ?? 0;
    base.setMatrixAt(i, m.makeTranslation(s.x, y + 0.08, s.z));
    ring.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, y + 0.19, s.z), q, new THREE.Vector3(1, 1, 1)));
  });
  base.receiveShadow = ring.receiveShadow = true;
  base.userData.noDeclutter = ring.userData.noDeclutter = true;
  k.group.add(base, ring);
}

/**
 * Bordas dos caminhos: pedrinhas, lancis ou sebes dos dois lados de cada troço (num InstancedMesh).
 * Não põe nada em cima das casas nem dentro de outros caminhos (cruzamentos).
 */
function edging(
  k: Kit,
  o: {
    offset: number;
    spacing: number;
    geo: THREE.BufferGeometry;
    colors: string[];
    scale: [number, number];
    scaleY?: [number, number];
    align?: boolean;
    jitter?: number;
    skip?: (a: Space, b: Space) => boolean;
    y?: number;
  },
): void {
  const items: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const { a, b } of k.segs3) {
    if (o.skip?.(a, b)) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const ux = dx / len;
    const uz = dz / len;
    for (let d = o.spacing / 2; d < len; d += o.spacing) {
      for (const side of [-1, 1]) {
        const j = (k.rng.next() - 0.5) * (o.jitter ?? 0.1);
        const x = a.x + ux * d - uz * (o.offset + j) * side;
        const z = a.z + uz * d + ux * (o.offset + j) * side;
        const y = lerp(a.y ?? 0, b.y ?? 0, d / len);
        let bad = false;
        for (const [ax, az, bx, bz] of k.segs) if (distToSegment(x, z, ax, az, bx, bz) < o.offset * 0.8) { bad = true; break; }
        if (!bad) for (const s of k.board.spaces) if (Math.abs((s.y ?? 0) - y) < 1.5 && Math.hypot(s.x - x, s.z - z) < TILE_R + 0.25) { bad = true; break; }
        if (bad) continue;
        const sc = lerp(o.scale[0], o.scale[1], k.rng.next());
        const sy = o.scaleY ? lerp(o.scaleY[0], o.scaleY[1], k.rng.next()) : sc;
        e.set(o.align ? 0 : k.rng.next() * 3, o.align ? Math.atan2(dx, dz) : k.rng.next() * 6, 0);
        q.setFromEuler(e);
        items.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y + (o.y ?? 0.06), z), q, new THREE.Vector3(sc, sy, sc)), c: new THREE.Color(o.colors[Math.floor(k.rng.next() * o.colors.length)]!) });
      }
    }
  }
  if (!items.length) return;
  const inst = new THREE.InstancedMesh(o.geo, new THREE.MeshToonMaterial({ color: '#ffffff' }), items.length);
  items.forEach((it, i) => {
    inst.setMatrixAt(i, it.m);
    inst.setColorAt(i, it.c);
  });
  inst.receiveShadow = true;
  inst.castShadow = true;
  inst.userData.noDeclutter = true;
  k.group.add(inst);
}

/** Pedrinha irregular (para as bordas). */
function pebbleGeo(r = 0.16): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  g.scale(1, 0.55, 1);
  return g;
}

/** Ruído suave (soma de senos) para deformar geometria. */
function bumpy(geo: THREE.BufferGeometry, amp: number, freq: number, seed: number, keepBottom = true): THREE.BufferGeometry {
  const p = geo.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (keepBottom && v.y <= 0.001) continue;
    const n = Math.sin(v.x * freq + seed) * Math.cos(v.z * freq * 1.3 + seed * 2) + Math.sin((v.x + v.y + v.z) * freq * 2.1 + seed) * 0.5;
    const len = Math.hypot(v.x, v.z) || 1;
    p.setXYZ(i, v.x + (v.x / len) * n * amp, v.y + n * amp * 0.5, v.z + (v.z / len) * n * amp);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Textura redonda e esbatida (fumo, vapor, névoa, espuma). */
let softTex: THREE.CanvasTexture | null = null;
function softTexture(): THREE.CanvasTexture {
  if (softTex) return softTex;
  softTex = canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return softTex;
}

/** Fumo/vapor: sprites reciclados que sobem, crescem e desaparecem. */
class Puffs {
  private readonly items: { s: THREE.Sprite; vel: THREE.Vector3; t: number; life: number; s0: number; s1: number; a: number }[] = [];
  constructor(
    private readonly parent: THREE.Object3D,
    private readonly color: string,
    private readonly blending: THREE.Blending = THREE.NormalBlending,
  ) {}
  emit(at: THREE.Vector3, vel: THREE.Vector3, life: number, s0: number, s1: number, alpha: number, color?: string): void {
    let it = this.items.find((i) => i.t >= i.life);
    if (!it) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: this.color, transparent: true, depthWrite: false, blending: this.blending }));
      this.parent.add(s);
      it = { s, vel: new THREE.Vector3(), t: 0, life: 0, s0: 0, s1: 0, a: 0 };
      this.items.push(it);
    }
    it.s.position.copy(at);
    it.vel.copy(vel);
    it.t = 0;
    it.life = life;
    it.s0 = s0;
    it.s1 = s1;
    it.a = alpha;
    it.s.visible = true;
    it.s.material.color.set(color ?? this.color);
  }
  update(dt: number): void {
    for (const it of this.items) {
      if (it.t >= it.life) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      it.s.position.addScaledVector(it.vel, dt);
      it.s.scale.setScalar(lerp(it.s0, it.s1, Math.sqrt(k)));
      it.s.material.opacity = it.a * Math.min(1, k * 6) * (1 - k);
      if (k >= 1) it.s.visible = false;
    }
  }
}

/** Pássaros (gaivotas, morcegos, abutres) a voar em círculos, a bater as asas. */
function birds(k: Kit, o: { count: number; cx: number; cz: number; r: [number, number]; h: [number, number]; color: string; size: number; speed: number; flap: number }): void {
  const list: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; a: number; r: number; h: number; sp: number; ph: number }[] = [];
  const mat = toon(o.color);
  const wingGeo = new THREE.BoxGeometry(o.size, 0.04, o.size * 0.38);
  wingGeo.translate(o.size / 2, 0, 0);
  for (let i = 0; i < o.count; i++) {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(o.size * 0.22, 8, 6), mat, { cast: false });
    body.scale.set(0.8, 0.7, 1.8);
    const wl = new THREE.Mesh(wingGeo, mat);
    const wr = new THREE.Mesh(wingGeo, mat);
    wr.rotation.y = Math.PI;
    g.add(body, wl, wr);
    k.group.add(g);
    list.push({ g, wl, wr, a: k.rng.next() * 6.3, r: lerp(o.r[0], o.r[1], k.rng.next()), h: lerp(o.h[0], o.h[1], k.rng.next()), sp: (0.7 + k.rng.next() * 0.6) * (k.rng.next() < 0.5 ? -1 : 1), ph: k.rng.next() * 6 });
  }
  k.updaters.push((dt, time) => {
    for (const b of list) {
      b.a += (b.sp * o.speed * dt) / b.r;
      const x = o.cx + Math.cos(b.a) * b.r;
      const z = o.cz + Math.sin(b.a) * b.r;
      b.g.position.set(x, b.h + Math.sin(time * 0.8 + b.ph) * 1.2, z);
      b.g.rotation.y = Math.atan2(-Math.sin(b.a) * Math.sign(b.sp), Math.cos(b.a) * Math.sign(b.sp)) + Math.PI / 2;
      const f = Math.sin(time * o.flap + b.ph) * 0.55;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
    }
  });
}

/** Chama pequena (archote, tocha, candeeiro) que tremeluz. */
function flame(k: Kit, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const outer = mesh(new THREE.ConeGeometry(0.16 * scale, 0.5 * scale, 8), toonUnique('#ff8a1a', { emissive: '#ff6a00', emissiveIntensity: 1.6 }), { cast: false });
  outer.position.y = 0.25 * scale;
  const inner = mesh(new THREE.ConeGeometry(0.08 * scale, 0.3 * scale, 6), toonUnique('#ffe680', { emissive: '#ffd23f', emissiveIntensity: 2 }), { cast: false });
  inner.position.y = 0.17 * scale;
  g.add(outer, inner);
  const ph = k.rng.next() * 10;
  k.updaters.push((_dt, time) => {
    const f = 1 + Math.sin(time * 13 + ph) * 0.12 + Math.sin(time * 23 + ph * 2) * 0.08;
    g.scale.set(1, f, 1);
    g.rotation.y = time * 2 + ph;
  });
  return g;
}

/** Textura de pedra aparelhada (blocos com argamassa), em tons da cor dada. */
export function stoneTexture(color: string, rows = 6, cols = 4): THREE.CanvasTexture {
  const base = new THREE.Color(color);
  const tex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base.clone().multiplyScalar(0.55).getStyle();
    ctx.fillRect(0, 0, s, s);
    const rng = createRng(rows * 31 + cols);
    const h = s / rows;
    const w = s / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? w / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * w + off;
        const tint = 0.82 + rng.next() * 0.3;
        ctx.fillStyle = base.clone().multiplyScalar(tint).getStyle();
        ctx.fillRect(x + 3, r * h + 3, w - 6, h - 6);
        // Manchas e desgaste.
        ctx.fillStyle = `rgba(0,0,0,${0.05 + rng.next() * 0.08})`;
        ctx.fillRect(x + 3 + rng.next() * w * 0.5, r * h + 3 + rng.next() * h * 0.4, w * 0.3, h * 0.25);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function stoneMat(color: string, rx: number, ry: number): THREE.MeshToonMaterial {
  const t = stoneTexture(color).clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return toonUnique('#ffffff', { map: t });
}

/** Material de lava: textura de manchas a correr e a brilhar. */
function lavaMaterial(k: Kit, repeat = 1, speed = 0.04): THREE.MeshToonMaterial {
  const tex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c4300c';
    ctx.fillRect(0, 0, s, s);
    const rng = createRng(77);
    for (let i = 0; i < 90; i++) {
      const x = rng.next() * s;
      const y = rng.next() * s;
      const r = 6 + rng.next() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hot = rng.next() < 0.5;
      g.addColorStop(0, hot ? 'rgba(255,230,120,0.95)' : 'rgba(255,120,30,0.8)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) ctx.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
    }
    // Crosta escura a boiar.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = 'rgba(40,12,6,0.55)';
      ctx.beginPath();
      ctx.ellipse(rng.next() * s, rng.next() * s, 4 + rng.next() * 12, 3 + rng.next() * 7, rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  const mat = toonUnique('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 });
  const ph = k.rng.next() * 5;
  k.updaters.push((dt, time) => {
    tex.offset.x += dt * speed;
    tex.offset.y += dt * speed * 0.6;
    mat.emissiveIntensity = 0.85 + Math.sin(time * 2 + ph) * 0.15;
  });
  return mat;
}

/** Material de água partilhado (o mesmo shader das ondas do mar, para lagos, fossos e fontes). */
function waterMat(k: Kit, color = '#1f9fc4'): THREE.Material {
  const normal = waterNormalMap().clone();
  normal.needsUpdate = true;
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(0.35, 0.35);
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.1, normalMap: normal, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.88 });
  k.updaters.push((dt) => {
    normal.offset.x += dt * 0.02;
    normal.offset.y += dt * 0.013;
  });
  return m;
}

/** Forma redonda com a borda irregular (lagos, poças de lava). */
function blobShape(r: number, seed: number, wob = 0.18): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 3 + seed) * wob * 0.6 + Math.sin(a * 5 + seed * 2) * wob * 0.4);
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return sh;
}

function flatShape(shape: THREE.Shape, mat: THREE.Material, y: number): THREE.Mesh {
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  // ShapeGeometry fica em XY; depois de rodar, o «y» da forma passa a −z: espelha para ficar igual.
  g.scale(1, 1, -1);
  const m = mesh(g, mat, { cast: false, receive: true });
  m.position.y = y;
  return m;
}

/** Ponto mais próximo num caminho (para virar portas e coisas para lá). */
function faceNearestPath(k: Kit, x: number, z: number): number {
  let best = Infinity;
  let px = x;
  let pz = z + 1;
  for (const [ax, az, bx, bz] of k.segs) {
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const d = Math.hypot(qx - x, qz - z);
    if (d < best) {
      best = d;
      px = qx;
      pz = qz;
    }
  }
  return Math.atan2(px - x, pz - z);
}

// ── Ilha ──────────────────────────────────────────────────

function island(k: Kit): void {
  const { board, group, rng } = k;
  tileBases(k, '#d9c08a', '#fff4d6');
  const notBridge = (a: Space, b: Space) => a.zone === 'bridge' || b.zone === 'bridge';
  edging(k, { offset: 0.85, spacing: 0.5, geo: pebbleGeo(), colors: ['#cdbb94', '#b8a884', '#e2d3ae', '#9c927e'], scale: [0.7, 1.3], skip: notBridge });

  const land = board.spaces.filter((s) => s.zone !== 'bridge');
  const lb = boundsOf(land);
  const cx = (lb.minX + lb.maxX) / 2;
  const cz = (lb.minZ + lb.maxZ) / 2;
  const a = (lb.maxX - lb.minX) / 2 + 7;
  const b = (lb.maxZ - lb.minZ) / 2 + 7;
  const outline = (aa: number, bb: number, th: number): [number, number] => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const wobble = 1 + Math.sin(th * 5) * 0.03 + Math.sin(th * 11) * 0.015;
    return [cx + aa * wobble * Math.sign(c) * Math.abs(c) ** (2 / 3), cz + bb * wobble * Math.sign(s) * Math.abs(s) ** (2 / 3)];
  };
  const onGrass = (m: number) => (x: number, z: number) => Math.abs((x - cx) / (a - m)) ** 3 + Math.abs((z - cz) / (b - m)) ** 3 < 1;
  const area = { minX: cx - a, maxX: cx + a, minZ: cz - b, maxZ: cz + b };

  // Lagoa com cascata (no sítio mais livre da ilha).
  const [lag] = k.spots({ n: 1, area, min: 5, sep: 10, inside: onGrass(5) });
  if (lag) {
    const r = Math.min(8, lag.c - 1.2);
    k.clearDeco(lag.x, lag.z, r + 2.5);
    k.claim(lag.x, lag.z, r + 2);
    const pond = new THREE.Group();
    pond.position.set(lag.x, 0, lag.z);
    const shape = blobShape(r, 3, 0.12);
    pond.add(flatShape(blobShape(r + 1.1, 3, 0.12), toon('#e8d3a2'), 0.03));
    pond.add(flatShape(blobShape(r * 0.92, 3, 0.12), toon('#16536b'), 0.05));
    const water = flatShape(shape, waterMat(k, '#2bb3c9'), 0.09);
    water.receiveShadow = true;
    pond.add(water);
    // Nenúfares (alguns com flor) a boiar devagar.
    const pads: THREE.Object3D[] = [];
    for (let i = 0; i < 7; i++) {
      const ang = rng.next() * Math.PI * 2;
      const rr = r * (0.3 + rng.next() * 0.55);
      const pad = mesh(new THREE.CircleGeometry(0.5 + rng.next() * 0.25, 16, 0.4, Math.PI * 2 - 0.5), toon('#4fa83d'), { cast: false });
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(Math.cos(ang) * rr, 0.16, Math.sin(ang) * rr);
      if (i % 2 === 0) {
        const fl = mesh(new THREE.SphereGeometry(0.16, 8, 6), toon('#ff8fc8'), { cast: false });
        fl.position.z = 0.1;
        pad.add(fl);
      }
      pads.push(pad);
      pond.add(pad);
    }
    // Pedras à volta.
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + rng.next() * 0.3;
      const st = pickProp(PROPS.rocks, rng.next(), { height: 0.4 + rng.next() * 0.6 });
      if (!st) continue;
      st.position.set(Math.cos(ang) * (r + 0.5), 0, Math.sin(ang) * (r + 0.5));
      st.rotation.y = rng.next() * 6;
      pond.add(st);
    }
    // Falésia ao fundo (lado de trás, longe da câmara) com a cascata a cair para a lagoa.
    const cliff = new THREE.Group();
    // Fica na borda de trás da lagoa (não passa para lá da zona livre).
    cliff.position.set(0, 0, -r * 0.72);
    for (let i = 0; i < 5; i++) {
      const rockM = mesh(bumpy(new THREE.DodecahedronGeometry(1.5 + rng.next() * 0.6, 1), 0.2, 1.2, i), toon(i % 2 ? '#8b8d86' : '#9d9a8d'), { receive: true });
      rockM.position.set((i - 2) * 1.6, 1.2 + (i % 2) * 1 + (i === 2 ? 1.3 : 0), -0.6 - rng.next() * 0.4);
      rockM.scale.set(1, 1.3, 0.9);
      cliff.add(rockM);
    }
    // Erva e fetos em cima da falésia.
    for (let i = 0; i < 4; i++) {
      const pl = pickProp(PROPS.plants, rng.next(), { height: 0.8 + rng.next() * 0.6 });
      if (!pl) continue;
      pl.position.set((i - 1.5) * 1.5, 3.6 + (i % 2) * 0.4, -0.8);
      cliff.add(pl);
    }
    const fallTex = canvasTexture(128, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const rr = createRng(5);
      for (let i = 0; i < 70; i++) {
        const x = rr.next() * s;
        ctx.fillStyle = `rgba(${200 + rr.next() * 55},${235 + rr.next() * 20},255,${0.35 + rr.next() * 0.55})`;
        ctx.fillRect(x, rr.next() * s, 2 + rr.next() * 5, 20 + rr.next() * 60);
      }
    });
    fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
    fallTex.repeat.set(1, 2);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, color: '#e6fbff' }));
    fall.position.set(0, 2.15, 0.9);
    cliff.add(fall);
    pond.add(cliff);
    const spray = new Puffs(pond, '#ffffff');
    let acc = 0;
    k.updaters.push((dt, time) => {
      fallTex.offset.y += dt * 1.6;
      pads.forEach((p, i) => (p.position.y = 0.16 + Math.sin(time * 1.2 + i) * 0.02));
      acc += dt;
      while (acc > 0.07) {
        acc -= 0.07;
        spray.emit(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.3, -r * 0.72 + 1), new THREE.Vector3((Math.random() - 0.5) * 0.8, 1 + Math.random(), 0.6 + Math.random() * 0.6), 1.2, 0.6, 2, 0.5);
      }
      spray.update(dt);
    });
    group.add(pond);
  }

  // Colinas suaves com palmeiras e pedras (a relva 3D cresce por cima).
  for (const h of k.spots({ n: 4, area, min: 5, sep: 14, inside: onGrass(4) })) {
    const R = Math.min(7, h.c - 1.5);
    k.clearDeco(h.x, h.z, R);
    k.claim(h.x, h.z, R);
    const mound = mesh(bumpy(new THREE.SphereGeometry(R, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.25, 0.6, h.x), toon('#76c956'), { cast: false, receive: true });
    mound.scale.y = 0.26;
    mound.position.set(h.x, -0.05, h.z);
    group.add(mound);
    const top = R * 0.26;
    const palm = pickProp(PROPS.palms, rng.next(), { height: 4.5 + rng.next() * 2 }) ?? palmTree(rng, 1);
    palm.position.set(h.x + R * 0.15, top * 0.92, h.z);
    palm.rotation.y = rng.next() * 6;
    group.add(palm);
    for (let i = 0; i < 3; i++) {
      const ang = rng.next() * 6.3;
      const d = R * (0.35 + rng.next() * 0.35);
      const st = pickProp([...PROPS.rocks, ...PROPS.plants], rng.next(), { height: 0.6 + rng.next() * 0.7 });
      if (!st) continue;
      const hy = top * Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
      st.position.set(h.x + Math.cos(ang) * d, hy - 0.05, h.z + Math.sin(ang) * d);
      group.add(st);
    }
  }

  // Cabanas de palha à volta da aldeia, viradas para o caminho.
  const village = board.spaces.filter((s) => s.zone === 'village');
  if (village.length) {
    const vb = boundsOf(village);
    const huts = k.spots({ n: 6, area: { minX: vb.minX - 9, maxX: vb.maxX + 9, minZ: vb.minZ - 9, maxZ: vb.maxZ + 9 }, min: 2.8, sep: 6, max: 4, inside: onGrass(4), step: 1 });
    const bamboo = canvasTexture(64, (ctx, s) => {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#c9a15c' : '#b48a47';
        ctx.fillRect((i * s) / 8, 0, s / 8, s);
        ctx.fillStyle = 'rgba(80,50,20,0.5)';
        ctx.fillRect((i * s) / 8, s * 0.3, s / 8, 3);
        ctx.fillRect((i * s) / 8, s * 0.75, s / 8, 3);
      }
    });
    bamboo.wrapS = THREE.RepeatWrapping;
    bamboo.repeat.set(4, 1);
    for (const h of huts) {
      k.clearDeco(h.x, h.z, 2.6);
      k.claim(h.x, h.z, 2.6);
      const hut = new THREE.Group();
      const wall = mesh(new THREE.CylinderGeometry(1.25, 1.35, 1.7, 14), toonUnique('#ffffff', { map: bamboo }), { receive: true });
      wall.position.y = 0.85;
      const roof1 = mesh(bumpy(new THREE.ConeGeometry(2.05, 1.3, 14, 2), 0.06, 4, h.x, false), toon('#d9b866'));
      roof1.position.y = 2.25;
      const roof2 = mesh(new THREE.ConeGeometry(1.2, 0.9, 12), toon('#c9a354'));
      roof2.position.y = 3;
      const door = mesh(new THREE.BoxGeometry(0.7, 1.15, 0.1), toon('#4a2f18'), { cast: false });
      door.position.set(0, 0.58, 1.3);
      const mat = mesh(new THREE.CircleGeometry(0.6, 16), toon('#b5452f'), { cast: false });
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(0, 0.03, 1.9);
      hut.add(wall, roof1, roof2, door, mat);
      hut.position.set(h.x, 0, h.z);
      hut.rotation.y = faceNearestPath(k, h.x, h.z);
      group.add(hut);
    }
  }

  // Praia: chapéus de sol, toalhas e espreguiçadeiras na areia (sobretudo do lado da frente).
  const towels = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#4cd964', '#ff8fc8'];
  let placed = 0;
  for (let i = 0; i < 40 && placed < 10; i++) {
    const th = 0.15 + (i / 40) * (Math.PI - 0.3) + rng.next() * 0.05;
    const [x, z] = outline(a + 1.5, b + 1.5, th);
    if (k.clearance(x, z) < 2) continue;
    if (i % 4) continue;
    placed++;
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), toon('#ffffff'));
    pole.position.y = 1.2;
    const col = towels[placed % towels.length]!;
    const canopyTex = canvasTexture(64, (ctx, s) => {
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = j % 2 ? '#ffffff' : col;
        ctx.beginPath();
        ctx.moveTo(s / 2, s / 2);
        ctx.arc(s / 2, s / 2, s / 2, (j / 8) * Math.PI * 2, ((j + 1) / 8) * Math.PI * 2);
        ctx.fill();
      }
    });
    const canopy = mesh(new THREE.ConeGeometry(1.4, 0.55, 8, 1, true), new THREE.MeshToonMaterial({ map: canopyTex, side: THREE.DoubleSide }));
    canopy.position.y = 2.45;
    canopy.rotation.z = 0.12;
    const towel = mesh(new THREE.BoxGeometry(0.75, 0.02, 1.6), toon(towels[(placed + 2) % towels.length]!), { cast: false });
    towel.position.set(0.9, -0.2, 0.2);
    towel.rotation.y = 0.3;
    const chair = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(0.6, 0.06, 1.1), toon('#f2f2f2'));
    seat.position.y = 0.3;
    const back = mesh(new THREE.BoxGeometry(0.6, 0.06, 0.7), toon('#f2f2f2'));
    back.position.set(0, 0.55, -0.7);
    back.rotation.x = -0.9;
    chair.add(seat, back);
    chair.position.set(-0.8, -0.25, 0);
    g.add(pole, canopy, towel, chair);
    g.position.set(x, -0.2, z);
    g.rotation.y = Math.atan2(x - cx, z - cz);
    group.add(g);
  }

  // Farol num rochedo, no mar.
  {
    let best: { x: number; z: number; c: number } | null = null;
    for (const th of [-0.4, 0.3, -2.7, 2.9, -1.2, 1.9]) {
      const [x, z] = outline(a + 12, b + 12, th);
      const c = k.clearance(x, z);
      if (!best || c > best.c) best = { x, z, c };
    }
    if (best && best.c > 4) {
      const lh = new THREE.Group();
      lh.position.set(best.x, 0, best.z);
      const base = mesh(bumpy(new THREE.CylinderGeometry(2.6, 3.4, 2.4, 14, 3), 0.3, 1.4, 9, false), toon('#7d776c'), { receive: true });
      base.position.y = -0.6;
      const stripes = canvasTexture(64, (ctx, s) => {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#ffffff' : '#e8413c';
          ctx.fillRect(0, (i * s) / 6, s, s / 6);
        }
      });
      const tower = mesh(new THREE.CylinderGeometry(0.85, 1.3, 8, 18), new THREE.MeshToonMaterial({ map: stripes }));
      tower.position.y = 4.6;
      const gallery = mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 18), toon('#2b2b38'));
      gallery.position.y = 8.7;
      const lampMat = toonUnique('#fff2a8', { emissive: '#ffe066', emissiveIntensity: 1.6 });
      const lamp = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 14), lampMat, { cast: false });
      lamp.position.y = 9.4;
      const roof = mesh(new THREE.ConeGeometry(1.05, 1.1, 14), toon('#c7302c'));
      roof.position.y = 10.5;
      const beamGeo = new THREE.ConeGeometry(2.4, 18, 16, 1, true);
      beamGeo.translate(0, -9, 0);
      beamGeo.rotateZ(Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const pivot = new THREE.Group();
      pivot.position.y = 9.4;
      pivot.add(beam);
      lh.add(base, tower, gallery, lamp, roof, pivot);
      group.add(lh);
      k.updaters.push((dt) => (pivot.rotation.y += dt * 0.9));
    }
  }

  // Gaivotas a planar sobre a ilha e caranguejos a passear na areia.
  birds(k, { count: 9, cx, cz, r: [12, a + 8], h: [13, 19], color: '#ffffff', size: 0.9, speed: 5, flap: 6 });
  const crabs: { g: THREE.Group; x: number; z: number; tx: number; tz: number; ph: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const th = rng.next() * Math.PI * 2;
    const [x, z] = outline(a + 1.6, b + 1.6, th);
    if (k.clearance(x, z) < 1) continue;
    const g = new THREE.Group();
    const shell = mesh(new THREE.SphereGeometry(0.25, 10, 8), toon('#e2462f'));
    shell.scale.set(1.3, 0.55, 1);
    shell.position.y = 0.16;
    g.add(shell);
    for (const sx of [-1, 1]) {
      const claw = mesh(new THREE.SphereGeometry(0.1, 8, 6), toon('#e2462f'));
      claw.position.set(sx * 0.32, 0.14, 0.2);
      const eye = mesh(new THREE.SphereGeometry(0.04, 6, 4), toon('#111111'), { cast: false });
      eye.position.set(sx * 0.08, 0.32, 0.18);
      g.add(claw, eye);
    }
    g.position.set(x, -0.22, z);
    const tang = new THREE.Vector2(-(z - cz) / b, (x - cx) / a).normalize();
    crabs.push({ g, x, z, tx: tang.x, tz: tang.y, ph: rng.next() * 6 });
    group.add(g);
  }
  k.updaters.push((_dt, time) => {
    for (const c of crabs) {
      const s = Math.sin(time * 0.6 + c.ph) * 1.4;
      c.g.position.x = c.x + c.tx * s;
      c.g.position.z = c.z + c.tz * s;
      c.g.rotation.y = Math.atan2(c.tz, -c.tx);
      c.g.position.y = -0.22 + Math.abs(Math.sin(time * 9 + c.ph)) * 0.03;
    }
  });

  // Tochas tiki ao longo dos caminhos (de vez em quando, do lado de fora).
  k.segs3.forEach(({ a: s, b: t }, i) => {
    if (i % 5 || notBridge(s, t)) return;
    const dx = t.x - s.x;
    const dz = t.z - s.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = i % 10 ? 1 : -1;
    const x = (s.x + t.x) / 2 - (dz / len) * 1.7 * side;
    const z = (s.z + t.z) / 2 + (dx / len) * 1.7 * side;
    if (k.clearance(x, z) < 0.5) return;
    const torch = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6), toonUnique('#ffffff', { map: (() => { const t2 = canvasTexture(32, (ctx, sz) => { ctx.fillStyle = '#a07040'; ctx.fillRect(0, 0, sz, sz); ctx.fillStyle = '#5a3a1e'; for (let y = 0; y < sz; y += 8) ctx.fillRect(0, y, sz, 2); }); return t2; })() }));
    pole.position.y = 0.9;
    const cup = mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.3, 8), toon('#5a3a1e'));
    cup.position.y = 1.9;
    const f = flame(k, 1);
    f.position.y = 2.02;
    torch.add(pole, cup, f);
    torch.position.set(x, 0, z);
    group.add(torch);
  });

  // Selva mais cerrada: fetos e arbustos junto ao trilho, árvores grandes logo atrás.
  for (const { a: s, b: t } of k.segs3) {
    if (s.zone !== 'jungle' && t.zone !== 'jungle') continue;
    for (let j = 0; j < 5; j++) {
      const f = rng.next();
      const side = rng.next() < 0.5 ? -1 : 1;
      const dist = 1.9 + rng.next() * 3.5;
      const dx = t.x - s.x;
      const dz = t.z - s.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = s.x + dx * f - (dz / len) * dist * side;
      const z = s.z + dz * f + (dx / len) * dist * side;
      if (k.clearance(x, z) < 0.4) continue;
      const big = dist > 3.6;
      const o = big
        ? pickProp([...PROPS.trees.slice(0, 5), ...PROPS.palms], rng.next(), { height: 4.5 + rng.next() * 2.5 })
        : pickProp(PROPS.plants, rng.next(), { height: 0.8 + rng.next() * 0.9 });
      if (!o) continue;
      o.position.set(x, 0, z);
      o.rotation.y = rng.next() * 6;
      o.userData.deco = true;
      group.add(o);
    }
  }
}

// ── Vulcão ────────────────────────────────────────────────

/** Chão de rocha vulcânica com fendas a brilhar (cor + brilho na mesma textura). */
export function volcanicGround(): THREE.MeshToonMaterial {
  const draw = (glow: boolean) => (ctx: CanvasRenderingContext2D, s: number) => {
    const rng = createRng(13);
    ctx.fillStyle = glow ? '#000000' : '#57402f';
    ctx.fillRect(0, 0, s, s);
    if (!glow)
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(${rng.next() < 0.5 ? '30,20,16' : '120,90,70'},${0.08 + rng.next() * 0.12})`;
        const r = 2 + rng.next() * 10;
        ctx.fillRect(rng.next() * s, rng.next() * s, r, r);
      }
    // Fendas: linhas aos ziguezagues (escuras na cor, laranja no brilho).
    for (let i = 0; i < 14; i++) {
      let x = rng.next() * s;
      let y = rng.next() * s;
      let ang = rng.next() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 12; j++) {
        ang += (rng.next() - 0.5) * 1.2;
        x += Math.cos(ang) * 14;
        y += Math.sin(ang) * 14;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = glow ? '#ff6a1a' : '#1d120e';
      ctx.lineWidth = glow ? 2 : 4;
      ctx.stroke();
    }
  };
  const map = canvasTexture(512, draw(false));
  const em = canvasTexture(512, draw(true));
  for (const t of [map, em]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
  }
  return toonUnique('#ffffff', { map, emissive: '#ffffff', emissiveMap: em, emissiveIntensity: 0.7 });
}

function volcano(k: Kit): void {
  const { board, group, rng } = k;
  tileBases(k, '#3a2f2c', '#ff7a2a');
  edging(k, { offset: 0.95, spacing: 0.55, geo: pebbleGeo(0.2), colors: ['#2b2422', '#3a302c', '#4a3c35', '#231b19'], scale: [0.7, 1.4] });
  const lava = lavaMaterial(k, 1, 0.03);
  let erupting = false;
  k.flagers.push((f) => (erupting = !!f.erupting));

  // O vulcão: rocha irregular a afunilar, cratera com lava, rios de lava pela encosta e fumo.
  const R = Math.max(8, Math.min(14, k.clearance(0, 0) - 1));
  const H = R * 1.2;
  const r0 = R * 0.3;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    prof.push(new THREE.Vector2(r0 + (R - r0) * (1 - t) ** 1.7, H * t));
  }
  prof.push(new THREE.Vector2(r0 * 0.82, H - 0.4), new THREE.Vector2(r0 * 0.6, H - 1.8));
  const coneGeo = new THREE.LatheGeometry(prof, 56);
  {
    // Rugas e escorrências na rocha, e cores: base castanha, topo quase preto, sulcos escuros.
    const p = coneGeo.attributes.position!;
    const colors: number[] = [];
    const v = new THREE.Vector3();
    const cBase = new THREE.Color('#5a3d30');
    const cTop = new THREE.Color('#241816');
    const cGroove = new THREE.Color('#1a110f');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ang = Math.atan2(v.z, v.x);
      const ridge = Math.sin(ang * 9 + v.y * 0.35) * 0.5 + Math.sin(ang * 17 - v.y * 0.8) * 0.3 + Math.sin(ang * 4 + v.y * 0.15) * 0.4;
      const rad = Math.hypot(v.x, v.z);
      const k2 = rad > 0.01 ? 1 + (ridge * 0.05 * (1 - v.y / (H * 1.3))) : 1;
      p.setXYZ(i, v.x * k2, v.y, v.z * k2);
      const c = cBase.clone().lerp(cTop, Math.min(1, v.y / H));
      c.lerp(cGroove, Math.max(0, -ridge) * 0.5);
      colors.push(c.r, c.g, c.b);
    }
    coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    coneGeo.computeVertexNormals();
  }
  const cone = mesh(coneGeo, toonUnique('#ffffff', { vertexColors: true }), { receive: true });
  group.add(cone);
  const crater = mesh(new THREE.CircleGeometry(r0 * 0.62, 28), lava, { cast: false });
  crater.rotation.x = -Math.PI / 2;
  crater.position.y = H - 1.7;
  group.add(crater);
  const craterLight = new THREE.PointLight('#ff6a2a', 40, 30);
  craterLight.position.set(0, H + 1.5, 0);
  group.add(craterLight);
  // Rios de lava: tubos que descem rente à encosta, aos ziguezagues, até uma poça na base.
  const radiusAt = (y: number) => r0 + (R - r0) * (1 - y / H) ** 1.7;
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 + 0.5 + rng.next() * 0.4;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 20; j++) {
      const t = j / 20;
      const y = (H - 0.5) * (1 - t);
      const ang = a0 + Math.sin(t * 6 + i) * 0.1;
      const rr = radiusAt(y) + 0.05;
      pts.push(new THREE.Vector3(Math.cos(ang) * rr, y, Math.sin(ang) * rr));
    }
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.32 + rng.next() * 0.15, 6), lava, { cast: false });
    tube.scale.set(1, 1, 1);
    group.add(tube);
    const end = pts[pts.length - 1]!;
    const pool = flatShape(blobShape(1.3, i, 0.25), lava, 0.06);
    pool.position.x = end.x * 1.08;
    pool.position.z = end.z * 1.08;
    group.add(pool);
  }
  // Fumo a sair da cratera (mais e mais escuro na erupção).
  const smoke = new Puffs(group, '#7a6e6a');
  let sAcc = 0;
  k.updaters.push((dt, time) => {
    sAcc += dt * (erupting ? 3 : 1);
    while (sAcc > 0.12) {
      sAcc -= 0.12;
      smoke.emit(
        new THREE.Vector3((Math.random() - 0.5) * r0, H - 0.5, (Math.random() - 0.5) * r0),
        new THREE.Vector3(0.6 + Math.random() * 0.4, 2 + Math.random() * 1.5 + (erupting ? 3 : 0), (Math.random() - 0.5) * 0.6),
        6,
        2,
        erupting ? 10 : 7,
        erupting ? 0.75 : 0.45,
        erupting ? '#3d3533' : '#8a807b',
      );
    }
    smoke.update(dt);
    craterLight.intensity = (erupting ? 120 : 40) + Math.sin(time * 7) * 10;
  });

  // Poças de lava com crosta à volta, longe dos caminhos.
  const area = { minX: -70, maxX: 70, minZ: -70, maxZ: 70 };
  const steam = new Puffs(group, '#f2ece6');
  const vents: THREE.Vector3[] = [];
  for (const sp of k.spots({ n: 6, area, min: 4, sep: 14, max: 7, inside: (x, z) => Math.hypot(x, z) > R + 4 })) {
    const rr = Math.min(5, sp.c - 1.2);
    k.clearDeco(sp.x, sp.z, rr + 1);
    k.claim(sp.x, sp.z, rr + 1);
    const g = new THREE.Group();
    g.position.set(sp.x, 0, sp.z);
    g.add(flatShape(blobShape(rr + 0.7, sp.x, 0.2), toon('#241816'), 0.03));
    g.add(flatShape(blobShape(rr, sp.x, 0.2), lava, 0.07));
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + rng.next() * 0.3;
      const st = mesh(bumpy(new THREE.DodecahedronGeometry(0.35 + rng.next() * 0.5, 0), 0.05, 3, i, false), toon(i % 2 ? '#2b2220' : '#3a2e2a'));
      st.position.set(Math.cos(ang) * (rr + 0.5), 0.15, Math.sin(ang) * (rr + 0.5));
      st.scale.y = 0.6;
      g.add(st);
    }
    const pl = new THREE.PointLight('#ff6a2a', 14, rr * 3);
    pl.position.y = 1.5;
    g.add(pl);
    group.add(g);
    vents.push(new THREE.Vector3(sp.x, 0.3, sp.z));
  }
  // Colunas de basalto (prismas hexagonais) em grupos.
  for (const sp of k.spots({ n: 6, area, min: 2.6, sep: 12, max: 3.5, inside: (x, z) => Math.hypot(x, z) > R + 3 })) {
    k.clearDeco(sp.x, sp.z, 2.5);
    k.claim(sp.x, sp.z, 2.5);
    const n = 7 + Math.floor(rng.next() * 6);
    for (let i = 0; i < n; i++) {
      const h = 0.8 + rng.next() * 3.5;
      const col = mesh(new THREE.CylinderGeometry(0.42, 0.46, h, 6), [toon('#2e2a2d'), toon('#4a4448'), toon('#2e2a2d')]);
      const ang = rng.next() * 6.3;
      const d = rng.next() * 1.6;
      col.position.set(sp.x + Math.cos(ang) * d, h / 2, sp.z + Math.sin(ang) * d);
      col.rotation.y = rng.next();
      group.add(col);
    }
  }
  // Fumarolas: anel de pedras com vapor a sair.
  for (const sp of k.spots({ n: 5, area, min: 1.8, sep: 10, max: 2.5, inside: (x, z) => Math.hypot(x, z) > R + 2 })) {
    k.claim(sp.x, sp.z, 1.5);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const st = mesh(new THREE.DodecahedronGeometry(0.22, 0), toon('#c9b89a'));
      st.position.set(sp.x + Math.cos(ang) * 0.5, 0.1, sp.z + Math.sin(ang) * 0.5);
      group.add(st);
    }
    const hole = mesh(new THREE.CircleGeometry(0.4, 12), toon('#120a08'), { cast: false });
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(sp.x, 0.04, sp.z);
    group.add(hole);
    vents.push(new THREE.Vector3(sp.x, 0.2, sp.z));
  }
  let vAcc = 0;
  k.updaters.push((dt) => {
    vAcc += dt;
    while (vAcc > 0.2) {
      vAcc -= 0.2;
      const v = vents[Math.floor(Math.random() * vents.length)];
      if (v) steam.emit(v.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(0.2, 1.4 + Math.random(), 0), 2.6, 0.6, 2.6, 0.45);
    }
    steam.update(dt);
  });

  // Ponte de lava: um canal de lava por baixo do caminho e tábuas com cordas por cima.
  for (const { a, b } of k.segs3) {
    if (a.zone !== 'lavaBridge' && b.zone !== 'lavaBridge') continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const channel = mesh(new THREE.BoxGeometry(5, 0.06, len + 1.2), lava, { cast: false });
    channel.position.set(mx, 0.02, mz);
    channel.rotation.y = yaw;
    group.add(channel);
    for (let d = 0.2; d < len; d += 0.42) {
      const plank = mesh(new THREE.BoxGeometry(2, 0.1, 0.34), toon(rng.next() < 0.5 ? '#7a5230' : '#6b4524'), { receive: true });
      plank.position.set(a.x + (dx / len) * d, 0.17, a.z + (dz / len) * d);
      plank.rotation.y = yaw;
      plank.rotation.z = (rng.next() - 0.5) * 0.04;
      group.add(plank);
    }
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (const f of [0, 0.5, 1]) {
        const x = a.x + dx * f - (dz / len) * 1.05 * side;
        const z = a.z + dz * f + (dx / len) * 1.05 * side;
        const post = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), toon('#5a3a1e'));
        post.position.set(x, 0.55, z);
        group.add(post);
        pts.push(new THREE.Vector3(x, f === 0.5 ? 0.85 : 1.05, z));
      }
      group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 4), toon('#c9a26b'), { cast: false }));
    }
  }

  // Candeeiros da mina (lanterna num poste) de vez em quando junto ao caminho.
  k.segs3.forEach(({ a, b }, i) => {
    if (i % 6 || a.zone === 'lavaBridge') return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const x = (a.x + b.x) / 2 - (dz / len) * 1.8;
    const z = (a.z + b.z) / 2 + (dx / len) * 1.8;
    if (k.clearance(x, z) < 0.4) return;
    const g = new THREE.Group();
    const post = mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), toon('#4a3020'));
    post.position.y = 1.1;
    const arm = mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), toon('#4a3020'));
    arm.position.set(0.3, 2.1, 0);
    const lamp = mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), toonUnique('#ffb347', { emissive: '#ff9a2a', emissiveIntensity: 1.4 }), { cast: false });
    lamp.position.set(0.6, 1.85, 0);
    g.add(post, arm, lamp);
    g.position.set(x, 0, z);
    g.rotation.y = rng.next() * 6;
    group.add(g);
  });

  birds(k, { count: 5, cx: 0, cz: 0, r: [12, 30], h: [H + 4, H + 9], color: '#2a2226', size: 1.4, speed: 4, flap: 2.5 });
  void board;
}

// ── Castelo ───────────────────────────────────────────────

function castle(k: Kit): void {
  const { board, group, rng } = k;
  tileBases(k, '#4a4652', '#b9a37a');
  edging(k, { offset: 0.9, spacing: 0.45, geo: new THREE.BoxGeometry(0.34, 0.12, 0.3), colors: ['#8a8578', '#77736a', '#9a9486', '#6c685f'], scale: [0.85, 1.15], align: true, jitter: 0.04 });

  const floors = ['floor0', 'floor1', 'floor2']
    .map((zone) => {
      const sp = board.spaces.filter((s) => s.zone === zone);
      if (!sp.length) return null;
      const b = boundsOf(sp);
      return { zone, y: sp[0]!.y ?? 0, minX: b.minX - 3.5, maxX: b.maxX + 3.5, minZ: b.minZ - 3.5, maxZ: b.maxZ + 3.5 };
    })
    .filter((f): f is NonNullable<typeof f> => !!f);
  const wallMat = stoneMat('#8a8072', 2, 1);
  const merlonMat = stoneMat('#8a8072', 1, 1);

  // Muralhas com ameias à volta de cada andar (com aberturas onde passam escadas e caminhos).
  const torches: THREE.Vector3[] = [];
  for (const f of floors) {
    const low = f.y === 0;
    const wallH = low ? 0.9 : 1.2;
    const edges: [number, number, number, number][] = [
      [f.minX, f.minZ, f.maxX, f.minZ],
      [f.maxX, f.minZ, f.maxX, f.maxZ],
      [f.maxX, f.maxZ, f.minX, f.maxZ],
      [f.minX, f.maxZ, f.minX, f.minZ],
    ];
    edges.forEach(([ax, az, bx, bz], ei) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2));
      const piece = len / n;
      const yaw = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = lerp(ax, bx, t);
        const z = lerp(az, bz, t);
        // Abertura: perto de um caminho (escadas) ou de uma casa (elevadores, entradas).
        let open = false;
        for (const { a, b } of k.segs3) {
          if (Math.max(a.y ?? 0, b.y ?? 0) < f.y - 0.5 && f.y > 0) continue;
          if (distToSegment(x, z, a.x, a.z, b.x, b.z) < 1.8) { open = true; break; }
        }
        if (!open) for (const s of board.spaces) if (Math.abs((s.y ?? 0) - f.y) < 0.6 && Math.hypot(s.x - x, s.z - z) < 2) { open = true; break; }
        if (open) continue;
        const w = mesh(new THREE.BoxGeometry(0.55, wallH, piece + 0.02), wallMat, { receive: true });
        w.position.set(x, f.y + wallH / 2, z);
        w.rotation.y = yaw;
        group.add(w);
        if (i % 2 === 0) {
          const m = mesh(new THREE.BoxGeometry(0.6, 0.55, piece * 0.5), merlonMat);
          m.position.set(x, f.y + wallH + 0.27, z);
          m.rotation.y = yaw;
          group.add(m);
        }
        if (!low && i % 5 === 2 && ei % 2 === 0) torches.push(new THREE.Vector3(x, f.y + wallH + 0.1, z));
      }
    });

    // Estandartes e janelas nas torres dos cantos (viradas para a câmara).
    for (const [tx, tz] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const) {
      const banner = new THREE.Group();
      const cloth = mesh(new THREE.PlaneGeometry(1.1, 2.6, 1, 6), toonUnique('#5b2a8a', { side: THREE.DoubleSide }), { cast: false });
      cloth.position.y = -1.3;
      const emblem = mesh(new THREE.CircleGeometry(0.32, 16), toonUnique('#ffd23f', { side: THREE.DoubleSide }), { cast: false });
      emblem.position.set(0, -1, 0.01);
      const rod = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), toon('#2b2b38'));
      rod.rotation.z = Math.PI / 2;
      banner.add(cloth, emblem, rod);
      banner.position.set(tx, f.y + 5.2, tz + 1.82);
      group.add(banner);
      const ph = rng.next() * 5;
      k.updaters.push((_dt, time) => (cloth.rotation.x = Math.sin(time * 1.5 + ph) * 0.06));
      for (let j = 0; j < 2; j++) {
        const win = mesh(new THREE.BoxGeometry(0.4, 0.7, 0.1), toonUnique('#ffcf6a', { emissive: '#ffb347', emissiveIntensity: 1.2 }), { cast: false });
        const ang = j ? 0.9 : -0.9;
        win.position.set(tx + Math.sin(ang) * 1.68, f.y + 2.4 + j * 1.6, tz + Math.cos(ang) * 1.68);
        win.rotation.y = ang;
        group.add(win);
      }
    }
  }
  for (const p of torches) {
    const holder = mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.4, 6), toon('#2b2b38'));
    holder.position.copy(p).add(new THREE.Vector3(0, 0.2, 0));
    const f = flame(k, 1.1);
    f.position.copy(p).add(new THREE.Vector3(0, 0.42, 0));
    group.add(holder, f);
  }

  // Escadas com degraus a sério e base de pedra até ao chão (em vez de uma rampa no ar).
  const stepMat = stoneMat('#9a9080', 1, 0.5);
  const baseMat = stoneMat('#7d7466', 1, 1);
  for (const { a, b } of k.segs3) {
    const ya = a.y ?? 0;
    const yb = b.y ?? 0;
    if (Math.abs(yb - ya) < 0.3) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(3, Math.ceil(Math.abs(yb - ya) / 0.28));
    const yaw = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      // Cada degrau fica rente à rampa do caminho (o caminho assenta por cima; os degraus veem-se dos lados).
      const top = lerp(ya, yb, t) - 0.04;
      const blk = mesh(new THREE.BoxGeometry(2.1, Math.max(0.2, top), len / n + 0.02), i % 2 ? stepMat : baseMat, { receive: true });
      blk.position.set(a.x + dx * t, Math.max(0.2, top) / 2, a.z + dz * t);
      blk.rotation.y = yaw;
      group.add(blk);
    }
    // Parapeitos dos lados.
    for (const side of [-1, 1]) {
      const pa = new THREE.Vector3(a.x - (dz / len) * 1.15 * side, ya + 0.5, a.z + (dx / len) * 1.15 * side);
      const pb = new THREE.Vector3(b.x - (dz / len) * 1.15 * side, yb + 0.5, b.z + (dx / len) * 1.15 * side);
      const mid = pa.clone().lerp(pb, 0.5);
      const rail = mesh(new THREE.BoxGeometry(0.3, 0.6, pa.distanceTo(pb)), merlonMat);
      rail.position.copy(mid);
      rail.lookAt(pb);
      group.add(rail);
    }
  }

  // Fosso à volta do castelo, com ponte levadiça à frente (junto ao portão do cemitério).
  if (floors.length) {
    const minX = Math.min(...floors.map((f) => f.minX)) - 5;
    const maxX = Math.max(...floors.map((f) => f.maxX)) + 5;
    const minZ = Math.min(...floors.map((f) => f.minZ)) - 5;
    const maxZ = Math.max(...floors.map((f) => f.maxZ)) + 2.2;
    const W = 3.4;
    const water = waterMat(k, '#2a4f5c');
    const edgeMat = stoneMat('#6f6a60', 4, 0.5);
    const band = (x0: number, z0: number, x1: number, z1: number) => {
      const w = Math.abs(x1 - x0) || W;
      const d = Math.abs(z1 - z0) || W;
      const cxm = (x0 + x1) / 2;
      const czm = (z0 + z1) / 2;
      const sw = mesh(new THREE.PlaneGeometry(w, d, 8, 8), water, { cast: false, receive: true });
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(cxm, -0.15, czm);
      group.add(sw);
      const bed = mesh(new THREE.PlaneGeometry(w, d), toon('#16262c'), { cast: false });
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(cxm, -0.35, czm);
      group.add(bed);
      // Tira a decoração que caiu dentro do fosso.
      for (const o of [...group.children]) {
        if (!o.userData.deco && !o.userData.prop) continue;
        if (Math.abs(o.position.x - cxm) < w / 2 + 0.8 && Math.abs(o.position.z - czm) < d / 2 + 0.8) group.remove(o);
      }
    };
    band(minX - W, minZ - W / 2, maxX + W, minZ - W / 2);
    band(minX - W, maxZ + W / 2, maxX + W, maxZ + W / 2);
    band(minX - W / 2, minZ, minX - W / 2, maxZ);
    band(maxX + W / 2, minZ, maxX + W / 2, maxZ);
    // Bordas de pedra do fosso.
    for (const [x0, z0, x1, z1] of [
      [minX - W, minZ - W, maxX + W, minZ - W], [minX, minZ, maxX, minZ], [minX - W, maxZ + W, maxX + W, maxZ + W], [minX, maxZ, maxX, maxZ],
      [minX - W, minZ - W, minX - W, maxZ + W], [minX, minZ, minX, maxZ], [maxX + W, minZ - W, maxX + W, maxZ + W], [maxX, minZ, maxX, maxZ],
    ] as const) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const e = mesh(new THREE.BoxGeometry(0.45, 0.35, len), edgeMat, { receive: true });
      e.position.set((x0 + x1) / 2, 0.1, (z0 + z1) / 2);
      e.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      group.add(e);
    }
    const bridge = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const plank = mesh(new THREE.BoxGeometry(3.2, 0.14, 0.5), toon(i % 2 ? '#6b4524' : '#7a5230'), { receive: true });
      plank.position.set(0, 0.32, -W / 2 - 0.4 + i * 0.52);
      bridge.add(plank);
    }
    for (const sx of [-1, 1]) {
      const chain = mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 6), toon('#3a3a44'));
      chain.position.set(sx * 1.5, 2, -W / 2 - 0.2);
      chain.rotation.x = 0.6;
      bridge.add(chain);
    }
    bridge.position.set(0, 0, maxZ + W / 2);
    group.add(bridge);
  }

  // Poço no pátio.
  const f0 = floors.find((f) => f.zone === 'floor0');
  if (f0) {
    const [w] = k.spots({ n: 1, area: f0, min: 1.8, sep: 4, max: 3, step: 1 });
    if (w) {
      k.claim(w.x, w.z, 1.8);
      const well = new THREE.Group();
      const ring = mesh(new THREE.CylinderGeometry(0.95, 1, 0.9, 16, 1, true), stoneMat('#8a8578', 3, 1), { receive: true });
      ring.position.y = 0.45;
      well.add(ring);
      const water = mesh(new THREE.CircleGeometry(0.85, 16), toon('#1d3a44'), { cast: false });
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.6;
      well.add(water);
      for (const sx of [-1, 1]) {
        const post = mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), toon('#5a3a1e'));
        post.position.set(sx * 0.85, 1.3, 0);
        well.add(post);
      }
      const roof = mesh(new THREE.ConeGeometry(1.4, 0.8, 4), toon('#6b3a2a'));
      roof.position.y = 2.55;
      roof.rotation.y = Math.PI / 4;
      const bucket = mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.25, 8), toon('#7a5230'));
      bucket.position.set(0, 1.4, 0);
      well.add(roof, bucket);
      well.position.set(w.x, 0, w.z);
      group.add(well);
    }
  }

  // Névoa rasteira a deslizar pelo cemitério.
  const fogMat = new THREE.MeshBasicMaterial({ map: softTexture(), color: '#bfc4ff', transparent: true, opacity: 0.16, depthWrite: false });
  const mists: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
  const all = boundsOf(board.spaces);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), fogMat);
    m.rotation.x = -Math.PI / 2;
    const x = lerp(all.minX - 30, all.maxX + 30, rng.next());
    const z = lerp(all.minZ - 20, all.maxZ + 30, rng.next());
    if (floors.some((f) => x > f.minX - 6 && x < f.maxX + 6 && z > f.minZ - 6 && z < f.maxZ + 6)) continue;
    m.position.set(x, 0.5 + rng.next() * 0.5, z);
    m.renderOrder = 2;
    group.add(m);
    mists.push({ m, x, z, ph: rng.next() * 6 });
  }
  k.updaters.push((_dt, time) => {
    for (const s of mists) {
      s.m.position.x = s.x + Math.sin(time * 0.1 + s.ph) * 4;
      s.m.position.z = s.z + Math.cos(time * 0.08 + s.ph) * 3;
    }
    fogMat.opacity = 0.14 + Math.sin(time * 0.4) * 0.04;
  });

  birds(k, { count: 12, cx: 0, cz: (all.minZ + all.maxZ) / 2, r: [10, 38], h: [10, 20], color: '#1b1626', size: 0.8, speed: 9, flap: 16 });
}

// ── Parque ────────────────────────────────────────────────

function park(k: Kit): void {
  const { board, group, rng } = k;
  tileBases(k, '#f4ecff', '#ffcf3f');
  // Sebes baixas a ladear os caminhos.
  const hedge = new THREE.BoxGeometry(0.5, 0.42, 0.5);
  hedge.translate(0, 0.21, 0);
  edging(k, { offset: 1.15, spacing: 0.52, geo: hedge, colors: ['#3f9d4a', '#4cad55', '#368a40'], scale: [0.9, 1.1], scaleY: [0.85, 1.2], align: true, jitter: 0.03, y: 0 });

  const all = boundsOf(board.spaces);
  const area = { minX: all.minX - 14, maxX: all.maxX + 14, minZ: all.minZ - 14, maxZ: all.maxZ + 14 };
  // O carrossel e a roda gigante já lá estão.
  const car = group.userData.carousel as THREE.Vector3 | undefined;
  if (car) k.claim(car.x, car.z, 5);
  const wheelSp = board.wheel?.map((id) => getSpace(board, id)) ?? [];
  if (wheelSp.length) k.claim(wheelSp.reduce((s, p) => s + p.x, 0) / wheelSp.length, wheelSp.reduce((s, p) => s + p.z, 0) / wheelSp.length, 6);

  // Fonte com três bacias e repuxos.
  const [fs] = k.spots({ n: 1, area: { minX: -20, maxX: 20, minZ: -14, maxZ: 14 }, min: 3.2, sep: 8, max: 5 });
  if (fs) {
    k.clearDeco(fs.x, fs.z, 4);
    k.claim(fs.x, fs.z, 4);
    const R = Math.min(3.4, fs.c - 0.6);
    const g = new THREE.Group();
    g.position.set(fs.x, 0, fs.z);
    const stone = stoneMat('#e8e1d0', 6, 0.6);
    const basin = mesh(new THREE.CylinderGeometry(R, R + 0.15, 0.6, 32, 1, true), stone, { receive: true });
    basin.position.y = 0.3;
    g.add(basin);
    const rimT = mesh(new THREE.TorusGeometry(R, 0.14, 8, 40), toon('#f2ece0'));
    rimT.rotation.x = Math.PI / 2;
    rimT.position.y = 0.6;
    const pool = mesh(new THREE.CircleGeometry(R - 0.05, 32), waterMat(k, '#3fb6e0'), { cast: false });
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.45;
    const col = mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 12), stone);
    col.position.y = 1.1;
    const bowl1 = mesh(new THREE.CylinderGeometry(1.4, 0.4, 0.4, 20), toon('#e8e1d0'));
    bowl1.position.y = 2.2;
    const col2 = mesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 10), stone);
    col2.position.y = 2.8;
    const bowl2 = mesh(new THREE.CylinderGeometry(0.75, 0.25, 0.3, 16), toon('#e8e1d0'));
    bowl2.position.y = 3.3;
    const ball = mesh(new THREE.SphereGeometry(0.25, 12, 8), toon('#ffd23f'));
    ball.position.y = 3.6;
    g.add(rimT, pool, col, bowl1, col2, bowl2, ball);
    // Gotas: sobem do topo e caem em arco para as bacias.
    const n = 70;
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#c9f1ff', transparent: true, opacity: 0.85 }), n);
    const st = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3() }));
    drops.frustumCulled = false;
    g.add(drops);
    const mtx = new THREE.Matrix4();
    k.updaters.push((dt) => {
      st.forEach((d, i) => {
        if (d.p.y < 0.45) {
          const ang = Math.random() * Math.PI * 2;
          const top = Math.random() < 0.5;
          d.p.set(0, top ? 3.75 : 2.45, 0);
          const sp = top ? 0.9 : 1.6;
          d.v.set(Math.cos(ang) * sp, top ? 2.6 : 1.2, Math.sin(ang) * sp);
        }
        d.v.y -= 9.8 * dt;
        d.p.addScaledVector(d.v, dt);
        drops.setMatrixAt(i, mtx.makeTranslation(d.p.x, d.p.y, d.p.z));
      });
      drops.instanceMatrix.needsUpdate = true;
    });
    group.add(g);
  }

  // Torre de queda: sobe devagar, fica lá em cima e cai a pique.
  // Ao fundo do parque (longe da câmara, que está do lado da frente).
  const [dt0] = k.spots({ n: 1, area: { ...area, maxZ: (all.minZ + all.maxZ) / 2 }, min: 3, sep: 10, max: 4 });
  if (dt0) {
    k.clearDeco(dt0.x, dt0.z, 3.5);
    k.claim(dt0.x, dt0.z, 3.5);
    const g = new THREE.Group();
    g.position.set(dt0.x, 0, dt0.z);
    const H = 17;
    const stripe = canvasTexture(64, (ctx, s) => {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#3fa7ff';
        ctx.fillRect(0, (i * s) / 8, s, s / 8);
      }
    });
    stripe.wrapT = THREE.RepeatWrapping;
    stripe.repeat.set(1, 4);
    const pole = mesh(new THREE.CylinderGeometry(0.55, 0.7, H, 14), new THREE.MeshToonMaterial({ map: stripe }));
    pole.position.y = H / 2;
    const base = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 20), toon('#ffd23f'), { receive: true });
    base.position.y = 0.25;
    const cap = mesh(new THREE.ConeGeometry(1.1, 1.4, 14), toon('#ff5a5f'));
    cap.position.y = H + 0.7;
    const lightMat = toonUnique('#fff3b0', { emissive: '#ffd23f', emissiveIntensity: 1.4 });
    const bulb = mesh(new THREE.SphereGeometry(0.25, 8, 6), lightMat, { cast: false });
    bulb.position.y = H + 1.5;
    const seat = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(1.3, 0.28, 8, 24), toon('#ff5a5f'));
    ring.rotation.x = Math.PI / 2;
    seat.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const chair = mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), toon(['#ffd23f', '#4cd964', '#3fa7ff', '#ff8fc8'][i % 4]!));
      chair.position.set(Math.cos(a) * 1.55, -0.2, Math.sin(a) * 1.55);
      chair.rotation.y = -a + Math.PI / 2;
      seat.add(chair);
    }
    g.add(pole, base, cap, bulb, seat);
    group.add(g);
    let t = rng.next() * 9;
    k.updaters.push((dt, time) => {
      t = (t + dt) % 10;
      // 0–6 s sobe, 6–7 s parado lá em cima, 7–7,8 s cai, depois trava e espera em baixo.
      const y = t < 6 ? lerp(1.2, H - 2, t / 6) : t < 7 ? H - 2 : t < 7.8 ? lerp(H - 2, 1.4, ((t - 7) / 0.8) ** 2) : 1.2 + Math.sin((t - 7.8) * 8) * 0.25 * Math.max(0, 1 - (t - 7.8));
      seat.position.y = y;
      lightMat.emissiveIntensity = t > 6 && t < 7 ? (Math.sin(time * 20) > 0 ? 2 : 0.3) : 1.2;
    });
  }

  // Barco pirata a baloiçar.
  const [sw] = k.spots({ n: 1, area, min: 3.6, sep: 10, max: 5 });
  if (sw) {
    k.clearDeco(sw.x, sw.z, 4.5);
    k.claim(sw.x, sw.z, 4.5);
    const g = new THREE.Group();
    g.position.set(sw.x, 0, sw.z);
    g.rotation.y = faceNearestPath(k, sw.x, sw.z) + Math.PI / 2;
    const P = 5.5;
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.16, 0.2, 6, 8), toon('#9aa3ad'));
        leg.position.set(sx * 1.4, P / 2, sz * 1.2);
        leg.rotation.x = sz * -0.22;
        leg.rotation.z = sx * 0.0;
        g.add(leg);
      }
    const axle = mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.4, 8), toon('#5a5f68'));
    axle.rotation.x = Math.PI / 2;
    axle.position.y = P;
    g.add(axle);
    const swing = new THREE.Group();
    swing.position.y = P;
    const hull = mesh(new THREE.CylinderGeometry(1, 1, 4.6, 16, 1, false, Math.PI / 2, Math.PI), toon('#8b4a2b'));
    hull.rotation.z = Math.PI / 2;
    hull.position.y = -3.6;
    const deck = mesh(new THREE.BoxGeometry(4.6, 0.1, 1.9), toon('#c08a52'));
    deck.position.y = -3.6;
    const mast = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2), toon('#5a3a1e'));
    mast.position.y = -2.5;
    const sail = mesh(new THREE.PlaneGeometry(1.6, 1.2), toonUnique('#ffffff', { side: THREE.DoubleSide }), { cast: false });
    sail.position.set(0, -2.3, 0.1);
    sail.rotation.y = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(0.14, 3.6, 0.14), toon('#9aa3ad'));
      arm.position.set(sx * 1.2, -1.8, 0);
      swing.add(arm);
    }
    swing.add(hull, deck, mast, sail);
    g.add(swing);
    group.add(g);
    k.updaters.push((_dt, time) => (swing.rotation.z = Math.sin(time * 0.9) * 1.0));
  }

  // Bandeirinhas por cima da avenida dos doces e candeeiros ao longo dos caminhos.
  const pennants: THREE.Mesh[] = [];
  k.segs3.forEach(({ a, b }, i) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if ((a.zone === 'midway' || b.zone === 'midway') && i % 2 === 0) {
      const p1 = new THREE.Vector3(mx + nx * 2.3, 0, mz + nz * 2.3);
      const p2 = new THREE.Vector3(mx - nx * 2.3, 0, mz - nz * 2.3);
      if (k.clearance(p1.x, p1.z) > 0.2 && k.clearance(p2.x, p2.z) > 0.2) {
        for (const p of [p1, p2]) {
          const pole = mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), toon('#ffffff'));
          pole.position.set(p.x, 2.5, p.z);
          const knob = mesh(new THREE.SphereGeometry(0.15, 8, 6), toon('#ffd23f'));
          knob.position.set(p.x, 5.05, p.z);
          group.add(pole, knob);
        }
        pennants.push(...bunting(group, p1.clone().setY(4.8), p2.clone().setY(4.8), { sag: 0.6, gap: 0.55, size: 0.4 }));
      }
      return;
    }
    if (i % 4) return;
    const side = i % 8 ? 1 : -1;
    const x = mx + nx * 2 * side;
    const z = mz + nz * 2 * side;
    if (k.clearance(x, z) < 0.3) return;
    const lamp = new THREE.Group();
    const post = mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.2, 8), toon('#2b4a3a'));
    post.position.y = 1.6;
    const globe = mesh(new THREE.SphereGeometry(0.3, 12, 8), toonUnique('#fff6d8', { emissive: '#ffe9a8', emissiveIntensity: 1.2 }), { cast: false });
    globe.position.y = 3.35;
    const capL = mesh(new THREE.ConeGeometry(0.32, 0.25, 10), toon('#2b4a3a'));
    capL.position.y = 3.7;
    lamp.add(post, globe, capL);
    lamp.position.set(x, 0, z);
    group.add(lamp);
  });
  k.updaters.push((_dt, time) => swayBunting(pennants, time));

  // Canteiros de flores redondos.
  const flowerGeo = new THREE.SphereGeometry(0.13, 6, 4);
  for (const fb of k.spots({ n: 8, area, min: 1.6, sep: 8, max: 2.4 })) {
    k.claim(fb.x, fb.z, 1.8);
    const r = Math.min(2, fb.c - 0.2);
    const soil = mesh(new THREE.CylinderGeometry(r, r + 0.1, 0.25, 20), toon('#6b4a2a'), { cast: false, receive: true });
    soil.position.set(fb.x, 0.12, fb.z);
    const border = mesh(new THREE.TorusGeometry(r + 0.05, 0.1, 6, 28), toon('#e8e1d0'));
    border.rotation.x = Math.PI / 2;
    border.position.set(fb.x, 0.22, fb.z);
    group.add(soil, border);
    const n = Math.round(r * r * 14);
    const fl = new THREE.InstancedMesh(flowerGeo, new THREE.MeshToonMaterial({ color: '#ffffff' }), n);
    const pal = ['#ff5a5f', '#ffd23f', '#ff8fc8', '#b36bff', '#ffffff'];
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const ang = rng.next() * 6.3;
      const d = Math.sqrt(rng.next()) * (r - 0.15);
      m.makeTranslation(fb.x + Math.cos(ang) * d, 0.32 + rng.next() * 0.1, fb.z + Math.sin(ang) * d);
      fl.setMatrixAt(i, m);
      fl.setColorAt(i, new THREE.Color(pal[i % pal.length]!));
    }
    group.add(fl);
  }

  // Fogo de artifício de vez em quando por cima do parque.
  const fwN = 70;
  const fw = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), fwN);
  fw.frustumCulled = false;
  fw.visible = false;
  group.add(fw);
  const parts = Array.from({ length: fwN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3() }));
  let wait = 3;
  let life = 0;
  const fwM = new THREE.Matrix4();
  const fwS = new THREE.Vector3();
  const fwQ = new THREE.Quaternion();
  k.updaters.push((dt) => {
    if (life <= 0) {
      wait -= dt;
      fw.visible = false;
      if (wait <= 0) {
        wait = 4 + Math.random() * 5;
        life = 1.8;
        const c = new THREE.Vector3(lerp(all.minX, all.maxX, Math.random()), 26 + Math.random() * 8, lerp(all.minZ - 20, all.minZ + 10, Math.random()));
        const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
        parts.forEach((p, i) => {
          p.p.copy(c);
          const u = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 3);
          p.v.copy(u);
          fw.setColorAt(i, i % 3 ? col : new THREE.Color('#ffffff'));
        });
        if (fw.instanceColor) fw.instanceColor.needsUpdate = true;
        fw.visible = true;
      }
      return;
    }
    life -= dt;
    const k2 = Math.max(0, life / 1.8);
    (fw.material as THREE.MeshBasicMaterial).opacity = k2;
    parts.forEach((p, i) => {
      p.v.multiplyScalar(1 - dt * 1.2);
      p.v.y -= 4 * dt;
      p.p.addScaledVector(p.v, dt);
      fwS.setScalar(0.5 + k2);
      fw.setMatrixAt(i, fwM.compose(p.p, fwQ, fwS));
    });
    fw.instanceMatrix.needsUpdate = true;
  });
}

// ── Cidade ────────────────────────────────────────────────

function city(k: Kit): void {
  const { board, group, rng } = k;
  tileBases(k, '#2c2838', '#3fd0ff');
  // Lancis dos passeios (dos dois lados de cada rua).
  edging(k, { offset: 2.1, spacing: 0.6, geo: new THREE.BoxGeometry(0.2, 0.16, 0.62), colors: ['#b9b6c8', '#a9a6b8'], scale: [1, 1], align: true, jitter: 0, y: 0.08 });

  // Passadeiras junto aos cruzamentos.
  const degree = new Map<number, number>();
  for (const { a, b } of k.segs3) {
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
  }
  const zebra = toon('#f2f2f2');
  for (const { a, b } of k.segs3) {
    for (const [n, o] of [[a, b], [b, a]] as const) {
      if ((degree.get(n.id) ?? 0) < 3) continue;
      const dx = o.x - n.x;
      const dz = o.z - n.z;
      const len = Math.hypot(dx, dz);
      if (len < 3.2) continue;
      const ux = dx / len;
      const uz = dz / len;
      const at = 2.1;
      for (let j = -2; j <= 2; j++) {
        const st = mesh(new THREE.BoxGeometry(0.34, 0.02, 0.9), zebra, { cast: false });
        st.position.set(n.x + ux * at - uz * j * 0.55, 0.075, n.z + uz * at + ux * j * 0.55);
        st.rotation.y = Math.atan2(dx, dz);
        group.add(st);
      }
    }
  }

  // Terraços dos prédios (os de caixa): murete, ar condicionado, depósitos de água e antenas a piscar.
  const blink = toonUnique('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 1.5 });
  const roofs: { m: THREE.Mesh; h: number }[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    const g = m.geometry as THREE.BoxGeometry | undefined;
    if (m.isMesh && g?.type === 'BoxGeometry' && g.parameters.width === 4.2 && g.parameters.depth === 4.2) roofs.push({ m, h: g.parameters.height });
  });
  for (const { m, h } of roofs) {
    const top = h / 2;
    const roofG = new THREE.Group();
    roofG.position.y = top;
    const lip = toon('#4a4560');
    for (const [x, z, w, d] of [[0, 2.05, 4.2, 0.1], [0, -2.05, 4.2, 0.1], [2.05, 0, 0.1, 4.2], [-2.05, 0, 0.1, 4.2]] as const) {
      const p = mesh(new THREE.BoxGeometry(w, 0.35, d), lip, { cast: false });
      p.position.set(x, 0.17, z);
      roofG.add(p);
    }
    const n = 1 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
      const ac = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), toon('#9a9aa8'));
      ac.position.set((rng.next() - 0.5) * 2.6, 0.25, (rng.next() - 0.5) * 2.6);
      const fan = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10), toon('#4a4a58'), { cast: false });
      fan.position.y = 0.27;
      ac.add(fan);
      roofG.add(ac);
    }
    if (rng.next() < 0.25) {
      const wt = prop('kaykit-city/watertower', { height: 2.6 });
      if (wt) {
        wt.position.set(0.8, 0, -0.8);
        roofG.add(wt);
      }
    }
    if (h > 12 && rng.next() < 0.7) {
      const ant = mesh(new THREE.CylinderGeometry(0.04, 0.06, 3, 6), toon('#c0c0c8'));
      ant.position.set(-1, 1.5, 1);
      const tip = mesh(new THREE.SphereGeometry(0.12, 8, 6), blink, { cast: false });
      tip.position.set(-1, 3.05, 1);
      roofG.add(ant, tip);
    }
    m.add(roofG);
  }
  k.updaters.push((_dt, time) => (blink.emissiveIntensity = Math.sin(time * 3) > 0.6 ? 2 : 0.1));

  // Painéis publicitários com letras a correr, nos prédios mais altos.
  const ads = ['★ FESTA! ★', 'NÉON 24h', 'PIZZA 🍕', 'METRO →', 'SALDOS!'];
  const tall = [...roofs].sort((p, q) => q.h - p.h).slice(0, 5);
  tall.forEach(({ m, h }, i) => {
    const text = ads[i % ads.length]!;
    const tex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = ['#ff3bd4', '#3fd0ff', '#ffd23f', '#4cd964', '#ff7a2a'][i % 5]!;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1a1626';
      ctx.font = `bold ${s * 0.32}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 8, s / 2);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(0.6, 1);
    const board2 = mesh(new THREE.PlaneGeometry(3.6, 1.8), toonUnique('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 }), { cast: false });
    board2.position.set(0, h / 2 - 2, 2.12);
    const frame = mesh(new THREE.BoxGeometry(3.8, 2, 0.1), toon('#1a1626'), { cast: false });
    frame.position.set(0, h / 2 - 2, 2.08);
    m.add(frame, board2);
    k.updaters.push((dt) => (tex.offset.x += dt * 0.12));
  });

  // Árvores em vasos nos passeios.
  k.segs3.forEach(({ a, b }, i) => {
    if (i % 3) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = i % 6 ? 1 : -1;
    const x = (a.x + b.x) / 2 - (dz / len) * 1.75 * side;
    const z = (a.z + b.z) / 2 + (dx / len) * 1.75 * side;
    let ok = true;
    for (const [ax, az, bx, bz] of k.segs) if (distToSegment(x, z, ax, az, bx, bz) < 1.6) { ok = false; break; }
    if (!ok || board.spaces.some((s) => Math.hypot(s.x - x, s.z - z) < 2)) return;
    const pot = mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 10), toon('#6e6a80'));
    pot.position.set(x, 0.3, z);
    const soil = mesh(new THREE.CircleGeometry(0.36, 10), toon('#3a2a1a'), { cast: false });
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(x, 0.56, z);
    group.add(pot, soil);
    const tr = pickProp(PROPS.trees.slice(0, 5), rng.next(), { height: 3.4 });
    if (tr) {
      tr.position.set(x, 0.55, z);
      tr.rotation.y = rng.next() * 6;
      group.add(tr);
    }
  });

  // Monorail elevado à volta da cidade, com um comboio a dar voltas.
  const all = boundsOf(board.spaces);
  const off = 9.5;
  const x0 = all.minX - off;
  const x1 = all.maxX + off;
  const z0 = all.minZ - off;
  const z1 = all.maxZ + off;
  const Y = 9;
  const rr = 6;
  const corner = (cxc: number, czc: number, a0: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cxc + Math.cos(a) * rr, Y, czc + Math.sin(a) * rr));
    }
    return pts;
  };
  const loop = [
    ...corner(x1 - rr, z0 + rr, -Math.PI / 2),
    ...corner(x1 - rr, z1 - rr, 0),
    ...corner(x0 + rr, z1 - rr, Math.PI / 2),
    ...corner(x0 + rr, z0 + rr, Math.PI),
  ];
  const curve = new THREE.CatmullRomCurve3(loop, true, 'centripetal');
  const beam = mesh(new THREE.TubeGeometry(curve, 200, 0.45, 4, true), toon('#8d8aa0'));
  beam.scale.set(1, 1, 1);
  group.add(beam);
  // Pilares (e tira prédios que lá estavam).
  const L = curve.getLength();
  for (let d = 0; d < L; d += 9) {
    const p = curve.getPointAt(d / L);
    for (const o of [...group.children]) {
      if (o === beam) continue;
      const g = (o as THREE.Mesh).geometry as THREE.BoxGeometry | undefined;
      const isBld = (o.userData.deco && (g?.type === 'BoxGeometry' || o.userData.prop)) as boolean;
      if (isBld && Math.hypot(o.position.x - p.x, o.position.z - p.z) < 3.3) group.remove(o);
    }
    const pil = mesh(new THREE.CylinderGeometry(0.35, 0.5, Y, 10), toon('#6e6a80'));
    pil.position.set(p.x, Y / 2 - 0.4, p.z);
    group.add(pil);
  }
  const train = new THREE.Group();
  const cars: THREE.Group[] = [];
  const winTex = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#f2f2ff';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3fd0ff';
    ctx.fillRect(0, s * 0.62, s, s * 0.14);
    ctx.fillStyle = '#ffe9a8';
    for (let x = 4; x < s; x += 16) ctx.fillRect(x, s * 0.2, 10, s * 0.3);
  });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(1.5, 1.3, 3.2), toonUnique('#ffffff', { map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.35 }));
    body.position.y = 1.05;
    const nose = mesh(new THREE.SphereGeometry(0.75, 10, 8), toon('#f2f2ff'));
    nose.scale.set(1, 0.85, 0.7);
    nose.position.set(0, 1.05, 1.6);
    c.add(body);
    if (i === 0) c.add(nose);
    train.add(c);
    cars.push(c);
  }
  group.add(train);
  let tt = 0;
  k.updaters.push((dt) => {
    tt = (tt + dt * 7) % L;
    cars.forEach((c, i) => {
      const u = (((tt - i * 3.4) % L) + L) % L / L;
      const p = curve.getPointAt(u);
      const tng = curve.getTangentAt(u);
      c.position.copy(p);
      c.rotation.y = Math.atan2(tng.x, tng.z);
    });
  });

  // Prédios ao fundo (skyline) com janelas acesas, a fechar o horizonte.
  const sky = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#15121f';
    ctx.fillRect(0, 0, s, s);
    for (let y = 3; y < s; y += 8)
      for (let x = 3; x < s; x += 8) {
        ctx.fillStyle = Math.random() < 0.4 ? '#ffd98a' : '#221d33';
        ctx.fillRect(x, y, 4, 4);
      }
  });
  sky.wrapS = sky.wrapT = THREE.RepeatWrapping;
  const cxm = (all.minX + all.maxX) / 2;
  const czm = (all.minZ + all.maxZ) / 2;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rng.next() * 0.05;
    const r = 85 + rng.next() * 25;
    const h = 18 + rng.next() * 40;
    const w = 7 + rng.next() * 7;
    const t = sky.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 6, h / 6);
    const b = mesh(new THREE.BoxGeometry(w, h, w), toonUnique('#ffffff', { map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.5 }), { cast: false });
    b.position.set(cxm + Math.cos(a) * r, h / 2, czm + Math.sin(a) * r);
    b.rotation.y = -a;
    group.add(b);
  }
}
