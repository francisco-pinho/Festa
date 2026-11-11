/**
 * Narrador: explica cada jogo antes de começar, em balões de fala no ecrã (sem voz),
 * com a personagem a «falar». Cada balão fica o tempo de o ler; qualquer jogador
 * salta com «−» (ou Enter/Espaço no PC).
 */
import type { PlayerHub } from '../PlayerHub';
import { settings } from '../game/Settings';
import { NarratorPortrait } from './NarratorPortrait';

const NAME = 'Zé Microfone';

class NarratorEngine {
  private el: HTMLElement | null = null;
  private skip: (() => void) | null = null;
  private portrait: NarratorPortrait | null = null;

  /** Liga o narrador ao ecrã e aos comandos (chamar uma vez). */
  init(hub: PlayerHub): void {
    const el = document.createElement('div');
    el.className = 'narrator';
    el.hidden = true;
    el.innerHTML = `<canvas class="nar-avatar"></canvas><div class="nar-box"><b>${NAME}</b><p></p><small>− no comando para saltar</small></div>`;
    document.getElementById('ui')!.appendChild(el);
    this.el = el;
    hub.events.on('press', ({ button }) => button === 'minus' && this.skip?.());
    window.addEventListener('keydown', (e) => {
      if (this.skip && (e.code === 'Enter' || e.code === 'Space')) this.skip();
    });
  }

  get speaking(): boolean {
    return !!this.skip;
  }

  /**
   * Mostra as frases, uma a uma, cada uma o tempo de a ler. Resolve quando acabar ou quando alguém saltar.
   */
  async say(lines: string[]): Promise<void> {
    if (!settings.value.narrator || !this.el || !lines.length) return;
    const el = this.el;
    const text = el.querySelector('p')!;
    el.hidden = false;
    el.classList.remove('out');
    // A personagem só se cria quando os modelos já estão carregados (primeira vez que fala).
    try {
      this.portrait ??= new NarratorPortrait(el.querySelector('canvas')!);
      this.portrait.start();
    } catch {
      this.portrait = null;
    }
    let skipped = false;
    const skipPromise = new Promise<void>((resolve) => {
      this.skip = () => {
        skipped = true;
        resolve();
      };
    });
    for (const line of lines) {
      if (skipped) break;
      text.textContent = line;
      this.portrait?.line(line);
      await Promise.race([this.speak(line), skipPromise]);
      if (!skipped) await Promise.race([wait(250), skipPromise]);
    }
    this.skip = null;
    this.portrait?.stop();
    el.classList.add('out');
    await wait(220);
    el.hidden = true;
  }

  /** Tempo de leitura do balão (a boca da personagem mexe-se como se falasse). */
  private speak(line: string): Promise<void> {
    const readTime = 1200 + line.split(/\s+/).length * 300;
    const words = setInterval(() => this.portrait?.word(), 260);
    return wait(readTime).then(() => clearInterval(words));
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const narrator = new NarratorEngine();
