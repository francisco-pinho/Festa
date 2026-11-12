/**
 * «Conta as Ovelhas» (todos contra todos): ovelhas brancas atravessam o prado, umas devagar,
 * outras a correr, às vezes em grupo — misturadas com ovelhas pretas, que NÃO contam.
 * No fim, cada um diz quantas brancas passaram (↑ ↓ para mudar o número, Ⓐ para confirmar).
 * Ganha quem ficar mais perto (empates ganham todos).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import type { ButtonId } from '@festa/shared';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

interface Sheep {
  group: THREE.Group;
  legs: THREE.Mesh[];
  white: boolean;
  x: number;
  z: number;
  speed: number;
  dir: number;
}

const WATCH = 16;
const ANSWER = 8;

function makeSheep(white: boolean): { group: THREE.Group; legs: THREE.Mesh[] } {
  const g = new THREE.Group();
  const wool = toon(white ? '#f7f5ef' : '#2b2733');
  const skin = toon(white ? '#3a3340' : '#151218');
  const body = mesh(new THREE.SphereGeometry(0.65, 14, 10), wool);
  body.scale.set(1.25, 0.9, 0.9);
  body.position.y = 0.9;
  // Lã fofa (bolinhas)
  for (let i = 0; i < 6; i++) {
    const puff = mesh(new THREE.SphereGeometry(0.32, 10, 8), wool);
    const a = (i / 6) * Math.PI * 2;
    puff.position.set(Math.cos(a) * 0.55, 1.15 + Math.sin(i * 1.7) * 0.08, Math.sin(a) * 0.4);
    g.add(puff);
  }
  const head = mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.scale.set(1, 1.1, 0.95);
  head.position.set(0.85, 1.05, 0);
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of [[0.45, 0.3], [0.45, -0.3], [-0.45, 0.3], [-0.45, -0.3]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 6), skin);
    leg.position.set(lx, 0.3, lz);
    g.add(leg);
    legs.push(leg);
  }
  g.add(body, head);
  return { group: g, legs };
}

class CountSheepRun extends RowMinigame {
  // Folga: as últimas ovelhas podem demorar a sair; a revelação acaba o jogo 3 s depois.
  protected readonly duration = WATCH + ANSWER + 16;
  private readonly sheep: Sheep[] = [];
  private schedule: { at: number; white: boolean; speed: number; z: number; dir: number }[] = [];
  private spawned = 0;
  private whiteCount = 0;
  private phase: 'watch' | 'answer' | 'reveal' = 'watch';
  private readonly guess = new Map<string, number>();
  private readonly locked = new Set<string>();
  private readonly signs = new Map<string, THREE.Sprite>();
  private banner: THREE.Sprite | null = null;
  private readonly botGuess = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.4 });
    // A fila fica à frente, de costas para o prado; a câmara vê o prado por cima deles.
    for (const r of this.row) {
      r.model.root.position.z = 4;
      r.model.faceYaw(Math.PI, true);
      this.guess.set(r.seat.id, 0);
    }
    // Cerca ao fundo
    for (let i = -8; i <= 8; i++) {
      const post = mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), toon('#a8743f'));
      post.position.set(i * 1.6, 0.55, -7.5);
      this.scene.add(post);
    }
    const rail = mesh(new THREE.BoxGeometry(26, 0.12, 0.08), toon('#a8743f'), { cast: false });
    rail.position.set(0, 0.85, -7.5);
    this.scene.add(rail);
    // Plano das ovelhas: quantas, quando, a que velocidade (grupos e pausas para confundir).
    const rng = ctx.rng;
    const round = ctx.round ?? 1;
    let t = 0.6;
    const total = 14 + Math.floor(rng.next() * 8) + round * 2;
    for (let i = 0; i < total; i++) {
      const group = rng.next() < 0.25 ? 2 + Math.floor(rng.next() * 3) : 1;
      for (let k = 0; k < group && i < total; k++, i++) {
        const white = rng.next() < 0.72;
        this.schedule.push({ at: t + k * 0.25, white, speed: 3 + rng.next() * (3 + round * 1.5), z: -5.5 + rng.next() * 7, dir: rng.next() < 0.5 ? 1 : -1 });
        if (white) this.whiteCount++;
      }
      t += 0.35 + rng.next() * 0.9;
      if (t > WATCH - 4) break;
    }
    this.camera.position.set(0, 9, 12.5);
    this.camera.lookAt(0, 0.5, -2);
    this.showBanner('Conta as ovelhas BRANCAS!');
  }

  private showBanner(text: string, color = '#ffffff'): void {
    if (this.banner) {
      this.scene.remove(this.banner);
      disposeObject(this.banner);
    }
    this.banner = textSprite(text, { height: 0.9, color, stroke: '#1d1433' });
    this.banner.position.set(0, 5.4, -4);
    this.scene.add(this.banner);
  }

  private showGuess(r: Rower): void {
    const old = this.signs.get(r.seat.id);
    if (old) {
      r.model.root.remove(old);
      disposeObject(old);
    }
    const locked = this.locked.has(r.seat.id);
    const s = textSprite(`${locked ? '✔ ' : '▲▼ '}${this.guess.get(r.seat.id)}`, { height: 0.75, color: locked ? '#4cd964' : '#ffd23f', stroke: '#1d1433' });
    s.position.y = 3.3;
    r.model.root.add(s);
    this.signs.set(r.seat.id, s);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({
      id: r.seat.id,
      value: this.phase === 'reveal' ? `🐑 ${this.guess.get(r.seat.id)} (${Math.abs(this.guess.get(r.seat.id)! - this.whiteCount)} de diferença)` : this.locked.has(r.seat.id) ? '✔ respondeu' : '🐑 a contar…',
    }));
  }

  winners(): string[] {
    const diff = (r: Rower) => Math.abs((this.guess.get(r.seat.id) ?? 0) - this.whiteCount);
    const best = Math.min(...this.row.map(diff));
    const top = this.row.filter((r) => diff(r) === best);
    return top.length === this.row.length && this.row.length > 1 ? [] : top.map((r) => r.seat.id);
  }

  protected step(dt: number): void {
    const t = this.elapsed;
    // Ovelhas
    while (this.spawned < this.schedule.length && this.schedule[this.spawned]!.at <= t) {
      const s = this.schedule[this.spawned++]!;
      const { group, legs } = makeSheep(s.white);
      const x = -s.dir * 15;
      group.position.set(x, 0, s.z);
      group.rotation.y = s.dir > 0 ? 0 : Math.PI;
      this.scene.add(group);
      this.sheep.push({ group, legs, white: s.white, x, z: s.z, speed: s.speed, dir: s.dir });
      if (Math.random() < 0.3) sound.play('tick', { vol: 0.3, pitch: 0.7 });
    }
    for (const sh of [...this.sheep]) {
      sh.x += sh.dir * sh.speed * dt;
      sh.group.position.x = sh.x;
      sh.group.position.y = Math.abs(Math.sin(t * sh.speed * 2.2)) * 0.18;
      sh.legs.forEach((l, i) => (l.rotation.z = Math.sin(t * sh.speed * 3 + i * Math.PI) * 0.5));
      if (Math.abs(sh.x) > 16) {
        this.scene.remove(sh.group);
        disposeObject(sh.group);
        this.sheep.splice(this.sheep.indexOf(sh), 1);
      }
    }
    if (this.phase === 'watch') {
      for (const r of this.row) for (const b of ['up', 'down', 'a'] as ButtonId[]) this.pressed(r, b);
      if (t >= WATCH && this.spawned >= this.schedule.length && !this.sheep.length) {
        this.phase = 'answer';
        this.showBanner('Quantas brancas? ▲▼ e Ⓐ', '#ffd23f');
        sound.play('whistle');
        for (const r of this.row) {
          r.model.faceYaw(0, false);
          this.showGuess(r);
          // Bots: erram mais quando são fracos.
          const err = Math.round((this.ctx.rng.next() - 0.5) * 2 * (1 + (1 - this.ctx.botSkill) * 5));
          this.botGuess.set(r.seat.id, Math.max(0, this.whiteCount + err));
        }
      }
      return;
    }
    if (this.phase === 'answer') {
      const answerT = t - WATCH;
      for (const r of this.row) {
        if (this.locked.has(r.seat.id)) continue;
        let g = this.guess.get(r.seat.id)!;
        let changed = false;
        if (this.isBot(r)) {
          const want = this.botGuess.get(r.seat.id)!;
          if (Math.random() < dt * 9 && g !== want) {
            g += g < want ? 1 : -1;
            changed = true;
          } else if (g === want && answerT > 1.5 + Math.random() * 3) this.locked.add(r.seat.id);
        } else {
          if (this.pressed(r, 'up')) (g++, (changed = true));
          if (this.pressed(r, 'down') && g > 0) (g--, (changed = true));
          if (this.pressed(r, 'a')) {
            this.locked.add(r.seat.id);
            this.ctx.vibrate(r.seat.id, 40);
          }
        }
        if (changed) this.ctx.vibrate(r.seat.id, 15);
        this.guess.set(r.seat.id, g);
        this.showGuess(r);
      }
      if (answerT >= ANSWER || this.row.every((r) => this.locked.has(r.seat.id))) {
        this.phase = 'reveal';
        for (const r of this.row) {
          this.locked.add(r.seat.id);
          this.showGuess(r);
        }
        this.showBanner(`Passaram ${this.whiteCount} ovelhas brancas!`, '#4cd964');
        sound.play('coin');
        this.elapsed = Math.max(this.elapsed, this.duration - 3);
        const won = new Set(this.winners());
        for (const r of this.row) if (won.has(r.seat.id)) this.float('🎯', r.model.root.position.x, 4.2, '#ffd23f', 0.9, r.model.root.position.z);
      }
    }
  }
}

export const CountSheep: MinigameDef = {
  id: 'ovelhas',
  rounds: 2,
  name: 'Conta as Ovelhas',
  modes: ['ffa'],
  description: () => 'Ovelhas a atravessar o prado! Conta só as BRANCAS (as pretas não contam). No fim diz quantas passaram: ganha quem ficar mais perto.',
  controls: '✚ ▲▼ mudar o número · Ⓐ confirmar',
  stick: 'dpad',
  buttons: [{ id: 'a', label: 'Confirmar' }],
  create: (ctx) => new CountSheepRun(ctx),
};
