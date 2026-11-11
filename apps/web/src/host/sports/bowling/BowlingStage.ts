/**
 * Bowling 3D. Pista ao longo de -Z: linha de falta em z=0, pinos ao fundo.
 * Física simplificada em 2D (plano XZ): bola e pinos são círculos que chocam;
 * um pino que se mexe tomba. O efeito (spin) faz a bola curvar na parte final da pista.
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { isFrameDone, rollSymbols, runningTotal, shouldResetPins, type BowlingFrame } from '@festa/game/sports/bowling';
import type { SwingInput } from '@festa/shared';
import { mesh, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import { botSwing, rankBy, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const LANE_HALF = 1.0;
const GUTTER = 0.35;
const LANE_LEN = 26;
const PIN_Z = -LANE_LEN;
const PIN_SPACING = 0.52;
const PIN_R = 0.13;
const BALL_R = 0.22;
const OIL_END = -LANE_LEN * 0.45;

interface Pin {
  mesh: THREE.Group;
  home: THREE.Vector2;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  standing: boolean;
  /** Já foi derrubado nesta bola (para contar). */
  hit: boolean;
  removed: boolean;
  tilt: number;
  tiltDir: number;
}

export class BowlingStage extends SportStage {
  private readonly pins: Pin[] = [];
  private readonly ball: THREE.Mesh;
  private readonly ballMat: THREE.MeshStandardMaterial;
  private readonly aimMarker: THREE.Mesh;
  private ballPos = new THREE.Vector2();
  private ballVel = new THREE.Vector2();
  private hook = 0;
  private rolling = false;
  private inGutter = false;
  private aimX = 0;
  private readonly frames = new Map<string, BowlingFrame[]>();
  private readonly totalFrames: number;

