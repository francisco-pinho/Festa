/**
 * Comando de golfe (layout `golf`).
 *
 *  1. Escolhe o taco (a área onde cai aparece no ecrã grande) e aponta com o joystick.
 *  2. Toca em «Tacada!»: o medidor sobe (passa a zona vermelha: mais força, menos precisão) e volta a descer.
 *  3. Toca outra vez para parar: «Parar» (normal), «⬆️ Topspin» (rola mais) ou «⬇️ Backspin» (trava).
 *     Com o medidor a andar, o joystick dá curva (lados) e altura (cima/baixo).
 *  Alternativa: modo balançar — segura e balança o telemóvel como um taco (força pelo balanço).
 */
import type { ControllerInput, ControllerLayout } from '@festa/shared';
import { createJoystick } from './joystick';
import { MotionTracker } from './motion';
import { sensors } from './sensors';

type GolfLayout = Extract<ControllerLayout, { kind: 'golf' }>;
type Send = (input: ControllerInput, volatile?: boolean) => void;

const SWING_KEY = 'festa.golfSwing';
const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

export function renderGolf(view: HTMLElement, l: GolfLayout, send: Send): () => void {
  const cleanups: (() => void)[] = [];
  const canMotion = sensors.supported;
  let swingMode = canMotion && sensors.active && localStorage.getItem(SWING_KEY) === 'on';
  const max = l.putter ? 1 : 1.1;

  view.innerHTML = `
    <div class="golf">
      <p class="prompt">${esc(l.prompt)}</p>
      <div class="clubs">${l.clubs.map((c) => `<button class="club ${c.id === l.club ? 'on' : ''}" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>
      <div class="golf-main">
        <div class="aim-zone"><span class="stick-label">🕹️ Apontar</span><div class="shape" hidden><span class="dot"></span></div></div>
        <div class="meter-col">
          <div class="meter"><div class="red" style="height:${l.putter ? 0 : ((max - 1) / max) * 100}%"></div><div class="mark" style="bottom:${(1 / max) * 100}%"></div><div class="fill"></div></div>
          <div class="meter-val">—</div>
        </div>
        <div class="buttons">
          <button class="go">⛳ Tacada!</button>
          <div class="stops" hidden>
            ${l.putter ? '' : '<button class="stop" data-spin="1">⬆️ Topspin</button>'}
            <button class="stop main" data-spin="0">Parar</button>
            ${l.putter ? '' : '<button class="stop" data-spin="-1">⬇️ Backspin</button>'}
          </div>
          <div class="swing-pad" hidden>📳 Segura aqui e balança o telemóvel</div>
        </div>
      </div>
      ${l.hint ? `<p class="hint">${esc(l.hint)}</p>` : ''}
      <div class="mode-row">${canMotion ? '<button class="mode-toggle"></button>' : ''}</div>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => view.querySelector<T>(s)!;
  const fill = q('.fill');
  const val = q('.meter-val');
  const go = q<HTMLButtonElement>('.go');
  const stops = q('.stops');
  const swingPad = q('.swing-pad');
  const stickLabel = q('.stick-label');
  const shape = q('.shape');
  const dot = q('.dot');
  const toggle = view.querySelector<HTMLButtonElement>('.mode-toggle');

  // Taco
  for (const b of view.querySelectorAll<HTMLButtonElement>('.club')) {
    b.addEventListener('click', () => {
      if (phase !== 'aim') return;
      view.querySelectorAll('.club').forEach((o) => o.classList.toggle('on', o === b));
      navigator.vibrate?.(12);
      send({ t: 'choice', id: `club:${b.dataset.id}` });
    });
  }

  // Joystick: antes do medidor aponta; com o medidor a andar dá curva e altura.
  let phase: 'aim' | 'meter' | 'done' = 'aim';
  let curve = 0;
  let loft = 0;
  let lastSent = 0;
  cleanups.push(
    createJoystick(q('.aim-zone'), {
      radius: 55,
      onChange: (x, y) => {
        if (phase === 'meter') {
          curve = clamp(x);
          loft = l.putter ? 0 : clamp(-y);
          dot.style.transform = `translate(${curve * 28}px, ${-loft * 28}px)`;
          return;
        }
        if (phase !== 'aim') return;
        const now = performance.now();
        if (x === 0 && y === 0) send({ t: 'stick', x: 0, y: 0 });
        else if (now - lastSent > 40) {
          lastSent = now;
          send({ t: 'stick', x, y }, true);
        }
      },
    }),
  );

  // Medidor
  let meterStart = 0;
  let raf = 0;
  const period = l.putter ? 1.7 : 1.3;
  const meterValue = (t: number) => {
    const k = t / period; // 0→1 a subir, 1→2 a descer
    return k <= 1 ? k * max : Math.max(0, (2 - k) * max);
  };
  const tick = () => {
    if (phase !== 'meter') return;
    const t = (performance.now() - meterStart) / 1000;
    const v = meterValue(t);
    fill.style.height = `${(v / max) * 100}%`;
    fill.classList.toggle('over', v > 1);
    val.textContent = `${Math.round(v * 100)}%`;
    if (t >= period * 2) return finish(0.03, 0);
    raf = requestAnimationFrame(tick);
  };
  const startMeter = () => {
    if (phase !== 'aim') return;
    phase = 'meter';
    curve = 0;
    loft = 0;
    send({ t: 'stick', x: 0, y: 0 });
    send({ t: 'button', button: 'a', pressed: true });
    send({ t: 'button', button: 'a', pressed: false });
    navigator.vibrate?.(15);
    go.hidden = true;
    stops.hidden = false;
    shape.hidden = l.putter;
    stickLabel.textContent = l.putter ? '🕹️' : '🕹️ Curva ↔ · Altura ↕';
    meterStart = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const finish = (power: number, spin: number) => {
    if (phase === 'done') return;
    phase = 'done';
    cancelAnimationFrame(raf);
    navigator.vibrate?.(power > 1 ? [40, 30, 80] : 40);
    val.textContent = `${Math.round(power * 100)}%`;
    stops.hidden = true;
    send({ t: 'swing', power: Math.min(max, power), dir: curve, spin, loft, source: 'touch' });
  };
  go.addEventListener('click', startMeter);
  for (const b of view.querySelectorAll<HTMLButtonElement>('.stop')) {
    b.addEventListener('click', () => {
      if (phase !== 'meter') return;
      const v = meterValue((performance.now() - meterStart) / 1000);
      finish(Math.max(0.03, v), Number(b.dataset.spin));
    });
  }

  // Modo balançar
  const refreshMode = () => {
    go.hidden = swingMode || phase !== 'aim';
    swingPad.hidden = !swingMode || phase !== 'aim';
    if (toggle) toggle.textContent = swingMode ? '📳 A balançar o telemóvel · mudar para medidor' : '👆 A usar o medidor · mudar para balançar';
  };
  refreshMode();
  toggle?.addEventListener('click', async () => {
    if (!swingMode && !(await sensors.enable())) {
      toggle.textContent = '📵 O telemóvel não está a enviar dados dos sensores';
      return;
    }
    swingMode = !swingMode;
    localStorage.setItem(SWING_KEY, swingMode ? 'on' : 'off');
    refreshMode();
  });
  let tracker: MotionTracker | null = null;
  swingPad.addEventListener('pointerdown', (e) => {
    if (phase !== 'aim') return;
    e.preventDefault();
    swingPad.classList.add('held');
    tracker = new MotionTracker(false, () => {});
    tracker.start();
  });
  const release = () => {
    swingPad.classList.remove('held');
    if (!tracker) return;
    const s = tracker.stop();
    tracker = null;
    if (!s) return;
    phase = 'done';
    swingPad.hidden = true;
    const power = l.putter ? s.power * 0.9 : Math.min(1.1, s.power * 1.1);
    val.textContent = `${Math.round(power * 100)}%`;
    fill.style.height = `${(power / max) * 100}%`;
    send({ t: 'button', button: 'a', pressed: true });
    send({ t: 'button', button: 'a', pressed: false });
    send({ t: 'swing', power, dir: clamp(s.dir * 0.6), spin: s.spin > 0.4 ? 1 : s.spin < -0.4 ? -1 : 0, loft: 0, source: 'motion' });
  };
  swingPad.addEventListener('pointerup', release);
  swingPad.addEventListener('pointercancel', release);

  cleanups.push(() => {
    cancelAnimationFrame(raf);
    tracker?.stop();
  });
  return () => cleanups.forEach((fn) => fn());
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
