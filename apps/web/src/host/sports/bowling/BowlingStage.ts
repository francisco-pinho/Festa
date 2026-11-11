/**
 * Bowling 3D num salão completo. Pista ao longo de -Z: linha de falta em z=0, pinos ao fundo.
 *
 *  - Física real com Rapier (ver lanePhysics.ts): óleo/parte seca, curva pelo efeito, pinos rígidos.
 *  - Lançamento: posição com o joystick, ângulo a rodar o telemóvel, gesto de pêndulo (força) e
 *    rodar o pulso no fim (efeito). Bots calculam a trajetória para acertar no "bolso".
 *  - Corrida de aproximação, câmara lenta no impacto, repetição dos strikes, máquina de pinos.
 *  - Salão: pistas vizinhas com bots a jogar, retorno de bolas, bancos, placar suspenso, luzes.
 */
import { sound } from '../../audio/Sound';
import * as THREE from 'three';
import { CHARACTERS, getCharacter } from '@festa/game';
import { isFrameDone, rollSymbols, runningTotal, scoreFrames, shouldResetPins, type BowlingFrame } from '@festa/game/sports/bowling';
import type { SwingInput } from '@festa/shared';
import { CharacterModel } from '../../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../../three/materials';
import { loadRapier } from '../../three/physics';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import { rankBy, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';
import { BALL_R, DECK_END, GUTTER, LANE_HALF, LANE_LEN, LanePhysics, OIL_END, PIN_Z, pinSpots, type Pose, type Throw } from './lanePhysics';

/** Distância entre o centro de duas pistas. */
const LANE_STEP = 2 * (LANE_HALF + GUTTER) + 0.9;
const START_Z = 4.6;
const RELEASE_Z = 0.9;
const MAX_AIM = 0.05;

interface RecordedFrame {
  dt: number;
  ball: Pose | null;
  pins: Pose[];
}

interface Neighbor {
  x: number;
  model: CharacterModel;
  ball: THREE.Mesh;
  pins: THREE.Group[];
  timer: number;
  phase: 'wait' | 'roll' | 'fall' | 'reset';
  knock: number[];
  curve: number;
}

export class BowlingStage extends SportStage {
  private phys: LanePhysics | null = null;
  private readonly pinMeshes: THREE.Group[] = [];
  private readonly ball: THREE.Mesh;
  private readonly ballMat: THREE.MeshStandardMaterial;
  private readonly handBall: THREE.Mesh;
  private readonly aimLine = new THREE.Group();
  private readonly sweepBar: THREE.Mesh;
  private readonly board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh };
  private readonly neighbors: Neighbor[] = [];
  private readonly benchSpots: THREE.Vector3[] = [];

  private aiming: Seat | null = null;
  private aimX = 0;
  private aimAngle = 0;
  private botTarget: { x: number; angle: number } | null = null;
  private syncPins = true;
  private followBall = false;
  private recording: RecordedFrame[] | null = null;
  private replaying = false;
  private replayState: { rec: RecordedFrame[]; times: number[]; clock: number } | null = null;
  private slowmo = 0;
  private slowmoArmed = false;
  private baseTimeScale = 1;

  private readonly frames = new Map<string, BowlingFrame[]>();
  private readonly totalFrames: number;
  private activeId: string | null = null;

  constructor(ctx: SportContext) {
    super(ctx);
    this.totalFrames = ctx.players.length <= 4 ? 10 : 5;
    for (const p of ctx.players) this.frames.set(p.id, []);
    this.buildHall();

    this.ballMat = new THREE.MeshStandardMaterial({ color: '#3fa7ff', roughness: 0.12, metalness: 0.25 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), this.ballMat);
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.scene.add(this.ball);
    this.handBall = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat);

    for (const s of pinSpots()) {
      const pin = makePin();
      pin.position.set(s.x, 0, s.z);
      this.scene.add(pin);
      this.pinMeshes.push(pin);
    }
    for (let i = 0; i < 9; i++) {
      const dot = mesh(new THREE.ConeGeometry(0.07, 0.22, 3), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85 }), { cast: false });
      dot.rotation.x = -Math.PI / 2;
      this.aimLine.add(dot);
    }
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    this.sweepBar = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2, 0.25, 0.12), toon('#30343c'));
    this.sweepBar.position.set(0, 1.9, PIN_Z + 1);
    this.scene.add(this.sweepBar);

    this.board = this.buildBoard();
  }

  // ── Jogo ────────────────────────────────────────────────

  async play(): Promise<SportStanding[]> {
    this.phys = new LanePhysics(await loadRapier());
    this.phys.resetPins();
    this.baseTimeScale = this.ctx.engine.timeScale;
    this.seatEveryone();
    this.drawBoard();

    // Entrada: vista geral do salão, depois para trás da pista.
    this.cameraTo({ x: 8, y: 7, z: 14 }, { x: 0, y: 0.5, z: -10 }, { instant: true });
    this.cameraTo({ x: 0.8, y: 3.4, z: 10 }, { x: 0, y: 0.6, z: -14 }, { speed: 0.8 });
    await this.ctx.hud.banner('Bowling!', { sub: `${this.totalFrames} jogadas · física real · strikes com repetição`, hold: 2.2 });

    for (let f = 0; f < this.totalFrames; f++) {
      const last = f === this.totalFrames - 1;
      for (const seat of this.players) {
        this.ctx.hud.setRound(`Jogada ${f + 1} / ${this.totalFrames}`);
        await this.playerFrame(seat, f, last);
      }
    }
    this.ctx.hud.setRound(null);
    this.activeId = null;
    this.drawBoard();
    const ranked = rankBy(this.players, (p) => runningTotal(this.frames.get(p.id)!, this.totalFrames));
    // Câmara no placar no fim.
    this.cameraTo({ x: 0, y: 3.4, z: -1 }, { x: 0, y: 4.2, z: -8 }, { speed: 1.5 });
    await this.wait(2);
    return ranked.map((p) => ({ id: p.id, rank: p.rank, score: `${runningTotal(this.frames.get(p.id)!, this.totalFrames)} pontos` }));
  }

  private async playerFrame(seat: Seat, f: number, last: boolean): Promise<void> {
    const frame: BowlingFrame = [];
    this.frames.get(seat.id)!.push(frame);
    this.activeId = seat.id;
    this.ballMat.color.set(getCharacter(seat.characterId).color);
    this.updateScoreboard(seat.id);
    this.waitAll(`Vez de ${seat.name} 🎳`, seat.id);

    const m = this.model(seat.id);
    m.setAnim('walk');
    m.root.position.set(0, 0, START_Z + 1.5);
    m.faceYaw(Math.PI, true);
    this.holdBall(m);
    this.handBall.position.set(0, 0, 0);
    this.handBall.visible = true;
    await this.ctx.hud.banner(seat.name, { sub: `Jogada ${f + 1}`, hold: 1 });

    while (!isFrameDone(frame, last)) {
      const before = this.phys!.standing();
      const freshRack = before === 10;
      const result = await this.bowl(seat, frame.length + 1, freshRack);
      frame.push(result.knocked);
      this.updateScoreboard(seat.id);
      this.drawBoard();
      const standing = this.phys!.standing();
      await this.celebrate(seat, result.knocked, standing, freshRack, result.gutter);
      if (shouldResetPins(frame, last, standing)) await this.pinsetter(true);
      else await this.pinsetter(false);
    }
    // Volta para o banco.
    this.handBall.removeFromParent();
    this.seatEveryone();
  }

  /** Uma bola: apontar, lançar, simular. */
  private async bowl(seat: Seat, ballNo: number, freshRack: boolean): Promise<{ knocked: number; gutter: boolean }> {
    const phys = this.phys!;
    const m = this.model(seat.id);
    this.aimX = 0;
    this.aimAngle = 0;
    m.root.position.set(0, 0, START_Z);
    m.faceYaw(Math.PI, true);
    m.setAnim('idle');
    this.holdBall(m);
    this.handBall.visible = true;
    this.cameraTo({ x: 1.5, y: 3.6, z: 10 }, { x: 0, y: 0.6, z: -14 }, { speed: 2.5 });

    const isBot = this.ctx.seats.isAuto(seat);
    const plan = isBot ? this.botPlan() : null;
    this.botTarget = plan ? { x: plan.x, angle: plan.angle } : null;
    this.aiming = seat;
    this.aimLine.visible = true;
    const swing = await this.ctx.seats.awaitSwing(seat, {
      layout: {
        kind: 'motion',
        action: 'throw',
        aim: true,
        prompt: `Bola ${ballNo}: 🕹️ posição · roda o telemóvel para apontar · segura e faz o pêndulo para lançar`,
        hint: 'Braço atrás e à frente: mais rápido = mais força. Rodar o pulso no fim dá efeito (curva).',
      },
      bot: () => ({ t: 'swing', power: plan!.power, dir: 0, spin: plan!.spin, source: 'key' }),
      botDelay: 1.6,
    });
    this.aiming = null;
    this.aimLine.visible = false;
    this.botTarget = null;
    this.waitAll(`${seat.name} lançou!`);
    this.setLayout(seat, { kind: 'wait', message: 'Lá vai ela… 🎳' });

    const t = this.toThrow(swing);
    // Corrida de aproximação (4 passos) e lançamento.
    m.setAnim('run');
    const z0 = m.root.position.z;
    await this.tween(0.75, (k) => (m.root.position.z = z0 + (RELEASE_Z - z0) * k), ease.inOut);
    m.setAnim('throw');
    await this.wait(0.28);
    this.handBall.visible = false;
    phys.launch(t);
    sound.play('roll');
    this.ball.visible = true;
    this.syncPins = true;
    this.followBall = true;
    this.slowmoArmed = freshRack;
    this.recording = null;
    this.ctx.seats.vibrate(seat, 30);

    // Espera que a bola chegue ao fundo e os pinos assentem.
    let time = 0;
    let after = 0;
    while (time < 12) {
      await this.wait(0.1);
      time += 0.1;
      if (phys.ballDone()) {
        after += 0.1;
        if ((phys.settled() && after > 0.8) || after > 3) break;
      }
    }
    this.followBall = false;
    this.stopSlowmo();
    phys.hideBall();
    this.ball.visible = false;
    await this.wait(0.3);
    return { knocked: this.pinsBefore - phys.standing(), gutter: phys.gutter };
  }

  /** Pinos de pé antes desta bola (guardado quando a bola sai da mão). */
  private pinsBefore = 10;

  private toThrow(s: SwingInput): Throw {
    this.pinsBefore = this.phys!.standing();
    return {
      x: this.aimX,
      speed: 11 + s.power * 9,
      angle: this.aimAngle + s.dir * 0.02,
      spin: s.spin,
    };
  }

  /** Bots: escolhem efeito e posição e calculam o ângulo para acertar no alvo. */
  private botPlan(): { x: number; angle: number; spin: number; power: number } {
    const phys = this.phys!;
    const rng = this.ctx.rng;
    const skill = this.ctx.botSkill;
    // Alvo: o "bolso" (entre o pino 1 e o 3), ou o pino da frente que sobrar.
    let targetX = 0.13;
    if (phys.standing() < 10) {
      const left = pinSpots()
        .map((s, i) => ({ s, i, pos: phys.pins[i]!.translation() }))
        .filter((p) => !phys.isDown(p.i));
      if (left.length) {
        const front = Math.max(...left.map((p) => p.pos.z));
        const near = left.filter((p) => p.pos.z > front - 0.6);
        targetX = near.reduce((a, p) => a + p.pos.x, 0) / near.length;
      }
    }
    const spin = 0.15 + rng.next() * 0.4 * skill;
    const power = 0.45 + rng.next() * 0.35;
    const x = THREE.MathUtils.clamp(targetX + spin * 0.9 + (rng.next() - 0.5) * 0.2, -LANE_HALF + 0.3, LANE_HALF - 0.3);
    const speed = 11 + power * 9;
    let angle = 0;
    for (let i = 0; i < 3; i++) {
      const at = LanePhysics.predictX(phys.R, { x, speed, angle, spin });
      angle += Math.atan((targetX - at) / LANE_LEN) * 0.95;
    }
    // Erro humano consoante a dificuldade.
    const err = (1 - skill) * 0.022;
    angle += (rng.next() + rng.next() - 1) * err;
    return { x, angle: THREE.MathUtils.clamp(angle, -MAX_AIM * 1.5, MAX_AIM * 1.5), spin: spin + (rng.next() - 0.5) * (1 - skill) * 0.4, power };
  }

  private async celebrate(seat: Seat, knocked: number, standing: number, freshRack: boolean, gutter: boolean): Promise<void> {
    const m = this.model(seat.id);
    // Vira-se para a câmara para reagir.
    m.faceYaw(0);
    this.cameraTo({ x: m.root.position.x * 0.5, y: 1.9, z: RELEASE_Z - 3.2 }, { x: m.root.position.x, y: 1.1, z: RELEASE_Z + 1 }, { speed: 3 });
    if (standing === 0 && freshRack) {
      m.setAnim('cheer');
      this.ctx.seats.vibrate(seat, [100, 50, 100, 50, 300]);
      sound.play('cheer');
      await this.ctx.hud.banner('STRIKE!', { hold: 1.4, color: '#ffd23f' });
      await this.replay();
    } else if (standing === 0) {
      m.setAnim('cheer');
      this.ctx.seats.vibrate(seat, [80, 50, 200]);
      await this.ctx.hud.banner('SPARE!', { hold: 1.6, color: '#3fd0ff' });
    } else if (gutter) {
      m.setAnim('sad');
      sound.play('aww', { vol: 0.6 });
      await this.ctx.hud.banner('Calha…', { hold: 1.3, color: '#b9a9e8' });
    } else {
      m.setAnim(knocked >= 7 ? 'cheer' : knocked <= 2 ? 'sad' : 'idle');
      await this.ctx.hud.banner(`${knocked} pino${knocked === 1 ? '' : 's'}`, { hold: 1.2 });
    }
    m.setAnim('idle');
    m.faceYaw(Math.PI);
  }

  /** Repetição do strike em câmara lenta, de um ângulo baixo ao lado dos pinos. */
  private async replay(): Promise<void> {
    const rec = this.recording;
    if (!rec || rec.length < 10) return;
    this.replaying = true;
    this.ctx.hud.hint('🔁 Repetição', true);
    this.cameraTo({ x: 0.85, y: 1.05, z: PIN_Z + 4 }, { x: -0.2, y: 0.3, z: PIN_Z - 0.8 }, { instant: true });
    this.ball.visible = true;
    this.pinMeshes.forEach((p) => (p.visible = true));
    const times: number[] = [];
    let acc = 0;
    for (const fr of rec) times.push((acc += fr.dt));
    this.replayState = { rec, times, clock: 0 };
    while (this.replayState) await this.wait(0.05);
    await this.wait(0.6);
    this.ctx.hud.hint(null, true);
    this.ball.visible = false;
    this.replaying = false;
  }

  /** Máquina de pinos: levanta os de pé, varre os caídos, volta a pousar (ou põe 10 novos). */
  private async pinsetter(reset: boolean): Promise<void> {
    const phys = this.phys!;
    this.syncPins = false;
    this.cameraTo({ x: 0, y: 2.4, z: PIN_Z + 6.5 }, { x: 0, y: 0.6, z: PIN_Z - 0.5 }, { speed: 3 });
    const standing = this.pinMeshes.map((_, i) => !phys.isDown(i));
    const bar = this.sweepBar;
    const lifted = this.pinMeshes.filter((_, i) => standing[i] && !reset);
    // Desce a barra e levanta os pinos de pé.
    await this.tween(0.35, (k) => {
      bar.position.y = 1.9 - k * 1.55;
      for (const p of lifted) p.position.y = k * 1.3;
    });
    // Varre para trás.
    const z0 = PIN_Z + 1;
    await this.tween(0.45, (k) => {
      bar.position.z = z0 + (DECK_END - 0.4 - z0) * k;
      this.pinMeshes.forEach((p, i) => {
        if (!lifted.includes(p) && p.position.z > bar.position.z) p.visible = false;
      });
    });
    bar.position.set(0, 1.9, z0);
    if (reset) {
      phys.resetPins();
      this.pinMeshes.forEach((p, i) => {
        this.applyPose(p, phys.pose(phys.pins[i]!));
        p.position.y = 1.3;
        p.visible = true;
      });
      await this.tween(0.45, (k) => this.pinMeshes.forEach((p) => (p.position.y = 1.3 * (1 - k))), ease.inOut);
    } else {
      phys.clearFallen();
      this.pinMeshes.forEach((p, i) => {
        if (!lifted.includes(p)) return;
        const pose = phys.pose(phys.pins[i]!);
        p.rotation.set(0, 0, 0);
        p.position.x = pose.x;
        p.position.z = pose.z;
      });
      await this.tween(0.35, (k) => lifted.forEach((p) => (p.position.y = 1.3 * (1 - k))), ease.inOut);
    }
    this.syncPins = true;
  }

  private holdBall(m: CharacterModel): void {
    this.handBall.removeFromParent();
    this.handBall.scale.setScalar(1);
    this.handBall.position.set(0, 0, 0);
    m.attach(this.handBall, 'right');
  }

  private seatEveryone(): void {
    this.players.forEach((p, i) => {
      const m = this.model(p.id);
      const spot = this.benchSpots[i % this.benchSpots.length]!;
      m.root.position.copy(spot);
      m.faceYaw(Math.PI, true);
      m.setAnim('sit');
    });
  }

  // ── Simulação e câmara ──────────────────────────────────

  protected override tick(dt: number, time: number): void {
    if (this.aiming) {
      const pad = this.ctx.seats.pad(this.aiming);
      if (this.botTarget) {
        this.aimX += (this.botTarget.x - this.aimX) * Math.min(1, dt * 2.5);
        this.aimAngle += (this.botTarget.angle - this.aimAngle) * Math.min(1, dt * 2);
      } else {
        this.aimX = THREE.MathUtils.clamp(this.aimX + pad.stick.x * dt * 1.6, -LANE_HALF + 0.25, LANE_HALF - 0.25);
        const target = this.ctx.seats.aim(this.aiming) * MAX_AIM;
        this.aimAngle += (target - this.aimAngle) * Math.min(1, dt * 10);
      }
      const m = this.models.get(this.aiming.id);
      if (m) m.root.position.x = this.aimX;
      this.aimLine.children.forEach((dot, i) => {
        const d = 1.2 + i * 1.6;
        dot.position.set(this.aimX + Math.sin(this.aimAngle) * d, 0.03 + Math.sin(time * 6 - i) * 0.015, -Math.cos(this.aimAngle) * d);
        dot.rotation.z = -this.aimAngle;
        (dot as THREE.Mesh).scale.setScalar(1 - i * 0.05);
      });
    }

    const phys = this.phys;
    if (phys && !this.replaying) {
      phys.advance(dt);
      if (this.ball.visible) this.applyPose(this.ball, phys.pose(phys.ball));
      if (this.syncPins)
        phys.pins.forEach((b, i) => {
          const pin = this.pinMeshes[i]!;
          pin.visible = b.isEnabled();
          if (pin.visible) this.applyPose(pin, phys.pose(b));
        });

      if (this.followBall) {
        const b = phys.ball.translation();
        if (b.z > PIN_Z + 7) this.cameraTo({ x: b.x * 0.5, y: 2.5, z: b.z + 5.5 }, { x: b.x * 0.6, y: 0.3, z: b.z - 8 }, { speed: 6 });
        else this.cameraTo({ x: 0, y: 1.7, z: PIN_Z + 5 }, { x: 0, y: 0.35, z: PIN_Z - 0.6 }, { speed: 3 });
        // Câmara lenta mesmo no impacto (só em bolas contra os 10 pinos).
        if (this.slowmoArmed && !phys.gutter && b.z < PIN_Z + 1.4) {
          this.slowmoArmed = false;
          this.slowmo = 0.45;
          this.ctx.engine.timeScale = this.baseTimeScale * 0.3;
          sound.play('pins');
        }
        // Grava para a repetição.
        if (b.z < PIN_Z + 6) {
          this.recording ??= [];
          if (this.recording.reduce((t, f) => t + f.dt, 0) < 2.4) {
            this.recording.push({ dt, ball: phys.ball.isEnabled() ? phys.pose(phys.ball) : null, pins: phys.pins.map((p) => phys.pose(p)) });
          }
        }
      }
    }
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      if (this.slowmo <= 0) this.stopSlowmo();
    }
    if (this.replayState) {
      const r = this.replayState;
      r.clock += dt / 2.2;
      let idx = r.times.findIndex((t) => t >= r.clock);
      if (idx < 0) idx = r.rec.length - 1;
      const fr = r.rec[idx]!;
      this.applyPose(this.ball, fr.ball);
      fr.pins.forEach((p, i) => this.applyPose(this.pinMeshes[i]!, p));
      if (r.clock >= r.times[r.times.length - 1]!) this.replayState = null;
    }
    this.updateNeighbors(dt);
  }

  private stopSlowmo(): void {
    if (this.slowmo > 0 || this.ctx.engine.timeScale !== this.baseTimeScale) this.ctx.engine.timeScale = this.baseTimeScale;
    this.slowmo = 0;
  }

  private applyPose(obj: THREE.Object3D, p: Pose | null): void {
    if (!p) {
      obj.visible = false;
      return;
    }
    obj.position.set(p.x, p.y, p.z);
    obj.quaternion.set(p.qx, p.qy, p.qz, p.qw);
  }

  // ── Placar ──────────────────────────────────────────────

  private updateScoreboard(activeId: string): void {
    this.scoreboard(
      this.players.map((p) => {
        const frames = this.frames.get(p.id)!;
        const lastFrame = frames[frames.length - 1];
        const symbols = lastFrame ? rollSymbols(lastFrame, frames.length === this.totalFrames).join(' ') : '';
        return { id: p.id, text: `${symbols ? `[${symbols}] ` : ''}${runningTotal(frames, this.totalFrames)}`, active: p.id === activeId };
      }),
    );
  }

  private buildBoard(): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh } {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 110 + this.players.length * 100;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const w = 8.5;
    const h = (w * canvas.height) / canvas.width;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    const frame = mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.15), toon('#111522'));
    frame.position.z = -0.09;
    const holder = new THREE.Group();
    holder.add(frame, screen);
    holder.position.set(0, 3.5 + h / 2, -3);
    holder.rotation.x = 0.12;
    for (const side of [-1, 1]) {
      const rod = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3), toon('#555b66'));
      rod.position.set(side * (w / 2 - 0.4), h / 2 + 1.5, -0.05);
      holder.add(rod);
    }
    this.scene.add(holder);
    return { canvas, texture, mesh: screen };
  }

  /** Placar suspenso: 10 jogadas com X, / e totais acumulados, como no bowling real. */
  private drawBoard(): void {
    const { canvas, texture } = this.board;
    const c = canvas.getContext('2d')!;
    const W = canvas.width;
    const F = this.totalFrames;
    const nameW = 330;
    const totW = 190;
    const fw = (W - nameW - totW - 40) / F;
    c.fillStyle = '#0d1430';
    c.fillRect(0, 0, W, canvas.height);
    c.font = 'bold 44px system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillStyle = '#7fb2ff';
    for (let f = 0; f < F; f++) c.fillText(String(f + 1), 20 + nameW + fw * f + fw / 2, 55);
    c.fillText('Total', W - 20 - totW / 2, 55);
    this.players.forEach((p, row) => {
      const y = 110 + row * 100;
      const active = p.id === this.activeId;
      c.fillStyle = active ? '#2b3f8f' : row % 2 ? '#141d42' : '#18224d';
      c.fillRect(10, y + 4, W - 20, 92);
      c.textAlign = 'left';
      c.fillStyle = getCharacter(p.characterId).color;
      c.font = 'bold 48px system-ui, sans-serif';
      c.fillText((active ? '▶ ' : '') + p.name, 26, y + 50, nameW - 20);
      const frames = this.frames.get(p.id)!;
      const totals = scoreFrames(frames, F);
      c.textAlign = 'center';
      for (let f = 0; f < F; f++) {
        const x = 20 + nameW + fw * f;
        c.strokeStyle = '#3a4a85';
        c.lineWidth = 3;
        c.strokeRect(x, y + 6, fw, 88);
        const fr = frames[f];
        if (!fr) continue;
        const syms = rollSymbols(fr, f === F - 1);
        const boxW = 42;
        syms.forEach((s, i) => {
          const bx = x + fw - boxW * (syms.length - i) - 4;
          c.strokeRect(bx, y + 6, boxW, 40);
          c.fillStyle = s === 'X' ? '#ffd23f' : s === '/' ? '#3fd0ff' : '#ffffff';
          c.font = 'bold 34px system-ui, sans-serif';
          c.fillText(s, bx + boxW / 2, y + 27);
        });
        const tot = totals[f];
        if (tot !== null && tot !== undefined) {
          c.fillStyle = '#ffffff';
          c.font = 'bold 36px system-ui, sans-serif';
          c.fillText(String(tot), x + fw / 2, y + 72);
        }
      }
      c.fillStyle = '#ffd23f';
      c.font = 'bold 56px system-ui, sans-serif';
      c.fillText(String(runningTotal(frames, F)), W - 20 - totW / 2, y + 52);
    });
    texture.needsUpdate = true;
  }

  // ── Pistas vizinhas (bots a jogar ao fundo) ─────────────

  private updateNeighbors(dt: number): void {
    for (const n of this.neighbors) {
      n.timer -= dt;
      if (n.phase === 'wait' && n.timer <= 0) {
        n.phase = 'roll';
        n.timer = 2.4;
        n.model.setAnim('throw');
        n.ball.visible = true;
        n.curve = (Math.random() - 0.5) * 0.8;
        const count = Math.random() < 0.3 ? 10 : 3 + Math.floor(Math.random() * 7);
        n.knock = [...Array(10).keys()].sort(() => Math.random() - 0.5).slice(0, count);
      } else if (n.phase === 'roll') {
        const k = 1 - n.timer / 2.4;
        n.ball.position.set(n.x + Math.sin(k * Math.PI) * n.curve * 0.5, BALL_R, -0.3 + (PIN_Z + 0.3) * k);
        n.ball.rotation.x -= dt * 25;
        if (n.timer <= 0) {
          n.phase = 'fall';
          n.timer = 2.2;
          n.ball.visible = false;
        }
      } else if (n.phase === 'fall') {
        for (const i of n.knock) {
          const p = n.pins[i]!;
          p.rotation.x = Math.min(Math.PI / 2, p.rotation.x + dt * 6);
          p.position.z -= dt * 0.4;
        }
        if (n.timer <= 0) {
          n.phase = 'reset';
          n.timer = 1;
          n.model.setAnim(n.knock.length === 10 ? 'cheer' : 'idle');
        }
      } else if (n.phase === 'reset' && n.timer <= 0) {
        const spots = pinSpots();
        n.pins.forEach((p, i) => {
          p.rotation.set(0, 0, 0);
          p.position.set(n.x + spots[i]!.x, 0, spots[i]!.z);
        });
        n.model.setAnim('idle');
        n.phase = 'wait';
        n.timer = 3 + Math.random() * 6;
      }
      n.model.update(dt);
    }
  }

  // ── Salão ───────────────────────────────────────────────

  private buildHall(): void {
    this.scene.background = new THREE.Color('#1a1033');
    this.scene.fog = new THREE.Fog('#1a1033', 35, 80);
    this.sun.intensity = 0.9;
    this.sun.position.set(4, 20, 8);
    this.scene.add(new THREE.AmbientLight('#b9a9ff', 0.6));

    // Alcatifa às cores na zona de trás.
    const carpetTex = new THREE.CanvasTexture(carpetPattern());
    carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
    carpetTex.repeat.set(6, 3);
    carpetTex.colorSpace = THREE.SRGBColorSpace;
    const carpet = mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshToonMaterial({ map: carpetTex }), { cast: false, receive: true });
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.2, 12);
    const floor = mesh(new THREE.PlaneGeometry(40, 60), toon('#241845'), { cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.21, -24);
    this.scene.add(carpet, floor);

    // Pistas: a nossa ao centro e duas de cada lado.
    for (let k = -2; k <= 2; k++) this.buildLane(k * LANE_STEP, k === 0);

    // Retorno de bolas entre pistas.
    for (const x of [-LANE_STEP / 2, LANE_STEP / 2]) {
      const hood = mesh(new THREE.BoxGeometry(0.7, 0.9, 1.4), toon('#3b3f6b'));
      hood.position.set(x, 0.45, 5.2);
      const top = mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonUnique('#ff6fb5', { emissive: '#ff6fb5', emissiveIntensity: 0.3 }));
      top.position.set(x, 0.9, 5.2);
      const rail = mesh(new THREE.BoxGeometry(0.5, 0.15, 2.6), toon('#8a8f99'));
      rail.position.set(x, 0.6, 6.9);
      this.scene.add(hood, top, rail);
      ['#3fa7ff', '#ff5a5f', '#4cd964', '#ffd23f'].forEach((c, i) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.2 }));
        b.position.set(x, 0.6 + BALL_R, 6 + i * 0.48);
        b.castShadow = true;
        this.scene.add(b);
      });
    }

    // Bancos (sofás) de frente para a pista, onde os jogadores esperam.
    for (const row of [0, 1]) {
      const z = 9 + row * 2.2;
      const sofa = mesh(new THREE.BoxGeometry(9, 0.45, 0.9), toon(row ? '#5b3a8a' : '#ff5a5f'));
      sofa.position.set(0, 0.22, z);
      const back = mesh(new THREE.BoxGeometry(9, 0.9, 0.25), toon(row ? '#4a2f72' : '#d9434a'));
      back.position.set(0, 0.6, z + 0.5);
      this.scene.add(sofa, back);
      for (let i = 0; i < 5; i++) this.benchSpots.push(new THREE.Vector3(-3.6 + i * 1.8, 0.45, z - 0.05));
    }
    const table = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20), toon('#e8e2f0'));
    table.position.set(5.6, 0.75, 9.2);
    const leg = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75), toon('#8a8f99'));
    leg.position.set(5.6, 0.37, 9.2);
    this.scene.add(table, leg);

    // Teto escuro com faixas de luz e luzes ao longo da pista.
    const ceiling = mesh(new THREE.PlaneGeometry(40, 70), toon('#120a24'), { cast: false });
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 7.5, -16);
    this.scene.add(ceiling);
    for (let z = 8; z > PIN_Z - 2; z -= 6) {
      const strip = mesh(new THREE.BoxGeometry(14, 0.06, 0.25), toonUnique('#fff1d6', { emissive: '#fff1d6', emissiveIntensity: 1 }), { cast: false });
      strip.position.set(0, 7.4, z);
      this.scene.add(strip);
    }
    for (let z = 2; z > PIN_Z - 2; z -= 9) {
      const lamp = new THREE.PointLight('#fff1d6', 14, 16);
      lamp.position.set(0, 5, z);
      this.scene.add(lamp);
    }
    const pinLight = new THREE.SpotLight('#ffffff', 60, 14, 0.5, 0.5);
    pinLight.position.set(0, 4.5, PIN_Z + 3);
    pinLight.target.position.set(0, 0, PIN_Z - 0.5);
    this.scene.add(pinLight, pinLight.target);

    // Parede do fundo com néon.
    const back = mesh(new THREE.BoxGeometry(40, 8, 0.4), toon('#24163f'));
    back.position.set(0, 3.5, DECK_END - 2.6);
    this.scene.add(back);
    const neon = textSprite('🎳 FESTA BOWL', { height: 1.3, color: '#ff6fb5', stroke: '#2b0a3d' });
    neon.position.set(-2.2 * LANE_STEP, 2.6, DECK_END - 2.3);
    (neon.material as THREE.SpriteMaterial).depthTest = true;
    this.scene.add(neon);
    for (const side of [-1, 1]) {
      const stripe = mesh(new THREE.BoxGeometry(14, 0.12, 0.05), toonUnique(side < 0 ? '#3fd0ff' : '#ffd23f', { emissive: side < 0 ? '#3fd0ff' : '#ffd23f', emissiveIntensity: 1.2 }), { cast: false });
      stripe.position.set(side * 9, 4.6, DECK_END - 2.35);
      this.scene.add(stripe);
    }
    // Paredes laterais com máquinas de jogos.
    for (const side of [-1, 1]) {
      const wall = mesh(new THREE.BoxGeometry(0.4, 8, 70), toon('#2c1c52'));
      wall.position.set(side * (2.5 * LANE_STEP + 1.8), 3.5, -16);
      this.scene.add(wall);
      for (let i = 0; i < 3; i++) {
        const cab = new THREE.Group();
        const body = mesh(new THREE.BoxGeometry(0.9, 1.9, 0.8), toon(['#ff5a5f', '#3fa7ff', '#4cd964'][i]!));
        body.position.y = 0.95;
        const scr = mesh(new THREE.PlaneGeometry(0.6, 0.45), toonUnique('#7fffd4', { emissive: '#7fffd4', emissiveIntensity: 0.9 }), { cast: false });
        scr.position.set(0, 1.4, 0.41);
        cab.add(body, scr);
        cab.position.set(side * (2.5 * LANE_STEP + 1.1), -0.2, 8 + i * 1.3);
        cab.rotation.y = -side * Math.PI / 2;
        this.scene.add(cab);
      }
    }

    // Jogadores das pistas vizinhas.
    const free = CHARACTERS.filter((c) => !this.players.some((p) => p.characterId === c.id));
    const pool = free.length >= 4 ? free : CHARACTERS;
    [-2, -1, 1, 2].forEach((k, i) => {
      const x = k * LANE_STEP;
      const model = new CharacterModel(pool[i % pool.length]!);
      model.root.position.set(x, 0, RELEASE_Z + 0.4);
      model.faceYaw(Math.PI, true);
      this.scene.add(model.root);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ color: ['#ff5a5f', '#4cd964', '#b36bff', '#ffd23f'][i]!, roughness: 0.2 }));
      ball.visible = false;
      this.scene.add(ball);
      const pins = pinSpots().map((s) => {
        const p = makePin();
        p.position.set(x + s.x, 0, s.z);
        this.scene.add(p);
        return p;
      });
      this.neighbors.push({ x, model, ball, pins, timer: 1 + i * 2.3, phase: 'wait', knock: [], curve: 0 });
    });
  }

  private buildLane(x: number, main: boolean): void {
    const total = 4 - DECK_END;
    const wood = toonUnique(main ? '#e0ad6e' : '#cf9c5f');
    const lane = mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.2, total), wood, { cast: false, receive: true });
    lane.position.set(x, -0.1, 4 - total / 2);
    this.scene.add(lane);
    // Brilho do óleo na primeira parte.
    const oil = mesh(new THREE.PlaneGeometry(LANE_HALF * 2 - 0.1, 4 - OIL_END), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07 }), { cast: false });
    oil.rotation.x = -Math.PI / 2;
    oil.position.set(x, 0.004, (4 + OIL_END) / 2);
    this.scene.add(oil);
    // Linha de falta, pontos e setas.
    const foul = mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.01, 0.05), toon('#ff3b5c'), { cast: false });
    foul.position.set(x, 0.005, 0);
    this.scene.add(foul);
    for (let i = -3; i <= 3; i++) {
      const arrow = mesh(new THREE.ConeGeometry(0.06, 0.25, 3), toon('#7a4a1f'), { cast: false });
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(x + i * 0.25, 0.01, -5 - Math.abs(i) * 0.3);
      const dot = mesh(new THREE.CircleGeometry(0.035, 10), toon('#7a4a1f'), { cast: false });
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x + i * 0.25, 0.006, -2);
      this.scene.add(arrow, dot);
    }
    // Zona de aproximação (madeira clara).
    const approach = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2 + 0.6, 0.2, 4.5), toon('#f0c98f'), { cast: false, receive: true });
    approach.position.set(x, -0.1, 4 + 2.25);
    this.scene.add(approach);
    // Calhas e divisórias.
    for (const side of [-1, 1]) {
      const gutter = mesh(new THREE.CylinderGeometry(GUTTER / 2, GUTTER / 2, total, 12, 1, true, 0, Math.PI), toonUnique('#9aa3ad', { side: THREE.DoubleSide }), { cast: false, receive: true });
      gutter.rotation.set(Math.PI / 2, 0, Math.PI);
      gutter.position.set(x + side * (LANE_HALF + GUTTER / 2), -0.02, 4 - total / 2);
      this.scene.add(gutter);
      const divider = mesh(new THREE.BoxGeometry(0.2, 0.35, total), toon('#3b2566'), { receive: true });
      divider.position.set(x + side * (LANE_HALF + GUTTER + 0.1), 0.05, 4 - total / 2);
      this.scene.add(divider);
      // Paredes da zona dos pinos.
      const kick = mesh(new THREE.BoxGeometry(0.2, 1.2, 3.4), toon('#2a2a3a'));
      kick.position.set(x + side * (LANE_HALF + GUTTER + 0.1), 0.6, PIN_Z - 0.9);
      this.scene.add(kick);
    }
    // Máquina de pinos (capota) com o número da pista e luzes.
    const hood = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2 + 0.4, 1.6, 3.6), toon('#1c1f2e'));
    hood.position.set(x, 3.1, PIN_Z - 1);
    const face = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2 + 0.4, 0.5, 0.05), toonUnique(main ? '#ffd23f' : '#3fd0ff', { emissive: main ? '#ffd23f' : '#3fd0ff', emissiveIntensity: 0.9 }), { cast: false });
    face.position.set(x, 2.55, PIN_Z + 0.83);
    this.scene.add(hood, face);
    const number = textSprite(String(Math.round(x / LANE_STEP) + 7), { height: 0.55, color: '#ffffff', stroke: '#1c1f2e' });
    number.position.set(x, 3.4, PIN_Z + 0.9);
    (number.material as THREE.SpriteMaterial).depthTest = true;
    this.scene.add(number);
    // Fosso.
    const pit = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2, 0.1, 2.4), toon('#0d0820'), { cast: false });
    pit.position.set(x, -0.85, DECK_END - 1.2);
    const cushion = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2 + 0.4, 2.2, 0.2), toon('#0b0b12'));
    cushion.position.set(x, 0.6, DECK_END - 2.2);
    this.scene.add(pit, cushion);
  }

  override dispose(): void {
    this.ctx.engine.timeScale = this.baseTimeScale;
    for (const n of this.neighbors) n.model.dispose();
    this.handBall.removeFromParent();
    disposeObject(this.handBall);
    this.board.texture.dispose();
    this.phys?.dispose();
    super.dispose();
  }
}

