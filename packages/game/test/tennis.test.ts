import { describe, expect, it } from 'vitest';
import { newScore, pointLabel, scorePoint } from '../src/sports/tennis';

const names: [string, string] = ['Azul', 'Vermelha'];

describe('ténis', () => {
  it('15, 30, 40, jogo', () => {
    const s = newScore(2);
    expect(pointLabel(s, names)).toBe('0–0');
    scorePoint(s, 0);
    expect(pointLabel(s, names)).toBe('15–0');
    scorePoint(s, 1);
    scorePoint(s, 0);
    scorePoint(s, 0);
    expect(pointLabel(s, names)).toBe('40–15');
    expect(scorePoint(s, 0)).toEqual({ gameWon: 0, matchWon: null });
    expect(s.games).toEqual([1, 0]);
    expect(s.points).toEqual([0, 0]);
  });

  it('iguais e vantagem', () => {
    const s = newScore(2);
    for (let i = 0; i < 3; i++) {
      scorePoint(s, 0);
      scorePoint(s, 1);
    }
    expect(pointLabel(s, names)).toBe('Iguais');
    scorePoint(s, 1);
    expect(pointLabel(s, names)).toBe('Vantagem Vermelha');
    scorePoint(s, 0);
    expect(pointLabel(s, names)).toBe('Iguais');
    scorePoint(s, 0);
    expect(scorePoint(s, 0).gameWon).toBe(0);
  });

  it('ganha o encontro quem chega primeiro aos jogos pedidos', () => {
    const s = newScore(2);
    const game = (t: 0 | 1) => {
      let r = scorePoint(s, t);
      for (let i = 0; i < 3; i++) r = scorePoint(s, t);
      return r;
    };
    expect(game(1).matchWon).toBeNull();
    expect(game(0).matchWon).toBeNull();
    expect(game(1)).toEqual({ gameWon: 1, matchWon: 1 });
  });
});
