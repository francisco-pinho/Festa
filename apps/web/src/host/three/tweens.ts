/**
 * Tweens e esperas sincronizadas com o ciclo de jogo (não com setTimeout):
 * se o separador for para segundo plano, as animações não "saltam".
 */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  bounceOut: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Running {
  elapsed: number;
  duration: number;
  ease: Ease;
  update: (t: number) => void;
  resolve: () => void;
}

export class Tweens {
  private running: Running[] = [];

  /** Anima `update(t)` com t de 0 a 1 durante `duration` segundos. */
  tween(duration: number, update: (t: number) => void, easing: Ease = ease.inOut): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) {
        update(1);
        resolve();
        return;
      }
      update(0);
      this.running.push({ elapsed: 0, duration, ease: easing, update, resolve });
    });
  }

  /** Espera `seconds` segundos de tempo de jogo. */
  wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {}, ease.linear);
  }

  update(dt: number): void {
    const done: Running[] = [];
    for (const r of this.running) {
      r.elapsed += dt;
      const t = Math.min(1, r.elapsed / r.duration);
      r.update(r.ease(t));
      if (t >= 1) done.push(r);
    }
    if (done.length) {
      this.running = this.running.filter((r) => !done.includes(r));
      for (const r of done) r.resolve();
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Fator de suavização independente do frame rate. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);
