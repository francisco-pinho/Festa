/**
 * Boxe: tipos de soco (com alcance, custo de energia e preparação), dano,
 * quedas (knockdowns) e classificação do "rei do ringue".
 *
 * Ideias principais (ver docs/PLANO.md §2.3):
 *  - A distância importa: gancho ao longe falha; uppercut colado não tem espaço.
 *  - Barra de soco (energia): quanto mais cheia, mais forte — castiga quem só carrega.
 *  - Defender trava muito o direto, menos o gancho e pouco o uppercut.
 *  - Esquivar um soco abre um contra-ataque mais forte.
 */
export type Hand = 'left' | 'right';
/** Gesto do jogador. */
export type PunchGesture = 'straight' | 'hook' | 'uppercut';
/** Soco resultante (direto de esquerda = jab). */
export type PunchKind = 'jab' | 'straight' | 'hook' | 'uppercut';

export const BOXING = {
  maxHealth: 100,
  /** Quedas até KO. */
  knockdownsForKO: 3,
  rounds: 3,
  roundSeconds: 40,
  /** Vida recuperada entre rondas (fração da máxima). */
  recoverBetweenRounds: 0.2,
  maxEnergy: 100,
  /** Energia recuperada por segundo. */
  energyRegen: 30,
  /** A defender recupera-se mais devagar. */
  guardRegenFactor: 0.35,
  /** Multiplicador do contra-ataque (logo a seguir a esquivar). */
  counterMult: 1.6,
  /** Janela para contra-atacar depois de esquivar (s). */
  counterWindow: 0.9,
  /** Distância mínima entre os lutadores. */
  minDistance: 0.85,
};

export interface PunchSpec {
  label: string;
  damage: number;
  /** Energia gasta. */
  cost: number;
  /** Preparação antes do impacto (s). */
  windup: number;
  /** Recuperação depois do impacto (s). */
  recovery: number;
  /** Alcance útil [mín, máx]. Mais perto: metade do dano. Mais longe: falha. */
  range: [number, number];
  /** Fração do dano que passa pela defesa. */
  blocked: number;
}

export const PUNCHES: Record<PunchKind, PunchSpec> = {
  jab: { label: 'Jab', damage: 5, cost: 14, windup: 0.08, recovery: 0.2, range: [1.0, 2.4], blocked: 0.1 },
  straight: { label: 'Direto', damage: 8, cost: 22, windup: 0.13, recovery: 0.3, range: [1.1, 2.4], blocked: 0.12 },
  hook: { label: 'Gancho', damage: 11, cost: 30, windup: 0.2, recovery: 0.38, range: [0.8, 1.75], blocked: 0.3 },
  uppercut: { label: 'Uppercut', damage: 13, cost: 34, windup: 0.22, recovery: 0.42, range: [0.95, 1.5], blocked: 0.5 },
};

/** Que soco sai deste gesto com esta mão (um direto com a esquerda é um jab). */
export function punchKind(hand: Hand, gesture: PunchGesture = 'straight'): PunchKind {
  if (gesture === 'straight') return hand === 'left' ? 'jab' : 'straight';
  return gesture;
}

/** Força do soco (0.25–1): sobretudo a energia; o gesto ajuda um pouco. */
export function punchPower(energy: number, gesturePower = 0.6): number {
  const e = Math.max(0, Math.min(1, energy / BOXING.maxEnergy));
  const g = Math.max(0, Math.min(1, gesturePower));
  return Math.round((0.25 + 0.75 * e) * (0.8 + 0.2 * g) * 100) / 100;
}

export type RangeResult = 'close' | 'ok' | 'far';

export function punchRange(kind: PunchKind, distance: number): RangeResult {
  const [min, max] = PUNCHES[kind].range;
  if (distance > max) return 'far';
  if (distance < min) return 'close';
  return 'ok';
}

/** Dano de um soco que chega ao adversário. */
export function punchDamage(kind: PunchKind, power: number, opts: { blocked?: boolean; counter?: boolean; range?: RangeResult } = {}): number {
  const spec = PUNCHES[kind];
  if (opts.range === 'far') return 0;
  let dmg = spec.damage * Math.max(0, Math.min(1, power));
  if (opts.range === 'close') dmg *= 0.5;
  if (opts.blocked) dmg *= spec.blocked;
  if (opts.counter) dmg *= BOXING.counterMult;
  return Math.round(dmg * 10) / 10;
}

/** Vida com que se levanta depois da n-ésima queda (cada vez menos). */
export function healthAfterGettingUp(knockdowns: number): number {
  return Math.max(15, BOXING.maxHealth * (0.6 - knockdowns * 0.15));
}

/** Em que contagem se levanta (mais quedas = mais lento). Devolve null se não se levantar. */
export function getUpCount(knockdowns: number, roll: number): number | null {
  if (knockdowns >= BOXING.knockdownsForKO) return null;
  return Math.min(9, 3 + knockdowns * 2 + Math.floor(roll * 3));
}

export interface FighterRecord {
  id: string;
  wins: number;
  kos: number;
  damage: number;
}

/** Classificação: vitórias, depois KOs, depois dano feito. */
export function boxingRanking(records: FighterRecord[]): (FighterRecord & { rank: number })[] {
  const key = (r: FighterRecord) => r.wins * 1e6 + r.kos * 1e3 + r.damage;
  const sorted = [...records].sort((a, b) => key(b) - key(a));
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((o) => key(o) === key(r)) + 1 }));
}

/** Decisão por pontos quando não há KO: vida, dano feito e quedas. */
export function judgesScore(health: number, damageDone: number, knockdowns: number): number {
  return health + damageDone * 0.5 - knockdowns * 25;
}
