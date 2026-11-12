/**
 * «Pinball» (todos contra todos): uma mesa redonda com bumpers no meio e um buraco para cada
 * jogador. Mexe a tua raquete com o joystick (anda à volta do teu buraco) para não deixar entrar
 * as bolas. Cada bola que entra tira uma vida (❤️ 3); quem fica sem vidas tem o buraco tapado.
 * Ganha quem sobrar. Com o tempo entram mais bolas.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

const R = 8.5; // raio da mesa
const HOLE = 0.36; // meia abertura do buraco (rad)
const PADDLE = 0.3; // meia largura da raquete (rad)
const BALL = 0.4;
const LIVES = 3;
const BUMPERS = [
  { x: 0, z: 0, r: 1.1 },
  { x: -3.2, z: -2.2, r: 0.8 },
  { x: 3.2, z: -2.2, r: 0.8 },
  { x: -3.2, z: 2.4, r: 0.8 },
  { x: 3.2, z: 2.4, r: 0.8 },
];

interface Seat {
  r: Rower;
  angle: number; // onde está o buraco
  paddle: number; // ângulo da raquete
  lives: number;
  paddleMesh: THREE.Mesh;
  cover: THREE.Mesh;
  hearts: THREE.Sprite | null;
}

interface Ball {
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  mesh: THREE.Mesh;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

class PinballRun extends RowMinigame {
  protected readonly duration = 75;
  private readonly seats: Seat[] = [];
  private readonly balls: Ball[] = [];
  private readonly bumperMeshes: THREE.Mesh[] = [];
  private readonly bumperPulse: number[] = BUMPERS.map(() => 0);
  private extra = 0;
  private readonly outAt = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.5, decor: true });
    // Mesa
    const table = mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.9, 1, 64), toon('#2a1f45'), { receive: true });
    table.position.y = 0.5;
    const felt = mesh(new THREE.CircleGeometry(R, 64), toonUnique('#3a6fd8'), { cast: false, receive: true });
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 1.01;
    this.scene.add(table, felt);
    BUMPERS.forEach((b) => {
      const m = mesh(new THREE.CylinderGeometry(b.r, b.r, 0.7, 24), toonUnique('#ff6fb5', { emissive: '#ff6fb5', emissiveIntensity: 0.4 }));
      m.position.set(b.x, 1.35, b.z);
      const cap = mesh(new THREE.CylinderGeometry(b.r * 0.6, b.r * 0.6, 0.72, 20), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), { cast: false });
      m.add(cap);
      this.scene.add(m);
      this.bumperMeshes.push(m);
    });
    // Um lugar (buraco + raquete) para cada jogador, à volta da mesa.
    const n = this.row.length;
    this.row.forEach((r, i) => {
      const angle = Math.PI / 2 + (i / n) * Math.PI * 2; // o 1.º fica cá à frente
      const color = getCharacter(r.seat.characterId).color;
      // Boca do buraco (da cor do jogador)
      const mouth = mesh(new THREE.TorusGeometry(R, 0.12, 6, 20, HOLE * 2), new THREE.MeshBasicMaterial({ color }), { cast: false });
      mouth.rotation.x = -Math.PI / 2;
      mouth.rotation.z = -(angle + HOLE);
      mouth.position.y = 1.05;
      this.scene.add(mouth);
      const paddleMesh = mesh(new THREE.BoxGeometry(2 * PADDLE * (R - 0.5), 0.5, 0.35), toonUnique(color, { emissive: color, emissiveIntensity: 0.3 }));
      this.scene.add(paddleMesh);
      const cover = mesh(new THREE.BoxGeometry(2 * HOLE * R, 0.6, 0.4), toon('#9aa3ad'));
      cover.position.set(Math.cos(angle) * (R + 0.1), 1.3, Math.sin(angle) * (R + 0.1));
      cover.rotation.y = -angle + Math.PI / 2;
      cover.visible = false;
      this.scene.add(cover);
      // A personagem fica atrás do seu buraco, a olhar para a mesa.
      r.model.root.position.set(Math.cos(angle) * (R + 2), 0, Math.sin(angle) * (R + 2));
      r.model.faceTowards(0, 0);
      r.model.faceYaw(Math.atan2(-Math.cos(angle), -Math.sin(angle)), true);
      const seat: Seat = { r, angle, paddle: angle, lives: LIVES, paddleMesh, cover, hearts: null };
      this.seats.push(seat);
      this.showHearts(seat);
    });
    this.camera.position.set(0, 22, 12);
    this.camera.lookAt(0, 0, 0.5);
    this.addBall();
  }

  private showHearts(s: Seat): void {
    if (s.hearts) {
      s.r.model.root.remove(s.hearts);
      disposeObject(s.hearts);
    }
    s.hearts = textSprite('❤️'.repeat(s.lives) + '🖤'.repeat(LIVES - s.lives), { height: 0.6 });
    s.hearts.position.y = 3.3;
    s.r.model.root.add(s.hearts);
  }

  private addBall(): void {
    const m = mesh(new THREE.SphereGeometry(BALL, 18, 12), toonUnique('#d9dde3', { emissive: '#ffffff', emissiveIntensity: 0.15 }));
    this.scene.add(m);
    const a = this.ctx.rng.next() * Math.PI * 2;
    this.balls.push({ pos: new THREE.Vector2(0, 0), vel: new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(7), mesh: m });
    sound.play('bell', { vol: 0.5 });
  }

  scores(): MinigameScore[] {
    return this.seats.map((s) => ({ id: s.r.seat.id, value: s.lives > 0 ? '❤️'.repeat(s.lives) : '💥 fora' }));
  }

  override ranking(): string[][] {
    // Vivos primeiro (mais vidas = melhor); depois quem saiu mais tarde.
    return rankBy(this.seats.map((s) => s.r.seat.id), (id) => {
      const s = this.seats.find((x) => x.r.seat.id === id)!;
      return s.lives > 0 ? 1e6 + s.lives : (this.outAt.get(id) ?? 0);
    });
  }

  winners(): string[] {
    let alive = this.seats.filter((s) => s.lives > 0);
    if (!alive.length) {
      const last = Math.max(...this.outAt.values());
      alive = this.seats.filter((s) => (this.outAt.get(s.r.seat.id) ?? 0) >= last - 0.05);
    }
    if (alive.length === this.seats.length) {
      // Ninguém saiu: ganha quem perdeu menos vidas.
      const best = Math.max(...this.seats.map((s) => s.lives));
      const top = this.seats.filter((s) => s.lives === best);
      return top.length === this.seats.length ? [] : top.map((s) => s.r.seat.id);
    }
    return alive.map((s) => s.r.seat.id);
  }

  protected step(dt: number): void {
    // Mais bolas com o tempo.
    if (this.extra < 2 && this.elapsed > 18 + this.extra * 18) {
      this.extra++;
      this.addBall();
    }
    // Raquetes: joystick no sentido do ecrã (a raquete anda à volta do buraco).
    for (const s of this.seats) {
      if (s.lives <= 0) continue;
      const tx = -Math.sin(s.paddle);
      const tz = Math.cos(s.paddle);
      let move = 0;
      if (this.isBot(s.r)) {
        // Bot: vai para o ângulo da bola que mais perto está de entrar no seu buraco.
        let target = s.angle;
        let best = Infinity;
        for (const b of this.balls) {
          const radial = b.pos.dot(b.vel) / Math.max(0.01, b.pos.length());
          const ang = Math.atan2(b.pos.y, b.pos.x);
          const d = Math.abs(wrap(ang - s.angle));
          if (radial > 0 && d < 1.2) {
            const eta = (R - b.pos.length()) / radial;
            if (eta < best) {
              best = eta;
              target = ang;
            }
          }
        }
        const err = (1 - this.ctx.botSkill) * Math.sin(this.elapsed * 1.7 + s.angle) * 0.25;
        move = Math.max(-1, Math.min(1, wrap(target + err - s.paddle) * 4));
        s.paddle += move * 3 * dt;
      } else {
        const pad = this.ctx.pad(s.r.seat.id);
        move = pad.stick.x * tx + pad.stick.y * tz;
        s.paddle += move * 3 * dt;
      }
      s.paddle = s.angle + Math.max(-HOLE - 0.15, Math.min(HOLE + 0.15, wrap(s.paddle - s.angle)));
      s.paddleMesh.position.set(Math.cos(s.paddle) * (R - 0.45), 1.3, Math.sin(s.paddle) * (R - 0.45));
      s.paddleMesh.rotation.y = -s.paddle + Math.PI / 2;
    }
    // Bolas
    for (const b of this.balls) {
      b.pos.addScaledVector(b.vel, dt);
      // Bumpers: ressaltam com força.
      BUMPERS.forEach((bp, i) => {
        const dx = b.pos.x - bp.x;
        const dz = b.pos.y - bp.z;
        const d = Math.hypot(dx, dz);
        if (d < bp.r + BALL && d > 0.001) {
          const nx = dx / d;
          const nz = dz / d;
          b.pos.set(bp.x + nx * (bp.r + BALL), bp.z + nz * (bp.r + BALL));
          const vn = b.vel.x * nx + b.vel.y * nz;
          if (vn < 0) b.vel.set(b.vel.x - 2 * vn * nx, b.vel.y - 2 * vn * nz);
          b.vel.multiplyScalar(1.08);
          this.bumperPulse[i] = 1;
          sound.play('bounce', { vol: 0.4, pitch: 1.3 });
        }
      });
      const sp = b.vel.length();
      if (sp > 15) b.vel.multiplyScalar(15 / sp);
      if (sp < 5) b.vel.multiplyScalar(5 / Math.max(0.01, sp));
      const dist = b.pos.length();
      if (dist < R - 0.75 - BALL) continue;
      const ang = Math.atan2(b.pos.y, b.pos.x);
      const n = b.pos.clone().normalize();
      const radial = b.vel.dot(n);
      if (radial <= 0) continue;
      // Raquete?
      const hitPaddle = this.seats.find((s) => s.lives > 0 && Math.abs(wrap(ang - s.paddle)) < PADDLE + 0.05 && dist > R - 0.75 - BALL);
      if (hitPaddle) {
        b.vel.addScaledVector(n, -2 * radial);
        // Efeito: bater na ponta da raquete desvia a bola.
        const off = wrap(ang - hitPaddle.paddle) / PADDLE;
        b.vel.add(new THREE.Vector2(-n.y, n.x).multiplyScalar(off * 3));
        b.pos.copy(n.multiplyScalar(R - 0.8 - BALL));
        sound.play('ball', { vol: 0.5 });
        this.ctx.vibrate(hitPaddle.r.seat.id, 25);
        continue;
      }
      if (dist < R - BALL) continue;
      // Buraco de alguém (vivo)?
      const hole = this.seats.find((s) => s.lives > 0 && Math.abs(wrap(ang - s.angle)) < HOLE);
      if (hole) {
        this.goalAgainst(hole, b);
        continue;
      }
      // Parede: ressalta.
      b.vel.addScaledVector(n, -2 * radial);
      b.pos.copy(n.multiplyScalar(R - BALL));
      sound.play('bounce', { vol: 0.25 });
    }
    const alive = this.seats.filter((s) => s.lives > 0);
    if (alive.length <= 1 && this.seats.length > 1) this.endGame();
  }

  private goalAgainst(s: Seat, b: Ball): void {
    s.lives--;
    this.showHearts(s);
    sound.play('lose', { vol: 0.6 });
    s.r.model.flash('#ff2a2a', 0.35);
    s.r.model.setAnim(s.lives > 0 ? 'hurt' : 'sad');
    this.ctx.vibrate(s.r.seat.id, 300);
    this.float('−1 ❤️', s.r.model.root.position.x, 3.8, '#ff6b7a', 0.7, s.r.model.root.position.z);
    if (s.lives <= 0) {
      this.knockOut(s.r);
      this.outAt.set(s.r.seat.id, this.elapsed);
      s.cover.visible = true;
      s.paddleMesh.visible = false;
    }
    // A bola volta ao meio.
    const a = this.ctx.rng.next() * Math.PI * 2;
    b.pos.set(0, 0);
    b.vel.set(Math.cos(a), Math.sin(a)).multiplyScalar(7);
  }

  protected override animate(dt: number): void {
    for (const b of this.balls) b.mesh.position.set(b.pos.x, 1.4, b.pos.y);
    this.bumperMeshes.forEach((m, i) => {
      this.bumperPulse[i] = Math.max(0, this.bumperPulse[i]! - dt * 4);
      m.scale.setScalar(1 + this.bumperPulse[i]! * 0.15);
    });
  }

  override dispose(): void {
    for (const b of this.balls) b.mesh.geometry.dispose();
    super.dispose();
  }
}

export const Pinball: MinigameDef = {
  id: 'pinball',
  rounds: 1,
  name: 'Pinball',
  modes: ['ffa'],
  description: () =>
    'Cada um guarda o seu buraco com uma raquete (joystick). Cada bola que entra tira uma vida (3)! Os bumpers cor-de-rosa atiram as bolas com força e, com o tempo, entram mais bolas. Ganha quem sobrar.',
  controls: '🕹️ Mexer a raquete',
  stick: true,
  buttons: [],
  create: (ctx) => new PinballRun(ctx),
};
