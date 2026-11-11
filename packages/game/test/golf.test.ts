import { describe, expect, it } from 'vitest';
import { COURSE, holeResultName, lieAt, pickClub, relativeToPar } from '../src/sports/golf';

describe('golfe', () => {
  it('pancadas face ao par', () => {
    expect(relativeToPar(3, 3)).toBe('Par');
    expect(relativeToPar(5, 4)).toBe('+1');
    expect(relativeToPar(10, 12)).toBe('-2');
  });

  it('nomes dos resultados', () => {
    expect(holeResultName(1, 3)).toBe('Hole in one!');
    expect(holeResultName(3, 4)).toBe('Birdie!');
    expect(holeResultName(5, 4)).toBe('Bogey');
  });

  it('escolha do taco', () => {
    expect(pickClub(100, false)).toBe('driver');
    expect(pickClub(25, false)).toBe('iron');
    expect(pickClub(5, true)).toBe('putter');
  });

  it('sítio da bola: tee no fairway, buraco no green, lagos e fora', () => {
    for (const hole of COURSE) {
      expect(lieAt(hole, 0, 0)).toBe('fairway');
      expect(lieAt(hole, hole.hole.x, hole.hole.z)).toBe('green');
      for (const w of hole.water) expect(lieAt(hole, w.x, w.z)).toBe('water');
      expect(lieAt(hole, 500, 0)).toBe('out');
    }
  });

  it('o buraco não fica dentro de água nem de bunkers', () => {
    for (const hole of COURSE) {
      for (const c of [...hole.water, ...hole.bunkers]) {
        expect(Math.hypot(c.x - hole.hole.x, c.z - hole.hole.z)).toBeGreaterThan(c.r + 1);
      }
    }
  });
});
