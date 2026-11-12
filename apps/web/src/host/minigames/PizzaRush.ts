/**
 * «Pizza Rápida» (todos contra todos / equipas): cada um tem uma pizza à frente. Ⓐ dá uma dentada
 * (4 dentadas por fatia). Cuidado com as fatias PICANTES (vermelhas, com uma chama): antes de as
 * comer tens de beber água com Ⓑ — se as morderes sem beber, ficas um bocado a abanar a boca.
 * Quem acabar primeiro ganha. Em equipas, a equipa come uma pizza gigante em conjunto.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

const BITES = 4;

interface Pizza {
  owners: Rower[];
  group: THREE.Group;
  slices: { mesh: THREE.Mesh; hot: boolean; flame: THREE.Mesh | null }[];
  bites: number;
  slice: number;
  doneAt: number;
  x: number;
}

class PizzaRun extends RowMinigame {
  protected readonly duration = 40;
  private readonly pizzas: Pizza[] = [];
  private readonly stunned = new Map<string, number>();
  private readonly drank = new Map<string, boolean>();
  private readonly botNext = new Map<string, number>();
  private order = 0;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.8 });
    const teams = ctx.mode !== 'ffa';
    const groups: Rower[][] = teams
      ? (['blue', 'red'] as const).map((t) => this.row.filter((r) => r.seat.team === t)).filter((g) => g.length)
      : this.row.map((r) => [r]);
    const hotChance = (ctx.round ?? 1) >= 2 ? 0.35 : 0.25;
    for (const owners of groups) {
      const x = owners.reduce((s, r) => s + r.x, 0) / owners.length;
      const count = teams ? 6 * owners.length : 8;
      const radius = teams ? 1 + owners.length * 0.35 : 1;
      const group = new THREE.Group();
      // Mesa
      const table = mesh(new THREE.CylinderGeometry(radius + 0.35, radius + 0.35, 0.12, 32), toon('#8a5a2b'));
      table.position.y = 0.95;
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.95, 10), toon('#5b3a1e'));
      leg.position.y = 0.47;
      group.add(table, leg);
      const slices: Pizza['slices'] = [];
      for (let i = 0; i < count; i++) {
        const hot = i > 0 && ctx.rng.next() < hotChance;
        const a0 = (i / count) * Math.PI * 2;
        const geo = new THREE.CylinderGeometry(radius, radius, 0.12, 8, 1, false, a0, (Math.PI * 2) / count - 0.04);
        const s = mesh(geo, toonUnique(hot ? '#e8452c' : '#f2c14e'));
        s.position.y = 1.08;
        group.add(s);
        // Bordas (massa) e, nas picantes, uma chama por cima.
        let flame: THREE.Mesh | null = null;
        if (hot) {
          flame = mesh(new THREE.ConeGeometry(0.12, 0.3, 8), toonUnique('#ff8c1a', { emissive: '#ff6a00', emissiveIntensity: 1 }), { cast: false });
          const mid = a0 + Math.PI / count;
          flame.position.set(Math.sin(mid) * radius * 0.6, 1.3, Math.cos(mid) * radius * 0.6);
          group.add(flame);
        } else {
          const pep = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), toon('#c0392b'), { cast: false });
          const mid = a0 + Math.PI / count;
          pep.position.set(Math.sin(mid) * radius * 0.55, 1.15, Math.cos(mid) * radius * 0.55);
          s.add(pep);
          pep.position.y = 0.07;
          pep.position.x = Math.sin(mid) * radius * 0.55;
          pep.position.z = Math.cos(mid) * radius * 0.55;
        }
        slices.push({ mesh: s, hot, flame });
      }
      group.position.set(x, 0, -1.6);
      this.scene.add(group);
      this.pizzas.push({ owners, group, slices, bites: 0, slice: 0, doneAt: 0, x });
    }
    // Atrás das mesas, de frente para a câmara (vê-se a cara de quem come).
    for (const r of this.row) {
      r.model.root.position.z = -3.2;
      r.model.faceYaw(0, true);
    }
    this.camera.position.set(0, 4.6, 6);
    this.camera.lookAt(0, 1, -1.6);
  }

  private pizzaOf(r: Rower): Pizza {
    return this.pizzas.find((p) => p.owners.includes(r))!;
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => {
      const p = this.pizzaOf(r);
      return { id: r.seat.id, value: p.doneAt ? `🏁 ${p.doneAt}.º` : `🍕 ${Math.round((p.slice / p.slices.length) * 100)}%` };
    });
  }

  override ranking(): string[][] {
    // Quem acabou (pela ordem) e depois quem comeu mais.
    return rankBy(this.row.map((r) => r.seat.id), (id) => {
      const p = this.pizzas.find((x) => x.owners.some((o) => o.seat.id === id))!;
      return p.doneAt ? 1e6 - p.doneAt : (p.slice * BITES + p.bites) / p.slices.length;
    });
  }

  winners(): string[] {
    const first = this.pizzas.find((p) => p.doneAt === 1);
    if (first) return first.owners.map((r) => r.seat.id);
    const best = Math.max(...this.pizzas.map((p) => (p.slice * BITES + p.bites) / p.slices.length));
    const top = this.pizzas.filter((p) => (p.slice * BITES + p.bites) / p.slices.length === best);
    return best > 0 && top.length === 1 ? top[0]!.owners.map((r) => r.seat.id) : [];
  }

  private bite(r: Rower): void {
    const p = this.pizzaOf(r);
    if (p.doneAt) return;
    const s = p.slices[p.slice]!;
    if (s.hot && !this.drank.get(r.seat.id)) {
      // Picante sem beber água: fica a abanar a boca.
      this.stunned.set(r.seat.id, 1.3);
      r.model.setAnim('dizzy');
      this.float('🔥 Picante!', r.x, 3.4, '#ff6b7a', 0.5, -3.2);
      sound.play('hit', { pitch: 1.4 });
      this.ctx.vibrate(r.seat.id, 250);
      return;
    }
    p.bites++;
    r.model.setAnim(r.model.anim === 'punchLeft' ? 'punchRight' : 'punchLeft');
    sound.play('tick', { pitch: 0.8 + Math.random() * 0.4, vol: 0.4 });
    this.ctx.vibrate(r.seat.id, 15);
    s.mesh.scale.setScalar(Math.max(0.05, 1 - p.bites / BITES));
    if (p.bites >= BITES) {
      s.mesh.visible = false;
      if (s.flame) s.flame.visible = false;
      p.bites = 0;
      p.slice++;
      for (const o of p.owners) this.drank.set(o.seat.id, false);
      if (p.slice >= p.slices.length) {
        p.doneAt = ++this.order;
        sound.play(p.doneAt === 1 ? 'win' : 'coin');
        for (const o of p.owners) {
          o.model.setAnim('cheer');
          this.ctx.vibrate(o.seat.id, 200);
        }
        this.float(p.doneAt === 1 ? '🏆 1.º!' : `${p.doneAt}.º`, p.x, 3.4, '#ffd23f', 0.8, -1.6);
        if (p.doneAt === 1) this.elapsed = Math.max(this.elapsed, this.duration - 2.5);
      }
    }
  }

  private drink(r: Rower): void {
    const p = this.pizzaOf(r);
    if (p.doneAt) return;
    this.drank.set(r.seat.id, true);
    this.float('💧', r.x, 3.2, '#3fa7ff', 0.5, -3.2);
    sound.play('splash', { vol: 0.25, pitch: 1.6 });
  }

  protected step(dt: number): void {
    for (const r of this.row) {
      const st = (this.stunned.get(r.seat.id) ?? 0) - dt;
      this.stunned.set(r.seat.id, st);
      if (st > 0) {
        this.pressed(r, 'a');
        this.pressed(r, 'b');
        continue;
      }
      if (r.model.anim === 'dizzy') r.model.setAnim('idle');
      if (this.isBot(r)) {
        const t = (this.botNext.get(r.seat.id) ?? 0) - dt;
        this.botNext.set(r.seat.id, t);
        if (t > 0) continue;
        this.botNext.set(r.seat.id, (0.2 - this.ctx.botSkill * 0.08) * (0.7 + this.ctx.rng.next() * 0.6));
        const p = this.pizzaOf(r);
        const s = p.slices[p.slice];
        // Bots fracos às vezes esquecem-se da água.
        if (s?.hot && !this.drank.get(r.seat.id) && this.ctx.rng.next() < 0.7 + this.ctx.botSkill * 0.3) this.drink(r);
        else this.bite(r);
        continue;
      }
      if (this.pressed(r, 'b')) this.drink(r);
      if (this.pressed(r, 'a')) this.bite(r);
    }
    if (this.pizzas.every((p) => p.doneAt)) this.endGame();
  }

  protected override animate(_dt: number, time: number): void {
    for (const p of this.pizzas)
      for (const s of p.slices) if (s.flame) s.flame.scale.y = 1 + Math.sin(time * 12 + s.mesh.id) * 0.2;
  }
}

export const PizzaRush: MinigameDef = {
  id: 'pizza',
  rounds: 2,
  name: 'Pizza Rápida',
  modes: ['ffa', 'teams'],
  description: () =>
    'Come a pizza à pressa: Ⓐ dá uma dentada! As fatias PICANTES (vermelhas, com chama) precisam de água primeiro: Ⓑ para beber. Morder uma picante sem beber deixa-te a abanar a boca. Quem acabar primeiro ganha!',
  controls: 'Ⓐ Comer · Ⓑ Beber água (antes das picantes)',
  stick: false,
  buttons: [
    { id: 'a', label: 'Comer' },
    { id: 'b', label: 'Beber água' },
  ],
  create: (ctx) => new PizzaRun(ctx),
};
