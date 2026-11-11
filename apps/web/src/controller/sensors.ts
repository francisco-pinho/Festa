/**
 * Sensores de movimento do telemóvel, num só sítio.
 *
 * - Só existem em HTTPS; no iPhone é preciso autorização (pedida num toque).
 * - Alguns browsers dizem ter sensores mas não enviam dados: só consideramos
 *   o sensor "ativo" depois de chegarem leituras reais.
 * - A aceleração usada é a "linear" (sem gravidade): ou a que o browser dá,
 *   ou calculada com um filtro passa-alto.
 * - O limiar do abanão pode ser calibrado e fica guardado no telemóvel.
 */
type Listener = () => void;
type MotionSample = { x: number; y: number; z: number; mag: number; gamma: number; dt: number; gx: number; gy: number };

const THRESHOLD_KEY = 'festa.shakeThreshold';
const DEFAULT_THRESHOLD = 11;

const DME = (typeof window !== 'undefined' ? window.DeviceMotionEvent : undefined) as
  | (typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> })
  | undefined;

class Sensors {
  /** O browser tem a API e estamos em HTTPS. */
  readonly supported = !!DME && window.isSecureContext;
  /** iPhone/iPad: precisa de pedir autorização num toque. */
  readonly needsPermission = typeof DME?.requestPermission === 'function';
  /** Já chegaram leituras reais. */
  active = false;
  /** Pedido de autorização recusado (iPhone). */
  denied = false;
  threshold = loadThreshold();

  private listening = false;
  private readonly gravity = { x: 0, y: 0, z: 0 };
  /** Gravidade suavizada (para saber a inclinação do telemóvel). */
  private readonly tilt = { x: 0, y: 0 };
  private lastT = 0;
  private readonly sampleListeners = new Set<(s: MotionSample) => void>();
  private readonly changeListeners = new Set<Listener>();

  constructor() {
    // No Android não há pedido de autorização: começa logo a escutar.
    if (this.supported && !this.needsPermission) this.listen();
  }

  /** Pede autorização (se for preciso) e espera por dados. Chamar a partir de um toque. */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.needsPermission) {
      try {
        const state = await DME!.requestPermission!();
        if (state !== 'granted') {
          this.denied = true;
          this.emitChange();
          return false;
        }
      } catch {
        this.denied = true;
        this.emitChange();
        return false;
      }
    }
    this.listen();
    if (this.active) return true;
    return new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        if (this.active) return resolve(true);
        if (performance.now() - started > 1500) return resolve(false);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  /** Leituras contínuas (aceleração linear + rotação do pulso). */
  onSample(fn: (s: MotionSample) => void): () => void {
    this.sampleListeners.add(fn);
    return () => this.sampleListeners.delete(fn);
  }

  /** Avisa quando o estado muda (para atualizar o indicador 📳). */
  onChange(fn: Listener): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Deteta abanões: pico acima do limiar, com pausa entre abanões. */
  onShake(fn: () => void): () => void {
    let last = 0;
    return this.onSample((s) => {
      const now = performance.now();
      if (s.mag > this.threshold && now - last > 450) {
        last = now;
        fn();
      }
    });
  }

  /** Mede o abanão do jogador durante `seconds` e ajusta o limiar. Devolve o pico medido. */
  calibrate(seconds = 3): Promise<number> {
    return new Promise((resolve) => {
      let peak = 0;
      const off = this.onSample((s) => (peak = Math.max(peak, s.mag)));
      setTimeout(() => {
        off();
        if (peak > 3) {
          this.threshold = Math.min(20, Math.max(5, peak * 0.5));
          try {
            localStorage.setItem(THRESHOLD_KEY, String(this.threshold));
          } catch {
            /* sem armazenamento */
          }
        }
        this.emitChange();
        resolve(peak);
      }, seconds * 1000);
    });
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('devicemotion', (e) => this.handle(e));
  }

  private handle(e: DeviceMotionEvent): void {
    const now = performance.now();
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0;
    this.lastT = now;
    let x: number, y: number, z: number;
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    if (a && a.x !== null && a.y !== null && a.z !== null) {
      [x, y, z] = [a.x, a.y, a.z];
    } else if (g && g.x !== null && g.y !== null && g.z !== null) {
      // Filtro passa-alto: estima a gravidade e tira-a.
      const k = 0.85;
      this.gravity.x = k * this.gravity.x + (1 - k) * g.x;
      this.gravity.y = k * this.gravity.y + (1 - k) * g.y;
      this.gravity.z = k * this.gravity.z + (1 - k) * g.z;
      [x, y, z] = [g.x - this.gravity.x, g.y - this.gravity.y, g.z - this.gravity.z];
    } else {
      return; // evento vazio: não há sensor real
    }
    if (!this.active && (x || y || z || g?.x || g?.y)) {
      this.active = true;
      this.emitChange();
    }
    if (g && g.x !== null && g.y !== null) {
      this.tilt.x = 0.8 * this.tilt.x + 0.2 * g.x;
      this.tilt.y = 0.8 * this.tilt.y + 0.2 * g.y;
    }
    const sample: MotionSample = { x, y, z, mag: Math.hypot(x, y, z), gamma: e.rotationRate?.gamma ?? 0, dt, gx: this.tilt.x, gy: this.tilt.y };
    for (const fn of this.sampleListeners) fn(sample);
  }

  private emitChange(): void {
    for (const fn of this.changeListeners) fn();
  }
}

function loadThreshold(): number {
  try {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return v > 0 ? v : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export const sensors = new Sensors();
export type { MotionSample };
