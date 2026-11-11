/**
 * "Apanha-Apanha" (1 contra todos): o solitário tem de apanhar toda a gente
 * antes do tempo acabar. Se sobrar alguém, ganha a equipa dos que fogem.
 */
import * as THREE from 'three';
import { mesh, toon } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const HALF = 12;
const PILLARS = [
  { x: -5, z: -4, r: 1.4 },
  { x: 5, z: -4, r: 1.4 },
  { x: -5, z: 5, r: 1.4 },
  { x: 5, z: 5, r: 1.4 },
  { x: 0, z: 0.5, r: 1.8 },
];

class TagRun extends ArenaMinigame {
  protected readonly duration = 25;
  private readonly caught = new Set<string>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.dashCooldownTime = 1.6;
    const floor = mesh(new THREE.BoxGeometry(HALF * 2 + 2, 1, HALF * 2 + 2), toon('#7ccf5b'), { cast: false, receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    for (const side of [-1, 1]) {
      for (const axis of ['x', 'z'] as const) {
        const wall = mesh(new THREE.BoxGeometry(axis === 'x' ? 0.6 : HALF * 2 + 2, 1, axis === 'x' ? HALF * 2 + 2 : 0.6), toon('#c98b4f'));
        wall.position.set(axis === 'x' ? side * (HALF + 0.7) : 0, 0.5, axis === 'z' ? side * (HALF + 0.7) : 0);
        this.scene.add(wall);
      }
    }
    for (const p of PILLARS) {
      const pillar = mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 2.4, 20), toon('#9aa3ad'));
      pillar.position.set(p.x, 1.2, p.z);
      this.scene.add(pillar);
    }
    this.spawnActors(9, (seat) => (seat.team === 'blue' ? { speed: 8.6, radius: 0.7 } : { speed: 7.4 }));
    const chaser = this.actors.find((a) => a.seat.team === 'blue');
    if (chaser) {
      chaser.pos.set(0, 0, -9);
      chaser.model.root.scale.setScalar(1.3);
      // Quem foge começa do lado oposto, espalhado (nunca em cima do caçador).
      const runners = this.actors.filter((a) => a !== chaser);
      runners.forEach((r, i) => {
        const k = runners.length === 1 ? 0.5 : i / (runners.length - 1);
        r.pos.set(-9 + k * 18, 0, 8 - (i % 2) * 2.5);
      });
    }
    this.camera.position.set(0, 26, 19);
    this.camera.lookAt(0, 0, 1);
  }

  private get chaser(): Actor | undefined {
    return this.actors.find((a) => a.seat.team === 'blue');
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({
      id: a.seat.id,
      value: a.seat.team === 'blue' ? '🏃 caçador' : this.caught.has(a.seat.id) ? '😵 apanhado' : '✅ livre',
    }));
  }

  winners(): string[] {
    const runners = this.actors.filter((a) => a.seat.team === 'red');
    const allCaught = runners.every((r) => this.caught.has(r.seat.id));
    return allCaught ? (this.chaser ? [this.chaser.seat.id] : []) : runners.map((r) => r.seat.id);
  }

  protected override constrain(a: Actor): void {
    a.pos.x = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.x));
    a.pos.z = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.z));
    for (const p of PILLARS) {
      const dx = a.pos.x - p.x;
      const dz = a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = p.r + a.radius;
      if (d < min && d > 0) {
        a.pos.x = p.x + (dx / d) * min;
        a.pos.z = p.z + (dz / d) * min;
      }
    }
  }

  protected step(): void {
    const chaser = this.chaser;
    if (!chaser) return this.endGame();
    // Segundo e meio de tolerância no arranque.
    if (this.elapsed < 1.5) return;
    for (const r of this.actors) {
      if (r === chaser || !r.alive) continue;
      if (Math.hypot(r.pos.x - chaser.pos.x, r.pos.z - chaser.pos.z) < r.radius + chaser.radius + 0.1) {
        r.alive = false;
        r.vel.set(0, 0, 0);
        this.caught.add(r.seat.id);
        r.model.setAnim('sad');
        r.model.setFaded(true);
        this.ctx.vibrate(r.seat.id, 250);
        this.ctx.vibrate(chaser.seat.id, 60);
      }
    }
    if (this.actors.every((a) => a === chaser || !a.alive)) this.endGame();
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const chaser = this.chaser!;
    if (a === chaser) {
      const prey = this.actors.filter((o) => o !== a && o.alive);
      if (!prey.length) return;
      const t = prey.reduce((best, o) =>
        Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z) ? o : best,
      );
      const lead = 0.25;
      this.steer(a, t.pos.x + t.vel.x * lead, t.pos.z + t.vel.z * lead);
      if (Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < 3.2 && this.ctx.rng.next() < 0.1) pad.press('a');
      return;
    }
    // Fugir: afastar do caçador, das paredes e dos pilares.
    let fx = a.pos.x - chaser.pos.x;
    let fz = a.pos.z - chaser.pos.z;
    const d = Math.hypot(fx, fz) || 1;
    fx = (fx / d) * (12 / d);
    fz = (fz / d) * (12 / d);
    fx += 1 / Math.max(0.5, HALF - a.pos.x) ** 1.5 * -4 + 1 / Math.max(0.5, HALF + a.pos.x) ** 1.5 * 4;
    fz += 1 / Math.max(0.5, HALF - a.pos.z) ** 1.5 * -4 + 1 / Math.max(0.5, HALF + a.pos.z) ** 1.5 * 4;
    for (const p of PILLARS) {
      const px = a.pos.x - p.x;
      const pz = a.pos.z - p.z;
      const pd = Math.hypot(px, pz) - p.r;
      if (pd < 2) {
        fx += (px / (pd + p.r)) * 1.5;
        fz += (pz / (pd + p.r)) * 1.5;
      }
    }
    const len = Math.hypot(fx, fz) || 1;
    const calm = d > 9 ? 0.5 : 1;
    pad.stick.x = (fx / len) * calm;
    pad.stick.y = (fz / len) * calm;
    if (d < 2.5 && this.ctx.rng.next() < 0.08) pad.press('a');
  }
}

export const Tag: MinigameDef = {
  id: 'tag',
  rounds: 2,
  name: 'Apanha-Apanha',
  modes: ['oneVsAll'],
  description: () => 'O caçador tem 25 segundos para apanhar toda a gente. Os outros têm de fugir!',
  controls: '🕹️ Mover  ·  Ⓐ Sprint',
  stick: true,
  buttons: [{ id: 'a', label: 'Sprint' }],
  create: (ctx: MinigameContext) => new TagRun(ctx),
};
