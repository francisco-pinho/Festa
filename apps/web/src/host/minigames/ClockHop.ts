/**
 * «Salta o Ponteiro» (duelo, inspirado no Tick Tock Hop do Mario Party 3): os dois estão em cima
 * de um relógio gigante deitado no chão. O ponteiro roda e varre o mostrador: carrega em Ⓐ para
 * saltar por cima dele no momento certo. Quem levar com o ponteiro perde um coração (❤️); cada
 * volta o ponteiro anda mais depressa. Ganha quem ficar com corações.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { canvasTexture, mesh, toon, toonUnique } from '../three/materials';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const LIVES = 3;
const R = 4.2;
const JUMP = 0.62;
const JUMP_H = 1.3;

interface Hopper {
  d: Duelist;
  /** Ângulo no mostrador. */
  angle: number;
  lives: number;
  air: number;
  /** Já levou com o ponteiro nesta passagem. */
  hit: boolean;
  stun: number;
  botJumpAt: number;
}

class ClockHopRun extends DuelMinigame {
  protected readonly duration = 75;
  private readonly hand = new THREE.Group();
  private handAngle = Math.PI / 2;
  private speed = 1.5;
  private readonly hoppers: Hopper[] = [];
  private loser: Duelist | null = null;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#8fd16a', spacing: 2.6, faceCamera: true, scenery: { radius: R + 2, count: 28 } });
    // Mostrador: disco com os números e os traços das horas.
    const face = mesh(
      new THREE.CylinderGeometry(R + 0.4, R + 0.6, 0.3, 48),
      new THREE.MeshToonMaterial({
        map: canvasTexture(512, (c, s) => {
          c.fillStyle = '#fff8e8';
          c.fillRect(0, 0, s, s);
          c.translate(s / 2, s / 2);
          c.fillStyle = '#2b1d3a';
          c.font = 'bold 44px "Trebuchet MS", sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          for (let h = 1; h <= 12; h++) {
            const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
            c.fillText(String(h), Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
            c.fillRect(Math.cos(a) * s * 0.47 - 4, Math.sin(a) * s * 0.47 - 4, 8, 8);
          }
        }),
      }),
      { receive: true },
    );
    face.position.y = 0.15;
    this.scene.add(face);
    const rim = mesh(new THREE.TorusGeometry(R + 0.5, 0.18, 8, 48), toon('#c9a227'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.3;
    this.scene.add(rim);
    // Ponteiro: barra vermelha do centro até à borda, à altura dos tornozelos, com o pino ao meio.
    const bar = mesh(new THREE.BoxGeometry(R, 0.28, 0.32), toonUnique('#ff3b5c'));
    bar.position.set(R / 2, 0.5, 0);
    const tip = mesh(new THREE.ConeGeometry(0.3, 0.6, 4), toonUnique('#ff3b5c'));
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(R + 0.1, 0.5, 0);
    const pin = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 16), toon('#c9a227'));
    pin.position.y = 0.45;
    this.hand.add(bar, tip, pin);
    this.scene.add(this.hand);
    // Os dois em lados opostos do mostrador.
    this.duelists.forEach((d, i) => {
      const angle = i === 0 ? Math.PI : 0;
      d.model.root.position.set(Math.cos(angle) * (R * 0.62), 0.3, -Math.sin(angle) * (R * 0.62));
      this.hoppers.push({ d, angle, lives: LIVES, air: 0, hit: false, stun: 0, botJumpAt: -1 });
    });
    this.camera.position.set(0, 9, 10.5);
    this.camera.lookAt(0, 0.5, 0);
  }

  scores(): MinigameScore[] {
    return this.hoppers.map((h) => ({ id: h.d.seat.id, value: '❤️'.repeat(h.lives) || '💀' }));
  }

  winners(): string[] {
    const [a, b] = this.hoppers as [Hopper, Hopper];
    if (a.lives === b.lives) return [];
    return [(a.lives > b.lives ? a : b).d.seat.id];
  }

  /** Quanto falta (rad) para o ponteiro chegar a este ângulo, no sentido em que roda. */
  private gap(angle: number): number {
    const g = (angle - this.handAngle) % (Math.PI * 2);
    return g < 0 ? g + Math.PI * 2 : g;
  }

  protected step(dt: number): void {
    if (this.loser) return;
    this.handAngle += this.speed * dt;
    // Cada volta completa anda mais depressa.
    if (this.handAngle > Math.PI * 2.5) {
      this.handAngle -= Math.PI * 2;
      this.speed = Math.min(5.5, this.speed * 1.12);
      sound.play('tick', { vol: 0.5 });
    }
    for (const h of this.hoppers) {
      h.stun = Math.max(0, h.stun - dt);
      if (h.air > 0) h.air = Math.max(0, h.air - dt);
      const want = this.pressed(h.d, 'a') || this.pressed(h.d, 'b');
      const g = this.gap(h.angle);
      if (this.isBot(h.d)) {
        // Bots: saltam quando o ponteiro está a chegar, com um erro que depende da dificuldade.
        const eta = g / this.speed;
        if (h.botJumpAt < 0 && eta < 0.6) h.botJumpAt = 0.12 + (this.ctx.rng.next() - 0.5) * (1 - this.ctx.botSkill) * 0.5;
        if (h.botJumpAt >= 0 && eta <= h.botJumpAt && h.air <= 0) {
          this.jump(h);
          h.botJumpAt = -1;
        }
      } else if (want && h.air <= 0 && h.stun <= 0) this.jump(h);
      // O ponteiro está a passar por baixo/por cima?
      const passing = g < 0.16 || g > Math.PI * 2 - 0.16;
      const height = h.air > 0 ? Math.sin((1 - h.air / JUMP) * Math.PI) * JUMP_H : 0;
      h.d.model.root.position.y = 0.3 + height;
      if (passing && !h.hit && height < 0.45) {
        h.hit = true;
        h.lives--;
        h.stun = 0.5;
        h.d.model.setAnim('hurt');
        h.d.model.flash('#ff2a2a', 0.35);
        this.float('−1 ❤️', h.d.model.root.position.x, 2.8, '#ff5a5f', 0.7);
        sound.play('hit');
        this.ctx.vibrate(h.d.seat.id, 250);
        if (h.lives <= 0) {
          this.loser = h.d;
          h.d.model.setAnim('fall');
          this.endGame();
          return;
        }
      }
      if (!passing) h.hit = false;
    }
  }

  private jump(h: Hopper): void {
    h.air = JUMP;
    h.d.model.setAnim('jump');
    sound.play('whoosh', { vol: 0.3, pitch: 1.3 });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.hand.rotation.y = this.handAngle;
  }
}

export const ClockHop: MinigameDef = {
  id: 'salta-ponteiro',
  name: 'Salta o Ponteiro',
  modes: ['ffa'],
  duel: true,
  description: () => 'O ponteiro do relógio gigante varre o mostrador cada vez mais depressa: carrega em A para saltar por cima dele! Quem levar com ele perde um coração.',
  controls: 'Ⓐ Saltar',
  stick: false,
  buttons: [{ id: 'a', label: 'Saltar' }],
  create: (ctx) => new ClockHopRun(ctx),
};
