/**
 * «Volei de Praia» (equipas): rede ao meio, cada equipa no seu lado da areia. Uma sombra mostra
 * onde a bola vai cair: corre para lá e a bola é devolvida sozinha quando chega a ti.
 * Carrega em Ⓐ mesmo quando lhe tocas para um REMATE (salto e bola rápida e rasteira).
 * Se a bola cair no teu lado, ponto para os outros. Ganha a primeira equipa a 5 pontos.
 *
 * O campo cresce com o número de jogadores (cada um tem de cobrir mais ou menos a mesma área, para
 * haver pontos perdidos), tem as linhas de um campo a sério e o serviço é feito por um jogador
 * da equipa que serve, à vez, atrás da linha de fundo. Cenário: praia com mar ao fundo.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { PROPS, prop } from '../three/props';
import { ArenaMinigame, TEAM_COLORS, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const NET_H = 2.6;
const G = 14;
const POINTS = 5;
const REACH = 1.25;
/** Tempo do lançamento da bola ao ar antes do serviço. */
const TOSS = 0.7;

type Team = 'blue' | 'red';

class VolleyRun extends ArenaMinigame {
  protected readonly duration = 150;
  /** Meio comprimento (rede em x = 0) e meia largura do campo; crescem com os jogadores. */
  private readonly HX: number;
  private readonly HZ: number;
  private readonly ball: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly bpos = new THREE.Vector3();
  private readonly bvel = new THREE.Vector3();
  private readonly land = new THREE.Vector2();
  private readonly score = { blue: 0, red: 0 };
  private live = false;
  private pause = 2;
  private serve: Team = 'blue';
  /** Próximo a servir em cada equipa (roda a cada serviço ganho). */
  private readonly serverIdx = { blue: 0, red: 0 };
  private server: Actor | null = null;
  private lastSide: Team = 'blue';
  private touchCool = 0;
  private sign: THREE.Sprite | null = null;
  /** Quando cada um carregou em Ⓐ (remate se tocar na bola logo a seguir). */
  private readonly spikeAt = new Map<string, number>();
  /** Saltos (remate) e saltinhos (passe): tempo que falta e altura. */
  private readonly hops = new Map<string, { t: number; dur: number; h: number }>();
  private replaceAt = -1;

