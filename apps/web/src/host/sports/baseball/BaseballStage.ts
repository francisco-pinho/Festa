/**
 * Basebol 3D, duas equipas, 3 entradas. Vista de trás da base (como o apanhador).
 * O lançador escolhe velocidade e sítio com o gesto; o batedor tem de acertar
 * no momento em que a bola chega. Os defesas são automáticos.
 */
import * as THREE from 'three';
import { applyPitch, battingTeam, newGame, swingOutcome, type BaseballGame, type PitchOutcome, type Team } from '@festa/game/sports/baseball';
import type { SwingInput } from '@festa/shared';
import { disposeObject, mesh, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import { botSwing, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const MOUND_Z = -18;
const BASE_D = 19.4; // 27,4 m entre bases → coordenadas da diamante
const BASES = [new THREE.Vector3(BASE_D, 0, -BASE_D), new THREE.Vector3(0, 0, -BASE_D * 2), new THREE.Vector3(-BASE_D, 0, -BASE_D)];
const FENCE = 95;
const WINDOW = 0.13;
const TEAM_NAMES: [string, string] = ['Azul', 'Vermelha'];
const TEAM_COLORS = ['#2f7dff', '#ff3b5c'];
const FIELD_SPOTS = [new THREE.Vector3(0, 0, MOUND_Z), new THREE.Vector3(-28, 0, -55), new THREE.Vector3(28, 0, -55), new THREE.Vector3(0, 0, -72), new THREE.Vector3(-14, 0, -30)];

export class BaseballStage extends SportStage {
  private readonly game: BaseballGame = newGame(3);
  private readonly teams: [Seat[], Seat[]] = [[], []];
  private readonly batterIdx = [0, 0];
  private readonly ball: THREE.Mesh;
  private readonly bat: THREE.Group;
  private readonly runnerTokens: THREE.Mesh[] = [];
  private readonly runsByPlayer = new Map<string, number>();

  constructor(ctx: SportContext) {
    super(ctx);
    ctx.players.forEach((p, i) => this.teams[(i % 2) as Team].push(p));
    for (const p of ctx.players) this.runsByPlayer.set(p.id, 0);
    this.buildField();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.scene.add(this.ball);
    this.bat = new THREE.Group();
    const stick = mesh(new THREE.CylinderGeometry(0.035, 0.06, 1, 10), toon('#c98b4f'));
    stick.position.y = 0.5;
    this.bat.add(stick);
    for (let b = 0; b < 3; b++) {
      const t = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), toonUnique('#ffffff'));
      t.visible = false;
      this.scene.add(t);
      this.runnerTokens.push(t);
    }
  }

  async play(): Promise<SportStanding[]> {
    this.cameraTo({ x: 0.9, y: 2.6, z: 5.5 }, { x: 0, y: 1.2, z: MOUND_Z }, { instant: true });
    await this.ctx.hud.banner('Basebol!', { sub: `${this.game.innings} entradas · ${TEAM_NAMES[0]} vs ${TEAM_NAMES[1]}`, hold: 2 });
    let lastHalf = -1;
    for (;;) {
      const halfKey = this.game.inning * 2 + this.game.half;
      if (halfKey !== lastHalf) {
        lastHalf = halfKey;
        await this.startHalf();
      }
      const res = await this.atBat();
      if (res.gameOver) break;
    }
    this.ctx.hud.setRound(null);
    const [r0, r1] = this.game.runs;
    const winner: Team | null = r0 === r1 ? null : r0 > r1 ? 0 : 1;
    if (winner !== null) await this.ctx.hud.banner(`Equipa ${TEAM_NAMES[winner]} ganha!`, { sub: `${r0}–${r1}`, hold: 2.5, color: TEAM_COLORS[winner] });
    return this.players.map((p, i) => {
      const team = (i % 2) as Team;
      return {
        id: p.id,
        rank: winner === null || team === winner ? 1 : 2,
        score: `${this.game.runs[team]}–${this.game.runs[team === 0 ? 1 : 0]} · ${this.runsByPlayer.get(p.id)} corrida(s)`,
      };
    });
  }

  private async startHalf(): Promise<void> {
    const bat = battingTeam(this.game);
    const field = (bat === 0 ? 1 : 0) as Team;
    // Defesas da equipa que não bate
    for (const m of this.models.values()) m.root.visible = false;
    this.teams[field].forEach((p, i) => {
      const m = this.model(p.id);
      m.root.visible = true;
      m.root.position.copy(FIELD_SPOTS[i % FIELD_SPOTS.length]!);
      m.faceYaw(0, true);
      m.setAnim('idle');
    });
    this.updateHud();
    await this.ctx.hud.banner(`Entrada ${this.game.inning} ${this.game.half === 0 ? '▲' : '▼'}`, {
      sub: `Bate a equipa ${TEAM_NAMES[bat]}`,
      hold: 1.8,
      color: TEAM_COLORS[bat],
    });
  }

  private currentBatter(): Seat {
    const team = battingTeam(this.game);
    const list = this.teams[team];
    return list[this.batterIdx[team]! % list.length]!;
  }

  private currentPitcher(): Seat {
    const field = battingTeam(this.game) === 0 ? 1 : 0;
    return this.teams[field][0]!;
  }

  /** Um lançamento. */
  private async atBat(): Promise<ReturnType<typeof applyPitch>> {
    const batter = this.currentBatter();
    const pitcher = this.currentPitcher();
    const bm = this.model(batter.id);
    bm.root.visible = true;
    bm.root.position.set(-0.9, 0, 0.2);
    bm.faceYaw(Math.PI / 2, true);
    bm.setAnim('idle');
    if (this.bat.parent !== bm.root) bm.root.add(this.bat);
    this.bat.position.set(-0.35, 1.1, 0.2);
    this.bat.rotation.set(0.4, 0, 0.9);
    const pm = this.model(pitcher.id);
    pm.root.position.set(0, 0, MOUND_Z);
    pm.faceYaw(0, true);
    this.cameraTo({ x: 0.9, y: 2.6, z: 5.5 }, { x: 0, y: 1.2, z: MOUND_Z }, { speed: 4 });
    this.updateHud();
    for (const p of this.players) {
      if (p.id !== batter.id && p.id !== pitcher.id) this.setLayout(p, { kind: 'wait', message: `${pitcher.name} lança a ${batter.name}` });
    }
    this.setLayout(batter, { kind: 'motion', action: 'bat', aim: false, prompt: 'Bate quando a bola chegar! ⚾', hint: 'Cedo = bola para a esquerda · tarde = para a direita' });

    // Lançamento
    const pitch = await this.ctx.seats.awaitSwing(pitcher, {
      layout: { kind: 'motion', action: 'pitch', aim: false, prompt: `Lança a ${batter.name}!`, hint: 'Força = velocidade · desvio = fora da zona' },
      bot: () => botSwing(this.ctx.rng, 0.7, { dir: (this.ctx.rng.next() - 0.5) * 1.3 }),
      botDelay: 0.9,
    });
    this.setLayout(pitcher, { kind: 'wait', message: 'Lá vai ela!' });
    pm.setAnim('hit');

    const outcome = await this.flyPitch(pitch, batter);
    pm.setAnim('idle');
    const res = applyPitch(this.game, outcome);
    await this.showOutcome(outcome, res, batter);
    // Acabou a vez deste batedor: passa ao seguinte da mesma equipa.
    if (res.event !== 'continue') {
      const team = res.halfOver ? (this.game.half === 0 ? 1 : 0) : battingTeam(this.game);
      this.batterIdx[team] = (this.batterIdx[team] ?? 0) + 1;
      if (res.runsScored) this.runsByPlayer.set(batter.id, (this.runsByPlayer.get(batter.id) ?? 0) + res.runsScored);
    }
    this.updateRunners();
    bm.root.visible = false;
    if (res.halfOver && !res.gameOver) await this.ctx.hud.banner('Três eliminados!', { sub: 'Trocam as equipas', hold: 1.6 });
    return res;
  }

  /** Anima o lançamento, ouve a tacada e devolve o resultado. */
  private async flyPitch(pitch: SwingInput, batter: Seat): Promise<PitchOutcome> {
    const speed = 24 + pitch.power * 18; // m/s
    const T = Math.abs(MOUND_Z) / speed;
    const zoneX = pitch.dir * 0.9;
    const inZone = Math.abs(zoneX) < 0.45;
    const curve = pitch.spin * 0.6;
    let swingAt: number | null = null;
    let swingPower = 0.6;
    const bm = this.model(batter.id);
    const doSwing = (power: number) => {
      if (swingAt !== null) return;
      swingAt = performance.now();
      swingPower = power;
      void this.tween(0.18, (t) => (this.bat.rotation.y = -t * 3), ease.out).then(() =>
        this.tween(0.3, (t) => (this.bat.rotation.y = -3 * (1 - t))),
      );
      bm.setAnim('hit');
    };
    const off = this.ctx.hub.events.on('swing', ({ player, swing }) => {
      if (player.id === batter.id) doSwing(swing.power);
    });
    const start = performance.now();
    const arrival = start + T * 1000;
    if (batter.isBot || this.ctx.seats.isAuto(batter)) {
      const rng = this.ctx.rng;
      const willSwing = rng.next() < (inZone ? 0.8 : 0.25);
      if (willSwing) {
        const err = (rng.next() - 0.5) * 0.24;
        void this.wait(Math.max(0, T + err)).then(() => doSwing(0.5 + rng.next() * 0.5));
      }
    }
    this.ball.visible = true;
    const from = new THREE.Vector3(0.2, 1.9, MOUND_Z + 0.5);
    await this.tween(T, (t) => {
      this.ball.position.set(from.x + (zoneX - from.x) * t + Math.sin(t * Math.PI) * curve, from.y + (0.9 - from.y) * t + Math.sin(t * Math.PI) * 0.4, from.z + (0.3 - from.z) * t);
    }, ease.linear);
    await this.wait(WINDOW + 0.05);
    off();
    bm.setAnim('idle');
    if (swingAt === null) {
      this.ball.visible = false;
      return inZone ? { kind: 'strike', swung: false } : { kind: 'ball' };
    }
    const timing = ((swingAt as number) - arrival) / 1000;
    const out = swingOutcome(timing, swingPower, this.ctx.rng.next(), WINDOW);
    if (out.kind === 'hit' || out.kind === 'out' || out.kind === 'foul') await this.flyHit(out, timing);
    this.ball.visible = false;
    return out;
  }

  /** Voo da bola depois da tacada. */
  private async flyHit(out: PitchOutcome, timing: number): Promise<void> {
    const rng = this.ctx.rng;
    // Cedo (timing<0) → esquerda; tarde → direita.
    let angle = THREE.MathUtils.clamp(timing / WINDOW, -1, 1) * 0.75 + (rng.next() - 0.5) * 0.3;
    let dist = 30;
    let apex = 12;
    if (out.kind === 'foul') {
      angle = Math.sign(angle || 1) * (0.95 + rng.next() * 0.3);
      dist = 25 + rng.next() * 20;
    } else if (out.kind === 'out') {
      dist = out.how === 'fly' ? 45 + rng.next() * 30 : 15 + rng.next() * 10;
      apex = out.how === 'fly' ? 20 : 1.5;
    } else if (out.kind === 'hit') {
      dist = out.bases === 4 ? FENCE + 10 + rng.next() * 15 : out.bases === 3 ? 78 : out.bases === 2 ? 62 : 32;
      apex = out.bases === 4 ? 28 : out.bases === 1 ? 5 : 14;
    }
    const target = new THREE.Vector3(Math.sin(angle) * dist, 0, -Math.cos(angle) * dist);
    const from = this.ball.position.clone();
    const T = 0.8 + dist / 40;
    // Câmara segue a bola
    this.cameraTo({ x: target.x * 0.25, y: 14, z: 12 }, { x: target.x * 0.6, y: 2, z: target.z * 0.6 }, { speed: 2 });
    // Defesa mais próxima corre para a bola
    const field = (battingTeam(this.game) === 0 ? 1 : 0) as Team;
    const fielder = this.teams[field].map((p) => this.model(p.id)).reduce((a, b) => (a.root.position.distanceTo(target) < b.root.position.distanceTo(target) ? a : b));
    const fFrom = fielder.root.position.clone();
    fielder.setAnim('run');
    fielder.faceTowards(target.x, target.z);
    await this.tween(T, (t) => {
      this.ball.position.set(from.x + (target.x - from.x) * t, from.y + (0.2 - from.y) * t + Math.sin(t * Math.PI) * apex, from.z + (target.z - from.z) * t);
      if (out.kind === 'out') fielder.root.position.lerpVectors(fFrom, target, Math.min(1, t * 1.1));
    }, ease.linear);
    fielder.setAnim(out.kind === 'out' ? 'cheer' : 'idle');
    await this.wait(0.6);
    fielder.root.position.copy(fFrom);
    fielder.setAnim('idle');
  }

  private async showOutcome(out: PitchOutcome, res: ReturnType<typeof applyPitch>, batter: Seat): Promise<void> {
    const bm = this.model(batter.id);
    const s = this.game.state;
    let text = '';
    let color = '#ffffff';
    switch (out.kind) {
      case 'ball':
        text = res.event === 'walk' ? 'Passeio!' : 'Bola';
        break;
      case 'strike':
        text = res.event === 'strikeout' ? 'Strikeout!' : out.swung ? 'Falhou! Strike' : 'Strike!';
        color = '#ff6b7a';
        break;
      case 'foul':
        text = 'Foul!';
        break;
      case 'out':
        text = out.how === 'fly' ? 'Apanhada! Eliminado' : 'Eliminado na base';
        color = '#ff6b7a';
        break;
      case 'hit':
        text = ['', 'Simples!', 'Duplo!', 'Triplo!', 'HOME RUN!'][out.bases]!;
        color = out.bases === 4 ? '#ffd23f' : '#7dff9b';
        bm.setAnim('cheer');
        this.ctx.seats.vibrate(batter, out.bases === 4 ? [100, 50, 100, 50, 400] : [80, 40, 80]);
        break;
    }
    const count = res.event === 'continue' ? `Bolas ${s.balls} · Strikes ${s.strikes}` : undefined;
    const runs = res.runsScored ? `+${res.runsScored} corrida${res.runsScored > 1 ? 's' : ''}!` : undefined;
    await this.ctx.hud.banner(text, { sub: runs ?? count, hold: out.kind === 'hit' ? 1.8 : 0.9, color });
    bm.setAnim('idle');
    this.updateHud();
  }

  private updateRunners(): void {
    const team = battingTeam(this.game);
    this.game.state.bases.forEach((on, i) => {
      const t = this.runnerTokens[i]!;
      t.visible = on;
      t.position.copy(BASES[i]!).setY(0.3);
      (t.material as THREE.MeshToonMaterial).color.set(TEAM_COLORS[team]!);
    });
  }

  private updateHud(): void {
    const s = this.game.state;
    const bases = s.bases.map((b) => (b ? '◆' : '◇')).join('');
    this.ctx.hud.setRound(
      `${TEAM_NAMES[0]} ${this.game.runs[0]} – ${this.game.runs[1]} ${TEAM_NAMES[1]} · Entrada ${this.game.inning}${this.game.half === 0 ? '▲' : '▼'} · ${s.outs} elim. · ${bases}`,
    );
    const batting = battingTeam(this.game);
    this.scoreboard(
      this.players.map((p, i) => ({
        id: p.id,
        text: `${i % 2 === 0 ? '🔵' : '🔴'} ${this.runsByPlayer.get(p.id) ?? 0}`,
        active: (i % 2) === batting,
      })),
    );
  }

  override dispose(): void {
    disposeObject(this.bat);
    super.dispose();
  }

  // ── Cenário ─────────────────────────────────────────────

  private buildField(): void {
    const flat = (geo: THREE.BufferGeometry, color: string, y: number) => {
      const m = mesh(geo, toonUnique(color), { cast: false, receive: true });
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      this.scene.add(m);
      return m;
    };
    flat(new THREE.PlaneGeometry(400, 400), '#3f8f3a', 0);
    // Relvado justo (setor de 90°)
    flat(new THREE.CircleGeometry(FENCE, 48, Math.PI / 4, Math.PI / 2), '#5cb84f', 0.01);
    // Terra do diamante
    flat(new THREE.CircleGeometry(BASE_D * 1.55, 40, Math.PI / 4, Math.PI / 2), '#c98b4f', 0.02);
    const grass = flat(new THREE.PlaneGeometry(BASE_D * 1.15, BASE_D * 1.15), '#5cb84f', 0.03);
    grass.rotation.z = Math.PI / 4;
    grass.position.z = -BASE_D;
    const mound = mesh(new THREE.CylinderGeometry(2, 2.6, 0.3, 24), toon('#c98b4f'), { cast: false, receive: true });
    mound.position.set(0, 0.15, MOUND_Z);
    this.scene.add(mound);
    const plate = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 5), toon('#ffffff'), { cast: false });
    plate.position.set(0, 0.04, 0);
    this.scene.add(plate);
    for (const b of BASES) {
      const base = mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), toon('#ffffff'));
      base.position.copy(b).setY(0.06);
      base.rotation.y = Math.PI / 4;
      this.scene.add(base);
    }
    // Linhas de foul
    for (const s of [-1, 1]) {
      const line = mesh(new THREE.PlaneGeometry(0.15, FENCE), toon('#ffffff'), { cast: false });
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = s * Math.PI / 4;
      line.position.set((s * FENCE) / 2 / Math.SQRT2, 0.04, -FENCE / 2 / Math.SQRT2);
      this.scene.add(line);
    }
    // Vedação
    const fence = mesh(new THREE.CylinderGeometry(FENCE, FENCE, 3, 64, 1, true, -Math.PI / 4 + Math.PI, Math.PI / 2), toonUnique('#2b5c8f', { side: THREE.DoubleSide }));
    fence.position.y = 1.5;
    this.scene.add(fence);
    // Bancadas atrás da base
    const stand = mesh(new THREE.BoxGeometry(40, 6, 4), toon('#4b2f7a'), { receive: true });
    stand.position.set(0, 3, 14);
    this.scene.add(stand);
  }
}
