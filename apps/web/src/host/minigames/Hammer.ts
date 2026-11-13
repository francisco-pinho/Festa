/**
 * «Martelão» (1 contra todos): o solitário é um gigante com um martelo de brincar. Ⓐ dá uma
 * martelada à frente (com um pequeno balanço, para os outros poderem fugir). Os outros têm
 * 3 corações; cada martelada tira um e deixa-os tontos. O gigante ganha se apanhar toda a gente.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { pickProp } from '../three/props';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const HALF = 11;
const OBSTACLES = [
  { x: -5, z: -3, r: 1.1 },
  { x: 5, z: -3, r: 1.1 },
  { x: 0, z: 3.5, r: 1.1 },
  { x: -6, z: 5, r: 0.9 },
  { x: 6, z: 5, r: 0.9 },
];

class HammerRun extends ArenaMinigame {
  protected readonly duration = 35;
  private readonly hearts = new Map<string, number>();
  private readonly heartSprites = new Map<string, THREE.Sprite>();
  private swing = 0;
  private readonly hammer: THREE.Group;
  private giant: Actor | undefined;

  constructor(ctx: MinigameContext) {
    super(ctx);
    const floor = mesh(new THREE.BoxGeometry(HALF * 2 + 2, 1, HALF * 2 + 2), toon('#9ad46b'), { receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    for (const o of OBSTACLES) {
      const crate = pickProp(['kaykit-dungeon/box_large', 'kaykit-dungeon/barrel_large', 'kaykit-medieval/crate_A_big'], ctx.rng.next(), { width: o.r * 2 }) ?? mesh(new THREE.BoxGeometry(o.r * 1.6, 1.4, o.r * 1.6), toon('#a8743f'));
      crate.position.set(o.x, crate instanceof THREE.Mesh ? 0.7 : 0, o.z);
      this.scene.add(crate);
    }
    ringDecor(this.scene, ctx.rng, HALF + 5, 24, { ground: '#000', theme: ctx.theme });
    this.spawnActors(8, (seat) => (seat.team === 'blue' ? { radius: 1, mass: 4, speed: 7.2 } : { speed: 7.2 }));
    this.giant = this.actors.find((a) => a.seat.team === 'blue');
    // Martelo
    this.hammer = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), toon('#8b5a2b'));
    handle.position.y = 1.1;
    const head = mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 16), toon('#ff3b5c'));
    head.rotation.z = Math.PI / 2;
    head.position.y = 2.2;
    this.hammer.add(handle, head);
    if (this.giant) {
      this.giant.pos.set(0, 0, -7);
      this.giant.model.root.scale.setScalar(1.7);
      this.giant.model.root.add(this.hammer);
      this.hammer.position.set(0.5, 1, 0);
    }
    for (const a of this.actors) {
      if (a === this.giant) continue;
      this.hearts.set(a.seat.id, 2);
      this.drawHearts(a);
    }
    this.dashCooldownTime = 0.9;
    this.camera.position.set(0, 24, 19);
    this.camera.lookAt(0, 0, 1);
  }

  private drawHearts(a: Actor): void {
    const old = this.heartSprites.get(a.seat.id);
    if (old) {
      a.model.root.remove(old);
      disposeObject(old);
    }
    const n = this.hearts.get(a.seat.id) ?? 0;
    if (n <= 0) return;
    const s = textSprite('❤️'.repeat(n), { height: 0.45 });
    s.position.y = 3;
    a.model.root.add(s);
    this.heartSprites.set(a.seat.id, s);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a === this.giant ? '🔨' : '❤️'.repeat(this.hearts.get(a.seat.id) ?? 0) || '💫' }));
  }

  winners(): string[] {
    const runners = this.actors.filter((a) => a !== this.giant);
    const allOut = runners.every((a) => !a.alive);
    return allOut ? (this.giant ? [this.giant.seat.id] : []) : runners.map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    a.pos.x = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.x));
    a.pos.z = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.z));
    for (const o of OBSTACLES) {
      const dx = a.pos.x - o.x;
      const dz = a.pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + a.radius;
      if (d < min && d > 0) {
        a.pos.x = o.x + (dx / d) * min;
        a.pos.z = o.z + (dz / d) * min;
      }
    }
  }

  /** Ⓐ do gigante = martelada; os outros têm o arranque normal. */
  protected override onDash(a: Actor): void {
    if (a !== this.giant) return;
    a.dashTime = 0;
    if (this.swing <= 0) {
      this.swing = 0.55;
      sound.play('whoosh');
    }
  }

  protected step(dt: number): void {
    const g = this.giant;
    if (!g) return this.endGame();
    if (this.swing > 0) {
      const before = this.swing;
      this.swing -= dt;
      // Balanço para trás (0,55→0,35 s) e golpe (0,35→0,2 s).
      const k = this.swing > 0.35 ? (0.55 - this.swing) / 0.2 : Math.max(0, this.swing - 0.2) / 0.15;
      this.hammer.rotation.x = this.swing > 0.35 ? -k * 1.2 : -1.2 + (1 - k) * 2.8;
      if (before > 0.2 && this.swing <= 0.2) this.smash(g);
    } else this.hammer.rotation.x *= 0.85;
    const runners = this.actors.filter((a) => a !== g);
    if (runners.every((a) => !a.alive)) this.endGame();
  }

  private smash(g: Actor): void {
    sound.play('hit');
    const fx = g.pos.x + Math.sin(g.facing) * 2.1;
    const fz = g.pos.z + Math.cos(g.facing) * 2.1;
    this.ctx.vibrate(g.seat.id, 60);
    for (const a of this.actors) {
      if (a === g || !a.alive || a.stunned > 0) continue;
      if (Math.hypot(a.pos.x - fx, a.pos.z - fz) > 2.3) continue;
      const left = (this.hearts.get(a.seat.id) ?? 0) - 1;
      this.hearts.set(a.seat.id, left);
      this.drawHearts(a);
      this.ctx.vibrate(a.seat.id, 250);
      const dx = a.pos.x - g.pos.x;
      const dz = a.pos.z - g.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      a.vel.set((dx / d) * 9, 0, (dz / d) * 9);
      if (left <= 0) {
        a.alive = false;
        a.model.setAnim('lie');
        a.model.root.scale.set(1.2, 0.5, 1.2);
      } else a.stunned = 1.2;
    }
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const g = this.giant!;
    if (a === g) {
      const prey = this.actors.filter((o) => o !== a && o.alive && o.stunned <= 0);
      if (!prey.length) return;
      const t = prey.reduce((best, o) => (Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z) ? o : best));
      // Aponta para onde a presa vai estar quando o martelo cair.
      this.steer(a, t.pos.x + t.vel.x * 0.35, t.pos.z + t.vel.z * 0.35);
      if (Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < 3.6 && this.swing <= 0 && this.ctx.rng.next() < 0.25 + this.ctx.botSkill * 0.2) pad.press('a');
      return;
    }
    // Foge do gigante e das bordas; arranque quando ele está a balançar perto.
    let fx = a.pos.x - g.pos.x;
    let fz = a.pos.z - g.pos.z;
    const d = Math.hypot(fx, fz) || 1;
    fx = (fx / d) * (10 / d);
    fz = (fz / d) * (10 / d);
    fx -= Math.sign(a.pos.x) * Math.max(0, Math.abs(a.pos.x) - HALF + 3);
    fz -= Math.sign(a.pos.z) * Math.max(0, Math.abs(a.pos.z) - HALF + 3);
    this.steer(a, a.pos.x + fx, a.pos.z + fz, d < 6 ? 1 : 0.5);
    if (this.swing > 0.25 && d < 3.5 && this.ctx.rng.next() < 0.3 * this.ctx.botSkill + 0.1) pad.press('a');
  }
}

export const Hammer: MinigameDef = {
  id: 'martelao',
  rounds: 2,
  name: 'Martelão',
  modes: ['oneVsAll'],
  description: () => 'O gigante tem um martelo de brincar: Ⓐ dá uma martelada! Os outros têm 2 corações e fogem. O gigante ganha se apanhar toda a gente antes do fim.',
  controls: '🕹️ Correr · Ⓐ Martelada (gigante) / Arranque',
  stick: true,
  buttons: [{ id: 'a', label: 'Martelar/Correr' }],
  create: (ctx) => new HammerRun(ctx),
};
