/**
 * "Empurra-Empurra": empurra os outros para fora da plataforma, que vai encolhendo.
 * Modos: todos contra todos, equipas e 1 contra todos (o solitário é gigante).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const START_R = 10;
const END_R = 4.5;

class SumoRun extends ArenaMinigame {
  protected readonly duration = 45;
  private radius = START_R;
  private readonly platform: THREE.Mesh;
  private readonly falling = new Set<Actor>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.grip = 5; // escorregadio: dá para ser empurrado
    this.dashBoost = 2.8;
    this.dashLength = 0.22;
    this.dashCooldownTime = 1.4;

    this.platform = mesh(new THREE.CylinderGeometry(1, 1, 1.2, 64), toon('#e8d3a2'), { receive: true });
    this.platform.position.y = -0.6;
    const pattern = mesh(new THREE.RingGeometry(0.9, 0.98, 64), toonUnique('#ff7b00'), { cast: false });
    pattern.rotation.x = -Math.PI / 2;
    pattern.position.y = 0.61;
    this.platform.add(pattern);
    this.scene.add(this.platform);
    (this.water.mesh.material as THREE.MeshStandardMaterial).color.set('#ff5a1f');
    (this.water.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#b32400');
    this.setRadius(START_R);

    this.spawnActors(6, (seat) =>
      ctx.mode === 'oneVsAll' && seat.team === 'blue'
        ? { radius: 1.1, mass: 3.5, speed: 6 }
        : { radius: 0.6, mass: 1, speed: 7.5 },
    );
    for (const a of this.actors) if (a.radius > 1) a.model.root.scale.setScalar(1.8);
  }

  private setRadius(r: number): void {
    this.radius = r;
    this.platform.scale.set(r, 1, r);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? '💪' : '💀' }));
  }

  winners(): string[] {
    const alive = this.actors.filter((a) => a.alive);
    if (this.ctx.mode === 'ffa') return alive.map((a) => a.seat.id);
    const count = (team: 'blue' | 'red') => alive.filter((a) => a.seat.team === team).length;
    const blue = count('blue');
    const red = count('red');
    if (blue === red) return [];
    const team = blue > red ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override onBump(a: Actor, b: Actor, nx: number, nz: number): void {
    // Quem vem em dash empurra com muito mais força.
    const push = (from: Actor, to: Actor, dir: number) => {
      if (from.dashTime <= 0) return;
      const force = (9 * from.mass) / to.mass;
      to.vel.x += nx * dir * force;
      to.vel.z += nz * dir * force;
      to.stunned = Math.max(to.stunned, 0.25);
      sound.play('hit');
      this.ctx.vibrate(to.seat.id, 80);
    };
    push(a, b, 1);
    push(b, a, -1);
    // Pequeno ressalto mesmo sem dash.
    const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    if (rel < 0) {
      const j = (-1.6 * rel) / (1 / a.mass + 1 / b.mass);
      a.vel.x -= (j * nx) / a.mass;
      a.vel.z -= (j * nz) / a.mass;
      b.vel.x += (j * nx) / b.mass;
      b.vel.z += (j * nz) / b.mass;
    }
  }

  protected step(dt: number): void {
    const t = Math.max(0, Math.min(1, (this.elapsed - 8) / 30));
    this.setRadius(START_R + (END_R - START_R) * t);

    for (const a of this.actors) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x, a.pos.z) > this.radius + 0.2) {
        a.alive = false;
        this.falling.add(a);
        a.model.setAnim('dizzy');
        this.ctx.vibrate(a.seat.id, 300);
      }
    }
    for (const a of this.falling) {
      a.vel.y -= 25 * dt;
      a.pos.addScaledVector(a.vel, dt);
      if (a.pos.y < -6) {
        a.model.root.visible = false;
        this.falling.delete(a);
      }
    }

    const alive = this.actors.filter((a) => a.alive);
    const sides = new Set(alive.map((a) => this.teamOf(a)));
    if (sides.size <= 1) this.endGame();
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > this.radius - 2) {
      this.steer(a, 0, 0);
      return;
    }
    const enemies = this.actors.filter((o) => o.alive && o !== a && this.teamOf(o) !== this.teamOf(a));
    if (!enemies.length) return;
    const target = enemies.reduce((best, o) =>
      Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z) ? o : best,
    );
    // Aponta para "trás" do alvo, para o empurrar para fora.
    const out = Math.hypot(target.pos.x, target.pos.z) || 1;
    const behindX = target.pos.x - (target.pos.x / out) * 1.2;
    const behindZ = target.pos.z - (target.pos.z / out) * 1.2;
    const dist = Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    if (dist > 2.5) this.steer(a, behindX, behindZ, 0.85);
    else this.steer(a, target.pos.x, target.pos.z);
    if (dist < 3 && a.dashCooldown <= 0 && this.ctx.rng.next() < 0.08) pad.press('a');
  }
}

export const Sumo: MinigameDef = {
  id: 'sumo',
  rounds: 2,
  name: 'Empurra-Empurra',
  modes: ['ffa', 'teams', 'oneVsAll'],
  description: (mode) =>
    mode === 'oneVsAll'
      ? 'O gigante tem de atirar todos para a lava — e os outros têm de o derrubar! A plataforma vai encolhendo.'
      : mode === 'teams'
        ? 'Atirem a outra equipa para a lava! A plataforma vai encolhendo.'
        : 'Atira os outros para a lava! O último em pé ganha. A plataforma vai encolhendo.',
  controls: '🕹️ Mover  ·  Ⓐ Investida',
  stick: true,
  buttons: [{ id: 'a', label: 'Empurrar' }],
  create: (ctx) => new SumoRun(ctx),
};
