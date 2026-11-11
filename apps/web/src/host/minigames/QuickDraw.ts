/**
 * "Saque Rápido" (duelo): espera pelo sinal e carrega primeiro. Quem carrega
 * antes do sinal perde a ronda. Ganha quem fizer 2 rondas.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, textSprite, toon } from '../three/materials';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const WINS = 2;

class QuickDrawRun extends DuelMinigame {
  protected readonly duration = 45;
  private phase: 'ready' | 'go' | 'result' = 'ready';
  private t = 0;
  private goAt = 0;
  private readonly wins = new Map<string, number>();
  private readonly botAt = new Map<string, number>();
  private readonly ready: THREE.Sprite;
  private readonly go: THREE.Sprite;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#e3c18b', spacing: 3.2 });
    this.scene.background = new THREE.Color('#ffb36b');
    // Catos e uma tabuleta ao fundo
    for (let i = 0; i < 9; i++) {
      const cactus = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.4 + (i % 3) * 0.6, 8), toon('#3f9b4a'));
      body.position.y = 1.2;
      const arm = mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 6), toon('#3f9b4a'));
      arm.position.set(0.5, 1.5, 0);
      arm.rotation.z = -0.6;
      cactus.add(body, arm);
      cactus.position.set(-16 + i * 4 + (i % 2) * 1.3, 0, -8 - (i % 3) * 3);
      this.scene.add(cactus);
    }
    this.ready = textSprite('Preparar…', { height: 1.2, color: '#ffffff', stroke: '#1d1433' });
    this.go = textSprite('JÁ!', { height: 2.6, color: '#ff3b5c', stroke: '#ffffff' });
    for (const s of [this.ready, this.go]) {
      s.position.set(0, 4.3, 0);
      s.visible = false;
      this.scene.add(s);
    }
    for (const d of this.duelists) this.wins.set(d.seat.id, 0);
  }

  override start(): void {
    super.start();
    this.newRound();
  }

  private newRound(): void {
    this.phase = 'ready';
    this.t = 0;
    this.goAt = 1.5 + this.ctx.rng.next() * 3;
    this.ready.visible = true;
    this.go.visible = false;
    this.botAt.clear();
    for (const d of this.duelists) {
      d.model.setAnim('block');
      // Bots fracos às vezes precipitam-se.
      if (this.isBot(d) && this.ctx.rng.next() < (1 - this.ctx.botSkill) * 0.12) this.botAt.set(d.seat.id, this.ctx.rng.next() * this.goAt);
    }
  }

  scores(): MinigameScore[] {
    return this.duelists.map((d) => ({ id: d.seat.id, value: '⭐'.repeat(this.wins.get(d.seat.id) ?? 0) || '—' }));
  }

  winners(): string[] {
    const [a, b] = this.duelists as [Duelist, Duelist];
    const wa = this.wins.get(a.seat.id)!;
    const wb = this.wins.get(b.seat.id)!;
    return wa === wb ? [] : [wa > wb ? a.seat.id : b.seat.id];
  }

  private roundTo(winner: Duelist, why: string): void {
    sound.play('punch');
    const loser = this.other(winner);
    this.phase = 'result';
    this.t = 0;
    this.ready.visible = false;
    this.go.visible = false;
    this.wins.set(winner.seat.id, this.wins.get(winner.seat.id)! + 1);
    winner.model.setAnim('punchRight');
    loser.model.setAnim('hurt');
    this.float(why, 0, 3.6, '#ffd23f', 0.9);
    this.ctx.vibrate(loser.seat.id, 250);
    this.ctx.vibrate(winner.seat.id, 60);
  }

  protected step(dt: number): void {
    this.t += dt;
    const skill = this.ctx.botSkill;
    // Os bots "carregam" no momento que decidiram.
    for (const d of this.duelists) {
      const at = this.botAt.get(d.seat.id);
      if (at !== undefined && this.phase !== 'result' && this.t >= at) {
        this.botPress(d, 'a');
        this.botAt.delete(d.seat.id);
      }
    }
    if (this.phase === 'ready') {
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.float(`${d.seat.name}: falso arranque!`, d.side * 2, 3, '#ff6b7a', 0.5);
          this.roundTo(this.other(d), 'Falso arranque!');
          return;
        }
      }
      if (this.t >= this.goAt) {
        this.phase = 'go';
        this.t = 0;
        this.ready.visible = false;
        this.go.visible = true;
        sound.play('go');
        for (const d of this.duelists) {
          this.ctx.vibrate(d.seat.id, 40);
          if (this.isBot(d)) this.botAt.set(d.seat.id, 0.17 + (1 - skill) * 0.4 + this.ctx.rng.next() * 0.15);
        }
      }
    } else if (this.phase === 'go') {
      this.go.scale.multiplyScalar(1 + Math.sin(this.t * 30) * 0.01);
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.roundTo(d, `${Math.round(this.t * 1000)} ms!`);
          return;
        }
      }
    } else if (this.t > 2) {
      if ([...this.wins.values()].some((w) => w >= WINS)) this.endGame();
      else this.newRound();
    }
  }
}

export const QuickDraw: MinigameDef = {
  id: 'saque',
  name: 'Saque Rápido',
  modes: ['ffa'],
  duel: true,
  description: () => 'Espera pelo «JÁ!» e carrega primeiro! Quem carregar antes do sinal perde a ronda. Ganha quem fizer 2 rondas.',
  controls: 'Ⓐ quando aparecer «JÁ!»',
  stick: false,
  buttons: [{ id: 'a', label: 'JÁ!' }],
  create: (ctx) => new QuickDrawRun(ctx),
};
