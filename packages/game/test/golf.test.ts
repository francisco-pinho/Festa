import { describe, expect, it } from 'vitest';
import { CLUBS, COURSE, heightAt, holeResultName, lieAt, pickClub, planShot, redZoneError, relativeToPar, simulateShot } from '../src/sports/golf';

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
    expect(pickClub(25, false)).toBe('iron9');
    expect(pickClub(45, false)).toBe('iron5');
    expect(pickClub(15, false, 'bunker')).toBe('wedge');
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

  it('sem vento, a bola cai à distância do taco; o vento e a curva desviam', () => {
    const flat = { ...COURSE[0]!, hills: [], water: [], bunkers: [], fairwayWidth: 400 };
    const base = { club: 'iron7' as const, angle: Math.PI, power: 1, curve: 0, loft: 0, spin: 0 };
    const r = simulateShot(flat, { x: 0, z: 0 }, base, { x: 0, z: 0 });
    const land = r.samples.find((s) => s.t >= r.landT)!;
    expect(Math.hypot(land.x, land.z)).toBeCloseTo(CLUBS.iron7.carry, 0);
    const windy = simulateShot(flat, { x: 0, z: 0 }, base, { x: 3, z: 0 });
    expect(windy.samples.find((s) => s.t >= windy.landT)!.x).toBeGreaterThan(1);
    const curved = simulateShot(flat, { x: 0, z: 0 }, { ...base, curve: 1 }, { x: 0, z: 0 });
    expect(Math.abs(curved.final.x)).toBeGreaterThan(2);
  });

  it('topspin rola mais do que backspin', () => {
    const flat = { ...COURSE[0]!, hills: [], water: [], bunkers: [], fairwayWidth: 400 };
    const shot = { club: 'iron5' as const, angle: Math.PI, power: 0.9, curve: 0, loft: 0, spin: 0 };
    const top = simulateShot(flat, { x: 0, z: 0 }, { ...shot, spin: 1 }, { x: 0, z: 0 });
    const back = simulateShot(flat, { x: 0, z: 0 }, { ...shot, spin: -1 }, { x: 0, z: 0 });
    expect(Math.abs(top.final.z)).toBeGreaterThan(Math.abs(back.final.z) + 3);
  });

  it('putt planeado com a inclinação do green entra (ou fica muito perto)', () => {
    const hole = COURSE[0]!;
    const from = { x: hole.hole.x - 5, z: hole.hole.z + 3 };
    const plan = planShot(hole, from, hole.hole, 'putter', { x: 0, z: 0 });
    const r = simulateShot(hole, from, plan, { x: 0, z: 0 });
    expect(r.holed || Math.hypot(r.final.x - hole.hole.x, r.final.z - hole.hole.z) < 1).toBe(true);
  });

  it('o green tem inclinação; tee plano; zona vermelha desvia', () => {
    for (const hole of COURSE) {
      expect(Math.abs(heightAt(hole, 0, 0))).toBeLessThan(0.3);
      const e = hole.greenRadius * 0.6;
      const dh = Math.abs(heightAt(hole, hole.hole.x + e, hole.hole.z) - heightAt(hole, hole.hole.x - e, hole.hole.z)) + Math.abs(heightAt(hole, hole.hole.x, hole.hole.z + e) - heightAt(hole, hole.hole.x, hole.hole.z - e));
      expect(dh).toBeGreaterThan(0.1);
    }
    expect(redZoneError(1, 0, 0).angle + 0).toBe(0);
    expect(Math.abs(redZoneError(1.1, 0, 1).angle)).toBeGreaterThan(0.05);
  });
});
