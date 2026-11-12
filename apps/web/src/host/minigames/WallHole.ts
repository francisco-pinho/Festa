/**
 * «Parede com Buraco» (todos contra todos / equipas): paredes atravessam a plataforma, uma de cada
 * vez, cada uma com um ou dois buracos. Põe-te à frente de um buraco para ela passar por ti;
 * se te apanhar, empurra-te para a água. As paredes vêm cada vez mais depressa e com buracos
 * mais estreitos (e a partir da 2.ª ronda podem vir de qualquer lado). Ganha quem sobrar.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const HALF = 8;
const THICK = 0.8;

interface Wall {
  group: THREE.Group;
  /** Eixo em que anda: 'z' (atravessa de trás para a frente) ou 'x' (de lado). */
  axis: 'x' | 'z';
  dir: 1 | -1;
  pos: number;
  speed: number;
  gaps: { c: number; w: number }[];
}

class WallHoleRun extends ArenaMinigame {
  protected readonly duration = 40;
  private wall: Wall | null = null;
  private walls = 0;
  private pause = 1.2;
  private readonly outAt = new Map<string, number>();
  private readonly carried = new Set<Actor>();
  /** Em que buraco está cada um (enquanto a parede passa por ele). */
  private readonly inHole = new Map<Actor, { c: number; w: number }>();
  private readonly round: number;

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.round = Math.max(1, ctx.round ?? 1);
    const floor = mesh(new THREE.BoxGeometry(HALF * 2, 1, HALF * 2), toon('#9ad0ff'), { cast: false, receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    // Xadrez no chão para se perceber bem onde se está
    for (let i = -HALF + 1; i < HALF; i += 2)
      for (let j = -HALF + 1; j < HALF; j += 2) {
        if (((i + j) / 2) % 2 === 0) continue;
        const tile = mesh(new THREE.BoxGeometry(2, 0.02, 2), toon('#7fbdf0'), { cast: false, receive: true });
        tile.position.set(i, 0.01, j);
        this.scene.add(tile);
      }
    this.spawnActors(3);
    this.camera.position.set(0, 19, 15);
    this.camera.lookAt(0, 0, 0.5);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? `🧱 ${this.walls} paredes` : '💦 na água' }));
  }

  winners(): string[] {
    let alive = this.actors.filter((a) => a.alive);
    if (!alive.length) {
      const last = Math.max(...this.outAt.values());
      alive = this.actors.filter((a) => (this.outAt.get(a.seat.id) ?? 0) >= last - 0.05);
      if (alive.length === this.actors.length) return [];
    }
    if (this.ctx.mode === 'ffa') return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((a) => a.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    if (this.carried.has(a)) return;
    a.pos.x = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.x));
    a.pos.z = Math.max(-HALF + a.radius, Math.min(HALF - a.radius, a.pos.z));
  }

  private spawnWall(): void {
    const n = this.walls;
    const sideways = this.round >= 2 && this.ctx.rng.next() < 0.45;
    const axis: 'x' | 'z' = sideways ? 'x' : 'z';
    const dir: 1 | -1 = this.ctx.rng.next() < 0.5 ? 1 : -1;
    const speed = Math.min(9, 3.6 + n * 0.45 + (this.round - 1) * 0.8);
    const w = Math.max(1.8, 3 - n * 0.12 - (this.round - 1) * 0.2);
    const gaps: { c: number; w: number }[] = [];
    const count = n < 3 ? 2 : this.ctx.rng.next() < 0.35 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 10; tries++) {
        const c = (this.ctx.rng.next() * 2 - 1) * (HALF - w / 2 - 0.3);
        if (gaps.every((g) => Math.abs(g.c - c) > (g.w + w) / 2 + 1.5)) {
          gaps.push({ c, w });
          break;
        }
      }
    }
    // Monta a parede em blocos, deixando os buracos.
    const group = new THREE.Group();
    const color = ['#ff6b7a', '#ffa41b', '#b98cff', '#4cd964'][n % 4]!;
    const mat = toonUnique(color);
    const edges = [-HALF - 0.5, ...gaps.flatMap((g) => [g.c - g.w / 2, g.c + g.w / 2]).sort((a, b) => a - b), HALF + 0.5];
    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      if (to - from < 0.05) continue;
      const block = mesh(new THREE.BoxGeometry(to - from, 2.6, THICK), mat);
      block.position.set((from + to) / 2, 1.3, 0);
      group.add(block);
    }
    // Moldura por cima dos buracos (vê-se melhor onde é)
    for (const g of gaps) {
      const top = mesh(new THREE.BoxGeometry(g.w, 0.35, THICK), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), { cast: false });
      top.position.set(g.c, 2.45, 0);
      group.add(top);
    }
    if (axis === 'x') group.rotation.y = Math.PI / 2;
    const pos = -dir * (HALF + 3);
    if (axis === 'z') group.position.z = pos;
    else group.position.x = pos;
    this.scene.add(group);
    this.wall = { group, axis, dir, pos, speed, gaps };
    this.walls++;
    sound.play('whoosh', { vol: 0.5, pitch: 0.7 });
  }

  /** Coordenada ao longo da parede (x para paredes que andam em z; z para as que andam em x). */
  private along(a: Actor, w: Wall): number {
    // Parede rodada 90° (eixo x): o x local dos blocos corresponde a -z do mundo.
    return w.axis === 'z' ? a.pos.x : -a.pos.z;
  }

  private across(a: Actor, w: Wall): number {
    return w.axis === 'z' ? a.pos.z : a.pos.x;
  }

  private setAcross(a: Actor, w: Wall, v: number): void {
    if (w.axis === 'z') a.pos.z = v;
    else a.pos.x = v;
  }

  private setAlong(a: Actor, w: Wall, v: number): void {
    if (w.axis === 'z') a.pos.x = v;
    else a.pos.z = -v;
  }

  protected step(dt: number): void {
    if (!this.wall) {
      this.pause -= dt;
      if (this.pause <= 0) this.spawnWall();
    } else {
      const w = this.wall;
      w.pos += w.dir * w.speed * dt;
      if (w.axis === 'z') w.group.position.z = w.pos;
      else w.group.position.x = w.pos;
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = (this.across(a, w) - w.pos) * w.dir;
        const band = d < THICK / 2 + a.radius && d > -THICK / 2 - a.radius;
        const along = this.along(a, w);
        let hole = this.inHole.get(a);
        if (band && !hole && !this.carried.has(a)) {
          // A parede está a chegar: se estiver à frente de um buraco, passa por ele.
          hole = w.gaps.find((g) => Math.abs(along - g.c) < g.w / 2 - a.radius * 0.4);
          if (hole) this.inHole.set(a, hole);
        }
        if (band && hole) {
          // Dentro do buraco: as paredes do buraco travam, mas pode andar à vontade (sem ficar preso).
          const lim = hole.w / 2 - a.radius * 0.5;
          this.setAlong(a, w, Math.max(hole.c - lim, Math.min(hole.c + lim, along)));
        } else if (band && d > -THICK / 2) {
          // A parede chegou e não está num buraco: é empurrada para a água.
          this.setAcross(a, w, w.pos + w.dir * (THICK / 2 + a.radius));
          if (!this.carried.has(a)) this.ctx.vibrate(a.seat.id, 120);
          this.carried.add(a);
          a.stunned = 0.2;
        } else if (band) {
          // Já passou: não pode entrar na parede por trás.
          this.setAcross(a, w, w.pos - w.dir * (THICK / 2 + a.radius));
        }
        if (!band) {
          this.inHole.delete(a);
          if (this.carried.has(a) && d > THICK / 2 + a.radius + 0.1) this.carried.delete(a);
        }
        // Empurrada para fora da plataforma: cai à água.
        if (Math.abs(this.across(a, w)) > HALF + 0.2) {
          this.carried.delete(a);
          this.outAt.set(a.seat.id, this.elapsed);
          this.sink(a, 2.5);
        }
      }
      if (Math.abs(w.pos) > HALF + 3.5) {
        this.scene.remove(w.group);
        this.wall = null;
        this.carried.clear();
        this.inHole.clear();
        this.pause = Math.max(0.3, 1.1 - this.walls * 0.06);
        sound.play('coin', { vol: 0.3 });
      }
    }
    const alive = this.actors.filter((a) => a.alive);
    const sides = new Set(alive.map((a) => (this.ctx.mode === 'ffa' ? a.seat.id : a.seat.team)));
    if (sides.size <= 1 && this.actors.length > 1) this.endGame();
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const w = this.wall;
    if (!w) {
      this.steer(a, 0, 0, 0.5);
      return;
    }
    // Vai para o buraco mais perto (com um erro que depende da dificuldade).
    const along = this.along(a, w);
    const gap = w.gaps.reduce((b, g) => (Math.abs(g.c - along) < Math.abs(b.c - along) ? g : b), w.gaps[0]!);
    if (!gap) return;
    const miss = (1 - this.ctx.botSkill) * Math.sin(this.elapsed * 0.9 + a.pos.x) * 1.4;
    const target = gap.c + miss;
    const diff = target - along;
    const s = Math.max(-1, Math.min(1, diff / 1.2));
    if (w.axis === 'z') {
      pad.stick.x = s;
      pad.stick.y = 0;
    } else {
      pad.stick.x = 0;
      pad.stick.y = -s;
    }
    const d = (this.across(a, w) - w.pos) * w.dir;
    if (d > 0 && d < 4 && Math.abs(diff) > 1.2 && this.ctx.rng.next() < 0.15) pad.press('a');
  }
}

export const WallHole: MinigameDef = {
  id: 'parede-buraco',
  rounds: 2,
  name: 'Parede com Buraco',
  modes: ['ffa', 'teams'],
  description: () =>
    'Vêm aí paredes com buracos! Põe-te à frente de um buraco para a parede passar por ti — se te apanhar, atira-te à água. Cada vez mais depressa (e na 2.ª ronda também de lado)!',
  controls: '🕹️ Mover · Ⓐ Sprint',
  stick: true,
  buttons: [{ id: 'a', label: 'Sprint' }],
  create: (ctx) => new WallHoleRun(ctx),
};
