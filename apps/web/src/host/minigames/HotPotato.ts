/**
 * «Batata Quente»: alguém tem uma bomba com o rastilho aceso. Toca noutro jogador para a passar.
 * Quando rebenta, quem a tiver sai — e aparece uma bomba nova. Ganha o último que sobrar.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const R = 9;

class HotPotatoRun extends ArenaMinigame {
  protected readonly duration = 90;
  private holder: Actor | null = null;
  private fuse = 0;
  private passCooldown = 0;
  private readonly bomb: THREE.Group;
  private readonly spark: THREE.Mesh;
  private readonly falling = new Set<Actor>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    const floor = mesh(new THREE.CylinderGeometry(R, R + 0.4, 1, 48), toon('#c9a26b'), { receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    ringDecor(this.scene, ctx.rng, R + 6, 24, { ground: '#000', theme: ctx.theme });
    this.bomb = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.45, 18, 14), toon('#22202b'));
    const cap = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10), toon('#6b6f78'));
    cap.position.y = 0.45;
    this.spark = mesh(new THREE.SphereGeometry(0.12, 8, 6), toonUnique('#ffb347', { emissive: '#ff7a1a', emissiveIntensity: 2 }), { cast: false });
    this.spark.position.y = 0.62;
    this.bomb.add(body, cap, this.spark);
    this.scene.add(this.bomb);
    this.spawnActors(5.5);
    this.camera.position.set(0, 20, 17);
    this.camera.lookAt(0, 0, 1);
    this.newBomb();
  }

  private newBomb(): void {
    const alive = this.actors.filter((a) => a.alive);
    if (alive.length < 2) return;
    this.holder = alive[this.ctx.rng.int(0, alive.length - 1)]!;
    this.fuse = 8 + this.ctx.rng.next() * 7;
    this.passCooldown = 1;
    this.ctx.vibrate(this.holder.seat.id, 160);
    sound.play('tick');
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: !a.alive ? '💥' : a === this.holder ? '💣' : '🏃' }));
  }

  winners(): string[] {
    const alive = this.actors.filter((a) => a.alive);
    return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > R - 0.6) {
      a.pos.x *= (R - 0.6) / d;
      a.pos.z *= (R - 0.6) / d;
    }
  }

  protected override onBump(a: Actor, b: Actor): void {
    if (this.passCooldown > 0 || !this.holder) return;
    if (a === this.holder || b === this.holder) {
      const to = a === this.holder ? b : a;
      this.holder = to;
      this.passCooldown = 0.6;
      to.stunned = 0.3; // um instante parado ao receber
      sound.play('punch', { vol: 0.5 });
      this.ctx.vibrate(to.seat.id, 120);
    }
  }

  protected step(dt: number, time: number): void {
    this.passCooldown -= dt;
    for (const a of this.actors) a.speed = a === this.holder ? 8 : 7.2;
    if (this.holder) {
      this.fuse -= dt;
      const p = this.holder.pos;
      this.bomb.position.set(p.x, p.y + 2.9, p.z);
      this.bomb.visible = true;
      // O rastilho pisca mais depressa quando está quase.
      const rate = this.fuse < 3 ? 18 : 7;
      this.spark.scale.setScalar(0.7 + Math.abs(Math.sin(time * rate)) * 0.8);
      if (this.fuse < 3 && Math.floor(time * 4) !== Math.floor((time - dt) * 4)) this.ctx.vibrate(this.holder.seat.id, 25);
      if (this.fuse <= 0) {
        const out = this.holder;
        out.alive = false;
        this.outTimes.set(out.seat.id, this.elapsed);
        out.vel.set(0, 9, 0);
        this.falling.add(out);
        out.model.setAnim('fall');
        this.ctx.vibrate(out.seat.id, 400);
        sound.play('firework');
        this.holder = null;
        this.bomb.visible = false;
        const alive = this.actors.filter((x) => x.alive);
        if (alive.length <= 1) this.endGame();
        else this.fuse = -1.2; // pausa antes da bomba nova
      }
    } else if ((this.fuse += dt) >= 0) this.newBomb();
    for (const a of this.falling) {
      a.vel.y -= 20 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.model.root.rotation.x += dt * 6;
      if (a.pos.y < -3) {
        a.model.root.visible = false;
        this.falling.delete(a);
      }
    }
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const others = this.actors.filter((o) => o.alive && o !== a);
    if (!others.length) return;
    if (a === this.holder) {
      // Persegue o mais perto e usa o arranque quando está quase.
      const t = others.reduce((best, o) => (Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z) ? o : best));
      this.steer(a, t.pos.x + t.vel.x * 0.25, t.pos.z + t.vel.z * 0.25);
      if (Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < 3 && this.ctx.rng.next() < 0.1) pad.press('a');
      return;
    }
    if (!this.holder) {
      this.steer(a, a.pos.x * 0.5, a.pos.z * 0.5, 0.3);
      return;
    }
    // Foge de quem tem a bomba (e afasta-se da borda).
    const h = this.holder.pos;
    let fx = a.pos.x - h.x;
    let fz = a.pos.z - h.z;
    const d = Math.hypot(fx, fz) || 1;
    fx /= d;
    fz /= d;
    const edge = Math.hypot(a.pos.x, a.pos.z) / R;
    fx -= (a.pos.x / R) * edge * 1.4;
    fz -= (a.pos.z / R) * edge * 1.4;
    this.steer(a, a.pos.x + fx * 3, a.pos.z + fz * 3, d < 4 ? 1 : 0.6);
    if (d < 2.2 && this.ctx.rng.next() < 0.06) pad.press('a');
  }
}

export const HotPotato: MinigameDef = {
  id: 'batata',
  rounds: 1,
  name: 'Batata Quente',
  modes: ['ffa'],
  description: () => 'Uma bomba anda de mão em mão: toca noutro jogador para a passar! Quando rebenta, quem a tiver sai. Ganha o último que sobrar.',
  controls: '🕹️ Correr · Ⓐ Arranque',
  stick: true,
  buttons: [{ id: 'a', label: 'Arranque' }],
  create: (ctx) => new HotPotatoRun(ctx),
};
