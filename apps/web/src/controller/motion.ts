/**
 * Gestos de desporto com o telemóvel (como um Joy-Con).
 *
 *  - `GestureTracker`: lê os sensores e envia um gesto no **fim** de cada movimento
 *    (quando a aceleração cai depois do pico) — não é preciso largar nenhum botão.
 *  - `swipeToSwing` / `touchPunch`: recurso para telemóveis sem sensores (arrastar o dedo).
 */
import type { MotionAction, SwingInput } from '@festa/shared';
import { sensors, type MotionSample } from './sensors';

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

/** Converte um gesto de arrastar em força/direção/efeito. */
export function swipeToSwing(
  points: { x: number; y: number; t: number }[],
  action: MotionAction,
): Omit<SwingInput, 't' | 'hand'> | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (action === 'swing') {
    // Ténis: qualquer direção. Lados = direção; para cima = topspin; para baixo = slice.
    const dx = last.x - first.x;
    const dy = first.y - last.y;
    const len = Math.hypot(dx, dy);
    if (len < 30) return null;
    const tail = points.filter((p) => last.t - p.t <= 120);
    const t0 = tail[0]!;
    const sp = Math.hypot(last.x - t0.x, last.y - t0.y) / Math.max(16, last.t - t0.t);
    return { power: clamp(sp / 2.6, 0.05, 1), dir: clamp((dx / len) * 1.3), spin: clamp((dy / len) * 1.2), source: 'touch' };
  }
  // Velocidade nos últimos ~120 ms (o "remate" do gesto).
  const tail = points.filter((p) => last.t - p.t <= 120);
  const t0 = tail[0]!;
  const dt = Math.max(16, last.t - t0.t);
  const sideways = action === 'bat';
  const main = sideways ? Math.abs(last.x - t0.x) : t0.y - last.y; // para cima = positivo
  const speed = main / dt; // px/ms
  const totalMain = sideways ? Math.abs(last.x - first.x) : first.y - last.y;
  if (totalMain < 30) return null;
  const scale = 2.6;
  const power = clamp(speed / scale, 0.05, 1);
  // Direção: desvio lateral face ao comprimento do gesto.
  const dir = sideways ? clamp((first.y - last.y) / Math.max(40, totalMain)) : clamp(((last.x - first.x) / Math.max(40, totalMain)) * 1.4);
  // Efeito: curvatura (quanto o meio do gesto fugiu da linha reta).
  const mid = points[Math.floor(points.length / 2)]!;
  const lineX = first.x + ((mid.y - first.y) / ((last.y - first.y) || 1)) * (last.x - first.x);
  const spin = sideways ? 0 : clamp(((mid.x - lineX) / Math.max(40, totalMain)) * 3);
  return { power, dir, spin, source: 'touch' };
}

/** Soco no ecrã: tocar = direto, arrastar de lado = gancho, arrastar para cima = uppercut. */
export function touchPunch(points: { x: number; y: number; t: number }[]): Omit<SwingInput, 't' | 'hand'> {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.x - first.x;
  const dy = first.y - last.y; // para cima = positivo
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(30, last.t - first.t);
  const power = clamp(0.45 + (dist / dt) * 0.25, 0.3, 1);
  let kind: SwingInput['kind'] = 'straight';
  if (dist > 28) kind = Math.abs(dx) > dy * 1.1 ? 'hook' : dy > 0 ? 'uppercut' : 'straight';
  return { power, dir: 0, spin: 0, source: 'touch', kind };
}

/** Deteta gestos: começa quando a aceleração passa o limiar e envia quando volta a cair. */
export class GestureTracker {
  private active = false;
  private peak = 0;
  private lateral = 0;
  private twist = 0;
  private vertical = 0;
  private spinRate = 0;
  private cooldown = 0;
  private off: (() => void) | null = null;

  constructor(
    private readonly action: MotionAction,
    private readonly onGesture: (s: Omit<SwingInput, 't' | 'hand'>) => void,
  ) {}

  start(): void {
    this.off ??= sensors.onSample((s) => this.sample(s));
  }

  stop(): void {
    this.off?.();
    this.off = null;
    this.active = false;
  }

  private sample(s: MotionSample): void {
    this.cooldown = Math.max(0, this.cooldown - s.dt);
    const mag = s.mag;
    if (!this.active) {
      if (this.cooldown > 0 || mag < 12) return;
      this.active = true;
      this.peak = 0;
      this.twist = 0;
    }
    this.twist += s.gamma * s.dt;
    if (mag > this.peak) {
      this.peak = mag;
      this.lateral = s.x;
      const g = Math.hypot(s.gx, s.gy, s.gz) || 1;
      this.vertical = ((s.x * s.gx + s.y * s.gy + s.z * s.gz) / g) / (mag || 1);
      this.spinRate = s.rot;
    }
    // Fim do gesto: a aceleração caiu bem abaixo do pico.
    if (mag < Math.max(5, this.peak * 0.35)) {
      this.active = false;
      this.cooldown = this.action === 'punch' ? 0.12 : 0.45;
      const punch = this.action === 'punch';
      this.onGesture({
        power: clamp((this.peak - 6) / 24, 0.05, 1),
        dir: clamp((this.lateral / Math.max(8, this.peak)) * 2),
        spin: punch ? 0 : clamp(this.twist / 120 + (this.action === 'swing' ? -this.vertical * 0.8 : 0)),
        source: 'motion',
        kind: punch ? (Math.abs(this.vertical) > 0.65 ? 'uppercut' : this.spinRate > 260 ? 'hook' : 'straight') : undefined,
      });
    }
  }
}
