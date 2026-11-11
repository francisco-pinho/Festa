import { describe, expect, it } from 'vitest';
import { FIELD, PITCHES, advance, applyPitch, batterBases, battedType, bestIntercept, contact, inStrikeZone, newGame, pitchPath, simulateFlight, swingOutcome, walk } from '../src/sports/baseball';

describe('basebol', () => {
  it('4 bolas = passeio; 3 strikes = eliminado', () => {
    const g = newGame();
    for (let i = 0; i < 3; i++) expect(applyPitch(g, { kind: 'ball' }).event).toBe('continue');
    expect(applyPitch(g, { kind: 'ball' }).event).toBe('walk');
    expect(g.state.bases).toEqual([true, false, false]);
    applyPitch(g, { kind: 'strike', swung: true });
    applyPitch(g, { kind: 'strike', swung: false });
    expect(applyPitch(g, { kind: 'strike', swung: true }).event).toBe('strikeout');
    expect(g.state.outs).toBe(1);
  });

  it('foul só conta como strike até ao segundo', () => {
    const g = newGame();
    for (let i = 0; i < 5; i++) applyPitch(g, { kind: 'foul' });
    expect(g.state.strikes).toBe(2);
  });

  it('home run com bases cheias = 4 corridas', () => {
    expect(advance([true, true, true], 4, true)).toEqual({ bases: [false, false, false], runs: 4 });
    expect(advance([true, false, true], 1, true)).toEqual({ bases: [true, true, false], runs: 1 });
  });

  it('passeio força só quem tem de avançar', () => {
    expect(walk([false, true, false])).toEqual({ bases: [true, true, false], runs: 0 });
    expect(walk([true, true, true])).toEqual({ bases: [true, true, true], runs: 1 });
  });

  it('3 eliminações trocam de equipa; o jogo acaba após as entradas', () => {
    const g = newGame(1);
    for (let i = 0; i < 3; i++) applyPitch(g, { kind: 'out', how: 'fly' });
    expect(g.half).toBe(1);
    applyPitch(g, { kind: 'hit', bases: 4 });
    expect(g.runs).toEqual([0, 1]);
    // equipa da casa à frente na última entrada → acabou
  });

  it('jogo termina na última entrada com a equipa visitante à frente', () => {
    const g = newGame(1);
    applyPitch(g, { kind: 'hit', bases: 4 });
    for (let i = 0; i < 3; i++) applyPitch(g, { kind: 'out', how: 'ground' });
    let r = applyPitch(g, { kind: 'out', how: 'fly' });
    r = applyPitch(g, { kind: 'out', how: 'fly' });
    r = applyPitch(g, { kind: 'out', how: 'fly' });
    expect(r.gameOver).toBe(true);
  });

  it('tacada: fora da janela é strike, perfeita e forte é boa', () => {
    expect(swingOutcome(0.5, 1, 0.5)).toEqual({ kind: 'strike', swung: true });
    expect(swingOutcome(0, 1, 0.1)).toEqual({ kind: 'hit', bases: 4 });
    expect(swingOutcome(0.12, 1, 0.5)).toEqual({ kind: 'foul' });
  });
  it('os 4 lançamentos acabam no alvo, mas com caminhos diferentes', () => {
    const from = { x: 0.3, y: 1.9, z: -18 };
    const target = { x: 0.2, y: 1, z: 0.3 };
    for (const t of Object.keys(PITCHES) as (keyof typeof PITCHES)[]) {
      const end = pitchPath(t, from, target, 1);
      expect(end.x).toBeCloseTo(target.x, 5);
      expect(end.y).toBeCloseTo(target.y, 5);
    }
    // A curva e a screwball vão para lados opostos a meio do caminho.
    const c = pitchPath('curve', from, target, 0.6).x;
    const s = pitchPath('screwball', from, target, 0.6).x;
    expect(c).toBeGreaterThan(s);
    expect(inStrikeZone(0, 1.1)).toBe(true);
    expect(inStrikeZone(0.8, 1.1)).toBe(false);
  });

  it('batida: altura do bastão decide o ângulo; o momento decide o lado e o foul', () => {
    expect(contact(0.2, 1, 1, 1)).toBeNull();
    expect(contact(0, 0.5, 1.2, 1)).toBeNull();
    expect(battedType(contact(0, 1.0, 1.2, 1)!.launch)).toBe('fly');
    expect(battedType(contact(0, 1.2, 1.0, 1)!.launch)).toBe('ground');
    expect(contact(-0.06, 1, 1, 1)!.spray).toBeLessThan(0);
    expect(contact(0.12, 1, 1, 1)!.foul).toBe(true);
  });

  it('voo: bola forte e alta passa a vedação; rasteira não', () => {
    const from = { x: 0, y: 1, z: 0 };
    expect(simulateFlight(from, { speed: 52, launch: 30, spray: 0, foul: false }).homeRun).toBe(true);
    const ground = simulateFlight(from, { speed: 40, launch: -5, spray: 10, foul: false });
    expect(ground.homeRun).toBe(false);
    expect(ground.landT!).toBeLessThan(0.5);
    const end = ground.samples[ground.samples.length - 1]!;
    expect(Math.hypot(end.x, end.z)).toBeLessThan(FIELD.fence);
  });

  it('defesa: apanha no ar uma bola alta perto dele; corredor vs lançamento', () => {
    const from = { x: 0, y: 1, z: 0 };
    const fly = simulateFlight(from, { speed: 30, launch: 45, spray: 0, foul: false });
    const land = fly.samples.find((s) => s.t >= fly.landT!)!;
    const ic = bestIntercept(fly, [{ x: land.x + 6, y: 0, z: land.z }]);
    expect(ic?.inAir).toBe(true);
    // Defesa apanha cedo e perto: eliminado na 1.ª base.
    expect(batterBases(1.2, { x: 10, y: 0, z: -25 })).toBe(0);
    // Bola apanhada muito tarde e longe: triplo.
    expect(batterBases(8.5, { x: -60, y: 0, z: -60 })).toBe(3);
    expect(batterBases(5, { x: -60, y: 0, z: -60 })).toBe(2);
  });
});
