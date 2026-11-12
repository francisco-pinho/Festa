/**
 * «Diz o Maestro»: o maestro mostra uma sequência de setas, uma de cada vez. Depois toda a gente
 * a repete na cruz do comando. Quem erra (ou não acaba a tempo) sai. Cada ronda tem mais uma
 * seta e passa mais depressa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import type { ButtonId } from '@festa/shared';
import { CharacterModel } from '../three/CharacterModel';
import { NARRATOR } from '../three/characterAssets';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const ARROW: Record<Dir, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
const COLOR: Record<Dir, string> = { up: '#25c26b', down: '#ff3b5c', left: '#2f7dff', right: '#ffd23f' };

interface Player {
  r: Rower;
  progress: number;
  done: boolean;
  points: number;
  marks: THREE.Sprite | null;
  /** Bot: tempo até à próxima seta e se vai errar. */
  botWait: number;
}

class MaestroRun extends RowMinigame {
  protected readonly duration = 75;
  private readonly maestro: CharacterModel;
  private readonly players: Player[];
  private seq: Dir[] = [];
  private phase: 'show' | 'input' | 'pause' = 'pause';
  private phaseT = 0;
  private shown = -1;
  private arrow: THREE.Sprite | null = null;
  /** Número do passo por baixo da seta («2/5»): mostra que é uma seta nova, mesmo repetida. */
  private stepLabel: THREE.Sprite | null = null;
  private arrowAge = 0;
  private arrowBase = new THREE.Vector3(1, 1, 1);
  private round = 0;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.3 });
    // Os jogadores ficam mais à frente; o maestro num estrado ao fundo.
    for (const r of this.row) r.model.root.position.z = 2.5;
    const podium = mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.7, 24), toon('#7a3fd1'));
    podium.position.set(0, 0.35, -3);
    this.scene.add(podium);
    this.maestro = new CharacterModel(NARRATOR);
    this.maestro.root.position.set(0, 0.7, -3);
    this.maestro.faceYaw(0, true);
    this.scene.add(this.maestro.root);
    this.players = this.row.map((r) => ({ r, progress: 0, done: false, points: 0, marks: null, botWait: 0 }));
    this.camera.position.set(0, 5, Math.max(11, this.row.length * 2.3));
    this.camera.lookAt(0, 1.8, -0.5);
    this.phaseT = -1; // pequena pausa antes da primeira sequência
  }

  scores(): MinigameScore[] {
    return this.players.map((p) => ({ id: p.r.seat.id, value: p.r.alive ? `🎼 ${p.points}` : '✖' }));
  }

  winners(): string[] {
    const alive = this.players.filter((p) => p.r.alive);
    if (this.ctx.mode !== 'ffa') return this.survivorsWin();
    if (!alive.length || alive.length === this.players.length) {
      // Toda a gente fora (ou toda a gente dentro): ganha quem acertou mais sequências.
      const best = Math.max(...this.players.map((p) => p.points));
      const top = this.players.filter((p) => p.points === best);
      return best > 0 && top.length < this.players.length ? top.map((p) => p.r.seat.id) : [];
    }
    return alive.map((p) => p.r.seat.id);
  }

  private setMarks(p: Player, text: string): void {
    if (p.marks) {
      p.r.model.root.remove(p.marks);
      disposeObject(p.marks);
    }
    p.marks = text ? textSprite(text, { height: 0.45, color: '#ffffff', stroke: '#1d1433' }) : null;
    if (p.marks) {
      p.marks.position.y = 3.2;
      p.r.model.root.add(p.marks);
    }
  }

  private showArrow(d: Dir | null): void {
    for (const o of [this.arrow, this.stepLabel]) {
      if (!o) continue;
      this.scene.remove(o);
      disposeObject(o);
    }
    this.arrow = null;
    this.stepLabel = null;
    if (!d) return;
    this.arrow = textSprite(ARROW[d], { height: 2.4, color: COLOR[d] });
    this.arrow.position.set(0, 4.6, -3);
    this.arrowBase.copy(this.arrow.scale);
    this.arrow.scale.setScalar(0.01);
    this.arrowAge = 0;
    this.scene.add(this.arrow);
    this.stepLabel = textSprite(`${this.shown + 1}/${this.seq.length}`, { height: 0.6, color: '#ffffff', stroke: '#1d1433' });
    this.stepLabel.position.set(0, 3.1, -3);
    this.scene.add(this.stepLabel);
    this.maestro.setAnim(this.shown % 2 ? 'talk' : 'talk2');
    sound.play('beep', { pitch: 0.8 + DIRS.indexOf(d) * 0.15 });
  }

  private startRound(): void {
    this.round++;
    const len = 2 + this.round;
    this.seq = Array.from({ length: len }, () => DIRS[this.ctx.rng.int(0, 3)]!);
    this.shown = -1;
    this.phase = 'show';
    this.phaseT = 0;
    for (const p of this.players) {
      p.progress = 0;
      p.done = !p.r.alive;
      this.setMarks(p, '');
    }
  }

  private get beat(): number {
    return Math.max(0.42, 0.85 - this.round * 0.06);
  }

  private input(p: Player, d: Dir): void {
    if (p.done || !p.r.alive) return;
    if (this.seq[p.progress] === d) {
      p.progress++;
      this.setMarks(p, '✔'.repeat(p.progress));
      this.ctx.vibrate(p.r.seat.id, 15);
      if (p.progress >= this.seq.length) {
        p.done = true;
        p.points++;
        p.r.model.setAnim('cheer');
        this.float('🎶', p.r.x, 3.4, '#4cd964', 0.8, 2.5);
      }
    } else {
      p.done = true;
      this.knockOut(p.r);
      this.setMarks(p, '✖');
      p.r.model.setAnim('sad');
      this.ctx.vibrate(p.r.seat.id, 300);
      sound.play('lose', { vol: 0.5 });
    }
  }

  protected step(dt: number): void {
    this.phaseT += dt;
    if (this.phase === 'pause') {
      if (this.phaseT >= 0.8) this.startRound();
      return;
    }
    if (this.phase === 'show') {
      const i = Math.floor(this.phaseT / this.beat);
      if (i !== this.shown) {
        this.shown = i;
        this.showArrow(this.seq[i] ?? null);
      }
      // Pequena pausa no fim de cada seta: duas setas iguais seguidas veem-se como duas.
      const on = this.phaseT % this.beat < this.beat * 0.78;
      if (this.arrow) this.arrow.visible = on;
      if (this.stepLabel) this.stepLabel.visible = on;
      if (i >= this.seq.length) {
        this.phase = 'input';
        this.phaseT = 0;
        this.maestro.setAnim('idle');
        for (const p of this.players) {
          if (p.r.alive) this.ctx.vibrate(p.r.seat.id, 60);
          p.botWait = 0.6 + this.ctx.rng.next() * 0.5;
        }
        // Descarta carregadelas feitas enquanto o maestro mostrava.
        for (const p of this.players) for (const d of DIRS) this.pressed(p.r, d as ButtonId);
      }
      return;
    }
    // Repetir: cada um ao seu ritmo.
    for (const p of this.players) {
      if (p.done || !p.r.alive) continue;
      if (this.isBot(p.r)) {
        p.botWait -= dt;
        if (p.botWait <= 0) {
          p.botWait = 0.35 + this.ctx.rng.next() * (0.6 - this.ctx.botSkill * 0.3);
          const ok = this.ctx.rng.next() < 0.86 + this.ctx.botSkill * 0.13 - this.round * 0.01;
          const want = this.seq[p.progress]!;
          this.input(p, ok ? want : DIRS.find((d) => d !== want)!);
        }
        continue;
      }
      for (const d of DIRS) if (this.pressed(p.r, d as ButtonId)) this.input(p, d);
    }
    const limit = this.seq.length * 1.1 + 2.5;
    if (this.players.every((p) => p.done) || this.phaseT > limit) {
      for (const p of this.players) {
        if (p.r.alive && !p.done) {
          this.knockOut(p.r);
          this.setMarks(p, '⌛');
          p.r.model.setAnim('sad');
          this.ctx.vibrate(p.r.seat.id, 300);
        }
      }
      this.phase = 'pause';
      this.phaseT = 0;
      for (const p of this.players) if (p.r.alive) p.r.model.setAnim('idle');
      this.endIfDecided();
    }
  }

  protected override animate(dt: number): void {
    this.maestro.update(dt);
    // Cada seta aparece com um «pop» (pequena → grande, com ressalto), mesmo que seja igual à anterior.
    if (this.arrow) {
      this.arrowAge += dt;
      const k = Math.min(1, this.arrowAge / 0.28);
      const c1 = 1.70158;
      const pop = 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
      this.arrow.scale.copy(this.arrowBase).multiplyScalar(Math.max(0.01, pop));
    }
  }

  override dispose(): void {
    this.maestro.dispose();
    super.dispose();
  }
}

export const Maestro: MinigameDef = {
  id: 'maestro',
  rounds: 1,
  name: 'Diz o Maestro',
  modes: ['ffa', 'teams'],
  description: () => 'O maestro mostra uma sequência de setas. Depois repete-a na cruz do comando, sem errar! Cada ronda tem mais uma seta.',
  controls: '✚ Repetir as setas',
  stick: 'dpad',
  buttons: [],
  create: (ctx) => new MaestroRun(ctx),
};
