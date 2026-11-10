/**
 * Tabuleiro: um grafo dirigido de casas. Cada casa conhece as seguintes (`next`);
 * mais do que uma = cruzamento onde o jogador escolhe o caminho.
 */
import { createRng } from './rng';

export type SpaceType = 'start' | 'blue' | 'red' | 'lucky' | 'unlucky' | 'event';

export interface Space {
  id: number;
  type: SpaceType;
  /** Posição no plano do tabuleiro (unidades 3D; y é para cima). */
  x: number;
  z: number;
  next: number[];
  /** Pode receber a estrela. */
  starCandidate: boolean;
}

export interface Board {
  name: string;
  spaces: Space[];
  startId: number;
}

type Point = { x: number; z: number };

/**
 * Reamostra uma curva paramétrica em `count` pontos igualmente espaçados.
 * Com `includeEnds = false` os pontos ficam entre as pontas (para ramos).
 */
function resample(curve: (t: number) => Point, count: number, includeEnds: boolean): Point[] {
  const N = 600;
  const samples: Point[] = [];
  for (let i = 0; i <= N; i++) samples.push(curve(i / N));
  const cumulative = [0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cumulative[cumulative.length - 1]!;
  const segments = includeEnds ? count - 1 : count + 1;
  const first = includeEnds ? 0 : 1;
  const out: Point[] = [];
  for (let k = first; k < first + count; k++) {
    const target = (k / segments) * total;
    let i = cumulative.findIndex((c) => c >= target);
    if (i <= 0) i = 1;
    const c0 = cumulative[i - 1]!;
    const c1 = cumulative[i]!;
    const f = c1 === c0 ? 0 : (target - c0) / (c1 - c0);
    const a = samples[i - 1]!;
    const b = samples[i]!;
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return out;
}

const bezier =
  (p0: Point, c: Point, p1: Point) =>
  (t: number): Point => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
    z: (1 - t) ** 2 * p0.z + 2 * (1 - t) * t * c.z + t ** 2 * p1.z,
  });

export const MAIN_RING_SIZE = 36;

/**
 * "Ilha do Coqueiro": um anel principal (retângulo arredondado) com dois atalhos —
 * um pelo centro da ilha e outro por uma ponte sobre o mar (mais longo, mais sorte).
 */
export function createIslandBoard(): Board {
  const A = 26;
  const B = 17;
  const P = 3.2;
  const ring = (t: number): Point => {
    const th = t * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    return { x: A * Math.sign(c) * Math.abs(c) ** (2 / P), z: B * Math.sign(s) * Math.abs(s) ** (2 / P) };
  };
  const mainPts = resample(ring, MAIN_RING_SIZE + 1, true).slice(0, MAIN_RING_SIZE);

  const spaces: Space[] = mainPts.map((p, i) => ({
    id: i,
    type: 'blue',
    x: p.x,
    z: p.z,
    next: [(i + 1) % MAIN_RING_SIZE],
    starCandidate: false,
  }));

  const addBranch = (from: number, to: number, count: number, control: Point): number[] => {
    const p0 = mainPts[from]!;
    const p1 = mainPts[to]!;
    const ids = resample(bezier(p0, control, p1), count, false).map((p) => {
      const id = spaces.length;
      spaces.push({ id, type: 'blue', x: p.x, z: p.z, next: [], starCandidate: false });
      return id;
    });
    ids.forEach((id, k) => (spaces[id]!.next = [k === ids.length - 1 ? to : ids[k + 1]!]));
    spaces[from]!.next.push(ids[0]!);
    return ids;
  };
  addBranch(4, 14, 8, { x: 0, z: 1 }); // atalho pelo centro da ilha
  const bridge = new Set(addBranch(22, 32, 10, { x: 0, z: -46 })); // ponte sobre o mar

  // Tipos das casas: semente fixa, para o tabuleiro ser sempre o mesmo.
  const rng = createRng(20261110);
  for (const s of spaces) {
    if (s.id === 0) {
      s.type = 'start';
      continue;
    }
    const r = rng.next();
    if (s.id <= 2) s.type = 'blue';
    else if (bridge.has(s.id)) s.type = r < 0.35 ? 'lucky' : r < 0.55 ? 'red' : r < 0.7 ? 'event' : 'blue';
    else s.type = r < 0.6 ? 'blue' : r < 0.75 ? 'red' : r < 0.85 ? 'lucky' : r < 0.92 ? 'unlucky' : 'event';
  }
  for (const s of spaces) {
    if (s.type === 'blue' && s.id >= 5 && s.id % 3 === 0) s.starCandidate = true;
  }
  return { name: 'Ilha do Coqueiro', spaces, startId: 0 };
}

export function getSpace(board: Board, id: number): Space {
  const s = board.spaces[id];
  if (!s) throw new Error(`Casa inexistente: ${id}`);
  return s;
}

/** Distância (nº de passos) de cada casa até `target`, seguindo o sentido do tabuleiro. */
export function distancesTo(board: Board, target: number): Map<number, number> {
  const reverse = new Map<number, number[]>();
  for (const s of board.spaces) {
    for (const n of s.next) {
      if (!reverse.has(n)) reverse.set(n, []);
      reverse.get(n)!.push(s.id);
    }
  }
  const dist = new Map<number, number>([[target, 0]]);
  const queue = [target];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const prev of reverse.get(cur) ?? []) {
      if (dist.has(prev)) continue;
      dist.set(prev, dist.get(cur)! + 1);
      queue.push(prev);
    }
  }
  return dist;
}
