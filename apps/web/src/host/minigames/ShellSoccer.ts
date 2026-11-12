/**
 * «Futebol de Carapaças» (equipas): um campo com duas balizas e uma carapaça a fazer de bola.
 * Encosta-te à bola para a levar; Ⓐ dá um pontapé forte. A equipa azul ataca para a direita,
 * a vermelha para a esquerda. Mais golos ganha; empatados no fim, golo de ouro.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, TEAM_COLORS, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { themeScenery } from './scenery';

const HX = 11; // meio comprimento do campo
const HZ = 6.5; // meia largura
const GOAL = 2.2; // meia boca da baliza
const BALL_R = 0.55;

class ShellSoccerRun extends ArenaMinigame {
  protected readonly duration = 60;
  private readonly ball: THREE.Group;
  private readonly bpos = new THREE.Vector3();
  private readonly bvel = new THREE.Vector3();
  private readonly goals = { blue: 0, red: 0 };
  private pause = 0;
  private readonly sign: THREE.Group = new THREE.Group();

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.grip = 9;
    this.dashBoost = 2.2;
    this.dashCooldownTime = 0.9;
    // Relvado às riscas, linhas e balizas
    for (let i = 0; i < 8; i++) {
      const stripe = mesh(new THREE.BoxGeometry((HX * 2) / 8, 1, HZ * 2), toon(i % 2 ? '#5fbf4a' : '#6dcc56'), { cast: false, receive: true });
      stripe.position.set(-HX + (i + 0.5) * ((HX * 2) / 8), -0.5, 0);
      this.scene.add(stripe);
    }
    const lineMat = toon('#ffffff');
    const line = (w: number, d: number, x: number, z: number) => {
      const l = mesh(new THREE.BoxGeometry(w, 0.03, d), lineMat, { cast: false });
      l.position.set(x, 0.02, z);
      this.scene.add(l);
    };
    line(0.12, HZ * 2, 0, 0);
    line(HX * 2, 0.12, 0, HZ);
    line(HX * 2, 0.12, 0, -HZ);
    const circle = mesh(new THREE.RingGeometry(1.9, 2.05, 48), lineMat, { cast: false });
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.03;
    this.scene.add(circle);
    for (const side of [-1, 1] as const) {
      const color = side > 0 ? TEAM_COLORS.red : TEAM_COLORS.blue; // baliza da equipa que defende
      const goal = new THREE.Group();
      for (const gz of [-GOAL, GOAL]) {
        const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10), toonUnique('#ffffff'));
        post.position.set(0, 1.1, gz);
        goal.add(post);
      }
      const bar = mesh(new THREE.CylinderGeometry(0.12, 0.12, GOAL * 2, 10), toonUnique('#ffffff'));
      bar.rotation.x = Math.PI / 2;
      bar.position.y = 2.2;
      const net = mesh(new THREE.BoxGeometry(1.4, 2.2, GOAL * 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 }), { cast: false });
      net.position.set(side * 0.7, 1.1, 0);
      goal.add(bar, net);
      goal.position.x = side * HX;
      this.scene.add(goal);
      // Paredes do campo (fora da boca da baliza)
      for (const gz of [-1, 1]) {
        const wall = mesh(new THREE.BoxGeometry(0.4, 0.8, HZ - GOAL), toon('#e9e2c9'));
        wall.position.set(side * (HX + 0.2), 0.4, gz * (GOAL + (HZ - GOAL) / 2));
        this.scene.add(wall);
      }
      const longWall = mesh(new THREE.BoxGeometry(HX * 2 + 0.8, 0.8, 0.4), toon('#e9e2c9'));
      longWall.position.set(0, 0.4, side * (HZ + 0.2));
      this.scene.add(longWall);
    }
    // A «bola»: uma carapaça verde e branca
    this.ball = new THREE.Group();
    const shell = mesh(new THREE.SphereGeometry(BALL_R, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), toonUnique('#3fb34f'));
    const rim = mesh(new THREE.TorusGeometry(BALL_R, 0.12, 8, 20), toonUnique('#ffffff'));
    rim.rotation.x = Math.PI / 2;
    const under = mesh(new THREE.SphereGeometry(BALL_R * 0.95, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toonUnique('#fff3c4'));
    for (let i = 0; i < 5; i++) {
      const spot = mesh(new THREE.CircleGeometry(0.13, 6), toonUnique('#2a8a3a'), { cast: false });
      const a = (i / 5) * Math.PI * 2;
      spot.position.set(Math.cos(a) * 0.33, 0.42, Math.sin(a) * 0.33);
      spot.lookAt(Math.cos(a) * 0.66, 0.9, Math.sin(a) * 0.66);
      this.ball.add(spot);
    }
    this.ball.add(shell, rim, under);
    this.scene.add(this.ball);
    // Cenário com o tema do mapa à volta (com chão por baixo).
    themeScenery(this.scene, ctx.rng, ctx.theme, HX + 2.5, { water: false });
    this.spawnActors(4);
    this.kickoff();
    this.camera.position.set(0, 20, 15);
    this.camera.lookAt(0, 0, 0.8);
  }

  /** Recomeço: bola ao meio, equipas cada uma no seu meio-campo. */
  private kickoff(): void {
    this.bpos.set(0, BALL_R, 0);
    this.bvel.set(0, 0, 0);
    const blues = this.actors.filter((a) => a.seat.team === 'blue');
    const reds = this.actors.filter((a) => a.seat.team !== 'blue');
    const place = (list: Actor[], side: number) =>
      list.forEach((a, i) => {
        const k = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
        a.pos.set(side * (4 + (i % 2) * 2), 0, k * 7);
        a.vel.set(0, 0, 0);
        a.facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        a.model.faceYaw(a.facing, true);
      });
    place(blues, -1);
    place(reds, 1);
  }

  private attack(a: Actor): number {
    // Azul ataca para +x (baliza da direita), vermelho para −x.
    return a.seat.team === 'blue' ? 1 : -1;
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: `⚽ ${this.goals.blue}–${this.goals.red}` }));
  }

  winners(): string[] {
    if (this.goals.blue === this.goals.red) return [];
    const team = this.goals.blue > this.goals.red ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    a.pos.x = Math.max(-HX + a.radius, Math.min(HX - a.radius, a.pos.x));
    a.pos.z = Math.max(-HZ + a.radius, Math.min(HZ - a.radius, a.pos.z));
  }

  private golden = 0;

  protected step(dt: number): void {
    // Golo de ouro: empatados no fim do tempo, joga-se até alguém marcar (no máximo +20 s).
    if (this.elapsed > this.duration - 0.2 && this.goals.blue === this.goals.red && this.golden < 20) {
      if (this.golden === 0) {
        sound.play('whistle');
        this.showGoal('blue');
      }
      this.golden += dt;
      this.elapsed = this.duration - 0.2;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.kickoff();
      return;
    }
    // Toques e pontapés: quem encosta empurra; em arranque (Ⓐ) é um pontapé forte.
    for (const a of this.actors) {
      const dx = this.bpos.x - a.pos.x;
      const dz = this.bpos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + BALL_R;
      if (d < min && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        this.bpos.x = a.pos.x + nx * min;
        this.bpos.z = a.pos.z + nz * min;
        const kick = a.dashTime > 0 ? 17 : Math.max(4, Math.hypot(a.vel.x, a.vel.z) * 1.15);
        this.bvel.set(nx * kick, 0, nz * kick);
        sound.play(a.dashTime > 0 ? 'punch' : 'ball', { vol: 0.4 });
        if (a.dashTime > 0) this.ctx.vibrate(a.seat.id, 40);
      }
    }
    this.bpos.addScaledVector(this.bvel, dt);
    this.bvel.multiplyScalar(Math.exp(-1.1 * dt));
    // Golo?
    if (Math.abs(this.bpos.x) > HX + 0.3 && Math.abs(this.bpos.z) < GOAL) {
      const scoredBy = this.bpos.x > 0 ? 'blue' : 'red';
      this.goals[scoredBy]++;
      sound.play('cheer');
      sound.play('whistle');
      for (const a of this.actors) {
        const mine = a.seat.team === scoredBy;
        a.model.setAnim(mine ? 'cheer' : 'sad');
        this.ctx.vibrate(a.seat.id, mine ? 200 : 80);
      }
      this.showGoal(scoredBy);
      this.pause = 2;
      this.bvel.set(0, 0, 0);
      return;
    }
    // Paredes (fora das balizas)
    if (Math.abs(this.bpos.z) > HZ - BALL_R) {
      this.bpos.z = Math.sign(this.bpos.z) * (HZ - BALL_R);
      this.bvel.z *= -0.8;
      sound.play('bounce', { vol: 0.3 });
    }
    if (Math.abs(this.bpos.x) > HX - BALL_R && Math.abs(this.bpos.z) >= GOAL - 0.1) {
      this.bpos.x = Math.sign(this.bpos.x) * (HX - BALL_R);
      this.bvel.x *= -0.8;
      sound.play('bounce', { vol: 0.3 });
    }
  }

  private showGoal(team: 'blue' | 'red'): void {
    this.sign.clear();
    const flash = mesh(new THREE.TorusGeometry(2, 0.25, 8, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }), { cast: false });
    flash.rotation.y = Math.PI / 2;
    flash.position.set(team === 'blue' ? HX : -HX, 1.6, 0);
    this.sign.add(flash);
    if (!this.sign.parent) this.scene.add(this.sign);
    setTimeout(() => this.sign.clear(), 1800);
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.ball.position.copy(this.bpos);
    const sp = Math.hypot(this.bvel.x, this.bvel.z);
    this.ball.rotation.y += sp * dt * 1.5;
  }

  /** Bots: põem-se atrás da bola (do lado contrário à baliza que atacam) e chutam. */
  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const dir = this.attack(a);
    const goalX = dir * HX;
    const toGoal = new THREE.Vector2(goalX - this.bpos.x, -this.bpos.z).normalize();
    // Um defende (o mais perto da sua baliza) quando a bola está no seu meio-campo.
    const mates = this.actors.filter((o) => o.seat.team === a.seat.team);
    const keeper = mates.length > 1 && mates.reduce((k, o) => (Math.abs(o.pos.x + dir * HX) < Math.abs(k.pos.x + dir * HX) ? o : k)) === a;
    if (keeper && Math.sign(this.bpos.x) === -dir) {
      this.steer(a, -dir * (HX - 1.5), Math.max(-GOAL, Math.min(GOAL, this.bpos.z)));
      return;
    }
    const behind = { x: this.bpos.x - toGoal.x * 1.1, z: this.bpos.z - toGoal.y * 1.1 };
    const d = Math.hypot(behind.x - a.pos.x, behind.z - a.pos.z);
    if (d > 0.8) this.steer(a, behind.x, behind.z);
    else this.steer(a, this.bpos.x + toGoal.x, this.bpos.z + toGoal.y);
    const toBall = Math.hypot(this.bpos.x - a.pos.x, this.bpos.z - a.pos.z);
    if (toBall < 1.6 && d < 1.2 && this.ctx.rng.next() < 0.1 + this.ctx.botSkill * 0.15) pad.press('a');
  }
}

export const ShellSoccer: MinigameDef = {
  id: 'futebol',
  rounds: 1,
  name: 'Futebol de Carapaças',
  modes: ['teams'],
  description: () => 'Futebol com uma carapaça! Encosta-te para a levar e Ⓐ para um pontapé forte. Os azuis atacam para a direita, os vermelhos para a esquerda. Mais golos ganha (empate: golo de ouro)!',
  controls: '🕹️ Correr · Ⓐ Pontapé',
  stick: true,
  buttons: [{ id: 'a', label: 'Pontapé' }],
  create: (ctx) => new ShellSoccerRun(ctx),
};
