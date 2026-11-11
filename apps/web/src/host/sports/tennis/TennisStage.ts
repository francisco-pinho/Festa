/**
 * Ténis em pares (2 contra 2) num estádio. As personagens correm sozinhas; o jogador
 * só faz a raquetada.
 *
 *  - Física da bola em @festa/game (ar, efeito Magnus, ressalto conforme o efeito).
 *  - Quem bate é quem chega primeiro a um ponto onde a bola se pode bater — incluindo
 *    os da rede (voleis) e smashes de bolas altas.
 *  - Gesto: momento (cedo = cruzada, tarde = paralela) e lado do gesto dão a direção;
 *    de baixo para cima = topspin, de cima para baixo = slice; força = velocidade.
 *  - Serviço com lançamento da bola; falta e dupla falta.
 *  - Estádio com público, árbitro de cadeira, apanha-bolas e placar.
 *
 * Campo ao longo de Z: equipa 0 em z>0 (perto da câmara), equipa 1 em z<0. Rede em z=0.
 */
import { sound } from '../../audio/Sound';
import * as THREE from 'three';
import { CHARACTERS } from '@festa/game';
import {
  TENNIS,
  inServiceBox,
  netClearance,
  newScore,
  planShot,
  pointLabel,
  scorePoint,
  stepBall,
  type BallState,
  type Team,
  type TennisScore,
  type V3,
} from '@festa/game/sports/tennis';
import type { SwingInput } from '@festa/shared';
import { CharacterModel } from '../../three/CharacterModel';
import { PROPS, pickProp, prop } from '../../three/props';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../../three/materials';
import { SportStage } from '../SportStage';
import type { SportContext, SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const { halfW: HALF_W, halfL: HALF_L, service: SERVICE, netH: NET_H, ballR: BALL_R } = TENNIS;
const REACH = 1.6;
const PLAYER_SPEED = 6.8;
const REACTION = 0.15;
const TEAM_NAMES: [string, string] = ['Azul', 'Vermelha'];
const TEAM_COLORS = ['#2f7dff', '#ff3b5c'];

interface Player {
  seat: Seat;
  team: Team;
  role: 'net' | 'back';
  pos: THREE.Vector3;
  home: THREE.Vector3;
  target: THREE.Vector3;
  /** Lado do corpo onde vai bater a próxima bola (1 = direita). */
  side: number;
}

interface Sample {
  t: number;
  p: V3;
  bounces: number;
}

type Phase = 'idle' | 'serve' | 'rally' | 'over';

export class TennisStage extends SportStage {
  private readonly tplayers: Player[] = [];
  private readonly ballMesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private ball: BallState = { p: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 0 }, spin: 0 };
  /**
   * Por onde a bola passou (último ~1,5 s). Quem joga de longe vê o ecrã atrasado: a pancada
   * dele é avaliada com a bola onde ele a viu, e não onde está agora (compensação de atraso).
   */
  private readonly ballTrail: { t: number; x: number; y: number; z: number }[] = [];
  private simTime = 0;
  private phase: Phase = 'idle';
  private lastHitter: Player | null = null;
  private bounces = 0;
  private server: Player | null = null;
  private secondServe = false;
  private tossT = 0;
  private pointEnd: ((winner: Team, why: string) => void) | null = null;
  private readonly score: TennisScore = newScore(2);
  private offSwing: (() => void) | null = null;
  shots = 0;
  private plan: { player: Player; sample: Sample } | null = null;
  private botSwung = -1;
  private readonly extras: CharacterModel[] = [];
  private umpire!: CharacterModel;
  private crowd!: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] };
  private excitement = 0.2;
  private board!: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };

  constructor(ctx: SportContext) {
    super(ctx);
    this.buildStadium();
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.6, 12, 10), new THREE.MeshStandardMaterial({ color: '#d7f542', roughness: 0.6 }));
    this.ballMesh.castShadow = true;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballMesh, this.shadow);

    // Equipas: lugares 0 e 2 = equipa 0; 1 e 3 = equipa 1 (dois humanos ficam em equipas diferentes).
    ctx.players.forEach((seat, i) => {
      const team = (i % 2) as Team;
      const role = i < 2 ? 'back' : 'net';
      const side = team === 0 ? 1 : -1;
      const home = role === 'back' ? new THREE.Vector3(0, 0, side * (HALF_L - 0.3)) : new THREE.Vector3(0, 0, side * 3.4);
      if (ctx.players.length > 2) home.x = role === 'back' ? -1.6 * side : 1.8 * side;
      const m = this.model(seat.id);
      m.attach(this.makeRacket(TEAM_COLORS[team]!), 'right');
      this.tplayers.push({ seat, team, role, pos: home.clone(), home, target: home.clone(), side: 1 });
    });
  }

  async play(): Promise<SportStanding[]> {
    this.cameraTo({ x: 14, y: 14, z: 26 }, { x: 0, y: 0, z: 0 }, { instant: true });
    this.cameraTo({ x: 0, y: 11, z: 25 }, { x: 0, y: 0, z: -1 }, { speed: 0.8 });
    // Pancadas com os botões (como no Mario Tennis): A normal, B slice, Y forte; o joystick dá a direção.
    const SHOTS = { a: { power: 0.72, spin: 0.45 }, b: { power: 0.6, spin: -0.7 }, y: { power: 1, spin: 0.1 } } as const;
    this.offSwing = this.ctx.hub.events.on('press', ({ player, button }) => {
      if (button !== 'a' && button !== 'b' && button !== 'y') return;
      const p = this.tplayers.find((tp) => tp.seat.id === player.id);
      if (!p || this.ctx.seats.isAuto(p.seat)) return;
      const shot = SHOTS[button];
      const dir = THREE.MathUtils.clamp(this.ctx.seats.pad(p.seat).stick.x * (p.team === 0 ? 1 : -1), -1, 1);
      this.trySwing(p, { t: 'swing', power: shot.power, dir, spin: shot.spin, source: 'key' }, player.lag);
    });
    for (const p of this.tplayers) {
      this.setLayout(p.seat, {
        kind: 'pad',
        title: `Equipa ${TEAM_NAMES[p.team]} · bate quando a bola chegar!`,
        sub: 'Joystick para o lado ao bater = direção · cedo = cruzada · tarde = paralela',
        stick: 'stick',
        stickLabel: 'Correr',
        buttons: { a: 'Batida', b: 'Slice', y: 'Forte', plus: 'Menu' },
      });
    }
    this.drawBoard();
    await this.ctx.hud.banner('Ténis!', { sub: `Pares · ganha quem fizer ${this.score.gamesToWin} jogos`, hold: 2 });

    let serveTeam: Team = 0;
    let pointNo = 0;
    for (;;) {
      this.updateScoreboard();
      const winner = await this.playPoint(serveTeam, pointNo);
      const res = scorePoint(this.score, winner);
      pointNo++;
      this.updateScoreboard();
      this.excitement = 1.6;
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
    this.secondServe = false;
    return new Promise<Team>((resolve) => {
      this.pointEnd = (winner, why) => {
        if (this.phase === 'over') return;
        this.phase = 'over';
        this.plan = null;
        if (why) void this.ctx.hud.banner(why, { hold: 0.9 });
        for (const p of this.tplayers) this.ctx.seats.vibrate(p.seat, p.team === winner ? 40 : [90, 40, 90]);
        sound.play('cheer', { vol: 0.5, pitch: 0.7 });
        void this.wait(1.1).then(() => resolve(winner));
      };
      this.setupServe(serveTeam, pointNo);
    });
  }

  private setupServe(serveTeam: Team, pointNo: number): void {
    const side = pointNo % 2 === 0 ? 1 : -1;
    for (const p of this.tplayers) {
      p.pos.copy(p.home);
      p.target.copy(p.home);
    }
    const zSign = serveTeam === 0 ? 1 : -1;
    const server = this.tplayers.find((p) => p.team === serveTeam && p.role === 'back')!;
    server.pos.set(side * 1.5 * zSign, 0, zSign * (HALF_L + 0.5));
    server.target.copy(server.pos);
    const receiver = this.tplayers.find((p) => p.team !== serveTeam && p.role === 'back')!;
    receiver.target.set(-side * 2.6 * zSign, 0, -zSign * (HALF_L - 0.2));
    receiver.pos.copy(receiver.target);
    this.server = server;
    this.shots = 0;
    this.lastHitter = null;
    this.bounces = 0;
    this.plan = null;
    this.ball = { p: { x: server.pos.x, y: 1, z: server.pos.z }, v: { x: 0, y: 0, z: 0 }, spin: 0 };
    this.ballTrail.length = 0;
    this.tossT = -0.6;
    this.phase = 'serve';
    // Bots (e humanos desligados) servem sozinhos perto do topo do lançamento.
    void (async () => {
      let waited = 0;
      while (this.phase === 'serve' && this.server === server) {
        await this.wait(1 / 30);
        waited += 1 / 30;
        const top = this.tossT > 0.5 && this.tossT < 0.62;
        if ((this.ctx.seats.isAuto(server.seat) && top && waited > 1.2) || waited > 9) {
          const rng = this.ctx.rng;
          this.trySwing(server, { t: 'swing', power: 0.55 + rng.next() * 0.35 * this.ctx.botSkill, dir: (rng.next() - 0.5) * 0.6, spin: 0.3, source: 'key' });
          break;
        }
      }
    })();
  }

  /** Posição da bola há `lag` segundos (ou a atual, se não houver registo). */
  private ballPast(lag: number): { x: number; y: number; z: number } {
    const at = this.simTime - lag;
    for (let i = this.ballTrail.length - 1; i >= 0; i--) if (this.ballTrail[i]!.t <= at) return this.ballTrail[i]!;
    return this.ball.p;
  }

  private trySwing(p: Player, s: SwingInput, lag = 0): void {
    const m = this.model(p.seat.id);
    if (this.phase === 'serve') {
      if (p !== this.server) return;
      m.setAnim('serve');
      // Bater no topo do lançamento dá o melhor serviço.
      const toss = this.tossT - lag;
      const quality = toss > 0 ? 1 - Math.min(1, Math.abs(toss - 0.56) / 0.35) : 0;
      if (quality <= 0) return; // bola ainda não está no ar
      this.phase = 'rally';
      const zSign = p.team === 0 ? -1 : 1;
      const boxX = -Math.sign(p.pos.x || 1) * (TENNIS.singlesW * 0.55);
      const depth = SERVICE - 0.8 - (1 - quality) * 1.2 + (s.power > 0.95 ? 1.2 : 0);
      const target = { x: boxX + s.dir * 1.3 + (1 - quality) * (this.ctx.rng.next() - 0.5) * 2.5, z: zSign * depth };
      const spin = this.secondServe ? 0.8 : 0.25;
      this.hit(p, target, (this.secondServe ? 15 : 18) + s.power * 10 * quality, spin, true);
      return;
    }
    if (this.phase !== 'rally' || this.lastHitter?.team === p.team || this.bounces >= 2) {
      m.setAnim(p.side > 0 ? 'hook' : 'backhand');
      return;
    }
    const b = lag > 0 ? this.ballPast(lag) : this.ball.p;
    const towards = p.team === 0 ? 1 : -1;
    const onMySide = Math.sign(b.z) === towards;
    const dx = b.x - p.pos.x;
    const dz = b.z - p.pos.z;
    const flat = Math.hypot(dx, dz);
    if (!onMySide || flat > REACH + 0.3 || b.y > 3.2 || b.y < 0.1) {
      m.setAnim(dx * towards * -1 > 0 ? 'hook' : 'backhand');
      return;
    }
    // Momento: a bola ainda vem a caminho (cedo) ou já passou (tarde).
    const along = dz * -towards;
    const timing = THREE.MathUtils.clamp(along / REACH, -1, 1);
    const awaySign = -towards;
    const smash = b.y > 2.2;
    const volley = this.bounces === 0;
    const power = Math.max(0, Math.min(1, s.power));
    const depth = smash ? 0.65 : volley ? 0.45 + power * 0.35 : 0.5 + power * 0.6;
    const target = {
      x: THREE.MathUtils.clamp((timing * 0.8 - s.dir * 0.6 * towards) * HALF_W * 0.9, -HALF_W - 1.2, HALF_W + 1.2),
      z: awaySign * HALF_L * depth,
    };
    const spin = smash ? 0 : THREE.MathUtils.clamp(s.spin, -1, 1);
    const speed = smash ? 26 + power * 6 : (13 + power * 13) * (volley ? 0.8 : 1) + spin * 2;
    if (power < 0.12) target.z = awaySign * 0.6; // pancada fraca: vai à rede
    this.hit(p, target, speed, spin, power >= 0.12);
    m.setAnim(smash ? 'serve' : p.side > 0 ? 'hook' : 'backhand');
    this.ctx.seats.vibrate(p.seat, smash ? [60, 30, 120] : 50);
    if (smash) this.excitement = 1.2;
  }

  /** Bate a bola para `target`; se `clear`, garante que passa a rede. */
  private hit(p: Player, target: { x: number; z: number }, speed: number, spin: number, clear: boolean): void {
    const from: V3 = { x: this.ball.p.x, y: Math.max(0.5, this.ball.p.y), z: this.ball.p.z };
    let v = planShot(from, target, speed, spin);
    for (let i = 0; clear && i < 5; i++) {
      const c = netClearance(from, v, spin);
      if (c === null || c > 0.15) break;
      speed *= 0.88;
      v = planShot(from, target, speed, spin);
    }
    this.ball = { p: from, v, spin };
    this.lastHitter = p;
    sound.play('ball', { pitch: 0.9 + Math.min(0.4, speed / 80) });
    this.bounces = 0;
    this.shots++;
    this.computePlan();
  }

  // ── Quem bate: o primeiro que chega a um ponto bom ──────

  private predict(): Sample[] {
    const s: BallState = { p: { ...this.ball.p }, v: { ...this.ball.v }, spin: this.ball.spin };
    let bounces = this.bounces;
    const out: Sample[] = [];
    const dt = 1 / 60;
    for (let t = dt; t < 3; t += dt) {
      if (stepBall(s, dt)) bounces++;
      if (bounces >= 2) break;
      out.push({ t, p: { ...s.p }, bounces });
    }
    return out;
  }

  private computePlan(): void {
    const hitter = this.lastHitter;
    if (!hitter) return;
    const team = this.tplayers.filter((p) => p.team !== hitter.team);
    const samples = this.predict();
    let best: { player: Player; sample: Sample } | null = null;
    for (const p of team) {
      const towards = p.team === 0 ? 1 : -1;
      for (const s of samples) {
        if (Math.sign(s.p.z) !== towards) continue;
        if (s.p.y < 0.3 || s.p.y > 2.9) continue;
        if (s.bounces === 0 && Math.abs(s.p.z) > HALF_L - 1) continue; // deixa ressaltar ao fundo
        const run = Math.max(0, Math.hypot(s.p.x - p.pos.x, s.p.z - p.pos.z) - REACH * 0.6);
        // Voleis só de bolas que passam perto (não se atravessa o campo para volear).
        if (s.bounces === 0 && run > 1.2) continue;
        if (REACTION + run / PLAYER_SPEED <= s.t) {
          if (!best || s.t < best.sample.t) best = { player: p, sample: s };
          break;
        }
      }
    }
    // Ninguém chega: o mais perto tenta na mesma (o ponto acaba).
    if (!best) {
      const last = samples[samples.length - 1];
      if (last) {
        const p = team.reduce((a, b) => (Math.hypot(a.pos.x - last.p.x, a.pos.z - last.p.z) < Math.hypot(b.pos.x - last.p.x, b.pos.z - last.p.z) ? a : b));
        best = { player: p, sample: last };
      }
    }
    this.plan = best;
    this.botSwung = -1;
    if (best) {
      const p = best.player;
      const right = p.team === 0 ? 1 : -1; // x do lado direito
      p.side = (best.sample.p.x - p.pos.x) * right >= -0.3 ? 1 : -1;
    }
  }

  // ── Simulação ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    this.planMovement();
    for (const p of this.tplayers) {
      const d = p.target.clone().sub(p.pos);
      d.y = 0;
      const len = d.length();
      const m = this.model(p.seat.id);
      const busy = ['hook', 'backhand', 'serve', 'cheer', 'sad'].includes(m.anim);
      const facing = p.team === 0 ? -1 : 1;
      if (len > 0.05) {
        const step = d.normalize().multiplyScalar(Math.min(len, PLAYER_SPEED * dt));
        p.pos.add(step);
        if (!busy) {
          const lateral = Math.abs(step.x) > Math.abs(step.z) * 1.4;
          const rightward = step.x * -facing > 0;
          m.setAnim(lateral && len < 4 ? (rightward ? 'strafeRight' : 'strafeLeft') : len > 0.6 ? 'run' : 'walk');
        }
      } else if (['run', 'walk', 'strafeLeft', 'strafeRight'].includes(m.anim)) m.setAnim('idle');
      m.root.position.copy(p.pos);
      m.faceTowards(p.pos.x + (this.ball.p.x - p.pos.x) * 0.3, p.pos.z + facing * 10);
    }

    if (this.phase === 'serve' && this.server) {
      // Lançamento da bola: sobe e desce em ciclo até haver serviço.
      this.tossT += dt;
      if (this.tossT > 1.25) this.tossT = -0.5;
      const s = this.server;
      const k = Math.max(0, this.tossT);
      const y = this.tossT < 0 ? 1.1 : 1.1 + 4.2 * k - 3.6 * k * k * 1.4;
      this.ball.p = { x: s.pos.x + 0.35, y: Math.max(1.1, y), z: s.pos.z - (s.team === 0 ? 0.3 : -0.3) };
    }
    if (this.phase === 'rally') this.simulateBall(dt);
    const b = this.ball.p;
    this.ballMesh.position.set(b.x, b.y, b.z);
    this.shadow.position.set(b.x, 0.02, b.z);
    // A câmara acompanha um pouco a bola.
    if (this.phase === 'rally' || this.phase === 'serve') this.cameraTo({ x: b.x * 0.25, y: 11, z: 25 }, { x: b.x * 0.35, y: 0, z: -1 }, { speed: 1.5 });
    this.updateCrowd(dt, time);
    this.umpire.update(dt);
    this.umpire.faceTowards(b.x, b.z);
    for (const e of this.extras) e.update(dt);
  }

  private planMovement(): void {
    if (this.phase !== 'rally' || !this.lastHitter) return;
    const plan = this.plan;
    for (const p of this.tplayers) {
      if (plan && p === plan.player) {
        const right = p.team === 0 ? 1 : -1;
        const s = plan.sample.p;
        p.target.set(s.x - p.side * right * 0.75, 0, s.z + (p.team === 0 ? 0.2 : -0.2));
      } else p.target.copy(p.home);
    }
    if (plan && this.ctx.seats.isAuto(plan.player.seat)) this.botMaybeHit(plan.player);
    this.stickMovement();
  }

  /**
   * Jogadores humanos correm com o joystick (direções do ecrã: a câmara está sempre do mesmo lado).
   * Só os bots se posicionam sozinhos. Cada um fica no seu meio-campo.
   */
  private stickMovement(): void {
    if (this.phase !== 'rally') return;
    for (const p of this.tplayers) {
      if (this.ctx.seats.isAuto(p.seat)) continue;
      const st = this.ctx.seats.pad(p.seat).stick;
      const mag = Math.hypot(st.x, st.y);
      if (mag < 0.15) {
        p.target.copy(p.pos);
        continue;
      }
      const k = Math.min(1, mag) / mag;
      const near = p.team === 0 ? 1 : -1;
      p.target.set(
        THREE.MathUtils.clamp(p.pos.x + st.x * k * 1.5, -HALF_W - 3, HALF_W + 3),
        0,
        near > 0
          ? THREE.MathUtils.clamp(p.pos.z + st.y * k * 1.5, 0.8, HALF_L + 3)
          : THREE.MathUtils.clamp(p.pos.z + st.y * k * 1.5, -HALF_L - 3, -0.8),
      );
      // Lado da pancada: direita ou esquerda conforme a bola.
      const right = p.team === 0 ? 1 : -1;
      p.side = (this.ball.p.x - p.pos.x) * right >= -0.3 ? 1 : -1;
    }
  }

  private botMaybeHit(p: Player): void {
    if (this.botSwung === this.shots) return;
    const b = this.ball.p;
    const dx = b.x - p.pos.x;
    const dz = b.z - p.pos.z;
    const towards = p.team === 0 ? 1 : -1;
    if (Math.sign(b.z) !== towards || Math.hypot(dx, dz) > REACH || b.y < 0.25 || b.y > 3 || this.bounces >= 2) return;
    // Espera pelo ponto previsto (a bola a chegar ao jogador).
    if (dz * -towards > 0.35) return;
    this.botSwung = this.shots;
    const rng = this.ctx.rng;
    const skill = this.ctx.botSkill;
    const missChance = (0.04 + this.shots * 0.012) * (1.6 - skill);
    if (rng.next() < missChance) return;
    const wild = rng.next() < (0.04 + this.shots * 0.008) * (1.5 - skill);
    const spin = (rng.next() - 0.3) * 1.2 * skill;
    this.trySwing(p, {
      t: 'swing',
      power: wild ? 1 : 0.35 + rng.next() * 0.5,
      dir: (rng.next() - 0.5) * 1.4,
      spin: THREE.MathUtils.clamp(spin, -1, 1),
      source: 'key',
    });
  }

  private simulateBall(dt: number): void {
    this.simTime += dt;
    this.ballTrail.push({ t: this.simTime, ...this.ball.p });
    while (this.ballTrail.length && this.ballTrail[0]!.t < this.simTime - 1.5) this.ballTrail.shift();
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps && this.phase === 'rally'; i++) {
      const prevZ = this.ball.p.z;
      const bounced = stepBall(this.ball, h);
      const hitter = this.lastHitter;
      if (!hitter) return;
      const opp: Team = hitter.team === 0 ? 1 : 0;
      const b = this.ball.p;
      // Rede
      if (Math.sign(prevZ) !== Math.sign(b.z) && Math.abs(b.x) < HALF_W + 0.9 && b.y < NET_H) {
        this.ball.v = { x: 0, y: -1, z: 0 };
        if (this.shots === 1 && hitter === this.server) return this.fault('Rede!');
        this.pointEnd?.(opp, 'Rede!');
        return;
      }
      if (bounced) {
        this.bounces++;
        sound.play('bounce', { vol: 0.7 });
        const onHitterSide = hitter.team === 0 ? b.z > 0 : b.z < 0;
        if (this.bounces === 1) {
          if (this.shots === 1 && hitter === this.server) {
            if (!inServiceBox(b.x, b.z, hitter.team === 0 ? -1 : 1, hitter.pos.x)) return this.fault('Falta!');
          } else if (Math.abs(b.x) > HALF_W || Math.abs(b.z) > HALF_L || onHitterSide) {
            this.excitement = 0.8;
            this.pointEnd?.(opp, 'Fora!');
            return;
          }
        } else if (this.bounces >= 2) {
          this.pointEnd?.(hitter.team, '');
          return;
        }
      }
      if (this.bounces >= 1 && (Math.abs(b.z) > HALF_L + 6 || Math.abs(b.x) > HALF_W + 6)) {
        this.pointEnd?.(hitter.team, '');
        return;
      }
    }
  }

  /** Serviço falhado: segundo serviço, ou dupla falta (ponto para o outro lado). */
  private fault(why: string): void {
    const server = this.server!;
    if (this.secondServe) {
      this.pointEnd?.(server.team === 0 ? 1 : 0, 'Dupla falta!');
      return;
    }
    this.phase = 'idle';
    void this.ctx.hud.banner(why, { sub: '2.º serviço', hold: 0.9 });
    void this.wait(1.2).then(() => {
      if (this.phase !== 'idle') return;
      this.secondServe = true;
      this.lastHitter = null;
      this.bounces = 0;
      this.shots = 0;
      this.plan = null;
      for (const p of this.tplayers) if (p !== server) p.target.copy(p.pos);
      this.ball = { p: { x: server.pos.x, y: 1, z: server.pos.z }, v: { x: 0, y: 0, z: 0 }, spin: 0 };
      this.tossT = -0.6;
      this.phase = 'serve';
      void (async () => {
        let waited = 0;
        while (this.phase === 'serve') {
          await this.wait(1 / 30);
          waited += 1 / 30;
          const top = this.tossT > 0.5 && this.tossT < 0.62;
          if ((this.ctx.seats.isAuto(server.seat) && top && waited > 1) || waited > 9) {
            this.trySwing(server, { t: 'swing', power: 0.5, dir: 0, spin: 0.5, source: 'key' });
            break;
          }
        }
      })();
    });
  }

  private updateScoreboard(): void {
    this.ctx.hud.setRound(`Jogos ${this.score.games[0]}–${this.score.games[1]} · ${pointLabel(this.score, TEAM_NAMES)}`);
    this.scoreboard(this.tplayers.map((p) => ({ id: p.seat.id, text: p.team === 0 ? '🔵 Azul' : '🔴 Vermelha' })));
    this.drawBoard();
  }

  private updateCrowd(dt: number, time: number): void {
    this.excitement = Math.max(0.15, this.excitement - dt * 0.5);
    const { mesh: crowd, base, phase } = this.crowd;
    const m = new THREE.Matrix4();
    const hop = new THREE.Matrix4();
    for (let i = 0; i < base.length; i++) {
      hop.makeTranslation(0, Math.max(0, Math.sin(time * (3 + this.excitement * 3) + phase[i]!)) * 0.2 * this.excitement, 0);
      m.multiplyMatrices(hop, base[i]!);
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
  }

  override dispose(): void {
    this.offSwing?.();
    for (const e of this.extras) e.dispose();
    this.umpire.dispose();
    this.board.texture.dispose();
    super.dispose();
  }

  // ── Cenário ─────────────────────────────────────────────

  private makeRacket(color: string): THREE.Group {
    const g = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), toon('#2b1d3a'));
    handle.position.y = 0.12;
    const head = mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), toon(color));
    head.position.y = 0.48;
    const strings = mesh(new THREE.CircleGeometry(0.16, 16), toonUnique('#ffffff', { transparent: true, opacity: 0.5, side: THREE.DoubleSide }), { cast: false });
    strings.position.y = 0.48;
    g.add(handle, head, strings);
    return g;
  }

  private drawBoard(): void {
    const { canvas, texture } = this.board;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#0b1220';
    c.fillRect(0, 0, 1024, 320);
    c.font = 'bold 50px system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.fillStyle = '#d7f542';
    c.textAlign = 'center';
    c.fillText('🎾 FESTA OPEN', 512, 46);
    ([0, 1] as Team[]).forEach((t) => {
      const y = 140 + t * 100;
      c.fillStyle = '#16213a';
      c.fillRect(30, y - 42, 964, 84);
      c.textAlign = 'left';
      c.fillStyle = TEAM_COLORS[t]!;
      c.fillText(this.tplayers.filter((p) => p.team === t).map((p) => p.seat.name).join(' / ') || TEAM_NAMES[t], 50, y);
      c.textAlign = 'center';
      c.fillStyle = '#ffffff';
      c.fillText(String(this.score.games[t]), 790, y);
      c.fillStyle = '#ffd23f';
      const pts = this.score.points;
      const call = ['0', '15', '30', '40'];
      const label = pts[0] >= 3 && pts[1] >= 3 ? (pts[0] === pts[1] ? '40' : pts[t] > pts[t === 0 ? 1 : 0] ? 'AD' : '') : call[pts[t]] ?? '';
      c.fillText(label, 920, y);
    });
    texture.needsUpdate = true;
  }

  private buildStadium(): void {
    this.sun.intensity = 1.9;
    const ground = mesh(new THREE.PlaneGeometry(90, 100), toon('#3f8f4a'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    const apron = mesh(new THREE.PlaneGeometry(HALF_W * 2 + 8, HALF_L * 2 + 12), toon('#2f8a5a'), { cast: false, receive: true });
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    const court = mesh(new THREE.PlaneGeometry(HALF_W * 2 + 0.2, HALF_L * 2 + 0.2), toon('#3f7dc4'), { cast: false, receive: true });
    court.rotation.x = -Math.PI / 2;
    this.scene.add(ground, apron, court);

    const line = (w: number, l: number, x: number, z: number) => {
      const m = mesh(new THREE.PlaneGeometry(w, l), toon('#ffffff'), { cast: false });
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.005, z);
      this.scene.add(m);
    };
    const t = 0.08;
    for (const s of [-1, 1]) {
      line(HALF_W * 2, t, 0, s * HALF_L);
      line(t, HALF_L * 2, s * HALF_W, 0);
      line(t, HALF_L * 2, s * TENNIS.singlesW, 0);
      line(TENNIS.singlesW * 2, t, 0, s * SERVICE);
      line(t, 0.3, 0, s * (HALF_L - 0.15));
    }
    line(t, SERVICE * 2, 0, 0);

    // Rede com malha
    const netTex = document.createElement('canvas');
    netTex.width = netTex.height = 64;
    const nc = netTex.getContext('2d')!;
    nc.strokeStyle = '#ffffff';
    nc.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) {
      nc.beginPath();
      nc.moveTo(i, 0);
      nc.lineTo(i, 64);
      nc.moveTo(0, i);
      nc.lineTo(64, i);
      nc.stroke();
    }
    const tex = new THREE.CanvasTexture(netTex);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 5);
    const net = mesh(new THREE.PlaneGeometry(HALF_W * 2 + 1.8, NET_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, color: '#e8e8e8' }), { cast: false });
    net.position.set(0, NET_H / 2, 0);
    const tape = mesh(new THREE.BoxGeometry(HALF_W * 2 + 1.8, 0.08, 0.06), toon('#ffffff'));
    tape.position.set(0, NET_H, 0);
    this.scene.add(net, tape);
    for (const s of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.06, 0.06, NET_H + 0.1), toon('#2b1d3a'));
      post.position.set(s * (HALF_W + 0.9), (NET_H + 0.1) / 2, 0);
      this.scene.add(post);
    }

    // Placas de publicidade à volta do campo.
    const ads = ['FESTA', '🎾', 'OPEN', '⭐', 'FESTA'];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const board = mesh(new THREE.BoxGeometry(5, 0.9, 0.15), toonUnique(i % 2 ? '#1d3b7a' : '#2f7dff'));
        board.position.set(-10 + i * 5, 0.45, s * (HALF_L + 5.5));
        this.scene.add(board);
        const label = textSprite(ads[i]!, { height: 0.55, color: '#ffffff', stroke: '#1d3b7a' });
        (label.material as THREE.SpriteMaterial).depthTest = true;
        label.position.set(-10 + i * 5, 0.5, s * (HALF_L + 5.4));
        this.scene.add(label);
      }
    }

    // Bancadas com público (instanced) nos 4 lados.
    const spots: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const palette = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#4cd964', '#b36bff', '#ff9f43', '#f2f2f2'];
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stand = (cx: number, cz: number, rotY: number, width: number) => {
      for (let row = 0; row < 7; row++) {
        const off = new THREE.Vector3(0, 0.4 + row * 0.8, row * 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        const step = mesh(new THREE.BoxGeometry(width, 0.8, 1.4), toon(row % 2 ? '#3b4466' : '#4a5480'), { receive: true });
        step.position.set(cx + off.x, off.y, cz + off.z);
        step.rotation.y = rotY;
        this.scene.add(step);
        for (let i = 0; i < width / 0.95; i++) {
          if (rnd() < 0.12) continue;
          const local = new THREE.Vector3(-width / 2 + 0.5 + i * 0.95, 1.15 + row * 0.8, row * 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          spots.push(new THREE.Matrix4().makeTranslation(cx + local.x, local.y, cz + local.z));
          colors.push(new THREE.Color(palette[Math.floor(rnd() * palette.length)]!));
        }
      }
    };
    stand(-(HALF_W + 7), 0, -Math.PI / 2, HALF_L * 2 + 6);
    stand(HALF_W + 7, 0, Math.PI / 2, HALF_L * 2 + 6);
    stand(0, -(HALF_L + 7), Math.PI, HALF_W * 2 + 10);
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.28, 0.45, 4, 8), new THREE.MeshToonMaterial(), spots.length);
    spots.forEach((m, i) => {
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, colors[i]!);
    });
    this.scene.add(crowd);
    this.crowd = { mesh: crowd, base: spots, phase: spots.map(() => rnd() * Math.PI * 2) };

    // Árvores e candeeiros à volta do estádio.
    let tseed = 9;
    const trnd = () => ((tseed = (tseed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const th = (i / 26) * Math.PI * 2;
      const t = pickProp(PROPS.trees, trnd(), { height: 6 + trnd() * 4 });
      if (!t) break;
      t.position.set(Math.cos(th) * 27, 0, Math.sin(th) * 30);
      t.rotation.y = trnd() * 6;
      this.scene.add(t);
    }
    for (const [x, z] of [[-14, 18], [14, 18], [-14, -18], [14, -18]] as const) {
      const l = prop('kaykit-city/streetlight', { height: 7 });
      if (!l) break;
      l.position.set(x, 0, z);
      l.rotation.y = Math.atan2(-x, -z);
      this.scene.add(l);
    }
    // Placar ao fundo.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    const frame = mesh(new THREE.BoxGeometry(14.6, 5, 0.4), toon('#1b2033'));
    frame.position.z = -0.25;
    const holder = new THREE.Group();
    holder.add(frame, screen);
    holder.position.set(0, 10.5, -(HALF_L + 15));
    this.scene.add(holder);
    this.board = { canvas, texture };

    // Árbitro na cadeira alta, junto à rede.
    const used = new Set(this.players.map((p) => p.characterId));
    const free = CHARACTERS.filter((c) => !used.has(c.id));
    const pick = (i: number) => free[i % Math.max(1, free.length)] ?? CHARACTERS[i % CHARACTERS.length]!;
    const chair = new THREE.Group();
    const legs = mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), toon('#2a3048'));
    legs.position.y = 1.1;
    const seat = mesh(new THREE.BoxGeometry(1.1, 0.15, 1.1), toon('#ffffff'));
    seat.position.y = 2.25;
    const ladder = mesh(new THREE.BoxGeometry(0.5, 2.2, 0.08), toon('#8a8f99'));
    ladder.position.set(0, 1.1, 0.6);
    chair.add(legs, seat, ladder);
    chair.position.set(HALF_W + 2.4, 0, 0);
    this.scene.add(chair);
    this.umpire = new CharacterModel(pick(0));
    this.umpire.root.position.set(HALF_W + 2.4, 2.3, 0);
    this.umpire.setAnim('sit');
    this.scene.add(this.umpire.root);

    // Apanha-bolas: junto à rede e nos cantos do fundo.
    const kids: [number, number][] = [[-(HALF_W + 1.2), 0.6], [-(HALF_W + 2.5), -(HALF_L + 3)], [HALF_W + 2.5, -(HALF_L + 3)], [-(HALF_W + 2.5), HALF_L + 3]];
    kids.forEach(([x, z], i) => {
      const k = new CharacterModel(pick(i + 1));
      k.root.scale.setScalar(0.62);
      k.root.position.set(x, 0, z);
      k.faceTowards(0, 0);
      k.setAnim('crouch');
      this.scene.add(k.root);
      this.extras.push(k);
    });

    // Bolas de reserva num cesto junto ao árbitro.
    const basket = mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.45, 12, 1, true), toonUnique('#8a8f99', { side: THREE.DoubleSide }));
    basket.position.set(HALF_W + 3.4, 0.23, 1.2);
    this.scene.add(basket);
    for (let i = 0; i < 6; i++) {
      const b = mesh(new THREE.SphereGeometry(0.11, 8, 6), toon('#d7f542'));
      b.position.set(HALF_W + 3.4 + (i % 3 - 1) * 0.15, 0.45, 1.2 + (Math.floor(i / 3) - 0.5) * 0.15);
      this.scene.add(b);
    }
  }
}
