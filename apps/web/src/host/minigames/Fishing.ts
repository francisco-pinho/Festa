/**
 * «Pesca de Baús» (todos contra todos / equipas): no pontão, Ⓐ lança a linha. Quando a boia
 * AFUNDA (aparece «!»), Ⓐ depressa para puxar: sai um baú (5), um peixe grande (3), um peixe (2)…
 * ou uma bota velha (0). Se puxares antes de tempo, o peixe foge e tens de esperar.
 * A partir da 2.ª ronda há toques falsos na boia para enganar! Ganha quem tiver mais pontos.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { Water } from '../stages/environment';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const PRIZES = [
  { emoji: '🧰', name: 'Baú!', points: 5, chance: 0.18 },
  { emoji: '🐟', name: 'Peixe grande', points: 3, chance: 0.3 },
  { emoji: '🐠', name: 'Peixe', points: 2, chance: 0.32 },
  { emoji: '🥾', name: 'Bota velha…', points: 0, chance: 0.2 },
];

interface Angler {
  r: Rower;
  state: 'idle' | 'casting' | 'waiting' | 'bite' | 'spooked';
  t: number;
  /** Quando morde (s desde que a boia caiu à água). */
  biteAt: number;
  /** Toques falsos (s) antes da mordidela a sério. */
  fakes: number[];
  points: number;
  bobber: THREE.Mesh;
  line: THREE.Line;
  tip: THREE.Vector3;
  home: THREE.Vector3;
  mark: THREE.Sprite | null;
  botReact: number;
}

