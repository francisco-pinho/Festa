import { describe, expect, it } from 'vitest';
import { isFrameDone, rollSymbols, runningTotal, scoreFrames, shouldResetPins } from '../src/sports/bowling';

describe('bowling', () => {
  it('jogo perfeito = 300', () => {
    const frames = [...Array.from({ length: 9 }, () => [10]), [10, 10, 10]];
    expect(scoreFrames(frames, 10)[9]).toBe(300);
  });

  it('só noves = 90', () => {
    const frames = Array.from({ length: 10 }, () => [9, 0]);
    expect(scoreFrames(frames, 10)[9]).toBe(90);
  });

  it('spares com 5 em todas = 150', () => {
    const frames = [...Array.from({ length: 9 }, () => [5, 5]), [5, 5, 5]];
    expect(scoreFrames(frames, 10)[9]).toBe(150);
  });

  it('bónus pendente fica null até se saberem as bolas seguintes', () => {
    expect(scoreFrames([[10], [3]], 10)).toEqual([null, null]);
    expect(scoreFrames([[10], [3, 4]], 10)).toEqual([17, 24]);
    expect(scoreFrames([[7, 3], [4]], 10)).toEqual([14, null]);
  });

  it('total corrente conta pinos já derrubados', () => {
    expect(runningTotal([[10], [3]], 10)).toBe(13);
    expect(runningTotal([[2, 3], [4]], 10)).toBe(9);
  });

  it('fim de jogada e reposição de pinos (incluindo a última)', () => {
    expect(isFrameDone([10], false)).toBe(true);
    expect(isFrameDone([3], false)).toBe(false);
    expect(isFrameDone([3, 4], true)).toBe(true);
    expect(isFrameDone([10, 3], true)).toBe(false);
    expect(isFrameDone([7, 3], true)).toBe(false);
    expect(isFrameDone([7, 3, 2], true)).toBe(true);
    expect(shouldResetPins([3], false, 7)).toBe(false);
    expect(shouldResetPins([10, 4], true, 6)).toBe(false);
    expect(shouldResetPins([10], true, 0)).toBe(true);
  });

  it('jogo com 5 jogadas', () => {
    const frames = [[10], [10], [10], [10], [10, 10, 10]];
    expect(scoreFrames(frames, 5)[4]).toBe(150);
  });

  it('símbolos do placar', () => {
    expect(rollSymbols([10], false)).toEqual(['X']);
    expect(rollSymbols([7, 3], false)).toEqual(['7', '/']);
    expect(rollSymbols([0, 4], false)).toEqual(['-', '4']);
    expect(rollSymbols([10, 10, 10], true)).toEqual(['X', 'X', 'X']);
    expect(rollSymbols([8, 2, 10], true)).toEqual(['8', '/', 'X']);
    expect(rollSymbols([10, 4, 6], true)).toEqual(['X', '4', '/']);
  });
});
