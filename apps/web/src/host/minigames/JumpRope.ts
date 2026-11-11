/**
 * «Corda Saltitona»: uma corda comprida gira cada vez mais depressa por baixo de toda a gente.
 * Salta com Ⓐ quando ela passa no chão — quem estiver no chão nesse momento tropeça e sai.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const JUMP = 0.55; // duração do salto (s)
const R = 1.9; // raio da volta da corda

class JumpRopeRun extends RowMinigame {
  protected readonly duration = 45;
  private angle = Math.PI * 0.2; // 0 = em cima; π = no chão
  private speed = 3.2; // rad/s
  private passes = 0;
  private readonly rope: THREE.Mesh;
  private readonly air = new Map<string, number>();
  private readonly botPlan = new Map<string, number>();
  private readonly half: number;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 1.9 });
    this.half = this.row.length * 0.95 + 1.6;
    for (const side of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.4, 10), toon('#8b5a2b'));
      post.position.set(side * this.half, 1.2, 0);
      this.scene.add(post);
    }
    this.rope = mesh(new THREE.CylinderGeometry(0.06, 0.06, this.half * 2, 8), toon('#ff6fb5'));
    this.rope.rotation.z = Math.PI / 2;
    this.scene.add(this.rope);
    for (const r of this.row) this.air.set(r.seat.id, 0);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({ id: r.seat.id, value: r.alive ? `🪢 ${this.passes}` : '💫' }));
  }

  winners(): string[] {
    return this.survivorsWin();
  }

  private jump(r: Rower): void {
    if ((this.air.get(r.seat.id) ?? 0) > 0 || !r.alive) return;
    this.air.set(r.seat.id, JUMP);
    r.model.setAnim('jump');
  }

  protected step(dt: number): void {
    const before = this.angle;
    this.speed = Math.min(12, 3.2 + this.elapsed * 0.2);
    this.angle += this.speed * dt;
    // Passou no chão (ângulo π + 2kπ)?
    const crossed = Math.floor((before - Math.PI) / (Math.PI * 2)) !== Math.floor((this.angle - Math.PI) / (Math.PI * 2));
    for (const r of this.row) {
      if (!r.alive) continue;
      if (this.isBot(r)) this.think(r);
      if (this.pressed(r, 'a')) this.jump(r);
      const t = Math.max(0, (this.air.get(r.seat.id) ?? 0) - dt);
      this.air.set(r.seat.id, t);
      r.model.root.position.y = t > 0 ? Math.sin((1 - t / JUMP) * Math.PI) * 0.9 : 0;
      if (t === 0 && r.model.anim === 'jump') r.model.setAnim('idle');
    }
    if (crossed) {
      this.passes++;
      sound.play('tick', { pitch: 0.8 });
      for (const r of this.row) {
        if (!r.alive) continue;
        if (r.model.root.position.y < 0.25) {
          this.knockOut(r);
          r.model.setAnim('fall');
          this.ctx.vibrate(r.seat.id, 300);
          this.float('💫', r.x, 2.4, '#ff6b7a');
          sound.play('hit');
        } else this.ctx.vibrate(r.seat.id, 20);
      }
      this.endIfDecided();
    }
  }

  /** Bot: salta pouco antes de a corda chegar ao chão, com um erro que depende da dificuldade. */
  private think(r: Rower): void {
    const toGround = (((Math.PI - this.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const timeLeft = toGround / this.speed;
    let plan = this.botPlan.get(r.seat.id);
    if (plan === undefined) {
      // Mais depressa = mais difícil acertar no tempo.
      const err = (1 - this.ctx.botSkill) * 0.2 + this.speed * 0.012;
      plan = JUMP * 0.45 + (this.ctx.rng.next() * 2 - 1) * err;
      this.botPlan.set(r.seat.id, plan);
    }
    if (timeLeft <= plan && timeLeft > plan - 0.05) {
      this.botPress(r, 'a');
      this.botPlan.delete(r.seat.id);
    }
  }

  protected override animate(): void {
    // A corda gira à volta do eixo x, à altura das mãos dos postes.
    this.rope.position.set(0, 1.95 + Math.cos(this.angle) * R * 0.95, Math.sin(this.angle) * R * 0.6);
    this.rope.position.y = Math.max(0.06, this.rope.position.y);
  }
}

export const JumpRope: MinigameDef = {
  id: 'corda',
  rounds: 2,
  name: 'Corda Saltitona',
  modes: ['ffa', 'teams'],
  description: () => 'Salta à corda! Carrega em Ⓐ quando a corda passar no chão. Vai cada vez mais depressa — quem tropeçar sai.',
  controls: 'Ⓐ Saltar',
  stick: false,
  buttons: [{ id: 'a', label: 'Saltar' }],
  create: (ctx) => new JumpRopeRun(ctx),
};
