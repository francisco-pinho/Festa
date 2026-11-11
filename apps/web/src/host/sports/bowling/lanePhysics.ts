/**
 * Física da pista de bowling com Rapier (sem Three.js, para se poder testar à parte).
 *
 * Unidades do jogo (~1,9× o metro real). Pista ao longo de -Z, linha de falta em z=0.
 *  - Óleo na primeira parte (atrito quase nulo: a bola desliza) e parte seca no fim
 *    (atrito: o efeito lateral da bola "agarra" e ela curva) — curva emergente.
 *  - Pinos: corpos rígidos (corpo + pescoço), caem por choque real.
 *  - Calhas mais baixas, paredes laterais na zona dos pinos, fosso e almofada ao fundo.
 */
import type * as RAPIER_NS from '@dimforge/rapier3d-compat';

type Rapier = typeof RAPIER_NS;

export const LANE_HALF = 1.0;
export const GUTTER = 0.36;
export const LANE_LEN = 26;
export const PIN_Z = -LANE_LEN;
export const PIN_SPACING = 0.52;
export const BALL_R = 0.22;
export const OIL_END = -LANE_LEN * 0.6;
export const DECK_END = PIN_Z - 1.75;
export const PIN_HEIGHT = 0.76;
const GRAVITY = -18;

export interface Pose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface Throw {
  /** Posição lateral de partida. */
  x: number;
  /** Velocidade (unidades/s). */
  speed: number;
  /** Ângulo em radianos (positivo = para a direita). */
  angle: number;
  /** Efeito: positivo curva para a esquerda. */
  spin: number;
}

/** Posições dos 10 pinos (x, z), pino 1 à frente. */
export function pinSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) out.push({ x: (i - row / 2) * PIN_SPACING, z: PIN_Z - row * PIN_SPACING * 0.866 });
  }
  return out;
}

/** Velocidade angular de efeito por unidade de `spin`. */
export let SPIN_RATE = 34;
export let PIN_DENSITY = 7;
export let PIN_REST = 0.6;
export function tune(o: { spin?: number; density?: number; rest?: number }): void {
  SPIN_RATE = o.spin ?? SPIN_RATE;
  PIN_DENSITY = o.density ?? PIN_DENSITY;
  PIN_REST = o.rest ?? PIN_REST;
}

export class LanePhysics {
  readonly world: RAPIER_NS.World;
  readonly pins: RAPIER_NS.RigidBody[] = [];
  readonly ball: RAPIER_NS.RigidBody;
  private readonly spots = pinSpots();
  private readonly down = new Set<number>();
  private accumulator = 0;
  readonly step = 1 / 120;
  /** A bola caiu na calha. */
  gutter = false;