function makePin(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    [0, 0], [0.09, 0], [0.12, 0.08], [0.13, 0.18], [0.11, 0.3], [0.06, 0.42], [0.055, 0.48], [0.075, 0.56], [0.06, 0.64], [0, 0.66],
  ] as const;
  const pts = profile.map(([r, y]) => new THREE.Vector2(r * 1.15, y * 1.15));
  const body = mesh(new THREE.LatheGeometry(pts, 16), toon('#ffffff'));
  const stripe = mesh(new THREE.CylinderGeometry(0.068, 0.07, 0.06, 16), toon('#ff3b5c'));
  stripe.position.y = 0.5;
  g.add(body, stripe);
  return g;
}

/** Padrão de alcatifa de salão de bowling (formas néon sobre fundo escuro). */
function carpetPattern(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1240';
  g.fillRect(0, 0, 256, 256);
  const colors = ['#ff6fb5', '#3fd0ff', '#ffd23f', '#7cff6b'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = colors[i % colors.length]!;
    g.lineWidth = 4;
    const x = rnd() * 256;
    const y = rnd() * 256;
    const s = 8 + rnd() * 14;
    g.beginPath();
    if (i % 3 === 0) g.arc(x, y, s, 0, Math.PI * 2);
    else if (i % 3 === 1) {
      g.moveTo(x - s, y + s);
      g.lineTo(x, y - s);
      g.lineTo(x + s, y + s);
      g.closePath();
    } else {
      g.moveTo(x - s, y);
      g.quadraticCurveTo(x, y - s, x + s, y);
    }
    g.stroke();
  }
  return c;
}
