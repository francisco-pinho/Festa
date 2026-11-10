/**
 * Ténis em pares (2 contra 2). As personagens deslocam-se sozinhas; o jogador
 * só faz a raquetada. O momento da pancada decide o ângulo (cedo = cruzado para
 * um lado, tarde = para o outro) e a força decide a velocidade.
 *
 * Campo ao longo de Z: equipa 0 em z>0 (perto da câmara), equipa 1 em z<0. Rede em z=0.
 */
import * as THREE from 'three';
import { newScore, pointLabel, scorePoint, type Team, type TennisScore } from '@festa/game/sports/tennis';
import type { SwingInput } from '@festa/shared';
import { mesh, toon, toonUnique } from '../../three/materials';
import { SportStage } from '../SportStage';
import { botSwing, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const HALF_W = 5.5; // largura de pares
const HALF_L = 12;
const SERVICE = 6.4;
const NET_H = 0.95;
const G = 14;
const BALL_R = 0.09;
const REACH = 1.7;
const PLAYER_SPEED = 6.5;
const TEAM_NAMES: [string, string] = ['Azul', 'Vermelha'];
const TEAM_COLORS = ['#2f7dff', '#ff3b5c'];

interface Player {
  seat: Seat;
  team: Team;
  role: 'net' | 'back';
  pos: THREE.Vector3;
  home: THREE.Vector3;
  target: THREE.Vector3;
  racket: THREE.Group;
  swingAnim: number;
}

type Phase = 'idle' | 'serve' | 'rally' | 'over';

export class TennisStage extends SportStage {
  private readonly tplayers: Player[] = [];
  private readonly ball: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly ballVel = new THREE.Vector3();
  private phase: Phase = 'idle';
  private lastHitter: Player | null = null;
  private bounces = 0;
  private server: Player | null = null;
  private pointEnd: ((winner: Team, why: string) => void) | null = null;
  private readonly score: TennisScore = newScore(2);
  private offSwing: (() => void) | null = null;
  /** Pancadas no ponto atual (para depurar e para a câmara). */
  shots = 0;
  private botHesitated = -1;

  constructor(ctx: SportContext) {
    super(ctx);
    this.buildCourt();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.6, 12, 10), new THREE.MeshStandardMaterial({ color: '#d7f542', roughness: 0.6 }));
    this.ball.castShadow = true;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ball, this.shadow);

    // Equipas: lugares 0 e 2 = equipa 0; 1 e 3 = equipa 1 (dois humanos ficam em equipas diferentes).
    ctx.players.forEach((seat, i) => {
      const team = (i % 2) as Team;
      const role = i < 2 ? 'back' : 'net';
      const side = team === 0 ? 1 : -1;
      const home = role === 'back' ? new THREE.Vector3(0, 0, side * (HALF_L - 0.5)) : new THREE.Vector3(0, 0, side * 3.2);
      if (ctx.players.length > 2) home.x = role === 'back' ? -1.8 * side : 1.8 * side;
      const racket = this.makeRacket(TEAM_COLORS[team]!);
      const m = this.model(seat.id);
      m.root.add(racket);
      this.tplayers.push({ seat, team, role, pos: home.clone(), home, target: home.clone(), racket, swingAnim: 0 });
    });
  }

  async play(): Promise<SportStanding[]> {
    this.cameraTo({ x: 0, y: 12.5, z: 27 }, { x: 0, y: 0, z: -0.5 }, { instant: true });
    this.offSwing = this.ctx.hub.events.on('swing', ({ player, swing }) => {
      const p = this.tplayers.find((tp) => tp.seat.id === player.id);
      if (p) this.trySwing(p, swing);
    });
    for (const p of this.tplayers) {
      this.setLayout(p.seat, {
        kind: 'motion',
        action: 'swing',
        aim: false,
        prompt: `Equipa ${TEAM_NAMES[p.team]} · bate quando a bola chegar!`,
        hint: 'Cedo = bola cruzada · tarde = bola para o outro lado',
      });
    }
    await this.ctx.hud.banner('Ténis!', { sub: `Pares · ganha quem fizer ${this.score.gamesToWin} jogos`, hold: 2 });

    let serveTeam: Team = 0;
    let pointNo = 0;
    for (;;) {
      this.updateScoreboard();
      const winner = await this.playPoint(serveTeam, pointNo);
      const res = scorePoint(this.score, winner);
      pointNo++;
      this.updateScoreboard();
      for (const p of this.tplayers) this.model(p.seat.id).setAnim(p.team === winner ? 'cheer' : 'sad');
      for (const p of this.tplayers) if (p.team === winner) this.ctx.seats.vibrate(p.seat, 80);
      if (res.matchWon !== null) {
        await this.ctx.hud.banner(`Equipa ${TEAM_NAMES[res.matchWon]} ganha!`, { hold: 2.5, color: TEAM_COLORS[res.matchWon] });
        break;
      }
      if (res.gameWon !== null) {
        await this.ctx.hud.banner(`Jogo para a equipa ${TEAM_NAMES[res.gameWon]}!`, {
          sub: `Jogos ${this.score.games[0]}–${this.score.games[1]}`,
          hold: 2.2,
          color: TEAM_COLORS[res.gameWon],
        });
        serveTeam = serveTeam === 0 ? 1 : 0;
        pointNo = 0;
      } else {
        await this.ctx.hud.banner(pointLabel(this.score, TEAM_NAMES), { hold: 1.4 });
      }
      for (const p of this.tplayers) this.model(p.seat.id).setAnim('idle');
    }
    this.offSwing?.();
    const w = this.score.games[0] > this.score.games[1] ? 0 : 1;
    return this.tplayers.map((p) => ({
      id: p.seat.id,
      rank: p.team === w ? 1 : 2,
      score: `${this.score.games[p.team]}–${this.score.games[p.team === 0 ? 1 : 0]} em jogos`,
    }));
  }

  // ── Ponto ───────────────────────────────────────────────

  private playPoint(serveTeam: Team, pointNo: number): Promise<Team> {
    const side = pointNo % 2 === 0 ? 1 : -1; // lado direito / esquerdo
    for (const p of this.tplayers) {
      p.pos.copy(p.home);
      p.target.copy(p.home);
    }
    const server = this.tplayers.find((p) => p.team === serveTeam && p.role === 'back')!;
    const zSign = serveTeam === 0 ? 1 : -1;
    server.pos.set(side * 1.5 * zSign, 0, zSign * (HALF_L + 0.6));
    server.target.copy(server.pos);
    // Quem recebe fica na diagonal.
    const receiver = this.tplayers.find((p) => p.team !== serveTeam && p.role === 'back')!;
    receiver.target.set(-side * 2.2 * zSign, 0, -zSign * (HALF_L - 0.3));
    receiver.pos.copy(receiver.target);
    this.server = server;
    this.shots = 0;
    this.lastHitter = null;
    this.bounces = 0;
    this.ballVel.set(0, 0, 0);
    this.phase = 'serve';
    this.placeBallForServe();

    return new Promise<Team>((resolve) => {
      this.pointEnd = (winner, why) => {
        if (this.phase === 'over') return;
        this.phase = 'over';
        if (why) void this.ctx.hud.banner(why, { hold: 0.9 });
        void this.wait(1).then(() => resolve(winner));
      };
      // Bots (e humanos desligados) servem sozinhos.
      void (async () => {
        await this.wait(1.2);
        const deadline = 8;
        let waited = 0;
        while (this.phase === 'serve') {
          if (this.ctx.seats.isAuto(server.seat) || waited > deadline) {
            this.trySwing(server, botSwing(this.ctx.rng, 0.8));
            break;
          }
          await this.wait(0.1);
          waited += 0.1;
        }
      })();
    });
  }

  private placeBallForServe(): void {
    const s = this.server!;
    this.ball.position.set(s.pos.x + 0.4, 2.4, s.pos.z);
  }

  private trySwing(p: Player, s: SwingInput): void {
    p.swingAnim = 1;
    const m = this.model(p.seat.id);
    m.setAnim('hit');
    void this.wait(0.3).then(() => m.anim === 'hit' && m.setAnim('idle'));

    if (this.phase === 'serve') {
      if (p !== this.server) return;
      this.phase = 'rally';
      const zSign = p.team === 0 ? -1 : 1; // para o outro lado
      const sideX = -Math.sign(p.pos.x || 1) * 2.6;
      const target = new THREE.Vector3(sideX + s.dir * 0.8, 0, zSign * (SERVICE - 1.4 - s.power * 1.2));
      this.hitBall(p, target, 13 + s.power * 9, 2.4, 0.4);
      return;
    }
    if (this.phase !== 'rally' || this.lastHitter?.team === p.team) return;

    // Está ao alcance?
    const dx = this.ball.position.x - p.pos.x;
    const dz = this.ball.position.z - p.pos.z;
    const towards = p.team === 0 ? 1 : -1; // a bola vem nesta direção (z)
    const along = dz * -towards; // >0: a bola ainda não chegou ao jogador (cedo)
    if (Math.abs(dx) > REACH + 0.4 || Math.abs(dz) > REACH || this.ball.position.y > 2.8) return;
    if (this.bounces >= 2) return;

    const timing = THREE.MathUtils.clamp(along / REACH, -1, 1); // -1 tarde … 1 cedo
    const awaySign = p.team === 0 ? -1 : 1;
    const depth = 0.45 + s.power * 0.55; // fração do meio-campo
    const outRisk = s.power > 0.97 ? 1.6 : 0;
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(timing * HALF_W * 0.85 * awaySign * -1 + s.dir * 1.2, -HALF_W - 1, HALF_W + 1),
      0,
      awaySign * (HALF_L * depth + outRisk),
    );
    const weak = s.power < 0.12;
    this.hitBall(p, target, 11 + s.power * 12, weak ? 1.1 : 2.2 + s.spin * 0.6, s.spin);
    this.ctx.seats.vibrate(p.seat, 50);
  }

  /** Bate a bola em direção a `target` com uma velocidade horizontal e altura máxima aproximada. */
  private hitBall(p: Player, target: THREE.Vector3, speed: number, apex: number, _spin: number): void {
    const from = this.ball.position.clone();
    from.y = Math.max(0.8, from.y);
    this.ball.position.copy(from);
    const flat = new THREE.Vector2(target.x - from.x, target.z - from.z);
    const dist = flat.length();
    let T = dist / speed;
    // Garante que passa a rede se for uma pancada normal (apex alto).
    const vyFor = (t: number) => (BALL_R - from.y + 0.5 * G * t * t) / t;
    let vy = vyFor(T);
    const maxH = from.y + (vy * vy) / (2 * G);
    if (maxH < apex) {
      // mais alto → mais tempo no ar
      const vyApex = Math.sqrt(2 * G * Math.max(0.1, apex - from.y));
      T = (vyApex + Math.sqrt(vyApex * vyApex + 2 * G * (from.y - BALL_R))) / G;
      vy = vyApex;
    }
    this.ballVel.set(flat.x / T, vy, flat.y / T);
    this.lastHitter = p;
    this.bounces = 0;
    this.shots++;
  }

  // ── Simulação ───────────────────────────────────────────

  protected override tick(dt: number): void {
    // Movimento automático dos jogadores
    this.planMovement();
    for (const p of this.tplayers) {
      const d = p.target.clone().sub(p.pos);
      d.y = 0;
      const len = d.length();
      const m = this.model(p.seat.id);
      if (len > 0.05) {
        p.pos.addScaledVector(d.normalize(), Math.min(len, PLAYER_SPEED * dt));
        if (m.anim !== 'hit' && m.anim !== 'cheer' && m.anim !== 'sad') m.setAnim(len > 0.6 ? 'run' : 'walk');
      } else if (m.anim === 'run' || m.anim === 'walk') m.setAnim('idle');
      m.root.position.copy(p.pos);
      // Olha para a rede (e para a bola)
      m.faceTowards(this.ball.position.x, p.team === 0 ? p.pos.z - 10 : p.pos.z + 10);
      p.swingAnim = Math.max(0, p.swingAnim - dt * 4);
      p.racket.rotation.y = -p.swingAnim * 2.6;
    }

    if (this.phase === 'serve' && this.server) {
      this.placeBallForServe();
      this.ball.position.y = 2.2 + Math.abs(Math.sin(performance.now() / 300)) * 0.8;
    }
    if (this.phase === 'rally') this.simulateBall(dt);
    this.shadow.position.set(this.ball.position.x, 0.02, this.ball.position.z);
  }

  private planMovement(): void {
    if (this.phase !== 'rally' || !this.lastHitter) return;
    const receivingTeam: Team = this.lastHitter.team === 0 ? 1 : 0;
    // Onde a bola vai passar perto do chão (após o ressalto) — previsão simples.
    const intercept = this.predictIntercept();
    const team = this.tplayers.filter((p) => p.team === receivingTeam);
    const responsible = team.reduce((a, b) => (a.pos.distanceTo(intercept) < b.pos.distanceTo(intercept) ? a : b));
    for (const p of this.tplayers) {
      if (p === responsible) p.target.set(intercept.x, 0, THREE.MathUtils.clamp(intercept.z, -HALF_L - 2, HALF_L + 2));
      else p.target.copy(p.home);
    }
    // Bots: batem quando a bola está no sítio certo.
    if (this.ctx.seats.isAuto(responsible.seat) || responsible.seat.isBot) this.botMaybeHit(responsible);
  }

  private botMaybeHit(p: Player): void {
    const dx = this.ball.position.x - p.pos.x;
    const dz = this.ball.position.z - p.pos.z;
    const towards = p.team === 0 ? 1 : -1;
    const along = dz * -towards;
    if (Math.abs(dx) < REACH && along < 0.5 && along > -0.8 && this.ball.position.y < 2.4 && this.bounces < 2) {
      const rng = this.ctx.rng;
      // Quanto mais longa a troca de bolas, mais provável é errar.
      const missChance = 0.05 + this.shots * 0.012;
      if (rng.next() < missChance) {
        this.botHesitated = this.shots;
        return;
      }
      if (this.botHesitated === this.shots) return; // já decidiu falhar esta bola
      const wild = rng.next() < 0.05 + this.shots * 0.008; // pancada para fora
      this.trySwing(p, botSwing(rng, 0.75, { dir: (rng.next() - 0.5) * 0.6, ...(wild ? { power: 1 } : {}) }));
    }
  }

  private predictIntercept(): THREE.Vector3 {
    const pos = this.ball.position.clone();
    const vel = this.ballVel.clone();
    let bounces = this.bounces;
    for (let i = 0; i < 240; i++) {
      const h = 1 / 60;
      vel.y -= G * h;
      pos.addScaledVector(vel, h);
      if (pos.y < BALL_R) {
        pos.y = BALL_R;
        vel.y = -vel.y * 0.72;
        vel.x *= 0.9;
        vel.z *= 0.9;
        bounces++;
      }
      // Depois do ressalto, a uma altura boa para bater…
      if (bounces >= 1 && vel.y < 0 && pos.y < 1.4) break;
      // …ou no fundo do campo, se a bola vier rasante e comprida.
      if (Math.abs(pos.z) > HALF_L + 1) break;
    }
    pos.y = 0;
    pos.x = THREE.MathUtils.clamp(pos.x, -HALF_W - 1.5, HALF_W + 1.5);
    return pos;
  }

  private simulateBall(dt: number): void {
    const steps = 3;
    const h = dt / steps;
    for (let i = 0; i < steps && this.phase === 'rally'; i++) {
      const prevZ = this.ball.position.z;
      this.ballVel.y -= G * h;
      this.ball.position.addScaledVector(this.ballVel, h);
      const hitter = this.lastHitter;
      if (!hitter) return;
      const opp: Team = hitter.team === 0 ? 1 : 0;

      // Rede
      if (Math.sign(prevZ) !== Math.sign(this.ball.position.z) && Math.abs(this.ball.position.x) < HALF_W + 0.9 && this.ball.position.y < NET_H) {
        this.ballVel.set(0, -1, 0);
        this.pointEnd?.(opp, 'Rede!');
        return;
      }
      // Ressalto
      if (this.ball.position.y < BALL_R) {
        this.ball.position.y = BALL_R;
        this.ballVel.y = -this.ballVel.y * 0.72;
        this.ballVel.x *= 0.9;
        this.ballVel.z *= 0.9;
        this.bounces++;
        const { x, z } = this.ball.position;
        const onHitterSide = hitter.team === 0 ? z > 0 : z < 0;
        if (this.bounces === 1) {
          const out = Math.abs(x) > HALF_W || Math.abs(z) > HALF_L || onHitterSide;
          if (out) {
            this.pointEnd?.(opp, 'Fora!');
            return;
          }
        } else if (this.bounces >= 2) {
          this.pointEnd?.(hitter.team, '');
          return;
        }
      }
      // Passou pelos jogadores e saiu do campo depois de ressaltar
      if (this.bounces >= 1 && Math.abs(this.ball.position.z) > HALF_L + 4) {
        this.pointEnd?.(hitter.team, '');
        return;
      }
    }
  }

  private updateScoreboard(): void {
    this.ctx.hud.setRound(`Jogos ${this.score.games[0]}–${this.score.games[1]} · ${pointLabel(this.score, TEAM_NAMES)}`);
    this.scoreboard(this.tplayers.map((p) => ({ id: p.seat.id, text: p.team === 0 ? '🔵 Azul' : '🔴 Vermelha' })));
  }

  override dispose(): void {
    this.offSwing?.();
    super.dispose();
  }

  // ── Cenário ─────────────────────────────────────────────

  private makeRacket(color: string): THREE.Group {
    const g = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), toon('#2b1d3a'));
    handle.position.y = 0.22;
    const head = mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), toon(color));
    head.position.y = 0.62;
    const strings = mesh(new THREE.CircleGeometry(0.19, 16), toonUnique('#ffffff', { transparent: true, opacity: 0.5, side: THREE.DoubleSide }), { cast: false });
    strings.position.y = 0.62;
    g.add(handle, head, strings);
    g.position.set(-0.6, 0.8, 0.1);
    g.rotation.z = 0.4;
    return g;
  }

  private buildCourt(): void {
    const ground = mesh(new THREE.PlaneGeometry(60, 70), toon('#5aa864'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    const court = mesh(new THREE.PlaneGeometry(HALF_W * 2 + 4, HALF_L * 2 + 7), toon('#3f7dc4'), { cast: false, receive: true });
    court.rotation.x = -Math.PI / 2;
    this.scene.add(ground, court);

    const line = (w: number, l: number, x: number, z: number) => {
      const m = mesh(new THREE.PlaneGeometry(w, l), toon('#ffffff'), { cast: false });
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.005, z);
      this.scene.add(m);
    };
    const t = 0.08;
    for (const s of [-1, 1]) {
      line(HALF_W * 2, t, 0, s * HALF_L); // linhas de fundo
      line(t, HALF_L * 2, s * HALF_W, 0); // laterais (pares)
      line(t, HALF_L * 2, s * (HALF_W - 1.37), 0); // laterais (singulares)
      line((HALF_W - 1.37) * 2, t, 0, s * SERVICE); // linha de serviço
    }
    line(t, SERVICE * 2, 0, 0); // linha central de serviço

    // Rede
    const net = mesh(new THREE.BoxGeometry(HALF_W * 2 + 1.8, NET_H, 0.04), toonUnique('#f4f4f4', { transparent: true, opacity: 0.65 }), { cast: false });
    net.position.set(0, NET_H / 2, 0);
    const tape = mesh(new THREE.BoxGeometry(HALF_W * 2 + 1.8, 0.08, 0.06), toon('#ffffff'));
    tape.position.set(0, NET_H, 0);
    this.scene.add(net, tape);
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, NET_H + 0.1), toon('#2b1d3a'));
      post.position.set(s * (HALF_W + 0.9), (NET_H + 0.1) / 2, 0);
      this.scene.add(post);
    }
    // Bancadas simples
    for (const s of [-1, 1]) {
      const stand = mesh(new THREE.BoxGeometry(2, 1.5, HALF_L * 2), toon('#e8d3a2'), { receive: true });
      stand.position.set(s * (HALF_W + 5), 0.75, 0);
      this.scene.add(stand);
    }
  }
}