class FishingRun extends RowMinigame {
  protected readonly duration = 32;
  private readonly water = new Water(200);
  private readonly anglers: Angler[] = [];
  private readonly window: number;
  private readonly round: number;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.6, ground: null, decor: false });
    this.round = Math.max(1, ctx.round ?? 1);
    this.window = Math.max(0.38, 0.65 - (this.round - 1) * 0.1);
    this.water.mesh.position.y = -0.6;
    this.scene.add(this.water.mesh);
    const n = this.row.length;
    const width = n * 2.6 + 2;
    // Pontão de madeira com estacas
    const deck = mesh(new THREE.BoxGeometry(width, 0.3, 3.2), toon('#a8743f'), { receive: true });
    deck.position.set(0, -0.15, 1.2);
    this.scene.add(deck);
    for (let i = 0; i < width; i += 1.2) {
      const plank = mesh(new THREE.BoxGeometry(0.04, 0.31, 3.2), toon('#7a4f28'), { cast: false });
      plank.position.set(-width / 2 + i, -0.14, 1.2);
      this.scene.add(plank);
    }
    for (const sx of [-1, 1])
      for (const z of [-0.3, 2.7]) {
        const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 8), toon('#5b3a1e'));
        post.position.set((sx * width) / 2, -0.9, z);
        this.scene.add(post);
      }
    for (const r of this.row) {
      r.model.root.position.set(r.x, 0, 1);
      r.model.faceYaw(Math.PI, true);
      r.model.setAnim('sit');
      r.model.restAnim = 'sit';
      // Cana de pesca
      const rod = mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.6, 6), toon('#3a2a1a'), { cast: false });
      rod.position.set(r.x + 0.35, 1.4, -0.1);
      rod.rotation.x = -0.9;
      this.scene.add(rod);
      const tip = new THREE.Vector3(r.x + 0.35, 1.4 + Math.cos(0.9) * 1.3, -0.1 - Math.sin(0.9) * 1.3);
      const bobber = mesh(new THREE.SphereGeometry(0.16, 12, 10), toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.3 }), { cast: false });
      const cap = mesh(new THREE.SphereGeometry(0.1, 10, 8), toon('#ffffff'), { cast: false });
      cap.position.y = 0.12;
      bobber.add(cap);
      const home = new THREE.Vector3(r.x + 0.35, 0.6, -1);
      bobber.position.copy(home);
      this.scene.add(bobber);
      const geo = new THREE.BufferGeometry().setFromPoints([tip, home]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
      this.scene.add(line);
      this.anglers.push({ r, state: 'idle', t: 0, biteAt: 0, fakes: [], points: 0, bobber, line, tip, home, mark: null, botReact: 0 });
    }
    this.camera.position.set(0, 4.2, 8.5);
    this.camera.lookAt(0, 0, -4);
  }

  scores(): MinigameScore[] {
    return this.anglers.map((a) => ({ id: a.r.seat.id, value: `🎣 ${a.points} pts` }));
  }

  winners(): string[] {
    if (this.ctx.mode === 'ffa') {
      const best = Math.max(...this.anglers.map((a) => a.points));
      const top = this.anglers.filter((a) => a.points === best);
      return best === 0 || (top.length === this.anglers.length && this.anglers.length > 1) ? [] : top.map((a) => a.r.seat.id);
    }
    const sum = (t: 'blue' | 'red') => this.anglers.filter((a) => a.r.seat.team === t).reduce((s, a) => s + a.points, 0);
    const b = sum('blue');
    const r = sum('red');
    if (b === r) return [];
    const team = b > r ? 'blue' : 'red';
    return this.anglers.filter((a) => a.r.seat.team === team).map((a) => a.r.seat.id);
  }

  private setMark(a: Angler, text: string | null, color = '#ffd23f'): void {
    if (a.mark) {
      this.scene.remove(a.mark);
      disposeObject(a.mark);
      a.mark = null;
    }
    if (!text) return;
    a.mark = textSprite(text, { height: 0.8, color, stroke: '#1d1433' });
    a.mark.position.set(a.bobber.position.x, 1.8, a.bobber.position.z);
    this.scene.add(a.mark);
  }

  private cast(a: Angler): void {
    a.state = 'casting';
    a.t = 0;
    a.biteAt = 1.4 + this.ctx.rng.next() * 3.6;
    a.fakes = [];
    if (this.round >= 2) {
      const n = Math.floor(this.ctx.rng.next() * (this.round + 1));
      for (let i = 0; i < n; i++) a.fakes.push(0.5 + this.ctx.rng.next() * (a.biteAt - 0.8));
    }
    a.botReact = 0;
    sound.play('whoosh', { vol: 0.4 });
  }

  private pull(a: Angler): void {
    if (a.state === 'bite') {
      let roll = this.ctx.rng.next();
      const prize = PRIZES.find((p) => (roll -= p.chance) < 0) ?? PRIZES[2]!;
      a.points += prize.points;
      this.float(`${prize.emoji} ${prize.name}${prize.points ? ` +${prize.points}` : ''}`, a.bobber.position.x, 2.4, prize.points >= 5 ? '#ffd23f' : prize.points ? '#ffffff' : '#b9a9e8', 0.55, a.bobber.position.z + 1);
      sound.play(prize.points >= 5 ? 'win' : prize.points ? 'coin' : 'aww', { vol: 0.6 });
      this.ctx.vibrate(a.r.seat.id, prize.points >= 5 ? 200 : 60);
      a.r.model.setAnim(prize.points ? 'cheer' : 'sad');
      setTimeout(() => a.r.model.setAnim('sit'), 900);
      a.state = 'idle';
      a.t = 0;
      this.setMark(a, null);
    } else if (a.state === 'waiting') {
      // Cedo demais: o peixe foge e é preciso esperar um bocadinho.
      a.state = 'spooked';
      a.t = 0;
      this.setMark(a, '💨', '#ffffff');
      this.float('Cedo demais!', a.bobber.position.x, 2.2, '#ff6b7a', 0.45, a.bobber.position.z + 1);
      this.ctx.vibrate(a.r.seat.id, 90);
      sound.play('splash', { vol: 0.3 });
    }
  }

  protected step(dt: number, time: number): void {
    for (const a of this.anglers) {
      a.t += dt;
      const human = !this.isBot(a.r);
      const pressed = human ? this.pressed(a.r, 'a') : false;
      switch (a.state) {
        case 'idle':
          a.bobber.position.lerp(a.home, Math.min(1, dt * 8));
          if (pressed || (!human && a.t > 0.4 + this.ctx.rng.next() * 0.3)) this.cast(a);
          break;
        case 'casting': {
          // A boia voa até à água.
          const k = Math.min(1, a.t / 0.5);
          const to = new THREE.Vector3(a.home.x, -0.5, -5 - (a.r.x % 2) * 0.5);
          a.bobber.position.lerpVectors(a.home, to, k);
          a.bobber.position.y += Math.sin(k * Math.PI) * 1.5;
          if (k >= 1) {
            a.state = 'waiting';
            a.t = 0;
            sound.play('splash', { vol: 0.2, pitch: 1.5 });
          }
          break;
        }
        case 'waiting': {
          // Boia a boiar, com toques falsos de vez em quando.
          const fake = a.fakes.some((f) => a.t > f && a.t < f + 0.18);
          a.bobber.position.y = -0.5 + Math.sin(time * 2 + a.r.x) * 0.04 - (fake ? 0.12 : 0);
          if (!human && fake && this.ctx.rng.next() < (1 - this.ctx.botSkill) * 0.08) this.pull(a);
          else if (pressed) this.pull(a);
          else if (a.t >= a.biteAt) {
            a.state = 'bite';
            a.t = 0;
            this.setMark(a, '❗', '#ff3b5c');
            sound.play('beep', { vol: 0.5 });
            if (human) this.ctx.vibrate(a.r.seat.id, 50);
            a.botReact = 0.18 + (1 - this.ctx.botSkill) * 0.45 * this.ctx.rng.next() + this.ctx.rng.next() * 0.12;
          }
          break;
        }
        case 'bite':
          a.bobber.position.y = -0.85 + Math.sin(time * 30) * 0.05;
          if (pressed || (!human && a.t >= a.botReact)) this.pull(a);
          else if (a.t > this.window) {
            a.state = 'idle';
            a.t = 0;
            this.setMark(a, null);
            this.float('Fugiu!', a.bobber.position.x, 2, '#b9a9e8', 0.45, a.bobber.position.z + 1);
          }
          break;
        case 'spooked':
          a.bobber.position.y = -0.5;
          if (a.t > 1.2) {
            a.state = 'idle';
            a.t = 0;
            this.setMark(a, null);
          }
          break;
      }
      // Linha da ponta da cana até à boia
      const pos = a.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(1, a.bobber.position.x, a.bobber.position.y + 0.1, a.bobber.position.z);
      pos.needsUpdate = true;
      if (a.mark) a.mark.position.set(a.bobber.position.x, 1.6 + Math.sin(time * 10) * 0.1, a.bobber.position.z);
    }
  }

  protected override animate(_dt: number, time: number): void {
    this.water.update(time);
  }

  override endGame(): void {
    for (const a of this.anglers) {
      this.setMark(a, null);
      a.r.model.restAnim = 'idle';
    }
    super.endGame();
  }
}

export const Fishing: MinigameDef = {
  id: 'pesca',
  rounds: 2,
  name: 'Pesca de Baús',
  modes: ['ffa', 'teams'],
  description: () =>
    'Ⓐ lança a linha. Quando a boia afundar e aparecer ❗, Ⓐ depressa! Baú = 5, peixe grande = 3, peixe = 2, bota = 0. Puxar antes do tempo assusta o peixe!',
  controls: 'Ⓐ Lançar / Puxar',
  stick: false,
  buttons: [{ id: 'a', label: 'Lançar/Puxar' }],
  create: (ctx) => new FishingRun(ctx),
};
