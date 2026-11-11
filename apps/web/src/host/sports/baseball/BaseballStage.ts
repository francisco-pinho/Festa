/**
 * Basebol 3D num estádio completo: duas equipas, 3 entradas.
 *
 *  - Lançador: escolhe o tipo (rápida, curva, screwball, splitter) no telemóvel, aponta a zona
 *    com o joystick e lança com o gesto (força = velocidade). O efeito só aparece no fim.
 *  - Batedor: escolhe a altura do bastão com o joystick e bate de lado; o momento decide a
 *    direção (cedo = puxada, muito cedo/tarde = foul) e a altura decide rasteira/linha/alta.
 *  - A bola voa com física (gravidade, ar, ressaltos, vedação); 9 defesas correm, apanham e
 *    lançam para as bases; os corredores correm as bases. Defesa e corridas são automáticas.
 *  - Placar eletrónico, bancadas com público, banco das equipas, torres de luz,
 *    repetição dos home runs em câmara lenta e fogo de artifício.
 */
import { sound } from '../../audio/Sound';
import * as THREE from 'three';
import { CHARACTERS, getCharacter, type CharacterDef } from '@festa/game';
import {
  FIELD,
  PITCHES,
  PLAY,
  STRIKE_ZONE,
  applyPitch,
  basePos,
  batterBases,
  battedType,
  battingTeam,
  bestIntercept,
  contact,
  flightAt,
  inStrikeZone,
  newGame,
  pitchPath,
  pitchSpeed,
  simulateFlight,
  type BaseballGame,
  type Flight,
  type Intercept,
  type PitchOutcome,
  type PitchType,
  type Team,
  type Vec3,
} from '@festa/game/sports/baseball';
import { CharacterModel } from '../../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import type { SportContext, SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const MOUND_Z = -18;
const PLATE_Z = 0.3;
const RELEASE = { x: 0.35, y: 1.9, z: MOUND_Z + 0.8 };
const WINDOW = 0.13;
/** Atraso típico da rede (telemóvel → ecrã). */
const PHONE_LATENCY = 0.06;
const TEAM_NAMES: [string, string] = ['Azul', 'Vermelha'];
const TEAM_COLORS: [string, string] = ['#2f7dff', '#ff3b5c'];
const PITCH_IDS = Object.keys(PITCHES) as PitchType[];
/** Velocidade mostrada no placar (km/h) por unidade/s. */
const KMH = 4.2;

/** Posições da defesa: lançador, apanhador, 1.ª, 2.ª, 3.ª, defesa curto, esquerda, centro, direita. */
const POSITIONS: { id: string; at: Vec3 }[] = [
  { id: 'P', at: { x: 0, y: 0, z: MOUND_Z } },
  { id: 'C', at: { x: 0, y: 0, z: 1.3 } },
  { id: '1B', at: { x: 16.5, y: 0, z: -21 } },
  { id: '2B', at: { x: 8, y: 0, z: -33 } },
  { id: '3B', at: { x: -16.5, y: 0, z: -21 } },
  { id: 'SS', at: { x: -8, y: 0, z: -33 } },
  { id: 'LF', at: { x: -40, y: 0, z: -62 } },
  { id: 'CF', at: { x: 0, y: 0, z: -76 } },
  { id: 'RF', at: { x: 40, y: 0, z: -62 } },
];
/** Que posição cobre cada base (1.ª, 2.ª, 3.ª, casa). */
const COVER: Record<number, number[]> = { 1: [2], 2: [3, 5], 3: [4], 4: [1] };
/** Ordem em que os jogadores da equipa ocupam posições (o 1.º lança). */
const HUMAN_ORDER = [0, 7, 5, 2, 3, 4, 6, 8, 1];

interface Fielder {
  model: CharacterModel;
  home: THREE.Vector3;
  pos: THREE.Vector3;
}

interface Runner {
  model: CharacterModel;
  base: number;
}

