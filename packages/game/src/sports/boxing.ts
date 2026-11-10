/**
 * Boxe: dano dos socos, quedas (knockdowns) e classificação do "rei do ringue".
 */
export type Hand = 'left' | 'right';

export const BOXING = {
  maxHealth: 100,
  /** Quedas até KO. */
  knockdownsForKO: 3,
  rounds: 2,
  roundSeconds: 45,
  /** Vida recuperada entre rondas (fração da máxima). */
  recoverBetweenRounds: 0.25,
  /** Tempo de recarga de cada mão (s). */
  cooldown: { left: 0.35, right: 0.6 } as Record<Hand, number>,
};

/** Dano de um soco: o direto (direita) é mais forte; defender reduz muito. */
export function punchDamage(power: number, hand: Hand, blocked: boolean): number {
  const base = 2.5 + Math.max(0, Math.min(1, power)) * 6;
  const handMult = hand === 'right' ? 1.25 : 1;
  const dmg = base * handMult * (blocked ? 0.15 : 1);
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
