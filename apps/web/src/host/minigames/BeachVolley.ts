/**
 * «Volei de Praia» (equipas): rede ao meio, cada equipa no seu lado da areia. Uma sombra mostra
 * onde a bola vai cair: corre para lá e a bola é devolvida sozinha quando chega a ti.
 * Carrega em Ⓐ mesmo quando lhe tocas para um REMATE (mais rápido e rasteiro, difícil de apanhar).
 * Se a bola cair no teu lado, ponto para os outros. Ganha a primeira equipa a 5 pontos.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, TEAM_COLORS, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const HX = 9; // meio comprimento (rede em x = 0)
const HZ = 5;
const NET_H = 2.6;
const G = 14;
const POINTS = 5;
const REACH = 1.25;

class VolleyRun extends ArenaMinigame {
  protected readonly duration = 120;
  private readonly ball: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly bpos = new THREE.Vector3();
  private readonly bvel = new THREE.Vector3();
  private readonly land = new THREE.Vector2();
  private readonly score = { blue: 0, red: 0 };
  private live = false;
  private pause = 1.5;
  private serve: 'blue' | 'red' = 'blue';
  private lastSide: 'blue' | 'red' = 'blue';
  private touchCool = 0;
  private sign: THREE.Sprite | null = null;
  /** Quando cada um carregou em Ⓐ (remate se tocar na bola logo a seguir). */
  private readonly spikeAt = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    // Ⓐ não dá arranque: só marca o remate.
    this.dashBoost = 1;
    this.dashCooldownTime = 0.15;
    const sand = mesh(new THREE.BoxGeometry(HX * 2 + 8, 1, HZ * 2 + 6), toon('#f2d58b'), { cast: false, receive: true });
    sand.position.y = -0.5;
    this.scene.add(sand);
    const lineMat = toon('#ffffff');
    for (const [w, d, x, z] of [
      [HX * 2, 0.1, 0, HZ],
      [HX * 2, 0.1, 0, -HZ],
      [0.1, HZ * 2, HX, 0],
      [0.1, HZ * 2, -HX, 0],
    ] as const) {
      const l = mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat, { cast: false });
      l.position.set(x, 0.02, z);
      this.scene.add(l);
    }
    // Rede
    for (const z of [-HZ - 0.4, HZ + 0.4]) {
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, NET_H + 0.2, 10), toon('#ffffff'));
      post.position.set(0, (NET_H + 0.2) / 2, z);
      this.scene.add(post);
    }
    const net = mesh(new THREE.BoxGeometry(0.05, 1, HZ * 2 + 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }), { cast: false });
    net.position.set(0, NET_H - 0.5, 0);
    const tape = mesh(new THREE.BoxGeometry(0.08, 0.12, HZ * 2 + 0.8), toon('#ffffff'), { cast: false });
    tape.position.set(0, NET_H, 0);
    this.scene.add(net, tape);
    // Bola às gomos e sombra de onde vai cair
    this.ball = mesh(new THREE.SphereGeometry(0.4, 18, 14), toonUnique('#ffffff'));
    const band = mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 20), toonUnique('#ffd23f'), { cast: false });
    const band2 = band.clone();
    band2.rotation.y = Math.PI / 2;
    band2.material = toonUnique('#3fa7ff');
    this.ball.add(band, band2);
    this.shadow = mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: '#1d1433', transparent: true, opacity: 0.35, depthWrite: false }), { cast: false });
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.scene.add(this.ball, this.shadow);
    this.spawnActors(4, () => ({ speed: 8 }));
    this.placeTeams();
    this.camera.position.set(0, 13, 15);
    this.camera.lookAt(0, 1, 0);
    this.setSign(`Azul ${this.score.blue} – ${this.score.red} Vermelho`);
  }

  private side(team: 'blue' | 'red'): number {
    return team === 'blue' ? -1 : 1;
  }

  private placeTeams(): void {
    for (const team of ['blue', 'red'] as const) {
      const list = this.actors.filter((a) => (a.seat.team ?? 'blue') === team);
      list.forEach((a, i) => {
        const k = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
        a.pos.set(this.side(team) * (HX * 0.5), 0, k * HZ * 1.2);
        a.vel.set(0, 0, 0);
        a.model.faceYaw(team === 'blue' ? Math.PI / 2 : -Math.PI / 2, true);
      });
    }
  }

  private setSign(text: string): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    this.sign = textSprite(text, { height: 0.9, color: '#ffffff', stroke: '#1d1433' });
    this.sign.position.set(0, 5.5, -HZ - 1);
    this.scene.add(this.sign);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: `🏐 ${this.score.blue}–${this.score.red}` }));
  }

  winners(): string[] {
    if (this.score.blue === this.score.red) return [];
    const team = this.score.blue > this.score.red ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override onDash(a: Actor): void {
    this.spikeAt.set(a.seat.id, this.elapsed);
    a.dashTime = 0;
  }

  protected override constrain(a: Actor): void {
    // Cada equipa no seu lado (não se passa a rede).
    const s = this.side((a.seat.team ?? 'blue') as 'blue' | 'red');
    const minX = s < 0 ? -HX - 2 : 0.5;
    const maxX = s < 0 ? -0.5 : HX + 2;
    a.pos.x = Math.max(minX, Math.min(maxX, a.pos.x));
    a.pos.z = Math.max(-HZ - 2, Math.min(HZ + 2, a.pos.z));
  }

  /** Lança a bola de `from` para cair em (x, z) do outro lado, com uma altura máxima. */
  private launch(from: THREE.Vector3, x: number, z: number, peak: number): void {
    const up = Math.sqrt(2 * G * Math.max(0.5, peak - from.y));
    const tUp = up / G;
    const tDown = Math.sqrt((2 * peak) / G);
    const T = tUp + tDown;
    this.bpos.copy(from);
    this.bvel.set((x - from.x) / T, up, (z - from.z) / T);
    this.land.set(x, z);
  }

  private serveBall(): void {
    const s = this.side(this.serve);
    const target = { x: -s * (2 + this.ctx.rng.next() * (HX - 3)), z: (this.ctx.rng.next() - 0.5) * HZ * 1.6 };
    this.launch(new THREE.Vector3(s * (HX - 1), 2.5, 0), target.x, target.z, 6);
    this.lastSide = this.serve;
    this.live = true;
    this.touchCool = 0.3;
    sound.play('whistle', { vol: 0.5 });
  }

  protected step(dt: number): void {
    if (!this.live) {
      this.pause -= dt;
      if (this.pause <= 0) this.serveBall();
      return;
    }
    this.touchCool -= dt;
    this.bvel.y -= G * dt;
    this.bpos.addScaledVector(this.bvel, dt);
    // Rede: se bater na rede, cai desse lado.
    if (Math.abs(this.bpos.x) < 0.3 && this.bpos.y < NET_H && Math.sign(this.bvel.x) !== 0) {
      this.bvel.x *= -0.3;
      this.bpos.x = Math.sign(this.bpos.x || -this.bvel.x) * 0.31;
    }
    // Toque: quem está perto quando a bola desce até à altura das mãos devolve-a.
    if (this.touchCool <= 0 && this.bvel.y < 0 && this.bpos.y < 2.4 && this.bpos.y > 0.6) {
      const side: 'blue' | 'red' = this.bpos.x < 0 ? 'blue' : 'red';
      const hitter = this.actors
        .filter((a) => (a.seat.team ?? 'blue') === side)
        .find((a) => Math.hypot(a.pos.x - this.bpos.x, a.pos.z - this.bpos.z) < REACH);
      if (hitter) {
        const pressedAt = this.spikeAt.get(hitter.seat.id) ?? -9;
        const spike = this.elapsed - pressedAt < 0.45 || (this.ctx.isBot(hitter.seat.id) && this.ctx.rng.next() < 0.2 + this.ctx.botSkill * 0.3);
        this.spikeAt.delete(hitter.seat.id);
        const s = this.side(side);
        const tx = -s * (1.5 + this.ctx.rng.next() * (HX - 2.5));
        const tz = (this.ctx.rng.next() - 0.5) * HZ * 1.7;
        this.launch(this.bpos.clone().setY(Math.max(1.6, this.bpos.y)), tx, tz, spike ? NET_H + 0.9 : 5.5 + this.ctx.rng.next());
        if (spike) this.bvel.multiplyScalar(1.15);
        this.lastSide = side;
        this.touchCool = 0.4;
        hitter.model.setAnim(spike ? 'punchRight' : 'jump');
        sound.play(spike ? 'punch' : 'ball', { vol: 0.6 });
        this.ctx.vibrate(hitter.seat.id, spike ? 80 : 30);
        if (spike) this.float('💥 Remate!', this.bpos.x, this.bpos.y + 1.2, '#ffd23f', 0.6);
      }
    }
    // Caiu na areia?
    if (this.bpos.y <= 0.4) {
      const side: 'blue' | 'red' = this.bpos.x < 0 ? 'blue' : 'red';
      const out = Math.abs(this.bpos.x) > HX || Math.abs(this.bpos.z) > HZ;
      // Dentro: ponto para quem não é desse lado; fora: ponto para quem não bateu por último.
      const winner: 'blue' | 'red' = out ? (this.lastSide === 'blue' ? 'red' : 'blue') : side === 'blue' ? 'red' : 'blue';
      this.score[winner]++;
      this.live = false;
      this.pause = 1.8;
      this.serve = winner;
      sound.play(out ? 'whistle' : 'bounce');
      for (const a of this.actors) {
        const mine = (a.seat.team ?? 'blue') === winner;
        a.model.setAnim(mine ? 'cheer' : 'sad');
        this.ctx.vibrate(a.seat.id, mine ? 100 : 40);
      }
      this.float(out ? 'Fora!' : 'Ponto!', this.bpos.x, 2, TEAM_COLORS[winner], 0.8);
      this.setSign(`Azul ${this.score.blue} – ${this.score.red} Vermelho`);
      if (this.score[winner] >= POINTS) return this.endGame();
      setTimeout(() => this.placeTeams(), 900);
    }
  }

  private readonly floaters: { s: THREE.Sprite; t: number }[] = [];

  /** Texto que sobe e desaparece. */
  private float(text: string, x: number, y: number, color: string, height: number): void {
    const s = textSprite(text, { height, color, stroke: '#1d1433' });
    s.position.set(x, y, 0);
    this.scene.add(s);
    this.floaters.push({ s, t: 0 });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.t += dt;
      f.s.position.y += dt * 1.3;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t / 1.2);
      if (f.t > 1.2) {
        this.scene.remove(f.s);
        disposeObject(f.s);
        this.floaters.splice(i, 1);
      }
    }
    this.ball.position.copy(this.bpos);
    this.ball.rotation.x += dt * 4;
    this.ball.visible = this.live || this.pause > 0.3;
    this.shadow.visible = this.live;
    this.shadow.position.set(this.land.x, 0.03, this.land.y);
    // A sombra cresce à medida que a bola desce.
    this.shadow.scale.setScalar(0.6 + Math.max(0, 1 - this.bpos.y / 8));
  }

  /** Bots: vão para onde a bola vai cair (se for no seu lado); senão, voltam ao seu sítio. */
  protected think(a: Actor): void {
    const team = (a.seat.team ?? 'blue') as 'blue' | 'red';
    const s = this.side(team);
    const mates = this.actors.filter((o) => o.seat.team === team);
    const mine = Math.sign(this.land.x) === s && this.live;
    // Vai o colega mais perto do sítio da queda.
    const closest = mates.reduce((c, o) => (Math.hypot(o.pos.x - this.land.x, o.pos.y - this.land.y) < Math.hypot(c.pos.x - this.land.x, c.pos.y - this.land.y) ? o : c));
    if (mine && closest === a) {
      const err = (1 - this.ctx.botSkill) * Math.sin(this.elapsed * 1.3 + a.pos.x) * 1.3;
      this.steer(a, this.land.x, this.land.y + err);
    } else {
      const k = mates.indexOf(a);
      this.steer(a, s * HX * 0.5, (mates.length === 1 ? 0 : k / (mates.length - 1) - 0.5) * HZ * 1.2, 0.6);
    }
  }
}

export const BeachVolley: MinigameDef = {
  id: 'volei',
  rounds: 1,
  name: 'Volei de Praia',
  modes: ['teams'],
  description: () =>
    'A sombra mostra onde a bola vai cair: corre para lá e devolves sozinho. Ⓐ quando tocas na bola = REMATE (rápido e rasteiro)! Se cair no teu lado, ponto para os outros. Ganha quem chegar a 5.',
  controls: '🕹️ Correr · Ⓐ Remate (ao tocar)',
  stick: true,
  buttons: [{ id: 'a', label: 'Remate' }],
  create: (ctx) => new VolleyRun(ctx),
};