  constructor(
    readonly R: Rapier,
    opts: { pins?: boolean } = {},
  ) {
    this.world = new R.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = this.step;
    this.buildLane();
    const ballBody = R.RigidBodyDesc.dynamic().setTranslation(0, -5, 5).setCcdEnabled(true).setCanSleep(false);
    this.ball = this.world.createRigidBody(ballBody);
    this.world.createCollider(R.ColliderDesc.ball(BALL_R).setDensity(140).setFriction(1).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0.1), this.ball);
    this.ball.setEnabled(false);
    if (opts.pins !== false) {
      for (const s of this.spots) {
        const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(s.x, 0, s.z).setCcdEnabled(true).setAngularDamping(0.6).setLinearDamping(0.15));
        const cd = (d: RAPIER_NS.ColliderDesc) => d.setDensity(PIN_DENSITY).setFriction(0.45).setRestitution(PIN_REST);
        this.world.createCollider(cd(R.ColliderDesc.cylinder(0.2, 0.135)).setTranslation(0, 0.21, 0), body);
        this.world.createCollider(cd(R.ColliderDesc.cylinder(0.17, 0.07)).setTranslation(0, 0.58, 0), body);
        this.pins.push(body);
      }
    }
  }

  private fixed(hx: number, hy: number, hz: number, x: number, y: number, z: number, friction = 0.5, restitution = 0.2): void {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
    this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(restitution), body);
  }

  private buildLane(): void {
    const start = 4;
    // Parte oleada (quase sem atrito) e parte seca.
    const oilLen = start - OIL_END;
    this.fixed(LANE_HALF, 0.1, oilLen / 2, 0, -0.1, start - oilLen / 2, 0.015);
    const dryLen = OIL_END - DECK_END;
    this.fixed(LANE_HALF, 0.1, dryLen / 2, 0, -0.1, OIL_END - dryLen / 2, 0.28);
    // Calhas (mais baixas) e paredes exteriores.
    const total = start - DECK_END;
    for (const side of [-1, 1]) {
      this.fixed(GUTTER / 2, 0.1, total / 2, side * (LANE_HALF + GUTTER / 2), -0.28, start - total / 2, 0.3);
      this.fixed(0.1, 0.6, total / 2 + 1.5, side * (LANE_HALF + GUTTER + 0.1), 0.3, start - total / 2 - 1.5, 0.3, 0.45);
    }
    // Fosso: chão bem mais baixo atrás da plataforma dos pinos; almofada ao fundo.
    this.fixed(3, 0.1, 1.5, 0, -0.9, DECK_END - 1.5, 0.8, 0);
    this.fixed(3, 1.5, 0.1, 0, 0.5, DECK_END - 2.2, 0.8, 0.05);
  }

  /** Volta a pôr os 10 pinos. */
  resetPins(): void {
    this.down.clear();
    this.pins.forEach((p, i) => {
      const s = this.spots[i]!;
      p.setEnabled(true);
      p.setTranslation({ x: s.x, y: 0, z: s.z }, false);
      p.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
      p.setLinvel({ x: 0, y: 0, z: 0 }, false);
      p.setAngvel({ x: 0, y: 0, z: 0 }, false);
      p.sleep();
    });
  }

  /** "Varredora": tira os pinos caídos e endireita os que ficaram de pé no sítio. */
  clearFallen(): void {
    this.pins.forEach((p, i) => {
      if (!p.isEnabled()) return;
      if (this.isDown(i)) {
        p.setEnabled(false);
        this.down.add(i);
      } else {
        const t = p.translation();
        p.setTranslation({ x: t.x, y: 0, z: t.z }, false);
        p.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
        p.setLinvel({ x: 0, y: 0, z: 0 }, false);
        p.setAngvel({ x: 0, y: 0, z: 0 }, false);
        p.sleep();
      }
    });
  }

  /** O pino i está caído (inclinado, no fosso ou já retirado)? */
  isDown(i: number): boolean {
    const p = this.pins[i]!;
    if (!p.isEnabled() || this.down.has(i)) return true;
    const t = p.translation();
    if (t.y < -0.15 || t.z < DECK_END || Math.abs(t.x) > LANE_HALF + 0.05) return true;
    const q = p.rotation();
    // Componente y do eixo "para cima" do pino.
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    return upY < 0.82;
  }

  standing(): number {
    let n = 0;
    for (let i = 0; i < this.pins.length; i++) if (!this.isDown(i)) n++;
    return n;
  }

  launch(t: Throw): void {
    const b = this.ball;
    b.setEnabled(true);
    b.setTranslation({ x: t.x, y: BALL_R + 0.01, z: -0.3 }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    const vx = Math.sin(t.angle) * t.speed;
    const vz = -Math.cos(t.angle) * t.speed;
    b.setLinvel({ x: vx, y: 0, z: vz }, true);
    // Efeito: rotação em torno do sentido da marcha (a fricção na parte seca faz curvar).
    const w = t.spin * SPIN_RATE;
    b.setAngvel({ x: 0, y: 0, z: w }, true);
    this.gutter = false;
  }

  hideBall(): void {
    this.ball.setEnabled(false);
  }

  /** A bola já chegou ao fosso (ou parou). */
  ballDone(): boolean {
    if (!this.ball.isEnabled()) return true;
    const t = this.ball.translation();
    const v = this.ball.linvel();
    return t.y < -0.4 || t.z < DECK_END - 0.5 || Math.hypot(v.x, v.z) < 0.3;
  }

  /** Tudo parado? */
  settled(): boolean {
    return this.pins.every((p) => !p.isEnabled() || p.isSleeping() || p.translation().y < -0.3 || p.translation().z < DECK_END || (Math.hypot(p.linvel().x, p.linvel().y, p.linvel().z) < 0.05 && Math.hypot(p.angvel().x, p.angvel().y, p.angvel().z) < 0.1));
  }

  advance(dt: number): void {
    this.accumulator = Math.min(this.accumulator + dt, this.step * 10);
    while (this.accumulator >= this.step) {
      this.world.step();
      this.accumulator -= this.step;
      if (this.ball.isEnabled() && !this.gutter) {
        const t = this.ball.translation();
        if (Math.abs(t.x) > LANE_HALF + 0.02 && t.z > PIN_Z + 1) this.gutter = true;
      }
    }
  }

  pose(body: RAPIER_NS.RigidBody): Pose {
    const t = body.translation();
    const q = body.rotation();
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  }

  /** Onde a bola passa na linha dos pinos (só a bola, sem pinos), para os bots apontarem. */
  static predictX(R: Rapier, t: Throw): number {
    const sim = new LanePhysics(R, { pins: false });
    sim.launch(t);
    let x = t.x;
    for (let i = 0; i < 600; i++) {
      sim.world.step();
      const p = sim.ball.translation();
      x = p.x;
      if (p.z <= PIN_Z || p.y < -0.1) break;
    }
    sim.dispose();
    return x;
  }

  dispose(): void {
    this.world.free();
  }
}
