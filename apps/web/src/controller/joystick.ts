/**
 * Joystick virtual "flutuante": aparece onde o dedo toca dentro da zona.
 * Usa Pointer Events (multi-toque, funciona com o botão ao mesmo tempo).
 */
export interface JoystickOptions {
  radius?: number;
  deadZone?: number;
  onChange: (x: number, y: number) => void;
}

export function createJoystick(zone: HTMLElement, opts: JoystickOptions): () => void {
  const radius = opts.radius ?? 70;
  const deadZone = opts.deadZone ?? 0.12;

  const base = document.createElement('div');
  base.className = 'stick-base';
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  base.appendChild(knob);
  zone.appendChild(base);

  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;

  const place = (x: number, y: number) => {
    const rect = zone.getBoundingClientRect();
    base.style.left = `${x - rect.left}px`;
    base.style.top = `${y - rect.top}px`;
  };

  const resetVisual = () => {
    const rect = zone.getBoundingClientRect();
    place(rect.left + rect.width / 2, rect.top + rect.height / 2);
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.remove('active');
  };

  const onDown = (e: PointerEvent) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    capture(zone, e.pointerId);
    place(originX, originY);
    base.classList.add('active');
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let nx = dx / radius;
    let ny = dy / radius;
    const mag = Math.hypot(nx, ny);
    if (mag < deadZone) nx = ny = 0;
    else {
      // Re-escala para que a zona morta não "coma" o início do curso.
      const k = (mag - deadZone) / (1 - deadZone) / mag;
      nx *= k;
      ny *= k;
    }
    opts.onChange(round(nx), round(ny));
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    resetVisual();
    opts.onChange(0, 0);
  };

  zone.addEventListener('pointerdown', onDown);
  zone.addEventListener('pointermove', onMove);
  zone.addEventListener('pointerup', onUp);
  zone.addEventListener('pointercancel', onUp);
  requestAnimationFrame(resetVisual);
  window.addEventListener('resize', resetVisual);

  return () => {
    window.removeEventListener('resize', resetVisual);
    if (pointerId !== null) opts.onChange(0, 0);
    base.remove();
  };
}

const round = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000;

/** Mantém o dedo "agarrado" ao elemento mesmo que saia dele. Pode falhar sem problema. */
export function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* ponteiro já não está ativo */
  }
}
