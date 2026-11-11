import { describe, expect, it } from 'vitest';
import { BOXING, PUNCHES, boxingRanking, getUpCount, healthAfterGettingUp, punchDamage, punchKind, punchPower, punchRange } from '../src/sports/boxing';

describe('boxe', () => {
  it('gesto + mão dão o tipo de soco; ganchos e uppercuts batem mais', () => {
    expect(punchKind('left')).toBe('jab');
    expect(punchKind('right', 'straight')).toBe('straight');
    expect(punchKind('left', 'hook')).toBe('hook');
    expect(punchDamage('uppercut', 1)).toBeGreaterThan(punchDamage('hook', 1));
    expect(punchDamage('hook', 1)).toBeGreaterThan(punchDamage('straight', 1));
    expect(punchDamage('straight', 1)).toBeGreaterThan(punchDamage('jab', 1));
    expect(punchDamage('jab', 5)).toBe(punchDamage('jab', 1)); // força limitada a 1
  });

  it('defesa trava muito o direto e pouco o uppercut; contra-ataque bate mais', () => {
    expect(punchDamage('straight', 1, { blocked: true })).toBeLessThan(punchDamage('straight', 1) / 5);
    expect(punchDamage('uppercut', 1, { blocked: true })).toBeGreaterThan(punchDamage('straight', 1, { blocked: true }) * 3);
    expect(punchDamage('jab', 1, { counter: true })).toBeGreaterThan(punchDamage('jab', 1));
  });

  it('a distância conta: longe falha, colado tira força', () => {
    expect(punchRange('hook', 2.2)).toBe('far');
    expect(punchRange('jab', 2.2)).toBe('ok');
    expect(punchRange('uppercut', 0.8)).toBe('close');
    expect(punchDamage('hook', 1, { range: 'far' })).toBe(0);
    expect(punchDamage('uppercut', 1, { range: 'close' })).toBe(PUNCHES.uppercut.damage / 2);
  });

  it('barra de soco: energia cheia bate muito mais do que vazia', () => {
    expect(punchPower(BOXING.maxEnergy, 1)).toBe(1);
    expect(punchPower(0, 1)).toBeLessThan(0.3);
    expect(punchPower(BOXING.maxEnergy, 0)).toBeGreaterThan(punchPower(BOXING.maxEnergy / 2, 1));
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
