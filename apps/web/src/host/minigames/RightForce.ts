/**
 * «Força Certa» (todos contra todos / equipas): cada um tem uma bola na sua pista e uma bandeira
 * lá ao fundo. Segura Ⓐ para carregar a força (a barra sobe e, se passares do máximo, volta a zero)
 * e larga para atirar. A bola rola e trava: ganha quem a deixar mais perto da bandeira.
 * Cada ronda a bandeira muda de sítio. Em equipas conta a média da equipa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const START_Z = 2.5;
/** Distância máxima (força 1) e travagem da bola. */
const MAX_DIST = 24;
const FRICTION = 6;
/** Segundos para a barra ir de 0 ao máximo. */
const FILL = 1.6;

interface Lane {
  r: Rower;
  ball: THREE.Mesh;
  meter: THREE.Mesh;
  meterGroup: THREE.Group;
  power: number;
  charging: boolean;
  thrown: boolean;
  v: number;
  dist: number;
  stopped: boolean;
  botAim: number;
}

class RightForceRun extends RowMinigame {
  protected readonly duration = 20;
  private readonly lanes: Lane[] = [];
  private readonly target: number;
  private revealed = false;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.6, decor: true });
    this.target = 9 + ctx.rng.next() * 9;
    const n = this.row.length;
    const width = n * 2.6 + 1;
    // Pista comprida com marcas de metro a metro
    const track = mesh(new THREE.BoxGeometry(width, 0.1, MAX_DIST + 6), toon('#d9c08a'), { cast: false, receive: true });
    track.position.set(0, 0.03, START_Z - (MAX_DIST + 6) / 2 + 1.5);
    this.scene.add(track);
    for (let m = 2; m <= MAX_DIST; m += 2) {
      const line = mesh(new THREE.BoxGeometry(width, 0.02, m % 10 === 0 ? 0.12 : 0.05), toon(m % 10 === 0 ? '#8a6a3a' : '#bfa572'), { cast: false });
      line.position.set(0, 0.09, START_Z - m);
      this.scene.add(line);
    }
    // Bandeira e linha do alvo
    const goal = mesh(new THREE.BoxGeometry(width, 0.03, 0.22), toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.4 }), { cast: false });
    goal.position.set(0, 0.1, START_Z - this.target);
    this.scene.add(goal);
    for (const side of [-1, 1]) {
      const pole = mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), toon('#ffffff'));
      pole.position.set((side * width) / 2, 1.5, START_Z - this.target);
      const flag = mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), toonUnique('#ff3b5c'));
      flag.position.set((side * width) / 2 + 0.45 * -side, 2.7, START_Z - this.target);
      this.scene.add(pole, flag);
    }
    for (const r of this.row) {
      r.model.root.position.z = START_Z + 1.2;
      r.model.faceYaw(Math.PI, true);
      const color = getCharacter(r.seat.characterId).color;
      const ball = mesh(new THREE.SphereGeometry(0.35, 18, 12), toonUnique(color, { emissive: color, emissiveIntensity: 0.2 }));
      ball.position.set(r.x, 0.43, START_Z);
      this.scene.add(ball);
      // Barra de força ao lado de cada um
      const meterGroup = new THREE.Group();
      const back = mesh(new THREE.BoxGeometry(0.25, 2, 0.06), toon('#2b2440'), { cast: false });
      back.position.y = 1;
      const meter = mesh(new THREE.BoxGeometry(0.2, 2, 0.08), toonUnique('#ffd23f', { emissive: '#ffd23f', emissiveIntensity: 0.4 }), { cast: false });
      meter.geometry.translate(0, 1, 0);
      meter.scale.y = 0.01;
      meterGroup.add(back, meter);
      meterGroup.position.set(r.x + 0.9, 0.3, START_Z + 1.2);
      this.scene.add(meterGroup);
      this.lanes.push({ r, ball, meter, meterGroup, power: 0, charging: false, thrown: false, v: 0, dist: 0, stopped: false, botAim: 0 });
    }
    this.camera.position.set(0, 7.5, START_Z + 9);
    this.camera.lookAt(0, 0, START_Z - this.target * 0.55);
  }

  /** Distância à bandeira (antes de atirar conta como muito longe). */
  private miss(l: Lane): number {
    return l.thrown ? Math.abs(l.dist - this.target) : 99;
  }

  scores(): MinigameScore[] {
    return this.lanes.map((l) => ({
      id: l.r.seat.id,
      value: !l.thrown ? (l.charging ? '💪 a carregar' : '⏳ à espera') : l.stopped ? `🎯 a ${this.miss(l).toFixed(1)} m` : '🏐 a rolar…',
    }));
  }

  winners(): string[] {
    if (this.ctx.mode === 'ffa') {
      const best = Math.min(...this.lanes.map((l) => this.miss(l)));
      if (best >= 99) return [];
      const top = this.lanes.filter((l) => Math.abs(this.miss(l) - best) < 0.05);
      return top.length === this.lanes.length && this.lanes.length > 1 ? [] : top.map((l) => l.r.seat.id);
    }
    const avg = (t: 'blue' | 'red') => {
      const ls = this.lanes.filter((l) => l.r.seat.team === t);
      return ls.reduce((s, l) => s + this.miss(l), 0) / Math.max(1, ls.length);
    };
    const b = avg('blue');
    const r = avg('red');
    if (Math.abs(b - r) < 0.05) return [];
    const team = b < r ? 'blue' : 'red';
    return this.lanes.filter((l) => l.r.seat.team === team).map((l) => l.r.seat.id);
  }

  private throwBall(l: Lane): void {
    l.thrown = true;
    l.charging = false;
    // Velocidade para parar exatamente a power × MAX_DIST: v² = 2·a·d
    l.v = Math.sqrt(2 * FRICTION * l.power * MAX_DIST);
    l.r.model.setAnim('punchRight');
    sound.play('whoosh', { vol: 0.5 });
    this.ctx.vibrate(l.r.seat.id, 40);
  }

  protected step(dt: number): void {
    for (const l of this.lanes) {
      if (!l.thrown) {
        const pad = this.ctx.pad(l.r.seat.id);
        let held: boolean;
        if (this.isBot(l.r)) {
          // Bot: decide a força que quer (com erro conforme a dificuldade) e larga lá perto.
          if (!l.botAim) l.botAim = Math.min(0.99, Math.max(0.1, this.target / MAX_DIST + (this.ctx.rng.next() - 0.5) * (0.04 + (1 - this.ctx.botSkill) * 0.25)));
          held = this.elapsed > 0.8 + (l.r.x + 10) * 0.05 && l.power < l.botAim;
          if (l.charging && !held) {
            this.throwBall(l);
            continue;
          }
        } else held = pad.held.a;
        if (held) {
          if (!l.charging) sound.play('tick', { vol: 0.3 });
          l.charging = true;
          // A barra sobe e, passando do máximo, volta a zero.
          l.power += dt / FILL;
          if (l.power > 1) {
            l.power = 0;
            sound.play('coinLose', { vol: 0.4 });
            this.ctx.vibrate(l.r.seat.id, 60);
          }
        } else if (l.charging) this.throwBall(l);
        // Quem nunca atirou: no fim do tempo atira com a força que tiver.
        if (!l.thrown && this.elapsed > this.duration - 6 && !l.charging) {
          l.power = l.power || 0.1;
          this.throwBall(l);
        }
      } else if (!l.stopped) {
        l.dist += l.v * dt;
        l.v = Math.max(0, l.v - FRICTION * dt);
        if (l.v <= 0) {
          l.stopped = true;
          const m = this.miss(l);
          this.float(m < 0.5 ? '🎯 Perfeito!' : `${m.toFixed(1)} m`, l.r.x, 2, m < 1 ? '#4cd964' : '#ffffff', 0.55, START_Z - l.dist);
          sound.play(m < 0.5 ? 'win' : 'bounce', { vol: 0.5 });
        }
      }
      l.meter.scale.y = Math.max(0.01, l.power);
      const mat = l.meter.material as THREE.MeshToonMaterial;
      mat.color.set(l.power > 0.85 ? '#ff5a5f' : l.power > 0.6 ? '#ffd23f' : '#4cd964');
      l.ball.position.z = START_Z - l.dist;
      l.ball.rotation.x -= (l.v * dt) / 0.35;
    }
    if (!this.revealed && this.lanes.every((l) => l.stopped)) {
      this.revealed = true;
      const won = new Set(this.winners());
      for (const l of this.lanes) if (won.has(l.r.seat.id)) this.float('🏆', l.r.x, 3.6, '#ffd23f', 0.9, START_Z + 1.2);
      this.elapsed = Math.max(this.elapsed, this.duration - 2.5);
    }
  }

  override dispose(): void {
    for (const l of this.lanes) disposeObject(l.meterGroup);
    super.dispose();
  }
}

export const RightForce: MinigameDef = {
  id: 'forca-certa',
  rounds: 3,
  name: 'Força Certa',
  modes: ['ffa', 'teams'],
  description: (mode) =>
    `Segura Ⓐ para carregar a força e larga para atirar a bola. Tem de parar o mais perto possível da bandeira! Se passares do máximo, a barra volta a zero.${mode === 'teams' ? ' Conta a média da equipa.' : ''}`,
  controls: 'Ⓐ segurar para carregar, largar para atirar',
  stick: false,
  buttons: [{ id: 'a', label: 'Segura e larga' }],
  create: (ctx) => new RightForceRun(ctx),
};
