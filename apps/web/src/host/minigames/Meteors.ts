/**
 * «Chuva de Meteoros» (todos contra todos / equipas): caem meteoros na ilha, cada vez mais e mais
 * depressa. Um círculo vermelho avisa onde vão cair. Quem for atingido sai; ganha quem sobrar
 * (se saírem todos, ganham os últimos a cair). Ⓐ dá um sprint para fugir à pressa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const R = 10;

interface Meteor {
  x: number;
  z: number;
  r: number;
  t: number;
  fall: number;
  rock: THREE.Mesh;
  warn: THREE.Mesh;
}

class MeteorsRun extends ArenaMinigame {
  protected readonly duration = 35;
  private readonly meteors: Meteor[] = [];
  private readonly flashes: { m: THREE.Mesh; t: number; r: number }[] = [];
  private next = 1;
  private readonly outAt = new Map<string, number>();
  private readonly rockGeo = new THREE.DodecahedronGeometry(1, 0);
  private readonly warnGeo = new THREE.CircleGeometry(1, 32);
  private readonly wander = new Map<string, THREE.Vector2>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    const floor = mesh(new THREE.CylinderGeometry(R + 1, R + 1.6, 1, 48), toon('#7ccf5b'), { cast: false, receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    ringDecor(this.scene, ctx.rng, R + 4, 22, { ground: '#000', theme: ctx.theme });
    this.scene.background = new THREE.Color('#ffb48a'); // céu ao fim da tarde
    this.spawnActors(5);
    this.camera.position.set(0, 21, 17);
    this.camera.lookAt(0, 0, 0.5);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? '🟢 de pé' : '☄️ atingido' }));
  }

  winners(): string[] {
    let alive = this.actors.filter((a) => a.alive);
    if (!alive.length) {
      const last = Math.max(...this.outAt.values());
      alive = this.actors.filter((a) => (this.outAt.get(a.seat.id) ?? 0) >= last - 0.05);
      if (alive.length === this.actors.length) return [];
    }
    if (this.ctx.mode === 'ffa') return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((a) => a.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > R - a.radius) a.pos.multiplyScalar((R - a.radius) / d);
  }

  private spawn(): void {
    const pace = Math.min(1, this.elapsed / this.duration);
    // Às vezes cai mesmo em cima de alguém (para ninguém ficar parado).
    const alive = this.actors.filter((a) => a.alive);
    let x: number;
    let z: number;
    if (alive.length && this.ctx.rng.next() < 0.45) {
      const t = alive[Math.floor(this.ctx.rng.next() * alive.length)]!;
      x = t.pos.x + (this.ctx.rng.next() - 0.5) * 2;
      z = t.pos.z + (this.ctx.rng.next() - 0.5) * 2;
    } else {
      const ang = this.ctx.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.ctx.rng.next()) * R;
      x = Math.cos(ang) * d;
      z = Math.sin(ang) * d;
    }
    const big = this.ctx.rng.next() < 0.25 + pace * 0.25;
    const r = big ? 2.4 : 1.5;
    const fall = 1.6 - pace * 0.6;
    const rock = mesh(this.rockGeo, toonUnique('#5a3d2b', { emissive: '#ff5a1f', emissiveIntensity: 0.6 }));
    rock.scale.setScalar(r * 0.45);
    rock.position.set(x, 18, z);
    const warn = new THREE.Mesh(this.warnGeo, new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.2, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(x, 0.05, z);
    warn.scale.setScalar(r * 0.2);
    this.scene.add(rock, warn);
    this.meteors.push({ x, z, r, t: 0, fall, rock, warn });
  }

  private impact(m: Meteor): void {
    this.scene.remove(m.rock, m.warn);
    (m.rock.material as THREE.Material).dispose();
    (m.warn.material as THREE.Material).dispose();
    sound.play('firework', { vol: 0.7 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: '#ff8c3a', transparent: true, opacity: 0.85, depthWrite: false }));
    flash.position.set(m.x, 0.3, m.z);
    this.scene.add(flash);
    this.flashes.push({ m: flash, t: 0, r: m.r });
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x - m.x, a.pos.z - m.z) > m.r + a.radius * 0.3) continue;
      a.alive = false;
      this.outTimes.set(a.seat.id, this.elapsed);
      this.outAt.set(a.seat.id, this.elapsed);
      a.vel.set(0, 0, 0);
      a.model.setAnim('fall');
      a.model.setFaded(true);
      this.ctx.vibrate(a.seat.id, 350);
    }
  }

  protected step(dt: number): void {
    this.next -= dt;
    if (this.next <= 0) {
      this.spawn();
      const pace = Math.min(1, this.elapsed / this.duration);
      this.next = (0.75 - pace * 0.5) * (0.7 + this.ctx.rng.next() * 0.6);
    }
    for (const m of [...this.meteors]) {
      m.t += dt;
      const k = Math.min(1, m.t / m.fall);
      m.rock.position.y = 18 * (1 - k * k);
      m.rock.rotation.x += dt * 3;
      m.rock.rotation.z += dt * 2;
      m.warn.scale.setScalar(m.r * (0.2 + k * 0.8));
      (m.warn.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.45;
      if (k >= 1) {
        this.meteors.splice(this.meteors.indexOf(m), 1);
        this.impact(m);
      }
    }
    const alive = this.actors.filter((a) => a.alive);
    const sides = new Set(alive.map((a) => (this.ctx.mode === 'ffa' ? a.seat.id : a.seat.team)));
    if (sides.size <= 1 && this.actors.length > 1) this.endGame();
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    for (const f of [...this.flashes]) {
      f.t += dt;
      const k = f.t / 0.45;
      f.m.scale.setScalar(0.4 + k * f.r);
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
    let fx = 0;
    let fz = 0;
    let danger = false;
    for (const m of this.meteors) {
      const dx = a.pos.x - m.x;
      const dz = a.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      const reach = m.r + 1.3;
      if (d < reach) {
        danger = true;
        fx += ((dx / (d || 1)) * (reach - d)) / 1.2;
        fz += ((dz / (d || 1)) * (reach - d)) / 1.2;
      }
    }
    let w = this.wander.get(a.seat.id);
    if (!w || this.ctx.rng.next() < dt * 0.5) {
      const ang = this.ctx.rng.next() * Math.PI * 2;
      w = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
      this.wander.set(a.seat.id, w);
    }
    fx += w.x * 0.25 - a.pos.x * 0.04;
    fz += w.y * 0.25 - a.pos.z * 0.04;
    const len = Math.hypot(fx, fz) || 1;
    pad.stick.x = fx / Math.max(1, len);
    pad.stick.y = fz / Math.max(1, len);
    if (danger && this.ctx.rng.next() < 0.15) pad.press('a');
  }

  override dispose(): void {
    this.rockGeo.dispose();
    this.warnGeo.dispose();
    super.dispose();
  }
}

export const Meteors: MinigameDef = {
  id: 'meteoros',
  rounds: 2,
  name: 'Chuva de Meteoros',
  modes: ['ffa', 'teams'],
  description: () => 'Caem meteoros na ilha, cada vez mais! O círculo vermelho mostra onde vão cair: foge! Quem for atingido sai. Ganha quem ficar de pé.',
  controls: '🕹️ Mover · Ⓐ Sprint',
  stick: true,
  buttons: [{ id: 'a', label: 'Sprint' }],
  create: (ctx) => new MeteorsRun(ctx),
};
