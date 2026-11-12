/**
 * «Bombardeiro» (1 contra todos): o solitário está numa torre e mexe uma mira no chão da arena
 * com o joystick; Ⓐ larga uma bomba que cai do céu (vê-se um aviso vermelho onde vai cair).
 * Os outros fogem pela arena: cada um tem 2 vidas. O solitário ganha se os apanhar a todos
 * antes do tempo acabar; se sobrar alguém, ganha o grupo. A cada ronda as bombas caem mais depressa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { explode } from '../three/explosion';

const R = 11;
const TOWER_Z = -15;
const TOWER_H = 6;
const BLAST = 1.9;
const LIVES = 2;

interface Bomb {
  x: number;
  z: number;
  t: number;
  ball: THREE.Mesh;
  warn: THREE.Mesh;
}

class BomberRun extends ArenaMinigame {
  protected readonly duration = 30;
  private readonly fall: number;
  private readonly reload: number;
  private readonly aim = new THREE.Vector3(0, 0, 0);
  private readonly cross: THREE.Group;
  private readonly bombs: Bomb[] = [];
  private readonly flashes: { m: THREE.Mesh; t: number }[] = [];
  private cooldown = 1;
  private readonly lives = new Map<string, number>();
  private readonly safe = new Map<string, number>();
  private readonly wander = new Map<string, THREE.Vector2>();
  private readonly ballGeo = new THREE.SphereGeometry(0.55, 16, 12);
  private readonly warnGeo = new THREE.CircleGeometry(BLAST, 32);

  constructor(ctx: MinigameContext) {
    super(ctx);
    const round = Math.max(1, ctx.round ?? 1);
    this.fall = Math.max(0.75, 1.15 - (round - 1) * 0.15);
    this.reload = Math.max(0.55, 0.9 - (round - 1) * 0.12);
    const floor = mesh(new THREE.CylinderGeometry(R + 1, R + 1.4, 1, 48), toon('#e7cf95'), { cast: false, receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    // Torre do bombardeiro
    const tower = mesh(new THREE.CylinderGeometry(1.6, 2.2, TOWER_H, 16), toon('#8d6e63'));
    tower.position.set(0, TOWER_H / 2 - 0.5, TOWER_Z);
    const top = mesh(new THREE.CylinderGeometry(2, 1.7, 0.5, 16), toon('#5d4037'));
    top.position.set(0, TOWER_H - 0.25, TOWER_Z);
    this.scene.add(tower, top);
    ringDecor(this.scene, ctx.rng, R + 4, 22, { ground: '#000', theme: ctx.theme });
    // Mira
    this.cross = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 32), toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.6 }), { cast: false });
    ring.rotation.x = Math.PI / 2;
    const dot = mesh(new THREE.CircleGeometry(0.18, 16), toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.6 }), { cast: false });
    dot.rotation.x = -Math.PI / 2;
    this.cross.add(ring, dot);
    this.cross.position.y = 0.06;
    this.scene.add(this.cross);

    this.spawnActors(6);
    for (const a of this.actors) {
      if (a.seat.team === 'blue') {
        a.pos.set(0, TOWER_H, TOWER_Z);
        a.facing = 0;
        a.model.faceYaw(0, true);
        a.model.root.scale.setScalar(1.3);
      } else this.lives.set(a.seat.id, LIVES);
    }
    this.camera.position.set(0, 22, 17);
    this.camera.lookAt(0, 0, -2.5);
  }

  private get bomber(): Actor | undefined {
    return this.actors.find((a) => a.seat.team === 'blue');
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({
      id: a.seat.id,
      value: a.seat.team === 'blue' ? '💣 bombardeiro' : a.alive ? '❤️'.repeat(this.lives.get(a.seat.id) ?? 0) : '💥 fora',
    }));
  }

  winners(): string[] {
    const runners = this.actors.filter((a) => a.seat.team !== 'blue');
    const left = runners.filter((a) => a.alive);
    if (!this.bomber) return [];
    return left.length ? runners.map((a) => a.seat.id) : [this.bomber.seat.id];
  }

  /** O bombardeiro não anda: o joystick mexe a mira e Ⓐ larga bombas. */
  protected override move(a: Actor, dt: number): void {
    if (a !== this.bomber) return super.move(a, dt);
    const pad = this.ctx.pad(a.seat.id);
    this.aim.x += pad.stick.x * 11 * dt;
    this.aim.z += pad.stick.y * 11 * dt;
    const d = Math.hypot(this.aim.x, this.aim.z);
    if (d > R) this.aim.multiplyScalar(R / d);
    this.cooldown -= dt;
    if (pad.consumePress('a') && this.cooldown <= 0) {
      this.cooldown = this.reload;
      this.drop();
      a.model.setAnim(a.model.anim === 'punchLeft' ? 'punchRight' : 'punchLeft');
    }
    a.model.faceTowards(this.aim.x, this.aim.z);
  }

  protected override constrain(a: Actor): void {
    if (a === this.bomber) return;
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > R - a.radius) a.pos.multiplyScalar((R - a.radius) / d);
  }

  private drop(): void {
    const ball = mesh(this.ballGeo, toon('#26232f'));
    ball.position.set(this.aim.x, 14, this.aim.z);
    const warn = new THREE.Mesh(this.warnGeo, new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.25, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(this.aim.x, 0.05, this.aim.z);
    warn.scale.setScalar(0.2);
    this.scene.add(ball, warn);
    this.bombs.push({ x: this.aim.x, z: this.aim.z, t: 0, ball, warn });
    sound.play('whoosh', { vol: 0.5, pitch: 0.8 });
  }

  private explode(b: Bomb): void {
    this.scene.remove(b.ball, b.warn);
    (b.warn.material as THREE.Material).dispose();
    explode(this.scene, new THREE.Vector3(b.x, 0.5, b.z), 1.1);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, depthWrite: false }));
    flash.position.set(b.x, 0.4, b.z);
    this.scene.add(flash);
    this.flashes.push({ m: flash, t: 0 });
    for (const a of this.actors) {
      if (a === this.bomber || !a.alive || (this.safe.get(a.seat.id) ?? 0) > 0) continue;
      const dx = a.pos.x - b.x;
      const dz = a.pos.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > BLAST + a.radius * 0.5) continue;
      const lives = (this.lives.get(a.seat.id) ?? 1) - 1;
      this.lives.set(a.seat.id, lives);
      this.safe.set(a.seat.id, 1.3);
      a.vel.x += (d > 0.01 ? dx / d : 1) * 9;
      a.vel.z += (d > 0.01 ? dz / d : 0) * 9;
      a.stunned = 0.5;
      this.ctx.vibrate(a.seat.id, 260);
      if (this.bomber) this.ctx.vibrate(this.bomber.seat.id, 60);
      if (lives <= 0) {
        a.alive = false;
        a.vel.set(0, 0, 0);
        a.model.setAnim('sad');
        a.model.setFaded(true);
      }
    }
  }

  protected step(dt: number): void {
    if (!this.bomber) return this.endGame();
    for (const [id, t] of this.safe) this.safe.set(id, t - dt);
    for (const b of [...this.bombs]) {
      b.t += dt;
      const k = Math.min(1, b.t / this.fall);
      b.ball.position.y = 14 * (1 - k * k);
      b.warn.scale.setScalar(0.2 + k * 0.8);
      (b.warn.material as THREE.MeshBasicMaterial).opacity = 0.2 + k * 0.4;
      if (k >= 1) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        this.explode(b);
      }
    }
    if (this.actors.every((a) => a === this.bomber || !a.alive)) this.endGame();
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.cross.position.x = this.aim.x;
    this.cross.position.z = this.aim.z;
    this.cross.rotation.y = time * 1.5;
    // Quem acabou de ser atingido pisca (não pode ser atingido outra vez logo a seguir).
    for (const a of this.actors) {
      if (a === this.bomber || !a.alive) continue;
      a.model.root.visible = (this.safe.get(a.seat.id) ?? 0) <= 0 || Math.sin(time * 30) > 0;
    }
    for (const f of [...this.flashes]) {
      f.t += dt;
      const k = f.t / 0.4;
      f.m.scale.setScalar(0.4 + k * BLAST);
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k));
      if (k >= 1) {
        this.scene.remove(f.m);
        f.m.geometry.dispose();
        this.flashes.splice(this.flashes.indexOf(f), 1);
      }
    }
  }

  protected think(a: Actor, dt: number): void {
    const pad = this.ctx.botPad(a.seat.id);
    if (a === this.bomber) {
      // Aponta para onde o alvo mais perto da mira vai estar quando a bomba cair.
      const prey = this.actors.filter((o) => o !== a && o.alive);
      if (!prey.length) return;
      const t = prey.reduce((best, o) => (Math.hypot(o.pos.x - this.aim.x, o.pos.z - this.aim.z) < Math.hypot(best.pos.x - this.aim.x, best.pos.z - this.aim.z) ? o : best));
      const err = (1 - this.ctx.botSkill) * 1.6;
      const tx = t.pos.x + t.vel.x * this.fall * 0.8 + Math.sin(this.elapsed * 1.7) * err;
      const tz = t.pos.z + t.vel.z * this.fall * 0.8 + Math.cos(this.elapsed * 1.3) * err;
      const dx = tx - this.aim.x;
      const dz = tz - this.aim.z;
      const d = Math.hypot(dx, dz);
      pad.stick.x = d > 0.2 ? Math.max(-1, Math.min(1, dx / 1.5)) : 0;
      pad.stick.y = d > 0.2 ? Math.max(-1, Math.min(1, dz / 1.5)) : 0;
      if (d < 1.3 && this.cooldown <= 0) pad.press('a');
      return;
    }
    // Fugir: das bombas a cair e da mira; senão passear.
    let fx = 0;
    let fz = 0;
    for (const b of this.bombs) {
      const dx = a.pos.x - b.x;
      const dz = a.pos.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < BLAST + 1.4) {
        fx += ((dx / (d || 1)) * (BLAST + 1.4 - d)) / 1.4;
        fz += ((dz / (d || 1)) * (BLAST + 1.4 - d)) / 1.4;
      }
    }
    const cx = a.pos.x - this.aim.x;
    const cz = a.pos.z - this.aim.z;
    const cd = Math.hypot(cx, cz);
    if (cd < 3.5) {
      fx += (cx / (cd || 1)) * 0.6;
      fz += (cz / (cd || 1)) * 0.6;
    }
    let w = this.wander.get(a.seat.id);
    if (!w || this.ctx.rng.next() < dt * 0.6) {
      const ang = this.ctx.rng.next() * Math.PI * 2;
      w = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
      this.wander.set(a.seat.id, w);
    }
    fx += w.x * 0.35 - a.pos.x * 0.03;
    fz += w.y * 0.35 - a.pos.z * 0.03;
    const len = Math.hypot(fx, fz) || 1;
    pad.stick.x = fx / Math.max(1, len);
    pad.stick.y = fz / Math.max(1, len);
    if (this.bombs.some((b) => Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < BLAST && b.t > this.fall * 0.6) && this.ctx.rng.next() < 0.3) pad.press('a');
  }

  override dispose(): void {
    this.ballGeo.dispose();
    this.warnGeo.dispose();
    super.dispose();
  }
}

export const Bomber: MinigameDef = {
  id: 'bombardeiro',
  rounds: 3,
  name: 'Bombardeiro',
  modes: ['oneVsAll'],
  description: () =>
    'O solitário está na torre: mexe a mira com o joystick e larga bombas com Ⓐ (o aviso vermelho mostra onde vão cair). Os outros fogem: cada um tem 2 vidas. Se sobrar alguém no fim, ganha o grupo!',
  controls: '🕹️ Mover (ou a mira) · Ⓐ Sprint (ou bomba)',
  stick: true,
  buttons: [{ id: 'a', label: 'Ação' }],
  create: (ctx) => new BomberRun(ctx),
};
