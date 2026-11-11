/**
 * Comando de desporto (layout `motion`).
 *
 * Duas formas de fazer o gesto, que dão o mesmo resultado (força, direção, efeito):
 *  - **Movimento**: segura a zona com o polegar e faz o gesto com o telemóvel
 *    (como um comando com sensores). Precisa de HTTPS e, no iPhone, de autorização.
 *  - **Toque**: arrasta o dedo para cima na zona, com força. Funciona sempre.
 */
import type { ControllerInput, ControllerLayout, SwingInput } from '@festa/shared';
import { createJoystick } from './joystick';
import { sensors, type MotionSample } from './sensors';

type MotionLayout = Extract<ControllerLayout, { kind: 'motion' }>;
type Send = (input: ControllerInput, volatile?: boolean) => void;
type Hand = 'left' | 'right';

const ACTION_TEXT: Record<MotionLayout['action'], { touch: string; motion: string; icon: string }> = {
  throw: { icon: '🎳', touch: 'Arrasta para cima para lançar', motion: 'Segura aqui e lança com o braço' },
  swing: { icon: '🎾', touch: 'Arrasta para cima para bater', motion: 'Segura aqui e dá a raquetada' },
  punch: { icon: '🥊', touch: 'Toca/arrasta para dar um soco', motion: 'Segura e dá socos com o telemóvel' },
  pitch: { icon: '⚾', touch: 'Arrasta para cima para lançar', motion: 'Segura aqui e lança com o braço' },
  bat: { icon: '🏏', touch: 'Arrasta de lado para bater', motion: 'Segura aqui e bate com força' },
  putt: { icon: '⛳', touch: 'Arrasta para cima (devagar = fraco)', motion: 'Segura aqui e balança o telemóvel' },
};

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const MOTION_KEY = 'festa.motion';

export function renderMotion(view: HTMLElement, l: MotionLayout, send: Send): () => void {
  const text = ACTION_TEXT[l.action];
  const canMotion = sensors.supported;
  let useMotion = canMotion && sensors.active && localStorage.getItem(MOTION_KEY) !== 'off';
  const cleanups: (() => void)[] = [];

  view.innerHTML = `
    <div class="motion">
      <p class="prompt">${esc(l.prompt)}</p>
      ${l.aim ? '<div class="aim-zone"><span>🕹️ Apontar</span></div>' : ''}
      <div class="pads ${l.hands ? 'two' : ''}">
        ${(l.hands ? (['left', 'right'] as Hand[]) : (['right'] as Hand[]))
          .map((h) => `<div class="pad" data-hand="${h}"><span class="icon">${text.icon}</span><span class="label"></span>${l.hands ? `<small>${h === 'left' ? 'Esquerda' : 'Direita'}</small>` : ''}</div>`)
          .join('')}
      </div>
      ${l.guard ? '<button class="guard">🛡️ Defender (segura)</button>' : ''}
      ${l.hint ? `<p class="hint">${esc(l.hint)}</p>` : ''}
      <div class="mode-row">
        ${canMotion ? '<button class="mode-toggle"></button>' : '<small>Movimento indisponível (precisa de HTTPS) — usa o dedo</small>'}
      </div>
    </div>`;

  const labels = [...view.querySelectorAll<HTMLElement>('.pad .label')];
  const toggle = view.querySelector<HTMLButtonElement>('.mode-toggle');
  const refreshLabels = () => {
    labels.forEach((el) => (el.textContent = useMotion ? text.motion : text.touch));
    if (toggle) toggle.textContent = useMotion ? '📳 A usar movimento · mudar para toque' : '👆 A usar toque · mudar para movimento';
  };
  refreshLabels();
  toggle?.addEventListener('click', async () => {
    if (!useMotion && !(await sensors.enable())) {
      toggle.textContent = '📵 O telemóvel não está a enviar dados dos sensores';
      return;
    }
    useMotion = !useMotion;
    localStorage.setItem(MOTION_KEY, useMotion ? 'on' : 'off');
    refreshLabels();
  });

  // Joystick para apontar
  const aim = view.querySelector<HTMLElement>('.aim-zone');
  if (aim) {
    let last = 0;
    cleanups.push(
      createJoystick(aim, {
        radius: 55,
        onChange: (x, y) => {
          const now = performance.now();
          if (x === 0 && y === 0) send({ t: 'stick', x: 0, y: 0 });
          else if (now - last > 40) {
            last = now;
            send({ t: 'stick', x, y }, true);
          }
        },
      }),
    );
  }

  // Defesa
  const guard = view.querySelector<HTMLButtonElement>('.guard');
  if (guard) {
    const set = (up: boolean) => {
      guard.classList.toggle('down', up);
      send({ t: 'guard', up });
    };
    guard.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      set(true);
    });
    guard.addEventListener('pointerup', () => set(false));
    guard.addEventListener('pointercancel', () => set(false));
    cleanups.push(() => set(false));
  }

  const emit = (hand: Hand, s: Omit<SwingInput, 't' | 'hand'>, pad: HTMLElement) => {
    navigator.vibrate?.(Math.round(20 + s.power * 60));
    pad.classList.remove('hit');
    void pad.offsetWidth;
    pad.classList.add('hit');
    send({ t: 'swing', hand, ...s });
  };

  // ── Gestos ────────────────────────────────────────────
  for (const pad of view.querySelectorAll<HTMLElement>('.pad')) {
    const hand = pad.dataset.hand as Hand;
    let pointerId: number | null = null;
    let points: { x: number; y: number; t: number }[] = [];
    let motion: MotionTracker | null = null;

    pad.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
        /* sem captura */
      }
      pad.classList.add('held');
      points = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      if (useMotion) {
        motion = new MotionTracker(l.action === 'punch', (s) => emit(hand, s, pad));
        motion.start();
      } else if (l.action === 'punch') {
        // No toque, um toque simples já é um soco (força média).
        emit(hand, { power: 0.55, dir: 0, spin: 0, source: 'touch' }, pad);
      }
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      points.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (points.length > 60) points.shift();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      pad.classList.remove('held');
      if (motion) {
        const tracker = motion;
        motion = null;
        const s = tracker.stop();
        if (s) return emit(hand, s, pad);
        // Sem dados dos sensores: usa o gesto de arrastar como recurso.
        if (tracker.samples > 0) return;
      }
      points.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      const s = swipeToSwing(points, l.action);
      if (s && l.action !== 'punch') emit(hand, s, pad);
      else if (s && l.action === 'punch' && s.power > 0.6) emit(hand, s, pad);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    cleanups.push(() => motion?.stop());
  }

  return () => cleanups.forEach((fn) => fn());
}

