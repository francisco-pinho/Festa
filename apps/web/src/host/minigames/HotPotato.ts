/**
 * «Batata Quente»: alguém tem uma bomba com o rastilho aceso. Para a passar, chega-te a outro
 * jogador e carrega em Ⓑ. A bomba pulsa (cor e tamanho) cada vez mais depressa e, nos últimos
 * segundos, mostra a contagem. Quando rebenta, quem a tiver sai — e aparece uma bomba nova.
 * Ganha o último que sobrar.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { explode } from '../three/explosion';

const R = 9;
/** Distância a que se pode passar a bomba (Ⓑ). */
const PASS = 2.3;

class HotPotatoRun extends ArenaMinigame {
  protected readonly duration = 90;
  private holder: Actor | null = null;
  private fuse = 0;
  private passCooldown = 0;
  private readonly bomb: THREE.Group;
  private readonly spark: THREE.Mesh;
  private readonly bodyMat: THREE.MeshToonMaterial;
  /** Anel no chão à volta de quem tem a bomba: até onde chega o passe. */
  private readonly reach: THREE.Mesh;
  private countdown: THREE.Sprite | null = null;
  private lastCount = -1;
  private fuseTotal = 1;
  private readonly falling = new Set<Actor>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    const floor = mesh(new THREE.CylinderGeometry(R, R + 0.4, 1, 48), toon('#c9a26b'), { receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    ringDecor(this.scene, ctx.rng, R + 6, 24, { ground: '#000', theme: ctx.theme });
    this.bomb = new THREE.Group();
    this.bodyMat = toonUnique('#22202b', { emissive: '#ff2a2a', emissiveIntensity: 0 });
    const body = mesh(new THREE.SphereGeometry(0.45, 18, 14), this.bodyMat);
    const cap = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10), toon('#6b6f78'));
    cap.position.y = 0.45;
    this.spark = mesh(new THREE.SphereGeometry(0.12, 8, 6), toonUnique('#ffb347', { emissive: '#ff7a1a', emissiveIntensity: 2 }), { cast: false });
    this.spark.position.y = 0.62;
    this.bomb.add(body, cap, this.spark);
    this.scene.add(this.bomb);
    const rg = new THREE.RingGeometry(PASS - 0.12, PASS, 40);
    rg.rotateX(-Math.PI / 2);
    this.reach = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ff6b7a', transparent: true, opacity: 0.6, depthWrite: false }));
    this.reach.position.y = 0.04;
    this.scene.add(this.reach);
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
    this.fuseTotal = this.fuse;
    this.lastCount = -1;
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

  /** Quem tem a bomba carregou em Ⓑ: passa-a ao mais perto (se estiver ao alcance). */
  private tryPass(): void {
    const h = this.holder;
    if (!h || this.passCooldown > 0) return;
    const near = this.actors
      .filter((o) => o.alive && o !== h)
      .map((o) => ({ o, d: Math.hypot(o.pos.x - h.pos.x, o.pos.z - h.pos.z) }))
      .sort((x, y) => x.d - y.d)[0];
    if (!near || near.d > PASS) {
      sound.play('click', { pitch: 0.6 });
      return;
    }
    const to = near.o;
    this.holder = to;
    this.passCooldown = 0.6;
    to.stunned = 0.3; // um instante parado ao receber
    sound.play('punch', { vol: 0.5 });
    sound.play('whoosh', { vol: 0.4, pitch: 1.3 });
    this.ctx.vibrate(to.seat.id, 120);
    this.ctx.vibrate(h.seat.id, 30);
  }

  protected step(dt: number, time: number): void {
    this.passCooldown -= dt;
    for (const a of this.actors) a.speed = a === this.holder ? 8 : 7.2;
    if (this.holder && this.ctx.pad(this.holder.seat.id).consumePress('b')) this.tryPass();
    if (this.holder) {
      this.fuse -= dt;
      const p = this.holder.pos;
      this.bomb.position.set(p.x, p.y + 2.9, p.z);
      this.bomb.visible = true;
      this.reach.visible = true;
      this.reach.position.set(p.x, 0.04, p.z);
      // A bomba pulsa (cor e tamanho) cada vez mais depressa à medida que o rastilho acaba.
      const left = Math.max(0, this.fuse / this.fuseTotal);
      const rate = 3 + (1 - left) * 16 + (this.fuse < 3 ? 10 : 0);
      const pulse = (Math.sin(time * rate) + 1) / 2;
      this.bomb.scale.setScalar(1 + pulse * (0.12 + (1 - left) * 0.35));
      this.bodyMat.emissiveIntensity = pulse * (0.2 + (1 - left) * 1.6);
      this.spark.scale.setScalar(0.7 + Math.abs(Math.sin(time * rate * 1.5)) * 0.8);
      // Últimos segundos: contagem por cima da bomba, com som.
      const count = this.fuse < 3.5 ? Math.ceil(this.fuse) : -1;
      if (count !== this.lastCount) {
        this.lastCount = count;
        if (this.countdown) {
          this.scene.remove(this.countdown);
          disposeObject(this.countdown);
          this.countdown = null;
        }
        if (count > 0) {
          this.countdown = textSprite(String(count), { height: 1.3, color: '#ff3b5c', stroke: '#ffffff' });
          this.scene.add(this.countdown);
          sound.play('countdown', { pitch: 1 + (3 - count) * 0.15 });
        }
      }
      if (this.countdown) this.countdown.position.set(p.x, p.y + 4.4, p.z);
      if (this.fuse < 3 && Math.floor(time * 4) !== Math.floor((time - dt) * 4)) this.ctx.vibrate(this.holder.seat.id, 25);
      if (this.fuse <= 0) {
        const out = this.holder;
        out.alive = false;
        this.outTimes.set(out.seat.id, this.elapsed);
        out.vel.set(0, 9, 0);
        this.falling.add(out);
        out.model.setAnim('fall');
        this.ctx.vibrate(out.seat.id, 400);
        explode(this.scene, this.bomb.getWorldPosition(new THREE.Vector3()), 1.3);
        this.holder = null;
        this.bomb.visible = false;
        this.reach.visible = false;
        if (this.countdown) {
          this.scene.remove(this.countdown);
          disposeObject(this.countdown);
          this.countdown = null;
        }
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
      const dist = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
      if (dist < 3.5 && this.ctx.rng.next() < 0.1) pad.press('a');
      // Passa quando está ao alcance (os fracos às vezes demoram).
      if (dist < PASS - 0.2 && this.ctx.rng.next() < 0.25 + this.ctx.botSkill * 0.5) pad.press('b');
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
  description: () =>
    'Uma bomba anda de mão em mão! Para a passar, chega-te a alguém (dentro do anel vermelho) e carrega em Ⓑ. Ela pulsa cada vez mais depressa e mostra a contagem no fim: quem a tiver quando rebenta, sai!',
  controls: '🕹️ Correr · Ⓐ Arranque · Ⓑ Passar a bomba',
  stick: true,
  buttons: [
    { id: 'a', label: 'Arranque' },
    { id: 'b', label: 'Passar' },
  ],
  create: (ctx) => new HotPotatoRun(ctx),
};
