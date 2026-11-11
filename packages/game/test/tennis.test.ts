import { describe, expect, it } from 'vitest';
import { TENNIS, bounceBall, firstBounce, inServiceBox, netClearance, newScore, planShot, pointLabel, scorePoint } from '../src/sports/tennis';

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

  it('planShot faz a bola cair no alvo, com e sem efeito', () => {
    const from = { x: 1, y: 1, z: 10 };
    for (const spin of [-1, 0, 1]) {
      const v = planShot(from, { x: -2, z: -8 }, 18, spin);
      const r = firstBounce({ p: { ...from }, v, spin });
      expect(Math.hypot(r.p.x + 2, r.p.z + 8)).toBeLessThan(0.3);
      expect(netClearance(from, v, spin)!).toBeGreaterThan(0);
    }
  });

  it('topspin passa mais alto sobre a rede para a mesma bola; ressalto depende do efeito', () => {
    const from = { x: 0, y: 1, z: 11 };
    const top = netClearance(from, planShot(from, { x: 0, z: -9 }, 20, 1), 1)!;
    const flat = netClearance(from, planShot(from, { x: 0, z: -9 }, 20, 0), 0)!;
    expect(top).toBeGreaterThan(flat);
    const a = { p: { x: 0, y: 0.05, z: 0 }, v: { x: 0, y: -6, z: -15 }, spin: 1 };
    const b = { p: { x: 0, y: 0.05, z: 0 }, v: { x: 0, y: -6, z: -15 }, spin: -1 };
    bounceBall(a);
    bounceBall(b);
    expect(Math.abs(a.v.z)).toBeGreaterThan(Math.abs(b.v.z));
    expect(a.v.y).toBeGreaterThan(b.v.y);
  });

  it('quadrado de serviço na diagonal', () => {
    expect(inServiceBox(-2, -4, -1, 1.5)).toBe(true);
    expect(inServiceBox(2, -4, -1, 1.5)).toBe(false);
    expect(inServiceBox(-2, -TENNIS.service - 1, -1, 1.5)).toBe(false);
  });
});