export class BaseballStage extends SportStage {
  private readonly game: BaseballGame = newGame(3);
  private readonly teams: [Seat[], Seat[]] = [[], []];
  private readonly batterIdx: [number, number] = [0, 0];
  private readonly runsByPlayer = new Map<string, number>();
  private readonly lineScore: [number[], number[]] = [[], []];
  private readonly ball: THREE.Mesh;
  private readonly bat: THREE.Group;
  private readonly zoneFrame: THREE.LineSegments;
  private readonly zoneTarget: THREE.Mesh;
  private readonly batBar: THREE.Mesh;
  private readonly capMats = new Map<CharacterModel, THREE.MeshToonMaterial>();
  private readonly npcs: CharacterModel[] = [];
  private fielders: Fielder[] = [];
  private runners: (Runner | null)[] = [null, null, null];
  private readonly board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  private lastPitchText = '';
  private crowd!: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] };
  private excitement = 0.2;
  private readonly sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private readonly offs: (() => void)[] = [];

  // Estado do lançamento em curso
  private aiming: { seat: Seat; type: PitchType } | null = null;
  private target = new THREE.Vector3(0, 1.15, PLATE_Z);
  private batting: Seat | null = null;
  private batY = 1.15;
  private pitchT = -1;

  constructor(ctx: SportContext) {
    super(ctx);
    ctx.players.forEach((p, i) => this.teams[(i % 2) as Team].push(p));
    for (const p of ctx.players) this.runsByPlayer.set(p.id, 0);
    this.buildStadium();
    this.board = this.buildBoard();

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.scene.add(this.ball);

    this.bat = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 10), toon('#6b4423'));
    handle.position.y = 0.2;
    const barrel = mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.65, 12), toon('#d9a566'));
    barrel.position.y = 0.72;
    this.bat.add(handle, barrel);

    // Zona de strike, alvo do lançador e altura do bastão.
    const zw = STRIKE_ZONE.halfWidth;
    const pts = [
      [-zw, STRIKE_ZONE.bottom], [zw, STRIKE_ZONE.bottom], [zw, STRIKE_ZONE.bottom], [zw, STRIKE_ZONE.top],
      [zw, STRIKE_ZONE.top], [-zw, STRIKE_ZONE.top], [-zw, STRIKE_ZONE.top], [-zw, STRIKE_ZONE.bottom],
    ].flatMap(([x, y]) => [x!, y!, PLATE_Z]);
    const zg = new THREE.BufferGeometry();
    zg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.zoneFrame = new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    this.zoneFrame.visible = false;
    this.zoneTarget = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.11, 20), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8 }));
    this.zoneTarget.visible = false;
    this.batBar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: '#7dff9b', transparent: true, opacity: 0.55 }));
    this.batBar.visible = false;
    this.scene.add(this.zoneFrame, this.zoneTarget, this.batBar);

    // Defesas extra (personagens do estádio) para completar as 9 posições.
    const used = new Set(ctx.players.map((p) => p.characterId));
    const pool = [...CHARACTERS.filter((c) => !used.has(c.id)), ...CHARACTERS];
    const need = 9 - Math.min(this.teams[0].length, this.teams[1].length);
    for (let i = 0; i < need; i++) {
      const m = this.makeModel(pool[i % pool.length]!, TEAM_COLORS[0]);
      m.root.visible = false;
      this.npcs.push(m);
    }
    // Bonés das equipas nos jogadores.
    ctx.players.forEach((p, i) => this.addCap(this.model(p.id), TEAM_COLORS[i % 2]!));
  }

  // ── Jogo ────────────────────────────────────────────────

  async play(): Promise<SportStanding[]> {
    this.offs.push(
      this.ctx.hub.events.on('press', ({ player, button }) => {
        const a = this.aiming;
        if (!a || player.id !== a.seat.id || button !== 'x') return;
        a.type = PITCH_IDS[(PITCH_IDS.indexOf(a.type) + 1) % PITCH_IDS.length]!;
        this.setLayout(a.seat, this.pitchLayout(a.type));
        this.lastPitchText = `${PITCHES[a.type].emoji} ${PITCHES[a.type].label}`;
        this.drawBoard();
      }),
    );
    this.cameraTo({ x: 30, y: 30, z: 40 }, { x: 0, y: 0, z: -40 }, { instant: true });
    this.cameraTo({ x: 1.2, y: 4.2, z: 8 }, { x: -0.2, y: 0.8, z: -12 }, { speed: 0.7 });
    await this.ctx.hud.banner('Basebol!', { sub: `${this.game.innings} entradas · ${TEAM_NAMES[0]} vs ${TEAM_NAMES[1]}`, hold: 2.2 });
    let lastHalf = -1;
    for (;;) {
      const halfKey = this.game.inning * 2 + this.game.half;
      if (halfKey !== lastHalf) {
        lastHalf = halfKey;
        await this.startHalf();
      }
      const res = await this.pitchOnce();
      if (res.gameOver) break;
    }
    this.ctx.hud.setRound(null);
    const [r0, r1] = this.game.runs;
    const winner: Team | null = r0 === r1 ? null : r0 > r1 ? 0 : 1;
    this.drawBoard();
    if (winner !== null) {
      this.excitement = 2;
      for (const p of this.teams[winner]) this.model(p.id).setAnim('cheer');
      await this.ctx.hud.banner(`Equipa ${TEAM_NAMES[winner]} ganha!`, { sub: `${r0}–${r1}`, hold: 2.5, color: TEAM_COLORS[winner] });
    }
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
    this.clearRunners();
    for (const m of this.models.values()) m.root.visible = false;
    // Defesa: jogadores da equipa nas posições principais, o resto com personagens do estádio.
    this.fielders = [];
    const seats = this.teams[field];
    const byPos: CharacterModel[] = new Array(9);
    seats.slice(0, 9).forEach((s, i) => (byPos[HUMAN_ORDER[i]!] = this.model(s.id)));
    let n = 0;
    for (let i = 0; i < 9; i++) {
      if (!byPos[i]) {
        const npc = this.npcs[n++]!;
        this.capMats.get(npc)?.color.set(TEAM_COLORS[field]);
        byPos[i] = npc;
      }
      const m = byPos[i]!;
      const home = new THREE.Vector3(POSITIONS[i]!.at.x, 0, POSITIONS[i]!.at.z);
      m.root.visible = true;
      m.root.position.copy(home);
      m.faceYaw(i === 1 ? Math.PI : Math.atan2(-home.x, -home.z), true);
      m.restAnim = i === 1 ? 'crouch' : 'idle';
      m.setAnim(m.restAnim);
      this.fielders.push({ model: m, home, pos: home.clone() });
    }
    for (let i = n; i < this.npcs.length; i++) this.npcs[i]!.root.visible = false;
    // Equipa que bate: no banco (3.ª base).
    this.teams[bat].forEach((s, i) => {
      const m = this.model(s.id);
      m.root.visible = true;
      m.root.position.set(-14 - i * 1.1, 0.35, 8.5);
      m.faceYaw(Math.PI * 0.8, true);
      m.restAnim = 'idle';
      m.setAnim('sit');
    });
    this.updateHud();
    this.drawBoard();
    await this.ctx.hud.banner(`Entrada ${this.game.inning} ${this.game.half === 0 ? '▲' : '▼'}`, {
      sub: `Bate a equipa ${TEAM_NAMES[bat]}`,
      hold: 1.8,
      color: TEAM_COLORS[bat],
    });
  }

  private currentBatter(): Seat {
    const team = battingTeam(this.game);
    const list = this.teams[team];
    return list[this.batterIdx[team] % list.length]!;
  }

  private currentPitcher(): Seat {
    const field = battingTeam(this.game) === 0 ? 1 : 0;
    return this.teams[field][0]!;
  }

  /** Um lançamento, do princípio ao fim da jogada. */
  private async pitchOnce(): Promise<ReturnType<typeof applyPitch>> {
    const batter = this.currentBatter();
    const pitcher = this.currentPitcher();
    const bm = this.model(batter.id);
    const pm = this.fielders[0]!.model;
    const catcher = this.fielders[1]!.model;
    bm.root.visible = true;
    bm.root.position.set(-0.85, 0, PLATE_Z);
    bm.faceYaw(Math.PI / 2, true);
    bm.restAnim = 'batIdle';
    bm.setAnim('batIdle');
    this.bat.removeFromParent();
    this.bat.scale.setScalar(1);
    this.bat.position.set(0, 0, 0);
    this.bat.rotation.set(0, 0, 0);
    bm.attach(this.bat, 'right');
    for (const f of this.fielders) {
      f.pos.copy(f.home);
      f.model.root.position.copy(f.home);
    }
    pm.faceYaw(0, true);
    catcher.setAnim('crouch');
    catcher.setFaded(true);
    this.cameraTo({ x: 1.2, y: 4.2, z: 8 }, { x: -0.2, y: 0.8, z: -12 }, { speed: 4 });
    this.updateHud();

    for (const p of this.players) {
      if (p.id !== batter.id && p.id !== pitcher.id) this.setLayout(p, { kind: 'wait', message: `${pitcher.name} lança a ${batter.name}` });
    }
    // Batedor: altura do bastão com o joystick e gesto de lado.
    this.batY = 1.15;
    this.batting = batter;
    this.setLayout(batter, {
      kind: 'motion',
      action: 'bat',
      aim: true,
      aimLabel: 'Altura do bastão',
      prompt: 'Bate quando a bola chegar! ⚾',
      hint: 'Cedo = para a esquerda · tarde = para a direita · bastão por baixo da bola = bola alta',
    });

    // Lançador: tipo, zona e gesto.
    const autoPitcher = this.ctx.seats.isAuto(pitcher);
    const plan = this.botPitch();
    this.aiming = { seat: pitcher, type: autoPitcher ? plan.type : 'fastball' };
    this.target.set(autoPitcher ? plan.x : 0, autoPitcher ? plan.y : 1.15, PLATE_Z);
    this.zoneFrame.visible = true;
    this.zoneTarget.visible = !autoPitcher;
    this.batBar.visible = true;
    const swing = await this.ctx.seats.awaitSwing(pitcher, {
      layout: this.pitchLayout('fastball'),
      bot: () => ({ t: 'swing', power: plan.power, dir: 0, spin: 0, source: 'key' }),
      botDelay: 1.3,
    });
    const type = this.aiming.type;
    this.aiming = null;
    this.zoneTarget.visible = false;
    this.setLayout(pitcher, { kind: 'wait', message: 'Lá vai ela!' });

    // Lançamento: preparação e soltar a bola.
    pm.setAnim('throw');
    void this.wait(0.4).then(() => sound.play('whoosh', { vol: 0.5 }));
    await this.wait(0.42);
    const speed = pitchSpeed(type, swing.power);
    const T = (PLATE_Z - RELEASE.z) / speed;
    this.lastPitchText = `${PITCHES[type].emoji} ${PITCHES[type].label} ${Math.round(speed * KMH)} km/h`;
    this.drawBoard();
    const target = { x: this.target.x, y: this.target.y, z: PLATE_Z };
    const inZone = inStrikeZone(target.x, target.y);

    // Espera pela tacada (telemóvel ou bot).
    let swingAt: number | null = null;
    let swingPower = 0.7;
    const doSwing = (power: number, latency: number) => {
      if (swingAt !== null || this.pitchT < 0) return;
      swingAt = this.pitchT - latency;
      swingPower = power;
      bm.setAnim('batSwing');
      this.ctx.seats.vibrate(batter, 30);
    };
    const off = this.ctx.hub.events.on('swing', ({ player, swing: s }) => {
      if (player.id === batter.id) {
        this.batY = THREE.MathUtils.clamp(this.batY + s.dir * 0.15, 0.5, 1.8);
        doSwing(s.power, s.source === 'key' ? 0 : PHONE_LATENCY);
      }
    });
    const autoBatter = this.ctx.seats.isAuto(batter);
    const botSwing = autoBatter ? this.botBat(target, inZone, T) : null;
    if (botSwing) this.batY = botSwing.batY;

    this.ball.visible = true;
    this.pitchT = 0;
    let hit: { c: NonNullable<ReturnType<typeof contact>>; at: THREE.Vector3 } | null = null;
    const from: Vec3 = { ...RELEASE };
    while (this.pitchT < T + WINDOW + 0.12) {
      await this.wait(1 / 60);
      this.pitchT += 1 / 60;
      const k = this.pitchT / T;
      const p = k <= 1 ? pitchPath(type, from, target, k) : { x: target.x, y: target.y - (k - 1) * 0.6, z: PLATE_Z + (k - 1) * T * speed };
      this.ball.position.set(p.x, p.y, Math.min(p.z, 1.1));
      this.ball.rotation.x += 0.4;
      if (botSwing && swingAt === null && this.pitchT >= botSwing.at) doSwing(botSwing.power, 0);
      if (swingAt !== null && !hit) {
        const timing = (swingAt as number) - T;
        const c = contact(timing, this.batY, target.y, swingPower, WINDOW);
        if (c) {
          hit = { c, at: this.ball.position.clone() };
          sound.play('bat');
          this.ctx.seats.vibrate(batter, [30, 20, 90]);
          break;
        }
        if (this.pitchT > (swingAt as number) + 0.05) swingAt = Number.NaN; // falhou: não tenta outra vez
      }
    }
    off();
    this.pitchT = -1;
    catcher.setFaded(false);
    this.zoneFrame.visible = false;
    this.batBar.visible = false;
    this.batting = null;
    this.setLayout(batter, { kind: 'wait', message: hit ? 'Corre! 🏃' : '…' });

    let outcome: PitchOutcome;
    let play: Promise<void> | null = null;
    if (!hit) {
      catcher.setAnim('catch');
      sound.play('ball', { pitch: 0.6 });
      this.ball.visible = false;
      const swung = swingAt !== null;
      outcome = swung ? { kind: 'strike', swung: true } : inZone ? { kind: 'strike', swung: false } : { kind: 'ball' };
      await this.wait(0.4);
    } else {
      this.excitement = 1.2;
      const r = this.resolveHit(hit.c, hit.at);
      outcome = r.outcome;
      play = this.animatePlay(batter, r.flight, r.intercept, outcome);
    }
    if (play) await play;

    // Regras e corredores.
    const scoringTeam = battingTeam(this.game);
    const scoringInning = this.game.inning;
    const res = applyPitch(this.game, outcome);
    if (res.event === 'walk') await this.walkRunners(batter);
    if (res.runsScored) {
      const line = this.lineScore[scoringTeam];
      while (line.length < scoringInning) line.push(0);
      line[scoringInning - 1]! += res.runsScored;
    }
    await this.showOutcome(outcome, res, batter);
    if (outcome.kind === 'hit' && outcome.bases === 4 && hit) await this.homeRunReplay(hit.c, hit.at, batter);

    if (res.event !== 'continue') {
      this.batterIdx[scoringTeam] += 1;
      if (res.runsScored) this.runsByPlayer.set(batter.id, (this.runsByPlayer.get(batter.id) ?? 0) + res.runsScored);
    }
    this.ball.visible = false;
    bm.restAnim = 'idle';
    if (res.event !== 'continue') bm.root.visible = false;
    this.drawBoard();
    if (res.halfOver && !res.gameOver) await this.ctx.hud.banner('Três eliminados!', { sub: 'Trocam as equipas', hold: 1.6 });
    return res;
  }

  // ── Tacada, defesa e corredores ─────────────────────────

  private resolveHit(c: NonNullable<ReturnType<typeof contact>>, at: THREE.Vector3): { outcome: PitchOutcome; flight: Flight; intercept: Intercept | null } {
    const flight = simulateFlight({ x: at.x, y: at.y, z: at.z }, c);
    if (c.foul) return { outcome: { kind: 'foul' }, flight, intercept: null };
    if (flight.homeRun) return { outcome: { kind: 'hit', bases: 4 }, flight, intercept: null };
    // O apanhador não persegue a bola.
    const spots = this.fielders.map((f, i) => (i === 1 ? { x: 999, y: 0, z: 999 } : { x: f.home.x, y: 0, z: f.home.z }));
    let ic = bestIntercept(flight, spots);
    if (!ic) {
      const last = flight.samples[flight.samples.length - 1]!;
      let best = 0;
      let bestD = Infinity;
      spots.forEach((s, i) => {
        const d = Math.hypot(s.x - last.x, s.z - last.z);
        if (d < bestD) [best, bestD] = [i, d];
      });
      ic = { fielder: best, t: Math.max(last.t, PLAY.reaction + bestD / PLAY.fielderSpeed), at: last, inAir: false };
    }
    if (ic.inAir) return { outcome: { kind: 'out', how: battedType(c.launch) === 'ground' ? 'ground' : 'fly' }, flight, intercept: ic };
    if (flight.bouncedOut) return { outcome: { kind: 'hit', bases: 2 }, flight, intercept: ic };
    const bases = batterBases(ic.t, ic.at);
    return { outcome: bases === 0 ? { kind: 'out', how: 'ground' } : { kind: 'hit', bases: bases as 1 | 2 | 3 }, flight, intercept: ic };
  }

  /** Anima a jogada: voo da bola, defesa a correr/apanhar/lançar e corredores. */
  private async animatePlay(batter: Seat, flight: Flight, ic: Intercept | null, outcome: PitchOutcome): Promise<void> {
    const bm = this.model(batter.id);
    const foul = outcome.kind === 'foul';
    const hr = outcome.kind === 'hit' && outcome.bases === 4;
    const flyOut = outcome.kind === 'out' && !!ic?.inAir;
    const batterTarget = outcome.kind === 'hit' ? outcome.bases : outcome.kind === 'out' && !flyOut ? 1 : 0;
    const runnerSpeedMul = hr ? 1.7 : 1;
    const baseTime = PLAY.baseDistance / PLAY.runnerSpeed / runnerSpeedMul;
    // Corredores que já estavam nas bases avançam tantas bases como o batedor (regras simples).
    const moves = outcome.kind === 'hit' ? this.runners.map((r) => (r ? { r, from: r.base, to: Math.min(4, r.base + outcome.bases) } : null)) : [];
    const lastSample = flight.samples[flight.samples.length - 1]!.t;
    const throwBase = outcome.kind === 'out' && !flyOut ? 1 : Math.min(4, batterTarget + 1);
    const throwFrom = ic ? ic.at : null;
    const throwTarget = basePos(throwBase % 4);
    const throwDist = throwFrom ? Math.hypot(throwTarget.x - throwFrom.x, throwTarget.z - throwFrom.z) : 0;
    const throwStart = ic ? ic.t + PLAY.throwDelay : Infinity;
    const throwEnd = throwStart + throwDist / PLAY.throwSpeed;
    const runnerEnd = PLAY.runnerStart + batterTarget * baseTime + 0.4;
    const D = foul ? Math.min(2.2, lastSample) : hr ? Math.max(Math.min(lastSample, 5), runnerEnd) : Math.min(13, Math.max(ic ? (flyOut ? ic.t + 1 : throwEnd + 0.5) : lastSample, runnerEnd));
    const chaser = ic ? this.fielders[ic.fielder]! : null;
    const covers = new Map<Fielder, THREE.Vector3>();
    for (const [b, list] of Object.entries(COVER)) {
      const f = list.map((i) => this.fielders[i]!).find((x) => x !== chaser);
      if (f && !foul) {
        const p = basePos(Number(b) % 4);
        covers.set(f, new THREE.Vector3(p.x, 0, p.z));
      }
    }
    let caught = false;
    let thrown = false;
    bm.restAnim = 'idle';
    if (!foul && !flyOut) this.bat.removeFromParent();

    await this.tween(D, (k) => {
      const t = k * D;
      // Bola
      if (!ic || t < ic.t) {
        const p = flightAt(flight, t);
        this.ball.position.set(p.x, p.y, p.z);
      } else if (!thrown && t < throwStart) {
        if (!caught) {
          caught = true;
          chaser?.model.setAnim('catch');
          sound.play('ball', { pitch: 0.7 });
          this.excitement = flyOut ? 1.6 : 1;
        }
        const hand = chaser!.model.root.position;
        this.ball.position.set(hand.x, 1.3, hand.z);
      } else if (!flyOut && throwFrom && t < throwEnd) {
        if (!thrown) {
          thrown = true;
          chaser?.model.setAnim('throw');
        }
        const q = (t - throwStart) / (throwEnd - throwStart);
        this.ball.position.set(throwFrom.x + (throwTarget.x - throwFrom.x) * q, 1.4 + Math.sin(q * Math.PI) * Math.min(6, throwDist / 10), throwFrom.z + (throwTarget.z - throwFrom.z) * q);
      }
      // Defesas
      if (chaser && ic) {
        const startRun = PLAY.reaction;
        const to = new THREE.Vector3(ic.at.x, 0, ic.at.z);
        const dist = chaser.home.distanceTo(to);
        const runT = Math.max(0.01, ic.t - startRun);
        const q = THREE.MathUtils.clamp((t - startRun) / runT, 0, 1);
        const step = Math.min(1, (q * runT * PLAY.fielderSpeed) / Math.max(0.01, dist));
        chaser.pos.lerpVectors(chaser.home, to, Math.max(0, Math.min(1, dist > PLAY.reach ? step : 0)));
        chaser.model.root.position.copy(chaser.pos);
        if (t > startRun && t < ic.t) {
          chaser.model.setAnim('run');
          chaser.model.faceTowards(to.x, to.z);
        }
      }
      for (const [f, to] of covers) {
        const q = THREE.MathUtils.clamp((t - PLAY.reaction) / 2.2, 0, 1);
        f.pos.lerpVectors(f.home, to, q);
        f.model.root.position.copy(f.pos);
        if (q > 0 && q < 1) {
          f.model.setAnim('run');
          f.model.faceTowards(to.x, to.z);
        } else if (q >= 1 && f.model.anim === 'run') f.model.setAnim('idle');
      }
      // Batedor a correr
      if (!foul) {
        const goal = flyOut ? 0.5 : batterTarget;
        const s = THREE.MathUtils.clamp((t - PLAY.runnerStart) / baseTime, 0, goal);
        this.placeOnPath(bm, s);
        bm.setAnim(t > PLAY.runnerStart && s < goal ? 'run' : flyOut || outcome.kind === 'out' ? 'sad' : 'cheer');
      }
      for (const m of moves) {
        if (!m) continue;
        const s = THREE.MathUtils.clamp(m.from + (t - 0.3) / baseTime, m.from, m.to);
        this.placeOnPath(m.r.model, s);
        m.r.model.setAnim(s < m.to ? 'run' : 'idle');
      }
      // Câmara segue a bola
      const b = this.ball.position;
      if (foul || !ic || t < ic.t + 0.2) this.cameraTo({ x: b.x * 0.35, y: 9 + b.y * 0.4, z: 14 + b.z * 0.25 }, { x: b.x, y: b.y * 0.6, z: b.z }, { speed: 3 });
      else this.cameraTo({ x: 26, y: 26, z: 18 }, { x: 0, y: 0, z: -22 }, { speed: 2 });
    }, ease.linear);

    // Corredores no fim: quem marcou sai do campo; o batedor fica na base (ou sai, se eliminado).
    for (const m of moves) {
      if (!m) continue;
      if (m.to >= 4) {
        m.r.model.root.visible = false;
        this.disposeRunner(m.r);
        this.runners[m.from] = null;
      }
    }
    if (outcome.kind === 'hit') {
      const next: (Runner | null)[] = [null, null, null];
      for (const m of moves) if (m && m.to < 4) next[m.to - 1] = { model: m.r.model, base: m.to };
      if (outcome.bases < 4) next[outcome.bases - 1] = this.newRunner(batter, outcome.bases);
      this.runners = next;
    }
    for (const f of this.fielders) {
      f.pos.copy(f.home);
      f.model.root.position.copy(f.home);
      f.model.setAnim(f.model.restAnim);
    }
  }

  /** Coloca uma personagem no caminho das bases (`s` em bases, 0 = casa … 4 = casa outra vez). */
  private placeOnPath(m: CharacterModel, s: number): void {
    const i = Math.min(3, Math.floor(s));
    const a = basePos(i);
    const b = basePos((i + 1) % 4);
    const q = s - i;
    m.root.position.set(a.x + (b.x - a.x) * q, 0, a.z + (b.z - a.z) * q);
    if (q > 0 && q < 1) m.faceTowards(b.x, b.z);
  }

  private newRunner(seat: Seat, base: number): Runner {
    const m = this.makeModel(getCharacter(seat.characterId), TEAM_COLORS[battingTeam(this.game)]);
    this.placeOnPath(m, base);
    m.setAnim('idle');
    return { model: m, base };
  }

  private disposeRunner(r: Runner): void {
    this.scene.remove(r.model.root);
    r.model.dispose();
  }

  private clearRunners(): void {
    for (const r of this.runners) if (r) this.disposeRunner(r);
    this.runners = [null, null, null];
  }

  /** Passeio: o batedor vai para a 1.ª e os corredores forçados avançam. */
  private async walkRunners(batter: Seat): Promise<void> {
    const old = this.runners;
    const next: (Runner | null)[] = [old[0] ?? null, old[1] ?? null, old[2] ?? null];
    const moves: { r: Runner; from: number; to: number }[] = [];
    if (old[0]) {
      if (old[1]) {
        if (old[2]) {
          moves.push({ r: old[2], from: 3, to: 4 });
          next[2] = null;
        }
        moves.push({ r: old[1], from: 2, to: 3 });
        next[2] = old[1];
        next[1] = null;
      }
      moves.push({ r: old[0], from: 1, to: 2 });
      next[1] = old[0];
    }
    const bm = this.model(batter.id);
    this.bat.removeFromParent();
    await this.tween(1.6, (k) => {
      this.placeOnPath(bm, k);
      bm.setAnim(k < 1 ? 'walk' : 'idle');
      for (const m of moves) {
        this.placeOnPath(m.r.model, m.from + k);
        m.r.model.setAnim(k < 1 ? 'walk' : 'idle');
      }
    });
    for (const m of moves) {
      if (m.to >= 4) this.disposeRunner(m.r);
      else m.r.base = m.to;
    }
    next[0] = this.newRunner(batter, 1);
    this.runners = next;
  }

  private pitchLayout(type: PitchType): import('../../game/Seats').MotionLayout {
    return {
      kind: 'motion',
      action: 'pitch',
      aim: true,
      aimLabel: 'Zona',
      pick: `${PITCHES[type].emoji} ${PITCHES[type].label}`,
      prompt: 'Aponta a zona, X muda o lançamento, segura A e lança!',
      hint: 'Gesto mais rápido = bola mais rápida · a curva e a screwball fogem para lados opostos',
    };
  }

  private botPitch(): { type: PitchType; x: number; y: number; power: number } {
    const rng = this.ctx.rng;
    const skill = this.ctx.botSkill;
    const type = rng.pick(PITCH_IDS);
    const edge = rng.next() < 0.3;
    const x = (rng.next() - 0.5) * (edge ? 1.3 : 0.6);
    const y = 1.15 + (rng.next() - 0.5) * (edge ? 1.3 : 0.6);
    return { type, x, y, power: 0.5 + rng.next() * 0.3 + skill * 0.2 };
  }

  private botBat(target: Vec3, inZone: boolean, T: number): { at: number; batY: number; power: number } | null {
    const rng = this.ctx.rng;
    const skill = this.ctx.botSkill;
    const p = inZone ? 0.55 + 0.35 * skill : 0.4 - 0.25 * skill;
    if (rng.next() > p) return null;
    const gauss = () => rng.next() + rng.next() + rng.next() - 1.5;
    const sd = 0.03 + (1 - skill) * 0.08;
    return {
      at: T + gauss() * sd * 1.6,
      batY: target.y - 0.06 + gauss() * (0.06 + (1 - skill) * 0.2),
      power: 0.55 + rng.next() * 0.45,
    };
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
        if (res.event === 'strikeout') bm.setAnim('sad');
        break;
      case 'foul':
        text = 'Foul!';
        break;
      case 'out':
        text = out.how === 'fly' ? 'Apanhada! Eliminado' : 'Eliminado na 1.ª base';
        color = '#ff6b7a';
        break;
      case 'hit':
        text = ['', 'Simples!', 'Duplo!', 'Triplo!', 'HOME RUN!'][out.bases]!;
        color = out.bases === 4 ? '#ffd23f' : '#7dff9b';
        this.excitement = out.bases === 4 ? 2.5 : 1.4;
        this.ctx.seats.vibrate(batter, out.bases === 4 ? [100, 50, 100, 50, 400] : [80, 40, 80]);
        sound.play('cheer', { vol: out.bases === 4 ? 1 : 0.6 });
        if (out.bases === 4) this.fireworks();
        break;
    }
    const count = res.event === 'continue' ? `Bolas ${s.balls} · Strikes ${s.strikes}` : undefined;
    const runs = res.runsScored ? `+${res.runsScored} corrida${res.runsScored > 1 ? 's' : ''}!` : undefined;
    this.updateHud();
    this.drawBoard();
    await this.ctx.hud.banner(text, { sub: runs ?? count, hold: out.kind === 'hit' ? 1.8 : 0.9, color });
  }

  /** Repetição do home run: a tacada e o voo em câmara lenta, de outros ângulos. */
  private async homeRunReplay(c: NonNullable<ReturnType<typeof contact>>, at: THREE.Vector3, batter: Seat): Promise<void> {
    const flight = simulateFlight({ x: at.x, y: at.y, z: at.z }, c);
    const bm = this.model(batter.id);
    const end = flight.samples[flight.samples.length - 1]!;
    this.ctx.hud.hint('🔁 Repetição', true);
    bm.root.visible = true;
    bm.root.position.set(-0.85, 0, PLATE_Z);
    bm.faceYaw(Math.PI / 2, true);
    bm.attach(this.bat, 'right');
    bm.setAnim('batSwing');
    this.ball.visible = true;
    // 1.º ângulo: de lado, junto ao batedor.
    this.cameraTo({ x: 3.2, y: 1.4, z: 2.2 }, { x: -0.3, y: 1.2, z: 0 }, { instant: true });
    const D = Math.min(4.5, end.t);
    await this.tween(D * 2.4, (k) => {
      const t = k * D;
      const p = flightAt(flight, t);
      this.ball.position.set(p.x, p.y, p.z);
      if (t > 0.35) this.cameraTo({ x: p.x * 0.3 + 6, y: Math.max(4, p.y * 0.5), z: p.z * 0.4 + 8 }, { x: p.x, y: p.y, z: p.z }, { speed: 4 });
    }, ease.linear);
    this.ctx.hud.hint(null, true);
    this.ball.visible = false;
    this.bat.removeFromParent();
    bm.root.visible = false;
  }

  private updateHud(): void {
    const s = this.game.state;
    const bases = s.bases.map((b) => (b ? '◆' : '◇')).join('');
    this.ctx.hud.setRound(
      `${TEAM_NAMES[0]} ${this.game.runs[0]} – ${this.game.runs[1]} ${TEAM_NAMES[1]} · Entrada ${this.game.inning}${this.game.half === 0 ? '▲' : '▼'} · B${s.balls} S${s.strikes} · ${s.outs} elim. · ${bases}`,
    );
    const batting = battingTeam(this.game);
    this.scoreboard(
      this.players.map((p, i) => ({
        id: p.id,
        text: `${i % 2 === 0 ? '🔵' : '🔴'} ${this.runsByPlayer.get(p.id) ?? 0}`,
        active: i % 2 === batting,
      })),
    );
  }

  // ── Por frame ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    if (this.aiming && !this.ctx.seats.isAuto(this.aiming.seat)) {
      const pad = this.ctx.seats.pad(this.aiming.seat);
      this.target.x = THREE.MathUtils.clamp(this.target.x + pad.stick.x * dt * 1.1, -0.85, 0.85);
      this.target.y = THREE.MathUtils.clamp(this.target.y - pad.stick.y * dt * 1.1, 0.35, 2);
    }
    this.zoneTarget.position.set(this.target.x, this.target.y, PLATE_Z + 0.01);
    if (this.batting && !this.ctx.seats.isAuto(this.batting)) {
      const pad = this.ctx.seats.pad(this.batting);
      this.batY = THREE.MathUtils.clamp(this.batY - pad.stick.y * dt * 1.2, 0.5, 1.8);
    }
    this.batBar.position.set(0, this.batY, PLATE_Z - 0.02);

    // Público
    this.excitement = Math.max(0.2, this.excitement - dt * 0.4);
    const { mesh: crowd, base, phase } = this.crowd;
    const m = new THREE.Matrix4();
    const hop = new THREE.Matrix4();
    for (let i = 0; i < base.length; i++) {
      hop.makeTranslation(0, Math.max(0, Math.sin(time * (3 + this.excitement * 3) + phase[i]!)) * 0.25 * this.excitement, 0);
      m.multiplyMatrices(hop, base[i]!);
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;

    // Fogo de artifício
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life -= dt;
      s.vel.y -= 6 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.life);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        disposeObject(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    for (const r of this.runners) r?.model.update(dt);
    for (const n of this.npcs) n.update(dt);
  }

  private fireworks(): void {
    const colors = ['#ffd23f', '#ff3b5c', '#3fd0ff', '#7dff9b', '#ff6fb5'];
    for (let b = 0; b < 6; b++) {
      const center = new THREE.Vector3((Math.random() - 0.5) * 120, 35 + Math.random() * 20, -90 - Math.random() * 30);
      const color = colors[b % colors.length]!;
      const delay = b * 0.4;
      void this.wait(delay).then(() => {
        sound.play('firework');
        for (let i = 0; i < 40; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
          s.position.copy(center);
          const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(12 + Math.random() * 6);
          this.scene.add(s);
          this.sparks.push({ mesh: s, vel: v, life: 1.6 + Math.random() * 0.6 });
        }
      });
    }
  }

  // ── Personagens ─────────────────────────────────────────

  private makeModel(def: CharacterDef, capColor: string): CharacterModel {
    const m = new CharacterModel(def);
    this.addCap(m, capColor);
    this.scene.add(m.root);
    return m;
  }

  private addCap(m: CharacterModel, color: string): void {
    if (this.capMats.has(m)) return;
    const mat = toonUnique(color);
    const cap = new THREE.Group();
    const dome = mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    const brim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), mat);
    brim.position.set(0, 0.02, 0.32);
    cap.add(dome, brim);
    cap.position.y = 0.45;
    m.attachHead(cap);
    this.capMats.set(m, mat);
  }

  override dispose(): void {
    for (const off of this.offs) off();
    this.clearRunners();
    for (const n of this.npcs) n.dispose();
    this.board.texture.dispose();
    disposeObject(this.bat);
    super.dispose();
  }

  // ── Placar eletrónico ───────────────────────────────────

  private buildBoard(): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    const frame = mesh(new THREE.BoxGeometry(42, 22, 1), toon('#1b2033'));
    frame.position.z = -0.6;
    const group = new THREE.Group();
    group.add(frame, screen);
    for (const sx of [-12, 12]) {
      const leg = mesh(new THREE.BoxGeometry(1.5, 16, 1.5), toon('#2a3048'));
      leg.position.set(sx, -18, -0.6);
      group.add(leg);
    }
    group.position.set(0, 27, -FIELD.fence - 18);
    this.scene.add(group);
    return { canvas, texture };
  }

  private drawBoard(): void {
    const { canvas, texture } = this.board;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#070b18';
    c.fillRect(0, 0, 1024, 512);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 44px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('⚾ FESTA PARK', 512, 42);
    const inn = this.game.innings;
    const colW = 70;
    const x0 = 300;
    c.font = 'bold 34px system-ui, sans-serif';
    c.fillStyle = '#7fb2ff';
    for (let i = 0; i < inn; i++) c.fillText(String(i + 1), x0 + colW * i + colW / 2, 110);
    c.fillText('C', x0 + colW * inn + colW / 2 + 20, 110);
    ([0, 1] as Team[]).forEach((t) => {
      const y = 170 + t * 70;
      const active = battingTeam(this.game) === t;
      c.fillStyle = active ? '#1d2c66' : '#0e1530';
      c.fillRect(30, y - 30, 964, 60);
      c.textAlign = 'left';
      c.fillStyle = TEAM_COLORS[t];
      c.fillText((active ? '▶ ' : '') + TEAM_NAMES[t], 44, y);
      c.textAlign = 'center';
      c.fillStyle = '#ffffff';
      for (let i = 0; i < inn; i++) {
        const v = this.lineScore[t][i];
        const played = this.game.inning > i + 1 || (this.game.inning === i + 1 && (t === 0 || this.game.half === 1));
        c.fillText(v !== undefined ? String(v) : played ? '0' : '', x0 + colW * i + colW / 2, y);
      }
      c.fillStyle = '#ffd23f';
      c.fillText(String(this.game.runs[t]), x0 + colW * inn + colW / 2 + 20, y);
    });
    // Contagem: bolas, strikes e eliminados em luzes.
    const s = this.game.state;
    const lights = (label: string, n: number, max: number, color: string, x: number) => {
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.fillText(label, x, 340);
      for (let i = 0; i < max; i++) {
        c.beginPath();
        c.arc(x + 50 + i * 40, 340, 14, 0, Math.PI * 2);
        c.fillStyle = i < n ? color : '#26304d';
        c.fill();
      }
    };
    lights('B', s.balls, 3, '#4cd964', 60);
    lights('S', s.strikes, 2, '#ffd23f', 330);
    lights('E', s.outs, 2, '#ff3b5c', 560);
    c.textAlign = 'right';
    c.fillStyle = '#ffffff';
    c.fillText(s.bases.map((b) => (b ? '◆' : '◇')).join(' '), 980, 340);
    c.textAlign = 'center';
    c.fillStyle = '#9fd8ff';
    c.font = 'bold 40px system-ui, sans-serif';
    const bat = this.teams[battingTeam(this.game)];
    const who = bat.length ? `Batedor: ${this.currentBatterName()}` : '';
    c.fillText(who, 512, 410);
    c.fillStyle = '#ffd23f';
    c.fillText(this.lastPitchText, 512, 465);
    texture.needsUpdate = true;
  }

  private currentBatterName(): string {
    try {
      return this.currentBatter().name;
    } catch {
      return '';
    }
  }

  // ── Estádio ─────────────────────────────────────────────

  private buildStadium(): void {
    this.sun.intensity = 1.6;
    const flat = (geo: THREE.BufferGeometry, color: string, y: number) => {
      const m = mesh(geo, toonUnique(color), { cast: false, receive: true });
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      this.scene.add(m);
      return m;
    };
    const F = FIELD.fence;
    flat(new THREE.PlaneGeometry(500, 500), '#3f8f3a', 0);
    // Relvado com faixas e pista de aviso junto à vedação.
    flat(new THREE.RingGeometry(F - 5, F, 64, 1, Math.PI / 4, Math.PI / 2), '#b07a45', 0.008);
    for (let i = 0; i < 9; i++) {
      const r0 = 6 + i * 10;
      flat(new THREE.RingGeometry(r0, Math.min(F - 5, r0 + 5), 48, 1, Math.PI / 4, Math.PI / 2), '#58b04a', 0.01);
    }
    // Terra do diamante e relva do interior.
    flat(new THREE.CircleGeometry(30, 40, Math.PI / 4, Math.PI / 2), '#c98b4f', 0.02);
    const grass = flat(new THREE.PlaneGeometry(PLAY.baseDistance * 1.25, PLAY.baseDistance * 1.25), '#5cb84f', 0.03);
    grass.rotation.z = Math.PI / 4;
    grass.position.z = -PLAY.baseDistance;
    flat(new THREE.CircleGeometry(4, 24), '#c98b4f', 0.025).position.z = 0;
    const mound = mesh(new THREE.CylinderGeometry(2, 2.6, 0.3, 24), toon('#c98b4f'), { cast: false, receive: true });
    mound.position.set(0, 0.15, MOUND_Z);
    const rubber = mesh(new THREE.BoxGeometry(0.6, 0.05, 0.15), toon('#ffffff'));
    rubber.position.set(0, 0.32, MOUND_Z);
    this.scene.add(mound, rubber);
    const plate = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 5), toon('#ffffff'), { cast: false });
    plate.position.set(0, 0.04, PLATE_Z - 0.3);
    this.scene.add(plate);
    for (let i = 1; i <= 3; i++) {
      const b = basePos(i);
      const base = mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), toon('#ffffff'));
      base.position.set(b.x, 0.06, b.z);
      base.rotation.y = Math.PI / 4;
      this.scene.add(base);
    }
    // Caixas do batedor e linhas de foul.
    for (const s of [-1, 1]) {
      const line = mesh(new THREE.PlaneGeometry(0.15, F), toon('#ffffff'), { cast: false });
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = (s * Math.PI) / 4;
      line.position.set((s * F) / 2 / Math.SQRT2, 0.04, -F / 2 / Math.SQRT2);
      this.scene.add(line);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.1, 1.9)),
        new THREE.LineBasicMaterial({ color: '#ffffff' }),
      );
      box.rotation.x = -Math.PI / 2;
      box.position.set(s * 0.95, 0.04, PLATE_Z - 0.2);
      this.scene.add(box);
      // Postes de foul.
      const pole = mesh(new THREE.CylinderGeometry(0.2, 0.2, 18), toonUnique('#ffd23f', { emissive: '#7a5a00', emissiveIntensity: 0.3 }));
      pole.position.set((s * F) / Math.SQRT2, 9, -F / Math.SQRT2);
      this.scene.add(pole);
    }
    // Vedação com faixa amarela no topo.
    const fence = mesh(new THREE.CylinderGeometry(F, F, FIELD.fenceHeight, 64, 1, true, Math.PI - Math.PI / 4, Math.PI / 2), toonUnique('#245a8a', { side: THREE.DoubleSide }));
    fence.position.y = FIELD.fenceHeight / 2;
    const top = mesh(new THREE.CylinderGeometry(F, F, 0.25, 64, 1, true, Math.PI - Math.PI / 4, Math.PI / 2), toonUnique('#ffd23f', { side: THREE.DoubleSide }));
    top.position.y = FIELD.fenceHeight;
    this.scene.add(fence, top);
    // Rede atrás da base.
    const net = mesh(new THREE.CylinderGeometry(14, 14, 6, 24, 1, true, -Math.PI / 4, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#cfd3da', transparent: true, opacity: 0.18, side: THREE.DoubleSide }), { cast: false });
    net.position.set(0, 3, -4);
    this.scene.add(net);

    // Bancos das equipas (dugouts).
    for (const s of [-1, 1]) {
      const dug = mesh(new THREE.BoxGeometry(9, 2.4, 2.4), toon('#2a3048'));
      dug.position.set(s * 17.5, 1.2, 9.6);
      const roof = mesh(new THREE.BoxGeometry(9.4, 0.25, 3), toon(s < 0 ? TEAM_COLORS[0] : TEAM_COLORS[1]));
      roof.position.set(s * 17.5, 2.5, 9.2);
      const bench = mesh(new THREE.BoxGeometry(8, 0.35, 0.6), toon('#8a5a32'));
      bench.position.set(s * 17.5, 0.18, 8.5);
      this.scene.add(dug, roof, bench);
    }

    // Bancadas: atrás da base e ao longo das linhas, com público (instanced).
    const spots: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const palette = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#4cd964', '#b36bff', '#ff9f43', '#f2f2f2', '#2f7dff', '#ff3b5c'];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stand = (cx: number, cz: number, rotY: number, width: number) => {
      for (let row = 0; row < 6; row++) {
        const step = mesh(new THREE.BoxGeometry(width, 0.9, 1.6), toon(row % 2 ? '#3b4466' : '#4a5480'), { receive: true });
        const off = new THREE.Vector3(0, 0.45 + row * 0.9, row * 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        step.position.set(cx + off.x, off.y, cz + off.z);
        step.rotation.y = rotY;
        this.scene.add(step);
        for (let i = 0; i < width / 1.1; i++) {
          if (rnd() < 0.15) continue;
          const local = new THREE.Vector3(-width / 2 + 0.55 + i * 1.1, 1.35 + row * 0.9, row * 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          spots.push(new THREE.Matrix4().makeTranslation(cx + local.x, local.y, cz + local.z));
          colors.push(new THREE.Color(palette[Math.floor(rnd() * palette.length)]!));
        }
      }
    };
    stand(0, 13, 0, 28);
    for (const s of [-1, 1]) {
      // Ao longo das linhas de foul (para lá dos bancos).
      for (let k = 0; k < 3; k++) {
        const d = 30 + k * 20;
        stand((s * (d + 8)) / Math.SQRT2 + s * 6, (-d + 8) / Math.SQRT2 + 6, s * (Math.PI / 4) + (s > 0 ? Math.PI / 2 : -Math.PI / 2), 18);
      }
    }
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 8), new THREE.MeshToonMaterial(), spots.length);
    spots.forEach((m, i) => {
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, colors[i]!);
    });
    this.scene.add(crowd);
    this.crowd = { mesh: crowd, base: spots, phase: spots.map(() => rnd() * Math.PI * 2) };

    // Torres de luz.
    for (const [x, z] of [[-60, 10], [60, 10], [-85, -70], [85, -70]] as const) {
      const pole = mesh(new THREE.CylinderGeometry(0.6, 0.9, 34), toon('#8a8f99'));
      pole.position.set(x, 17, z);
      const panel = mesh(new THREE.BoxGeometry(8, 4, 0.6), toonUnique('#fff7d6', { emissive: '#fff1c2', emissiveIntensity: 1 }));
      panel.position.set(x, 35, z);
      panel.lookAt(0, 0, -30);
      this.scene.add(pole, panel);
    }
    // Publicidade atrás da vedação.
    const sign = textSprite('FESTA ⚾ PARK', { height: 4, color: '#ffffff', stroke: '#245a8a' });
    (sign.material as THREE.SpriteMaterial).depthTest = true;
    sign.position.set(-45, 7, -F - 8);
    this.scene.add(sign);
  }
}
