/**
 * O comando (layout `pad`): sempre o mesmo, como os da Switch.
 *
 *   [−]            o que se está a fazer            [+]
 *   joystick/cruz   (zona de movimento nos desportos)   X / Y A / B
 *
 * Os botões ativos têm legenda; os outros ficam apagados. As escolhas aparecem no
 * ecrã grande: aqui só se navega (cruz/joystick) e confirma (A) ou volta (B).
 */
import type { ButtonId, ControllerInput, PadLayout } from '@festa/shared';
import { capture, createJoystick } from './joystick';
import { GestureTracker, swipeToSwing, touchPunch } from './motion';
import { sensors } from './sensors';

type Send = (input: ControllerInput, volatile?: boolean) => void;
type Face = 'a' | 'b' | 'x' | 'y' | 'plus' | 'minus';

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

export function renderPad(view: HTMLElement, l: PadLayout, send: Send, stickSend: (x: number, y: number) => void): () => void {
  const cleanups: (() => void)[] = [];
  const btn = (id: Face, glyph: string) => {
    const legend = l.buttons[id];
    return `<button class="pb pb-${id} ${legend ? '' : 'off'}" data-b="${id}"><span class="glyph">${glyph}</span>${legend ? `<span class="legend">${esc(legend)}</span>` : ''}</button>`;
  };
  const motion = l.motion;
  const holdA = motion?.hold === 'a';
  view.innerHTML = `
    <div class="pad" style="${l.color ? `--accent:${l.color}` : ''}">
      <div class="pad-top">
        <span class="pad-spacer"></span>
        <div class="pad-title"><b>${esc(l.title)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div>
        ${btn('plus', '+')}
      </div>
      <div class="pad-main">
        <div class="pad-left">
          ${l.stick === 'stick' ? '<div class="stick-zone"></div>' : ''}
          ${l.stick === 'dpad' ? `<div class="dpad">${(['up', 'left', 'right', 'down'] as const).map((d) => `<button class="db db-${d}" data-d="${d}">${{ up: '▲', left: '◀', right: '▶', down: '▼' }[d]}</button>`).join('')}</div>` : ''}
          ${l.stickLabel ? `<small class="stick-label">${esc(l.stickLabel)}</small>` : ''}
        </div>
        <div class="pad-center">
          ${motion ? `<div class="motion-zone"><span class="mz-icon">📳</span><span class="mz-text"></span><button class="mz-enable" hidden>📳 Ativar movimento</button></div>` : ''}
          ${motion?.tilt ? '<div class="tilt"><span class="tilt-arrow">⬆️</span><small>' + (motion.tilt === 'aim' ? 'Roda o telemóvel para apontar' : 'Inclina para esquivar') + '</small></div>' : ''}
          ${l.shake ? '<p class="shake-hint" hidden>📳 …ou abana o telemóvel!</p>' : ''}
        </div>
        <div class="pad-face">${btn('x', 'X')}${btn('y', 'Y')}${btn('a', 'A')}${btn('b', 'B')}</div>
      </div>
      <div class="pad-bottom">${btn('minus', '−')}</div>
    </div>`;

  // ── Botões ──────────────────────────────────────────────
  // Sensação de botão a sério: um «clique» ao carregar e um mais leve ao largar.
  const press = (button: ButtonId, pressed: boolean) => {
    navigator.vibrate?.(pressed ? 18 : 8);
    send({ t: 'button', button, pressed });
  };
  const holdListeners = new Set<(down: boolean) => void>();
  const bind = (el: HTMLElement, button: ButtonId) => {
    let down = false;
    const set = (v: boolean) => {
      if (v === down) return;
      down = v;
      el.classList.toggle('down', v);
      press(button, v);
      if (button === 'a') holdListeners.forEach((f) => f(v));
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(el, e.pointerId);
      set(true);
    });
    el.addEventListener('pointerup', () => set(false));
    el.addEventListener('pointercancel', () => set(false));
    cleanups.push(() => set(false));
  };
  view.querySelectorAll<HTMLElement>('.pb').forEach((el) => bind(el, el.dataset.b as ButtonId));
  view.querySelectorAll<HTMLElement>('.db').forEach((el) => bind(el, el.dataset.d as ButtonId));

  const zone = view.querySelector<HTMLElement>('.stick-zone');
  // Joystick: um toque leve quando chega à borda (como o batente de um comando).
  let atEdge = false;
  const stickHaptic = (x: number, y: number) => {
    const edge = Math.hypot(x, y) > 0.92;
    if (edge && !atEdge) navigator.vibrate?.(8);
    atEdge = edge;
    stickSend(x, y);
  };
  if (zone) cleanups.push(createJoystick(zone, { onChange: stickHaptic }));

  // ── Abanar = A ──────────────────────────────────────────
  if (l.shake && sensors.supported) {
    const hint = view.querySelector<HTMLElement>('.shake-hint');
    const start = () => {
      if (hint) hint.hidden = false;
      cleanups.push(
        sensors.onShake(() => {
          press('a', true);
          press('a', false);
          navigator.vibrate?.([30, 30, 60]);
        }),
      );
    };
    if (sensors.active) start();
    else {
      const off = sensors.onChange(() => {
        if (sensors.active) {
          off();
          start();
        }
      });
      cleanups.push(off);
    }
  }

  // ── Movimento (desportos) ───────────────────────────────
  if (motion) {
    const mz = view.querySelector<HTMLElement>('.motion-zone')!;
    const text = mz.querySelector<HTMLElement>('.mz-text')!;
    const enable = mz.querySelector<HTMLButtonElement>('.mz-enable')!;
    let hand: 'left' | 'right' = 'right';
    const emit = (s: Omit<Extract<ControllerInput, { t: 'swing' }>, 't' | 'hand'>) => {
      if (motion.action === 'punch') hand = hand === 'right' ? 'left' : 'right';
      navigator.vibrate?.(Math.round(20 + s.power * 60));
      mz.classList.remove('hit');
      void mz.offsetWidth;
      mz.classList.add('hit');
      send({ t: 'swing', ...s, hand });
    };
    const tracker = new GestureTracker(motion.action, emit);
    cleanups.push(() => tracker.stop());
    const verb = { throw: 'lança', swing: 'dá a raquetada', punch: 'dá socos', pitch: 'lança', bat: 'bate' }[motion.action];
    const setup = () => {
      enable.hidden = true;
      if (holdA) {
        text.textContent = `Segura A e ${verb} com o telemóvel`;
        holdListeners.add((down) => (down ? tracker.start() : tracker.stop()));
      } else {
        text.textContent = `Faz o gesto com o telemóvel: ${verb}!`;
        tracker.start();
      }
    };
    if (sensors.active) setup();
    else {
      // Sem sensores (ou ainda sem autorização): arrastar o dedo na zona, como recurso.
      text.textContent = sensors.supported ? 'Toca em «Ativar movimento» — ou arrasta o dedo aqui' : 'Arrasta o dedo aqui para fazer o gesto';
      enable.hidden = !sensors.supported;
      enable.addEventListener('click', async () => {
        if (await sensors.enable()) setup();
      });
      let pts: { x: number; y: number; t: number }[] = [];
      let pid: number | null = null;
      mz.addEventListener('pointerdown', (e) => {
        if (sensors.active || e.target === enable) return;
        pid = e.pointerId;
        capture(mz, e.pointerId);
        pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      });
      mz.addEventListener('pointermove', (e) => {
        if (e.pointerId === pid) pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      });
      mz.addEventListener('pointerup', (e) => {
        if (e.pointerId !== pid) return;
        pid = null;
        pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        const s = motion.action === 'punch' ? touchPunch(pts) : swipeToSwing(pts, motion.action);
        if (s) emit(s);
      });
    }

    // Inclinação: apontar (bowling) ou esquivar (boxe). Toca no indicador para centrar.
    const tiltBox = view.querySelector<HTMLElement>('.tilt');
    const arrow = view.querySelector<HTMLElement>('.tilt-arrow');
    if (tiltBox && sensors.supported) {
      let base: { x: number; y: number } | null = null;
      let last = 0;
      let lastSent = 0;
      tiltBox.addEventListener('click', () => (base = null));
      cleanups.push(
        sensors.onSample((s) => {
          if (Math.hypot(s.gx, s.gy) < 3) return;
          base ??= { x: s.gx, y: s.gy };
          const cross = base.x * s.gy - base.y * s.gx;
          const dot = base.x * s.gx + base.y * s.gy;
          const angle = clamp(-Math.atan2(cross, dot) / 0.6);
          if (arrow) arrow.style.transform = `rotate(${angle * 35}deg)`;
          const now = performance.now();
          if (now - last > 60 && Math.abs(angle - lastSent) > 0.01) {
            last = now;
            lastSent = angle;
            send({ t: 'aim', angle }, true);
          }
        }),
      );
    }
  }

  return () => cleanups.forEach((fn) => fn());
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
