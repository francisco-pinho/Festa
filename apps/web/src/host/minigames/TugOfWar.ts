/**
 * "Cabo de Guerra" (duelo): carrega em A e B alternadamente para puxar a corda.
 * Quem trouxer a fita para o seu lado ganha (ou quem estiver à frente no fim).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { damp } from '../three/tweens';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const LINE = 2.4;
const PULL = 0.1;
const HALF = 4;

class TugOfWarRun extends DuelMinigame {
  protected readonly duration = 20;
  /** Posição da fita: negativo = lado esquerdo a ganhar. */
  private pos = 0;
  private shown = 0;
  private readonly last = new Map<string, 'a' | 'b'>();
  private readonly botClock = new Map<string, number>();
  private readonly lean = new Map<string, number>();
  private readonly rope: THREE.Mesh;
  private readonly ribbon: THREE.Mesh;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#7ccf5b', spacing: HALF });
    const mud = mesh(new THREE.CircleGeometry(1.4, 24), toon('#6b4a2a'), { cast: false });
    mud.rotation.x = -Math.PI / 2;
    mud.position.y = 0.02;
    this.scene.add(mud);
    for (const side of [-1, 1]) {
      const line = mesh(new THREE.BoxGeometry(0.15, 0.03, 3), toonUnique(side < 0 ? '#2f7dff' : '#ff3b5c'), { cast: false });
      line.position.set(side * LINE, 0.03, 0);
      this.scene.add(line);
    }
    this.rope = mesh(new THREE.CylinderGeometry(0.07, 0.07, HALF * 2 + 1, 8), toon('#c9a26b'));
    this.rope.rotation.z = Math.PI / 2;
    this.rope.position.y = 1.05;
    this.ribbon = mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), toonUnique('#ff3b5c'));
    this.ribbon.position.y = 0.8;
    this.scene.add(this.rope, this.ribbon);
    for (const d of this.duelists) {
      d.model.setAnim('block');
      this.botClock.set(d.seat.id, 0.5 + ctx.rng.next() * 0.3);
    }
  }

  scores(): MinigameScore[] {
    return this.duelists.map((d) => {
      const lead = -d.side * this.pos;
      return { id: d.seat.id, value: lead > 0.05 ? '💪 a ganhar' : lead < -0.05 ? '😣' : '—' };
    });
  }

  winners(): string[] {
    if (Math.abs(this.pos) < 0.15) return [];
    const side = this.pos < 0 ? -1 : 1;
    return [this.duelists.find((d) => d.side === side)!.seat.id];
  }

  private pull(d: Duelist): void {
    sound.play('tick', { vol: 0.4, pitch: 0.6 + Math.random() * 0.3 });
    this.pos += d.side * PULL;
    this.lean.set(d.seat.id, 0.35);
    if (Math.abs(this.pos) >= LINE) {
      this.ctx.vibrate(this.other(d).seat.id, 300);
      this.endGame();
    }
  }

  protected step(dt: number): void {
    const skill = this.ctx.botSkill;
    for (const d of this.duelists) {
      if (this.isBot(d)) {
        let clock = this.botClock.get(d.seat.id)! - dt;
        if (clock <= 0) {
          this.botPress(d, this.last.get(d.seat.id) === 'a' ? 'b' : 'a');
          clock = 1 / (4.5 + skill * 4.5) * (0.7 + this.ctx.rng.next() * 0.6);
        }
        this.botClock.set(d.seat.id, clock);
      }
      for (const b of ['a', 'b'] as const) {
        if (!this.pressed(d, b)) continue;
        // Só conta se alternar entre A e B.
        if (this.last.get(d.seat.id) === b) continue;
        this.last.set(d.seat.id, b);
        if (!this.ended) this.pull(d);
      }
    }
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.shown += (this.pos - this.shown) * damp(12, dt);
    this.rope.position.x = this.shown;
    this.ribbon.position.x = this.shown;
    for (const d of this.duelists) {
      d.model.root.position.x = d.side * HALF + this.shown;
      const l = Math.max(0, (this.lean.get(d.seat.id) ?? 0) - dt);
      this.lean.set(d.seat.id, l);
      d.model.root.rotation.z = d.side * (0.15 + l * 0.4) * (this.ended ? 0 : 1);
    }
    if (this.ended) {
      const loser = this.duelists.find((d) => !this.winners().includes(d.seat.id));
      if (loser && this.winners().length && loser.model.root.position.y > -0.3) {
        loser.model.root.position.y -= dt * 0.6;
        loser.model.setAnim('dizzy');
      }
    }
  }
}

export const TugOfWar: MinigameDef = {
  id: 'cabo',
  rounds: 3,
  name: 'Cabo de Guerra',
  modes: ['ffa'],
  duel: true,
  description: () => 'Carrega em A e B à vez, o mais depressa que conseguires, para puxar a corda! Repetir o mesmo botão não conta.',
  controls: 'Ⓐ Ⓑ Ⓐ Ⓑ… à vez',
  stick: false,
  buttons: [
    { id: 'a', label: 'Puxa A' },
    { id: 'b', label: 'Puxa B' },
  ],
  create: (ctx) => new TugOfWarRun(ctx),
};
