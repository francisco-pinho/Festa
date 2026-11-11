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
  swing: { icon: '🎾', touch: 'Arrasta para bater (para cima = topspin, para baixo = slice)', motion: 'Segura aqui e dá a raquetada' },
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
      ${l.picks ? `<div class="picks">${l.picks.map((p) => `<button class="pick ${p.id === l.picked ? 'on' : ''}" data-id="${esc(p.id)}">${esc(p.label)}</button>`).join('')}</div>` : ''}
      ${l.aim ? `<div class="aim-zone"><span>🕹️ ${esc(l.aimLabel ?? (l.dodge ? 'Mover' : 'Posição'))}</span><button class="tilt-aim" hidden><span class="tilt-arrow">⬆️</span><small>${l.dodge ? 'Inclina para os lados para esquivar' : 'Roda o telemóvel para apontar'} · toca para centrar</small></button></div>` : ''}
      <div class="pads ${l.hands ? 'two' : ''}">
        ${(l.hands ? (['left', 'right'] as Hand[]) : (['right'] as Hand[]))
          .map((h) => `<div class="pad" data-hand="${h}"><span class="icon">${text.icon}</span><span class="label"></span>${l.hands ? `<small>${h === 'left' ? 'Esquerda' : 'Direita'}</small>` : ''}</div>`)
          .join('')}
      </div>
      ${l.guard || l.dodge ? `<div class="defense">${l.dodge ? '<button class="dodge" data-b="a">⬅️ Esquiva</button>' : ''}${l.guard ? '<button class="guard">🛡️ Defender (segura)</button>' : ''}${l.dodge ? '<button class="dodge" data-b="b">Esquiva ➡️</button>' : ''}</div>` : ''}
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

  // Pontaria por inclinação: roda o telemóvel (como um volante) para mudar o ângulo.
  const tiltBox = view.querySelector<HTMLElement>('.tilt-aim');
  const tiltArrow = view.querySelector<HTMLElement>('.tilt-arrow');
  let holding = false;
  let lastPunchAt = 0;
  if (tiltBox && canMotion) {
    let base: { x: number; y: number } | null = null;
    let last = 0;
    let lastSent = 0;
    cleanups.push(
      sensors.onSample((s) => {
        if (!useMotion || (holding && !l.dodge)) return;
        // Logo a seguir a um soco a inclinação não é de confiança.
        if (l.dodge && performance.now() - lastPunchAt < 350) return;
        if (Math.hypot(s.gx, s.gy) < 3) return; // telemóvel deitado: não dá para saber
        tiltBox.hidden = false;
        base ??= { x: s.gx, y: s.gy };
        const cross = base.x * s.gy - base.y * s.gx;
        const dot = base.x * s.gx + base.y * s.gy;
        const angle = clamp(-Math.atan2(cross, dot) / 0.6);
        if (tiltArrow) tiltArrow.style.transform = `rotate(${angle * 35}deg)`;
        const now = performance.now();
        if (now - last > 60 && Math.abs(angle - lastSent) > 0.01) {
          last = now;
          lastSent = angle;
          send({ t: 'aim', angle }, true);
        }
      }),
    );
    tiltBox.addEventListener('pointerdown', (e) => e.stopPropagation());
    tiltBox.addEventListener('click', () => {
      base = null; // volta a centrar
    });
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

  // Escolhas rápidas
  for (const b of view.querySelectorAll<HTMLButtonElement>('.pick')) {
    b.addEventListener('click', () => {
      view.querySelectorAll('.pick').forEach((o) => o.classList.toggle('on', o === b));
      navigator.vibrate?.(15);
      send({ t: 'choice', id: b.dataset.id! });
    });
  }

  // Esquivas (botões)
  for (const b of view.querySelectorAll<HTMLButtonElement>('.dodge')) {
    const button = b.dataset.b as 'a' | 'b';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      send({ t: 'button', button, pressed: true });
    });
    const up = () => {
      b.classList.remove('down');
      send({ t: 'button', button, pressed: false });
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  const emit = (hand: Hand, s: Omit<SwingInput, 't' | 'hand'>, pad: HTMLElement) => {
    lastPunchAt = performance.now();
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
      holding = true;
      points = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      if (useMotion) {
        motion = new MotionTracker(l.action === 'punch', (s) => emit(hand, s, pad));
        motion.start();
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
      holding = false;
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
      if (l.action === 'punch') return emit(hand, touchPunch(points), pad);
      const s = swipeToSwing(points, l.action);
      if (s) emit(hand, s, pad);
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

/** Lê os sensores enquanto a zona está segura; deteta o pico do gesto. */
export class MotionTracker {
  private peak = 0;
  private lateral = 0;
  private twist = 0;
  /** No pico: fração da aceleração na vertical e rotação (para saber o tipo de soco). */
  private vertical = 0;
  private spinRate = 0;
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
      kind: this.repeat ? (this.vertical > 0.65 ? 'uppercut' : this.spinRate > 260 ? 'hook' : 'straight') : undefined,
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
      const g = Math.hypot(s.gx, s.gy, s.gz) || 1;
      this.vertical = Math.abs((s.x * s.gx + s.y * s.gy + s.z * s.gz) / g) / (mag || 1);
      this.spinRate = s.rot;
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
