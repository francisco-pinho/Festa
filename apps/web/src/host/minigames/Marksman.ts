/**
 * "Pontaria" (duelo): um marcador anda de um lado para o outro numa barra;
 * carrega quando estiver no centro. 5 tiros, cada vez mais rápidos. Mais pontos ganha.
 */
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const SHOTS = 5;
const BAR = 3;

interface Shooter {
  d: Duelist;
  phase: number;
  marker: THREE.Mesh;
  bar: THREE.Group;
  shots: number;
  total: number;
  freeze: number;
  /** Onde o bot vai tentar parar (-1…1) e há quanto tempo espera. */
  aim: number;
  waited: number;
}

class MarksmanRun extends DuelMinigame {
  protected readonly duration = 30;
  private readonly shooters: Shooter[] = [];

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#9be07a', spacing: 3, faceCamera: true });
    // Alvos ao fundo
    for (const d of this.duelists) {
      const target = new THREE.Group();
      ['#ffffff', '#ff3b5c', '#ffffff', '#ff3b5c'].forEach((c, i) => {
        const ring = mesh(new THREE.CylinderGeometry(1.2 - i * 0.3, 1.2 - i * 0.3, 0.1 + i * 0.02, 24), toon(c));
        ring.rotation.x = Math.PI / 2;
        target.add(ring);
      });
      target.position.set(d.side * 3, 1.6, -7);
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6), toon('#7a5230'));
      post.position.set(d.side * 3, 0.8, -7.1);
      this.scene.add(target, post);
    }
    for (const d of this.duelists) {
      const bar = new THREE.Group();
      const red = mesh(new THREE.BoxGeometry(BAR, 0.3, 0.05), toonUnique('#ff5a5f'), { cast: false });
      const yellow = mesh(new THREE.BoxGeometry(BAR * 0.4, 0.3, 0.06), toonUnique('#ffd23f'), { cast: false });
      const green = mesh(new THREE.BoxGeometry(BAR * 0.12, 0.3, 0.07), toonUnique('#4cd964'), { cast: false });
      const marker = mesh(new THREE.BoxGeometry(0.08, 0.6, 0.1), toonUnique('#ffffff'), { cast: false });
      bar.add(red, yellow, green, marker);
      bar.position.set(d.side * 3, 3.1, 0);
      this.scene.add(bar);
      this.shooters.push({ d, phase: ctx.rng.next() * 6, marker, bar, shots: 0, total: 0, freeze: 0, aim: 0, waited: 0 });
    }
    for (const s of this.shooters) this.newAim(s);
  }

  private newAim(s: Shooter): void {
    const err = (1 - this.ctx.botSkill) * 0.55;
    s.aim = (this.ctx.rng.next() * 2 - 1) * err;
    s.waited = 0;
  }

  scores(): MinigameScore[] {
    return this.shooters.map((s) => ({ id: s.d.seat.id, value: `${s.total} (${s.shots}/${SHOTS})` }));
  }

  winners(): string[] {
    const [a, b] = this.shooters as [Shooter, Shooter];
    return a.total === b.total ? [] : [a.total > b.total ? a.d.seat.id : b.d.seat.id];
  }

  private shoot(s: Shooter): void {
    const m = Math.sin(s.phase);
    const points = Math.max(0, Math.round(100 * (1 - Math.abs(m) * 1.15)));
    s.total += points;
    s.shots++;
    s.freeze = 0.8;
    s.d.model.setAnim('throw');
    const label = points >= 90 ? `🎯 ${points}` : `${points}`;
    this.float(label, s.d.side * 3, 3.5, points >= 90 ? '#4cd964' : points >= 50 ? '#ffd23f' : '#ff6b7a', 0.9);
    this.ctx.vibrate(s.d.seat.id, points >= 90 ? 120 : 40);
    this.newAim(s);
  }

  protected step(dt: number): void {
    for (const s of this.shooters) {
      if (s.shots >= SHOTS) {
        this.pressed(s.d, 'a');
        continue;
      }
      if (s.freeze > 0) {
        s.freeze -= dt;
        this.pressed(s.d, 'a');
        if (s.freeze <= 0) s.d.model.setAnim('idle');
        continue;
      }
      s.phase += dt * (2.4 + s.shots * 0.6);
      const m = Math.sin(s.phase);
      if (this.isBot(s.d)) {
        s.waited += dt;
        if (Math.abs(m - s.aim) < 0.06 || s.waited > 4) this.botPress(s.d, 'a');
      }
      if (this.pressed(s.d, 'a')) this.shoot(s);
    }
    if (this.shooters.every((s) => s.shots >= SHOTS && s.freeze <= 0)) this.endGame();
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    for (const s of this.shooters) s.marker.position.x = (Math.sin(s.phase) * BAR) / 2;
  }
}

export const Marksman: MinigameDef = {
  id: 'pontaria',
  name: 'Pontaria',
  modes: ['ffa'],
  duel: true,
  description: () => `Carrega quando o marcador estiver no verde! ${SHOTS} tiros, cada vez mais rápidos. Quem somar mais pontos ganha.`,
  controls: 'Ⓐ Disparar',
  stick: false,
  buttons: [{ id: 'a', label: 'Disparar' }],
  create: (ctx) => new MarksmanRun(ctx),
};
