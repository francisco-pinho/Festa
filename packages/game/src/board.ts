/**
 * Tabuleiros: grafo dirigido de casas. Cada casa conhece as seguintes (`next`);
 * mais do que uma = cruzamento onde o jogador escolhe o caminho.
 *
 * Extras por mapa:
 *  - **Túneis/metro**: ligações especiais entre duas casas longe uma da outra
 *    (contam como 1 passo; podem custar moedas).
 *  - **Portões**: ligações que só estão abertas conforme um "interruptor" do
 *    mapa (maré alta/baixa, semáforo verde/vermelho…), mudado pela mecânica do mapa.
 *  - **Lojas**: casas onde se compram itens ao passar.
 */
import { createRng, type Rng } from './rng';

export type SpaceType =
  | 'start'
  | 'blue'
  | 'red'
  | 'lucky'
  | 'unlucky'
  | 'event'
  | 'shop'
  | 'item'
  | 'vs'
  | 'villain';

export type ShopKind = 'geral' | 'barata' | 'luxo' | 'ultimo';

export interface Space {
  id: number;
  type: SpaceType;
  /** Posição no plano (unidades 3D; y é para cima). */
  x: number;
  z: number;
  next: number[];
  /** Pode receber a estrela. */
  starCandidate: boolean;
  /** Zona do mapa (para o cenário: 'bridge', 'beach', 'avenue'…). */
  zone?: string;
  /** Loja nesta casa. */
  shopId?: string;
}

export interface ShopDef {
  id: string;
  name: string;
  kind: ShopKind;
  spaceId: number;
}

export interface Tunnel {
  from: number;
  to: number;
  kind: 'cave' | 'metro';
  /** Moedas para usar. */
  cost: number;
  name: string;
}

export interface Gate {
  from: number;
  to: number;
  /** Interruptor do mapa que controla este portão. */
  flag: string;
  /** Aberto quando o interruptor tem este valor. */
  openWhen: boolean;
  name: string;
}

export type BoardMechanic = 'tide' | 'traffic';
export type EventKind = 'tornado' | 'taxi';

export interface Board {
  id: string;
  name: string;
  description: string;
  theme: 'island' | 'city';
  spaces: Space[];
  startId: number;
  shops: ShopDef[];
  tunnels: Tunnel[];
  gates: Gate[];
  mechanic: BoardMechanic | null;
  /** Valores iniciais dos interruptores. */
  initialFlags: Record<string, boolean>;
  /** O que faz a casa de evento neste mapa. */
  eventKind: EventKind;
}

export function getSpace(board: Board, id: number): Space {
  const s = board.spaces[id];
  if (!s) throw new Error(`Casa inexistente: ${id}`);
  return s;
}

export function tunnelBetween(board: Board, from: number, to: number): Tunnel | undefined {
  return board.tunnels.find((t) => t.from === from && t.to === to);
}

/** Casas seguintes a que se pode ir agora (portões fechados ficam de fora). */
export function openNext(board: Board, flags: Record<string, boolean>, spaceId: number): number[] {
  const s = getSpace(board, spaceId);
  const open = s.next.filter((to) => {
    const gate = board.gates.find((g) => g.from === spaceId && g.to === to);
    return !gate || (flags[gate.flag] ?? false) === gate.openWhen;
  });
  return open.length ? open : s.next.slice(0, 1); // nunca fica preso
}

/** Casas anteriores (para recuar). */
export function previousOf(board: Board, spaceId: number): number[] {
  return board.spaces.filter((s) => s.next.includes(spaceId) && !tunnelBetween(board, s.id, spaceId)).map((s) => s.id);
}

/**
 * Distância (nº de passos) de cada casa até `target`, seguindo o sentido do
 * tabuleiro. Com `flags`, ignora portões fechados.
 */