  constructor(ctx: SportContext) {
    super(ctx);
    this.totalFrames = ctx.players.length <= 4 ? 10 : 5;
    this.buildAlley();
    this.ballMat = new THREE.MeshStandardMaterial({ color: '#3fa7ff', roughness: 0.15, metalness: 0.2 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), this.ballMat);
    this.ball.castShadow = true;
    this.ball.visible = false;
    this.scene.add(this.ball);

    this.aimMarker = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 3),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85 }),
    );
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.aimMarker.position.set(0, 0.06, -4);
    this.scene.add(this.aimMarker);

    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        const x = (i - row / 2) * PIN_SPACING;
        const z = PIN_Z - row * PIN_SPACING * 0.866;
        const pin = this.makePin();
        this.scene.add(pin);
        this.pins.push({
          mesh: pin,
          home: new THREE.Vector2(x, z),
          pos: new THREE.Vector2(x, z),
          vel: new THREE.Vector2(),
          standing: true,
          hit: false,
          removed: false,
          tilt: 0,
          tiltDir: 0,
        });
      }
    }
    this.resetPins();
    for (const p of ctx.players) this.frames.set(p.id, []);
  }

  // ── Jogo ────────────────────────────────────────────────

  async play(): Promise<SportStanding[]> {
    this.cameraTo({ x: 0, y: 3, z: 6 }, { x: 0, y: 0.5, z: -14 }, { instant: true });
    await this.ctx.hud.banner('Bowling!', { sub: `${this.totalFrames} jogadas`, hold: 1.8 });

    for (let f = 0; f < this.totalFrames; f++) {
      const last = f === this.totalFrames - 1;
      for (const seat of this.players) {
        this.ctx.hud.setRound(`Jogada ${f + 1} / ${this.totalFrames}`);
        await this.playerFrame(seat, f, last);
      }
    }
    this.ctx.hud.setRound(null);
    const ranked = rankBy(this.players, (p) => runningTotal(this.frames.get(p.id)!, this.totalFrames));
    return ranked.map((p) => ({ id: p.id, rank: p.rank, score: `${runningTotal(this.frames.get(p.id)!, this.totalFrames)} pontos` }));
  }

  private async playerFrame(seat: Seat, f: number, last: boolean): Promise<void> {
    const frame: BowlingFrame = [];
    this.frames.get(seat.id)!.push(frame);
    this.resetPins();
    this.ballMat.color.set(getCharacter(seat.characterId).color);
    this.updateScoreboard(seat.id);
    this.waitAll(`Vez de ${seat.name} 🎳`, seat.id);
    await this.ctx.hud.banner(`${seat.name}`, { sub: `Jogada ${f + 1}`, hold: 1 });

    while (!isFrameDone(frame, last)) {
      const knocked = await this.bowl(seat, frame.length + 1);
      frame.push(knocked);
      this.updateScoreboard(seat.id);
      const standing = this.standingCount();
      await this.celebrate(seat, knocked, standing, this.wasFreshRack(frame));
      if (shouldResetPins(frame, last, standing)) this.resetPins();
      else this.clearFallen();
    }
  }

  /** A bola que acabou de ser jogada foi contra um conjunto completo de pinos? */
  private wasFreshRack(frame: BowlingFrame): boolean {
    const i = frame.length - 1;
    if (i === 0) return true;
    if (frame[i - 1] === 10) return true;
    return i === 2 && frame[0]! + frame[1]! === 10;
  }

  private async celebrate(seat: Seat, knocked: number, standing: number, freshRack: boolean): Promise<void> {
    const m = this.model(seat.id);
    if (standing === 0 && freshRack) {
      m.setAnim('cheer');
      this.ctx.seats.vibrate(seat, [100, 50, 100, 50, 300]);
      await this.ctx.hud.banner('STRIKE!', { hold: 1.8, color: '#ffd23f' });
    } else if (standing === 0) {
      m.setAnim('cheer');
      this.ctx.seats.vibrate(seat, [80, 50, 200]);
      await this.ctx.hud.banner('SPARE!', { hold: 1.6, color: '#3fd0ff' });
    } else if (this.inGutter) {
      m.setAnim('sad');
      await this.ctx.hud.banner('Calha…', { hold: 1.2, color: '#b9a9e8' });
    } else {
      m.setAnim(knocked >= 7 ? 'cheer' : knocked === 0 ? 'sad' : 'idle');
      await this.ctx.hud.banner(`${knocked} pino${knocked === 1 ? '' : 's'}`, { hold: 1.1 });
    }
    m.setAnim('idle');
  }

  /** Uma bola: apontar, lançar, simular. Devolve quantos pinos caíram. */
  private async bowl(seat: Seat, ballNo: number): Promise<number> {
    const m = this.model(seat.id);
    for (const other of this.models.values()) other.root.visible = other === m;
    m.root.position.set(0, 0, 3);
    m.faceYaw(Math.PI, true);
    m.setAnim('idle');
    this.aimX = 0;
    this.aimMarker.visible = true;
    this.cameraTo({ x: 0.9, y: 3.6, z: 8 }, { x: 0, y: 0.2, z: -14 }, { instant: true });

    const swing = await this.ctx.seats.awaitSwing(seat, {
      layout: {
        kind: 'motion',
        action: 'throw',
        aim: true,
        prompt: `Bola ${ballNo}: joystick para te posicionares, depois lança!`,
        hint: 'Rodar o pulso (ou curvar o dedo) dá efeito à bola',
      },
      bot: () => this.botThrow(),
      botDelay: 1.6,
    });
    this.aimMarker.visible = false;
    this.waitAll(`${seat.name} lançou!`);
    this.setLayout(seat, { kind: 'wait', message: 'Lá vai ela… 🎳' });

    // Pequena corrida e lançamento
    m.setAnim('walk');
    const startZ = 3;
    await this.tween(0.6, (t) => (m.root.position.z = startZ - t * 2.4), ease.inOut);
    m.setAnim('hit');
    await this.wait(0.15);

    const standingBefore = this.standingCount();
    this.launch(swing);
    m.setAnim('idle');
    // Segue a bola e depois mostra os pinos
    await this.wait(0.5);
    this.cameraTo({ x: 0, y: 2.4, z: PIN_Z + 6 }, { x: 0, y: 0.2, z: PIN_Z - 0.6 }, { speed: 2.4 });
    let t = 0;
    while (this.rolling && t < 9) {
      await this.wait(0.1);
      t += 0.1;
    }
    await this.wait(0.6);
    return standingBefore - this.standingCount();
  }

  private standingCount(): number {
    return this.pins.filter((p) => p.standing && !p.removed).length;
  }

  private launch(s: SwingInput): void {
    const speed = 9 + s.power * 13;
    const angle = s.dir * 0.055;
    this.ballPos.set(this.aimX, -0.3);
    this.ballVel.set(Math.sin(angle) * speed, -Math.cos(angle) * speed);
    this.hook = -s.spin * 1.3;
    this.inGutter = false;
    this.rolling = true;
    this.ball.visible = true;
    for (const p of this.pins) p.hit = false;
  }

  private botThrow(): SwingInput {
    const rng = this.ctx.rng;
    // Bots: ficam perto do centro e lançam com pouco efeito.
    this.aimX = (rng.next() - 0.5) * 0.4;
    const sloppy = 1.4 - this.ctx.botSkill;
    return botSwing(rng, this.ctx.botSkill, { spin: (rng.next() - 0.5) * 0.3 * sloppy, dir: (rng.next() - 0.5) * 0.4 * sloppy - this.aimX * 0.8 });
  }

  // ── Simulação ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    // Apontar com o joystick (só antes de lançar).
    const active = this.aimMarker.visible ? this.activeSeat() : undefined;
    if (active) {
      const pad = this.ctx.seats.pad(active);
      this.aimX = THREE.MathUtils.clamp(this.aimX + pad.stick.x * dt * 1.6, -LANE_HALF + 0.25, LANE_HALF - 0.25);
      const m = this.models.get(active.id);
      if (m) m.root.position.x = this.aimX;
      this.aimMarker.position.x = this.aimX;
      this.aimMarker.position.y = 0.06 + Math.sin(time * 6) * 0.03;
    }

    if (this.rolling) this.simulate(dt);
    for (const p of this.pins) {
      p.mesh.position.set(p.pos.x, 0, p.pos.y);
      p.mesh.rotation.set(0, 0, 0);
      if (!p.standing) {
        p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 9);
        p.mesh.rotation.set(Math.cos(p.tiltDir) * p.tilt, 0, -Math.sin(p.tiltDir) * p.tilt, 'YXZ');
      }
    }
  }

  private activeSeat(): Seat | undefined {
    for (const p of this.players) if (this.models.get(p.id)?.root.visible) return p;
    return undefined;
  }

  private simulate(dt: number): void {
    const steps = 4;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      // Bola
      if (!this.inGutter) {
        if (this.ballPos.y < OIL_END) this.ballVel.x += this.hook * h;
        if (Math.abs(this.ballPos.x) > LANE_HALF) {
          this.inGutter = true;
          this.ballPos.x = Math.sign(this.ballPos.x) * (LANE_HALF + GUTTER / 2);
          this.ballVel.x = 0;
        }
      }
      this.ballPos.addScaledVector(this.ballVel, h);

      if (!this.inGutter) {
        for (const p of this.pins) {
          if (p.removed) continue;
          this.collide(this.ballPos, this.ballVel, BALL_R, 7, p, true);
        }
      }
      // Pinos entre si
      for (const a of this.pins) {
        if (a.removed || a.vel.lengthSq() < 0.01) continue;
        for (const b of this.pins) if (a !== b && !b.removed) this.collide(a.pos, a.vel, PIN_R, 1, b, false);
      }
      for (const p of this.pins) {
        if (p.removed) continue;
        p.pos.addScaledVector(p.vel, h);
        p.vel.multiplyScalar(1 - 2.2 * h);
        // Paredes laterais da caixa dos pinos
        const wall = LANE_HALF + GUTTER + 0.3;
        if (Math.abs(p.pos.x) > wall) {
          p.pos.x = Math.sign(p.pos.x) * wall;
          p.vel.x *= -0.5;
        }
        if (p.pos.y < PIN_Z - 3) p.removed = true; // caiu para o fosso
      }
    }
    const y = this.ballPos.y;
    this.ball.position.set(this.ballPos.x, this.inGutter ? BALL_R - 0.15 : BALL_R, y);
    this.ball.rotation.x -= (this.ballVel.y * dt) / BALL_R;

    // Câmara acompanha a bola na primeira parte
    if (y < -3 && y > PIN_Z + 8) this.cameraTo({ x: this.ballPos.x * 0.5, y: 3.2, z: y + 6 }, { x: this.ballPos.x, y: 0.3, z: y - 8 }, { speed: 5 });

    const settled = this.pins.every((p) => p.removed || p.vel.lengthSq() < 0.02);
    if (y < PIN_Z - 3.5 && settled) {
      this.rolling = false;
      this.ball.visible = false;
    }
  }

  /** Choque entre um corpo em movimento (pos/vel) e um pino. */
  private collide(pos: THREE.Vector2, vel: THREE.Vector2, r: number, mass: number, pin: Pin, isBall: boolean): void {
    const d = pin.pos.clone().sub(pos);
    const dist = d.length();
    const min = r + PIN_R;
    if (dist >= min || dist === 0) return;
    const n = d.divideScalar(dist);
    pin.pos.copy(pos).addScaledVector(n, min);
    const rel = vel.clone().sub(pin.vel).dot(n);
    if (rel <= 0) return;
    const j = (1.6 * rel) / (1 / mass + 1);
    pin.vel.addScaledVector(n, j);
    vel.addScaledVector(n, -j / mass);
    if (isBall) {
      // A bola desvia-se um pouco mas continua.
      vel.y = Math.min(vel.y, -4);
    }
    if (pin.standing) {
      pin.standing = false;
      pin.hit = true;
      pin.tiltDir = Math.atan2(n.x, -n.y);
    }
  }

  private resetPins(): void {
    for (const p of this.pins) {
      p.pos.copy(p.home);
      p.vel.set(0, 0);
      p.standing = true;
      p.hit = false;
      p.removed = false;
      p.tilt = 0;
      p.mesh.visible = true;
    }
  }

  /** Remove os pinos caídos (a "varredora"), deixa os de pé. */
  private clearFallen(): void {
    for (const p of this.pins) {
      if (!p.standing) {
        p.removed = true;
        p.mesh.visible = false;
      } else {
        p.vel.set(0, 0);
      }
      p.hit = false;
    }
  }

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

  // ── Cenário ─────────────────────────────────────────────

  private makePin(): THREE.Group {
    const g = new THREE.Group();
    const pts: THREE.Vector2[] = [];
    const profile = [
      [0, 0], [0.09, 0], [0.12, 0.08], [0.13, 0.18], [0.11, 0.3], [0.06, 0.42], [0.055, 0.48], [0.075, 0.56], [0.06, 0.64], [0, 0.66],
    ] as const;
    for (const [r, y] of profile) pts.push(new THREE.Vector2(r * 1.15, y * 1.15));
    const body = mesh(new THREE.LatheGeometry(pts, 16), toon('#ffffff'));
    const stripe = mesh(new THREE.CylinderGeometry(0.068, 0.07, 0.06, 16), toon('#ff3b5c'));
    stripe.position.y = 0.5;
    g.add(body, stripe);
    return g;
  }

  private buildAlley(): void {
    this.scene.background = new THREE.Color('#2a1a4a');
    this.scene.fog = new THREE.Fog('#2a1a4a', 30, 70);
    const wood = toonUnique('#d9a566');
    const lane = mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.2, LANE_LEN + 8), wood, { cast: false, receive: true });
    lane.position.set(0, -0.1, -LANE_LEN / 2 + 2);
    this.scene.add(lane);

    // Marcas (setas de pontaria e linha de falta)
    const foul = mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.01, 0.05), toon('#ff3b5c'), { cast: false });
    foul.position.set(0, 0.005, 0);
    this.scene.add(foul);
    for (let i = -3; i <= 3; i++) {
      const arrow = mesh(new THREE.ConeGeometry(0.06, 0.25, 3), toon('#7a4a1f'), { cast: false });
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(i * 0.25, 0.01, -5 - Math.abs(i) * 0.3);
      this.scene.add(arrow);
    }

    // Calhas
    for (const side of [-1, 1]) {
      const gutter = mesh(new THREE.CylinderGeometry(GUTTER / 2, GUTTER / 2, LANE_LEN + 8, 12, 1, true, 0, Math.PI), toon('#9aa3ad'), {
        cast: false,
        receive: true,
      });
      gutter.rotation.set(Math.PI / 2, 0, Math.PI);
      gutter.position.set(side * (LANE_HALF + GUTTER / 2), 0, -LANE_LEN / 2 + 2);
      gutter.material = toonUnique('#9aa3ad', { side: THREE.DoubleSide });
      this.scene.add(gutter);
      const wall = mesh(new THREE.BoxGeometry(0.2, 0.5, LANE_LEN + 8), toon('#4b2f7a'), { receive: true });
      wall.position.set(side * (LANE_HALF + GUTTER + 0.1), 0.1, -LANE_LEN / 2 + 2);
      this.scene.add(wall);
      // Pistas vizinhas (decoração)
      const other = mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.2, LANE_LEN + 8), toon('#c99355'), { cast: false, receive: true });
      other.position.set(side * (LANE_HALF * 2 + GUTTER * 2 + 0.6), -0.1, -LANE_LEN / 2 + 2);
      this.scene.add(other);
    }
    // Fundo e fosso
    const back = mesh(new THREE.BoxGeometry(12, 4, 0.3), toon('#1b1033'), { receive: true });
    back.position.set(0, 1.5, PIN_Z - 3.2);
    const pit = mesh(new THREE.BoxGeometry(LANE_HALF * 2 + GUTTER * 2, 0.1, 2), toon('#120a24'), { cast: false });
    pit.position.set(0, -0.4, PIN_Z - 2.3);
    this.scene.add(back, pit);
    const sign = mesh(new THREE.BoxGeometry(6, 0.8, 0.1), toonUnique('#ff6fb5', { emissive: '#ff6fb5', emissiveIntensity: 0.6 }));
    sign.position.set(0, 3.2, PIN_Z - 3);
    this.scene.add(sign);
    // Chão e luzes interiores
    const floor = mesh(new THREE.PlaneGeometry(60, 80), toon('#3b2566'), { cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.21, -10);
    this.scene.add(floor);
    for (let z = 0; z > PIN_Z - 2; z -= 7) {
      const lamp = new THREE.PointLight('#fff1d6', 12, 14);
      lamp.position.set(0, 4, z);
      this.scene.add(lamp);
    }
    this.sun.intensity = 1.2;
    this.sun.position.set(4, 20, 6);
  }
}
