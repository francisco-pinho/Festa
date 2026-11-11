import { describe, expect, it } from 'vitest';
import { BOXING, boxingRanking, getUpCount, healthAfterGettingUp, punchDamage } from '../src/sports/boxing';

describe('boxe', () => {
  it('direita bate mais que a esquerda e defender reduz o dano', () => {
    expect(punchDamage(1, 'right', false)).toBeGreaterThan(punchDamage(1, 'left', false));
    expect(punchDamage(1, 'right', true)).toBeLessThan(punchDamage(1, 'right', false) / 5);
    expect(punchDamage(5, 'left', false)).toBe(punchDamage(1, 'left', false)); // força limitada a 1
  });

  it('quedas: cada vez se levanta mais tarde e com menos vida; à terceira é KO', () => {
    expect(getUpCount(1, 0)!).toBeLessThan(getUpCount(2, 0)!);
    expect(getUpCount(BOXING.knockdownsForKO, 0)).toBeNull();
    expect(healthAfterGettingUp(1)).toBeGreaterThan(healthAfterGettingUp(2));
  });

  it('classificação por vitórias, KOs e dano', () => {
    const r = boxingRanking([
      { id: 'a', wins: 1, kos: 0, damage: 50 },
      { id: 'b', wins: 2, kos: 0, damage: 10 },
      { id: 'c', wins: 1, kos: 1, damage: 5 },
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([['b', 1], ['c', 2], ['a', 3]]);
  });
});