export function distancesTo(board: Board, target: number, flags?: Record<string, boolean>): Map<number, number> {
  const reverse = new Map<number, number[]>();
  for (const s of board.spaces) {
    const nexts = flags ? openNext(board, flags, s.id) : s.next;
    for (const n of nexts) {
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

// ── Construtor de mapas ───────────────────────────────────

type Point = { x: number; z: number };

/** Reamostra uma curva em `count` pontos igualmente espaçados (sem as pontas, se `includeEnds` = false). */
function resample(curve: (t: number) => Point, count: number, includeEnds: boolean): Point[] {
  const N = 800;
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

const line =
  (p0: Point, p1: Point) =>
  (t: number): Point => ({ x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t });

class BoardBuilder {
  readonly spaces: Space[] = [];

  /** Acrescenta casas nas posições dadas, ligadas em fila. Devolve os ids. */
  addChain(points: Point[], zone?: string): number[] {
    const ids = points.map((p) => {
      const id = this.spaces.length;
      this.spaces.push({ id, type: 'blue', x: p.x, z: p.z, next: [], starCandidate: false, zone });
      return id;
    });
    for (let i = 0; i < ids.length - 1; i++) this.link(ids[i]!, ids[i + 1]!);
    return ids;
  }

  /** Ramo entre duas casas existentes, seguindo uma curva com `count` casas pelo meio. */
  addBranch(from: number, to: number, count: number, control: Point | null, zone?: string): number[] {
    const a = this.spaces[from]!;
    const b = this.spaces[to]!;
    const curve = control ? bezier(a, control, b) : line(a, b);
    const ids = this.addChain(resample(curve, count, false), zone);
    this.link(from, ids[0]!);
    this.link(ids[ids.length - 1]!, to);
    return ids;
  }

  link(from: number, to: number): void {
    const s = this.spaces[from]!;
    if (!s.next.includes(to)) s.next.push(to);
  }

  set(id: number, type: SpaceType): void {
    this.spaces[id]!.type = type;
  }
}

/**
 * Preenche os tipos das casas com uma distribuição fixa (semente), sem tocar
 * nas que já têm tipo especial. Garante casas azuis à volta da partida.
 */
function fillTypes(spaces: Space[], startId: number, seed: number, weights: [SpaceType, number][], zoneWeights: Record<string, [SpaceType, number][]> = {}): void {
  const rng = createRng(seed);
  const pick = (w: [SpaceType, number][]) => {
    const total = w.reduce((a, [, n]) => a + n, 0);
    let r = rng.next() * total;
    for (const [t, n] of w) {
      r -= n;
      if (r <= 0) return t;
    }
    return w[0]![0];
  };
  for (const s of spaces) {
    if (s.id === startId) {
      s.type = 'start';
      continue;
    }
    if (s.type !== 'blue') continue; // já tem tipo especial
    const near = Math.abs(s.id - startId) <= 2;
    s.type = near ? 'blue' : pick(zoneWeights[s.zone ?? ''] ?? weights);
  }
}

/** Zonas atrás de portões: a estrela nunca vai para lá (podia ficar inacessível). */
const GATED_ZONES = new Set(['bridge', 'avenue', 'plaza']);

function markStarCandidates(spaces: Space[], every = 3, minId = 5): void {
  for (const s of spaces) {
    if (s.type === 'blue' && s.id >= minId && s.id % every === 0 && !GATED_ZONES.has(s.zone ?? '')) s.starCandidate = true;
  }
}

// ── Mapa 1: Ilha do Coqueiro (renovada) ───────────────────

/**
 * Ilha grande com anel exterior, atalho pelo centro, ponte sobre o mar (só com
 * maré baixa) e túnel pela gruta (só com maré alta). A maré muda a cada 3 rondas.
 */
export function createIslandBoard(): Board {
  const b = new BoardBuilder();
  const RING = 56;
  const BRIDGE_FROM = 33;
  const BRIDGE_TO = 51;
  const A = 40;
  const B = 27;
  const P = 3.2;
  const ring = (t: number): Point => {
    const th = t * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    return { x: A * Math.sign(c) * Math.abs(c) ** (2 / P), z: B * Math.sign(s) * Math.abs(s) ** (2 / P) };
  };
  const ringIds = b.addChain(resample(ring, RING + 1, true).slice(0, RING));
  b.link(ringIds[RING - 1]!, ringIds[0]!);
  for (const id of ringIds) {
    const s = b.spaces[id]!;
    if (s.z > 18) s.zone = 'beach';
  }

  // Atalho pelo centro (praça da aldeia)
  const center = b.addBranch(6, 22, 13, { x: 0, z: 2 }, 'village');
  // Ponte sobre o mar (lado de baixo do mapa)
  const bridge = b.addBranch(BRIDGE_FROM, BRIDGE_TO, 17, { x: 0, z: -96 }, 'bridge');

  // Túnel da gruta: atravessa a montanha do oeste para o este (contra o sentido do anel encurta muito)
  const caveFrom = 28;
  const caveTo = 2;
  b.link(caveFrom, caveTo);

  const shopBeach = 12;
  const shopCave = 44;
  b.set(shopBeach, 'shop');
  b.set(shopCave, 'shop');
  b.spaces[shopBeach]!.shopId = 'praia';
  b.spaces[shopCave]!.shopId = 'gruta';

  // Casas especiais fixas
  for (const id of [center[6]!, 40]) b.set(id, 'vs');
  for (const id of [17, bridge[8]!]) b.set(id, 'villain');
  for (const id of [9, 25, center[2]!, bridge[3]!, 53]) b.set(id, 'item');

  fillTypes(b.spaces, 0, 20261111, [
    ['blue', 58],
    ['red', 16],
    ['lucky', 10],
    ['unlucky', 7],
    ['event', 9],
  ], {
    bridge: [['lucky', 35], ['red', 25], ['event', 15], ['blue', 25]],
  });
  markStarCandidates(b.spaces);

  return {
    id: 'ilha',
    name: 'Ilha do Coqueiro',
    description: 'Maré baixa abre a ponte; maré alta abre o túnel da gruta. A maré muda a cada 3 rondas.',
    theme: 'island',
    spaces: b.spaces,
    startId: 0,
    shops: [
      { id: 'praia', name: 'Quiosque da Praia', kind: 'geral', spaceId: shopBeach },
      { id: 'gruta', name: 'Bazar da Gruta', kind: 'luxo', spaceId: shopCave },
    ],
    tunnels: [{ from: caveFrom, to: caveTo, kind: 'cave', cost: 0, name: 'Túnel da Gruta' }],
    gates: [
      { from: BRIDGE_FROM, to: bridge[0]!, flag: 'highTide', openWhen: false, name: 'Ponte' },
      { from: caveFrom, to: caveTo, flag: 'highTide', openWhen: true, name: 'Gruta' },
    ],
    mechanic: 'tide',
    initialFlags: { highTide: false },
    eventKind: 'tornado',
  };
}

// ── Mapa 2: Cidade Néon ───────────────────────────────────

/**
 * Cidade em quadrícula: anel de ruas, duas avenidas que se cruzam na praça
 * central (com semáforos que alternam a cada ronda), metro entre 3 estações
 * (3 moedas) e quatro lojas diferentes, incluindo a loja do último lugar.
 */
export function createCityBoard(): Board {
  const b = new BoardBuilder();
  const W = 30;
  const H = 20;
  // Anel: 4 lados com subdivisões fixas (para haver casas exatamente a meio de cada lado).
  const side = (p0: Point, p1: Point, segs: number) => resample(line(p0, p1), segs + 1, true).slice(0, segs);
  const pts = [
    ...side({ x: -W, z: -H }, { x: W, z: -H }, 16),
    ...side({ x: W, z: -H }, { x: W, z: H }, 10),
    ...side({ x: W, z: H }, { x: -W, z: H }, 16),
    ...side({ x: -W, z: H }, { x: -W, z: -H }, 10),
  ];
  const loop = b.addChain(pts);
  b.link(loop[loop.length - 1]!, loop[0]!);
  const topMid = 8; // (0, -H)
  const rightMid = 16 + 5; // (W, 0)
  const bottomMid = 26 + 8; // (0, H)
  const leftMid = 42 + 5; // (-W, 0)

  // Avenida Norte-Sul (de cima para baixo) e Este-Oeste (da esquerda para a direita), com praça ao centro.
  const nsTop = b.addChain(resample(line({ x: 0, z: -H }, { x: 0, z: 0 }), 4, false), 'avenue');
  const plaza = b.addChain([{ x: 0, z: 0 }], 'plaza')[0]!;
  const nsBottom = b.addChain(resample(line({ x: 0, z: 0 }, { x: 0, z: H }), 4, false), 'avenue');
  const ewLeft = b.addChain(resample(line({ x: -W, z: 0 }, { x: 0, z: 0 }), 7, false), 'avenue');
  const ewRight = b.addChain(resample(line({ x: 0, z: 0 }, { x: W, z: 0 }), 7, false), 'avenue');
  b.link(topMid, nsTop[0]!);
  b.link(nsTop[nsTop.length - 1]!, plaza);
  b.link(plaza, nsBottom[0]!);
  b.link(nsBottom[nsBottom.length - 1]!, bottomMid);
  b.link(leftMid, ewLeft[0]!);
  b.link(ewLeft[ewLeft.length - 1]!, plaza);
  b.link(plaza, ewRight[0]!);
  b.link(ewRight[ewRight.length - 1]!, rightMid);

  // Metro: 3 estações em cantos opostos
  const stations = [3, 29, 18];
  for (let i = 0; i < stations.length; i++) b.link(stations[i]!, stations[(i + 1) % stations.length]!);

  // Lojas
  const shops: ShopDef[] = [
    { id: 'mercado', name: 'Mercado Central', kind: 'geral', spaceId: 12 },
    { id: 'tudo1', name: 'Loja dos 300', kind: 'barata', spaceId: 38 },
    { id: 'luxo', name: 'Boutique Néon', kind: 'luxo', spaceId: 24 },
    { id: 'ultimo', name: 'Cantinho do Último', kind: 'ultimo', spaceId: 50 },
  ];
  for (const s of shops) {
    b.set(s.spaceId, 'shop');
    b.spaces[s.spaceId]!.shopId = s.id;
  }
  b.set(plaza, 'vs');
  for (const id of [nsBottom[2]!, 44]) b.set(id, 'villain');
  for (const id of [6, 33, ewLeft[3]!, ewRight[4]!]) b.set(id, 'item');

  fillTypes(b.spaces, 0, 1010101, [
    ['blue', 56],
    ['red', 17],
    ['lucky', 10],
    ['unlucky', 7],
    ['event', 10],
  ]);
  markStarCandidates(b.spaces);
  for (const id of stations) b.spaces[id]!.zone = 'metro';

  return {
    id: 'cidade',
    name: 'Cidade Néon',
    description: 'Semáforos mudam a cada ronda, metro entre 3 estações (3 moedas) e 4 lojas — uma só para quem vai em último.',
    theme: 'city',
    spaces: b.spaces,
    startId: 0,
    shops,
    tunnels: stations.map((from, i) => ({
      from,
      to: stations[(i + 1) % stations.length]!,
      kind: 'metro' as const,
      cost: 3,
      name: `Metro → Estação ${['Norte', 'Sul', 'Este'][(i + 1) % 3]}`,
    })),
    gates: [
      { from: topMid, to: nsTop[0]!, flag: 'greenNS', openWhen: true, name: 'Semáforo da Avenida Norte' },
      { from: leftMid, to: ewLeft[0]!, flag: 'greenNS', openWhen: false, name: 'Semáforo da Avenida Oeste' },
    ],
    mechanic: 'traffic',
    initialFlags: { greenNS: true },
    eventKind: 'taxi',
  };
}

export const BOARDS: { id: string; create: () => Board }[] = [
  { id: 'ilha', create: createIslandBoard },
  { id: 'cidade', create: createCityBoard },
];

export function createBoard(id: string): Board {
  return (BOARDS.find((b) => b.id === id) ?? BOARDS[0]!).create();
}

export type { Rng };
