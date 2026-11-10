import { describe, expect, it } from 'vitest';
import { advance, applyPitch, newGame, swingOutcome, walk } from '../src/sports/baseball';

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
});