/** Converte um gesto de arrastar em força/direção/efeito. */
export function swipeToSwing(
  points: { x: number; y: number; t: number }[],
  action: MotionLayout['action'],
): Omit<SwingInput, 't' | 'hand'> | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  // Velocidade nos últimos ~120 ms (o "remate" do gesto).
  const tail = points.filter((p) => last.t - p.t <= 120);
  const t0 = tail[0]!;
  const dt = Math.max(16, last.t - t0.t);
  const sideways = action === 'bat';
  const main = sideways ? Math.abs(last.x - t0.x) : t0.y - last.y; // para cima = positivo
  const speed = main / dt; // px/ms
  const totalMain = sideways ? Math.abs(last.x - first.x) : first.y - last.y;
  if (totalMain < 30) return null;
  const scale = action === 'putt' ? 1.6 : 2.6;
  const power = clamp(speed / scale, 0.05, 1);
  // Direção: desvio lateral face ao comprimento do gesto.
  const dir = sideways ? clamp((first.y - last.y) / Math.max(40, totalMain)) : clamp(((last.x - first.x) / Math.max(40, totalMain)) * 1.4);
  // Efeito: curvatura (quanto o meio do gesto fugiu da linha reta).
  const mid = points[Math.floor(points.length / 2)]!;
  const lineX = first.x + ((mid.y - first.y) / ((last.y - first.y) || 1)) * (last.x - first.x);
  const spin = sideways ? 0 : clamp(((mid.x - lineX) / Math.max(40, totalMain)) * 3);
  return { power, dir, spin, source: 'touch' };
}

/** Lê os sensores enquanto a zona está segura; deteta o pico do gesto. */
class MotionTracker {
  private peak = 0;
  private lateral = 0;
  private twist = 0;
  private armed = true;
  /** Quantas leituras dos sensores chegaram. */
  samples = 0;
  private off: (() => void) | null = null;

  constructor(
    /** Socos: cada pico é um gesto, sem largar a zona. */
    private readonly repeat: boolean,
    private readonly onRepeat: (s: Omit<SwingInput, 't' | 'hand'>) => void,
  ) {}

  start(): void {
    this.off = sensors.onSample((s) => this.sample(s));
  }

  stop(): Omit<SwingInput, 't' | 'hand'> | null {
    this.off?.();
    this.off = null;
    if (this.repeat || this.peak < 6) return null;
    return this.result();
  }

  private result(): Omit<SwingInput, 't' | 'hand'> {
    return {
      power: clamp((this.peak - 5) / 25, 0.05, 1),
      dir: clamp(this.lateral / Math.max(8, this.peak) * 2),
      spin: clamp(this.twist / 120),
      source: 'motion',
    };
  }

  private sample(s: MotionSample): void {
    this.samples++;
    const { x: ax, mag } = s;
    // Rotação do pulso (graus) para o efeito.
    this.twist += s.gamma * s.dt;

    if (mag > this.peak) {
      this.peak = mag;
      this.lateral = ax;
    }
    if (this.repeat) {
      if (this.armed && mag > 14) {
        this.armed = false;
        this.onRepeat(this.result());
      } else if (!this.armed && mag < 5) {
        this.armed = true;
        this.peak = 0;
        this.twist = 0;
      }
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