  constructor(ctx: MinigameContext) {
    super(ctx);
    // Ⓐ não dá arranque: só marca o remate.
    this.dashBoost = 1;
    this.dashCooldownTime = 0.15;
    const perTeam = Math.max(1, Math.ceil(ctx.seats.length / 2));
    this.HZ = 3.5 + perTeam * 1.0;
    this.HX = this.HZ * 1.8;
    const { HX, HZ } = this;

    this.buildBeach();

    // Linhas: fundo, laterais, linha central (debaixo da rede) e linhas de ataque.
    const lineMat = toon('#ffffff');
    const attack = HX / 3;
    for (const [w, d, x, z] of [
      [HX * 2, 0.12, 0, HZ],
      [HX * 2, 0.12, 0, -HZ],
      [0.12, HZ * 2, HX, 0],
      [0.12, HZ * 2, -HX, 0],
      [0.12, HZ * 2, 0, 0],
      [0.08, HZ * 2, attack, 0],
      [0.08, HZ * 2, -attack, 0],
    ] as const) {
      const l = mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat, { cast: false });
      l.position.set(x, 0.02, z);
      this.scene.add(l);
    }
    // Rede com postes e fita
    for (const z of [-HZ - 0.5, HZ + 0.5]) {
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, NET_H + 0.2, 10), toon('#e8e8e8'));
      post.position.set(0, (NET_H + 0.2) / 2, z);
      this.scene.add(post);
    }
    const net = mesh(new THREE.BoxGeometry(0.05, 1, HZ * 2 + 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }), { cast: false });
    net.position.set(0, NET_H - 0.5, 0);
    const tape = mesh(new THREE.BoxGeometry(0.08, 0.12, HZ * 2 + 1), toon('#ffffff'), { cast: false });
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
    // Câmara de lado, a ver o campo todo (afasta-se com o tamanho do campo).
    const dist = Math.max(15, HX * 1.55);
    this.camera.position.set(0, dist * 0.85, dist);
    this.camera.lookAt(0, 0.5, 0);
    this.setSign(`Azul ${this.score.blue} – ${this.score.red} Vermelho`);
  }

  /** Praia: areia larga, mar ao fundo (nunca lava), palmeiras e chapéus de sol à volta do campo. */
  private buildBeach(): void {
    const { HX, HZ } = this;
    const m = this.water.mesh.material as THREE.MeshStandardMaterial;
    m.color.set('#2fa9d6');
    m.emissive = new THREE.Color('#000000');
    this.water.mesh.position.y = -0.35;
    // Areia: vai de trás da câmara até ao mar, que fica ao fundo.
    const depth = HZ * 2 + 40;
    const sand = mesh(new THREE.BoxGeometry(HX * 2 + 70, 1, depth), toon('#f2d58b'), { cast: false, receive: true });
    sand.position.set(0, -0.5, HZ + 6 - depth / 2 + 20);
    this.scene.add(sand);
    // Faixa de areia molhada junto à água.
    const shoreZ = sand.position.z - depth / 2;
    const wet = mesh(new THREE.BoxGeometry(HX * 2 + 70, 1, 3), toon('#d9b56b'), { cast: false, receive: true });
    wet.position.set(0, -0.52, shoreZ + 1.5);
    this.scene.add(wet);
    // Palmeiras atrás do campo e dos lados; chapéus de sol e toalhas entre elas.
    const rng = this.ctx.rng;
    const spots: [number, number][] = [];
    for (let i = 0; i < 9; i++) spots.push([-HX - 10 + ((HX * 2 + 20) * i) / 8 + (rng.next() - 0.5) * 2, -HZ - 4 - rng.next() * 4]);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) spots.push([sx * (HX + 4 + rng.next() * 4), -HZ + i * HZ + (rng.next() - 0.5) * 2]);
    spots.forEach(([x, z], i) => {
      const umbrella = i % 3 === 1;
      const keys = umbrella ? PROPS.beach.filter((k) => k.includes('umbrella')) : PROPS.palms;
      const o = prop(keys[Math.floor(rng.next() * keys.length)]!, { height: umbrella ? 2.4 : 5 + rng.next() * 2 });
      if (!o) return;
      o.position.set(x, 0, z);
      o.rotation.y = rng.next() * Math.PI * 2;
      this.scene.add(o);
      if (umbrella) {
        const towel = mesh(new THREE.BoxGeometry(1, 0.03, 1.9), toonUnique(['#ff6b7a', '#3fa7ff', '#ffd23f', '#7be38a'][i % 4]!), { cast: false });
        towel.position.set(x + 1.2, 0.02, z + 0.4);
        towel.rotation.y = rng.next() * 0.6 - 0.3;
        this.scene.add(towel);
      }
    });
  }

  private side(team: Team): number {
    return team === 'blue' ? -1 : 1;
  }

  private teamSide(a: Actor): Team {
    return (a.seat.team ?? 'blue') as Team;
  }

  private mates(team: Team): Actor[] {
    return this.actors.filter((a) => this.teamSide(a) === team);
  }

  /**
   * Posição base de cada jogador: espalhados pelo seu meio campo numa grelha (filas junto à rede e
   * ao fundo), como numa formação de voleibol, em vez de todos na mesma linha.
   */
  private spotOf(a: Actor): { x: number; z: number } {
    const team = this.teamSide(a);
    const list = this.mates(team);
    const n = list.length;
    const i = list.indexOf(a);
    const rows = n <= 2 ? 1 : 2;
    const front = Math.ceil(n / rows);
    const row = rows === 1 ? 0 : i < front ? 0 : 1;
    const inRow = row === 0 ? front : n - front;
    const k = row === 0 ? i : i - front;
    const z = inRow === 1 ? 0 : (k / (inRow - 1) - 0.5) * this.HZ * 1.4;
    const depth = rows === 1 ? 0.5 : row === 0 ? 0.3 : 0.72;
    return { x: this.side(team) * this.HX * depth, z };
  }

  private placeTeams(): void {
    for (const a of this.actors) {
      const h = this.spotOf(a);
      a.pos.set(h.x, 0, h.z);
      a.vel.set(0, 0, 0);
      a.model.faceYaw(this.teamSide(a) === 'blue' ? Math.PI / 2 : -Math.PI / 2, true);
    }
    // Quem serve vai para trás da linha de fundo, com a bola na mão.
    const list = this.mates(this.serve);
    this.server = list[this.serverIdx[this.serve] % list.length] ?? null;
    if (this.server) {
      this.server.pos.set(this.side(this.serve) * (this.HX + 1), 0, this.HZ * 0.3);
      this.server.model.setAnim('idle');
    }
  }

  private setSign(text: string): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    this.sign = textSprite(text, { height: 0.9, color: '#ffffff', stroke: '#1d1433' });
    this.sign.position.set(0, 5.5, -this.HZ - 1);
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
    // Cada equipa no seu lado (não se passa a rede); quem serve pode estar atrás da linha.
    const s = this.side(this.teamSide(a));
    const minX = s < 0 ? -this.HX - 2.5 : 0.5;
    const maxX = s < 0 ? -0.5 : this.HX + 2.5;
    a.pos.x = Math.max(minX, Math.min(maxX, a.pos.x));
    a.pos.z = Math.max(-this.HZ - 2, Math.min(this.HZ + 2, a.pos.z));
  }

  /** Lança a bola de `from` para cair em (x, z), com uma altura máxima. */
  private launch(from: THREE.Vector3, x: number, z: number, peak: number): void {
    const up = Math.sqrt(2 * G * Math.max(0.5, peak - from.y));
    const tUp = up / G;
    const tDown = Math.sqrt((2 * peak) / G);
    const T = tUp + tDown;
    this.bpos.copy(from);
    this.bvel.set((x - from.x) / T, up, (z - from.z) / T);
    this.land.set(x, z);
  }

  /** Alvo ao calhas no campo do outro lado (às vezes perto das linhas, para ser difícil). */
  private targetFor(side: Team): { x: number; z: number } {
    const s = this.side(side);
    const r = this.ctx.rng;
    return { x: -s * (1.2 + r.next() * (this.HX - 1.4)), z: (r.next() * 2 - 1) * (this.HZ - 0.3) };
  }

  /** O jogador que serve bate na bola por cima da cabeça. */
  private serveBall(): void {
    const srv = this.server;
    const from = srv ? srv.pos.clone().setY(2.3) : new THREE.Vector3(this.side(this.serve) * (this.HX + 1), 2.3, 0);
    const t = this.targetFor(this.serve);
    this.launch(from, t.x, t.z, 6);
    this.lastSide = this.serve;
    this.live = true;
    this.touchCool = 0.5;
    if (srv) {
      srv.model.setAnim('uppercut');
      this.hop(srv, 0.45, 0.35);
      this.ctx.vibrate(srv.seat.id, 40);
    }
    sound.play('ball', { vol: 0.7 });
  }

  /** Salto (ou saltinho) de quem bate na bola. */
  private hop(a: Actor, dur: number, h: number): void {
    this.hops.set(a.seat.id, { t: dur, dur, h });
  }

  protected step(dt: number): void {
    for (const a of this.actors) {
      const hp = this.hops.get(a.seat.id);
      if (!hp) continue;
      hp.t -= dt;
      a.pos.y = hp.t > 0 ? Math.sin((1 - hp.t / hp.dur) * Math.PI) * hp.h : 0;
      if (hp.t <= 0) this.hops.delete(a.seat.id);
    }
    if (this.replaceAt >= 0 && this.elapsed >= this.replaceAt) {
      this.replaceAt = -1;
      this.placeTeams();
    }
    if (!this.live) {
      this.pause -= dt;
      // Quem serve atira a bola ao ar antes de lhe bater.
      if (this.server && this.replaceAt < 0) {
        const p = this.server.pos;
        const k = Math.max(0, Math.min(1, 1 - this.pause / TOSS));
        this.bpos.set(p.x - this.side(this.serve) * 0.3, 1.5 + Math.sin(k * Math.PI) * 1.4 + k * 0.6, p.z);
        if (k > 0 && k < 0.05) this.server.model.setAnim('throw');
      }
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
      const side: Team = this.bpos.x < 0 ? 'blue' : 'red';
      const hitter = this.mates(side).find((a) => Math.hypot(a.pos.x - this.bpos.x, a.pos.z - this.bpos.z) < REACH);
      if (hitter) {
        const pressedAt = this.spikeAt.get(hitter.seat.id) ?? -9;
        const spike = this.elapsed - pressedAt < 0.45 || (this.ctx.isBot(hitter.seat.id) && this.ctx.rng.next() < 0.2 + this.ctx.botSkill * 0.3);
        this.spikeAt.delete(hitter.seat.id);
        const t = this.targetFor(side);
        this.launch(this.bpos.clone().setY(Math.max(1.6, this.bpos.y)), t.x, t.z, spike ? NET_H + 0.9 : 5.5 + this.ctx.rng.next());
        if (spike) this.bvel.multiplyScalar(1.15);
        this.lastSide = side;
        this.touchCool = 0.4;
        // Remate: salto com o braço por cima; passe: braços à frente e um saltinho.
        hitter.model.setAnim(spike ? 'uppercut' : 'block');
        this.hop(hitter, spike ? 0.55 : 0.3, spike ? 1 : 0.25);
        sound.play(spike ? 'punch' : 'ball', { vol: 0.6 });
        this.ctx.vibrate(hitter.seat.id, spike ? 80 : 30);
        if (spike) this.float('💥 Remate!', this.bpos.x, this.bpos.y + 1.2, '#ffd23f', 0.6);
      }
    }
    // Caiu na areia?
    if (this.bpos.y <= 0.4) {
      const side: Team = this.bpos.x < 0 ? 'blue' : 'red';
      const out = Math.abs(this.bpos.x) > this.HX || Math.abs(this.bpos.z) > this.HZ;
      // Dentro: ponto para quem não é desse lado; fora: ponto para quem não bateu por último.
      const winner: Team = out ? (this.lastSide === 'blue' ? 'red' : 'blue') : side === 'blue' ? 'red' : 'blue';
      this.score[winner]++;
      this.live = false;
      // Quem ganha o ponto serve; se mudar de equipa a servir, roda quem serve nessa equipa.
      if (winner !== this.serve) this.serverIdx[winner]++;
      this.serve = winner;
      this.pause = 2.6;
      sound.play(out ? 'whistle' : 'bounce');
      for (const a of this.actors) {
        const mine = this.teamSide(a) === winner;
        a.model.setAnim(mine ? 'cheer' : 'sad');
        this.ctx.vibrate(a.seat.id, mine ? 100 : 40);
      }
      this.float(out ? 'Fora!' : 'Ponto!', this.bpos.x, 2, TEAM_COLORS[winner], 0.8);
      this.setSign(`Azul ${this.score.blue} – ${this.score.red} Vermelho`);
      if (this.score[winner] >= POINTS) return this.endGame();
      this.replaceAt = this.elapsed + 0.9;
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
    // Entre pontos a bola só aparece quando já está na mão de quem serve.
    this.ball.visible = this.live || (this.replaceAt < 0 && !!this.server);
    this.shadow.visible = this.live;
    this.shadow.position.set(this.land.x, 0.03, this.land.y);
    // A sombra cresce à medida que a bola desce.
    this.shadow.scale.setScalar(0.6 + Math.max(0, 1 - this.bpos.y / 8));
  }

  /** Bots: vão para onde a bola vai cair (se for no seu lado); senão, voltam ao seu sítio. */
  protected think(a: Actor): void {
    if (!this.live && a === this.server) return; // quem serve fica atrás da linha
    const team = this.teamSide(a);
    const s = this.side(team);
    const mates = this.mates(team);
    const mine = Math.sign(this.land.x) === s && this.live;
    // Vai o colega mais perto do sítio da queda.
    const dist = (o: Actor) => Math.hypot(o.pos.x - this.land.x, o.pos.z - this.land.y);
    const closest = mates.reduce((c, o) => (dist(o) < dist(c) ? o : c));
    if (mine && closest === a) {
      const err = (1 - this.ctx.botSkill) * Math.sin(this.elapsed * 1.3 + a.pos.x) * 1.3;
      this.steer(a, this.land.x, this.land.y + err);
    } else {
      const h = this.spotOf(a);
      this.steer(a, h.x, h.z, 0.6);
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
  props: [...PROPS.palms, ...PROPS.beach.filter((k) => k.includes('umbrella'))],
  create: (ctx) => new VolleyRun(ctx),
};
