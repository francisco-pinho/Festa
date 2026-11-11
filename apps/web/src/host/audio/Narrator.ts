/**
 * Narrador: explica cada jogo antes de começar, em voz alta (voz do browser, português
 * de Portugal quando existir) e num balão no ecrã. Qualquer jogador salta com «−»
 * (ou Enter/Espaço no PC). A música baixa enquanto ele fala.
 */
import type { PlayerHub } from '../PlayerHub';
import { settings } from '../game/Settings';
import { sound } from './Sound';
import { NarratorPortrait } from './NarratorPortrait';

const NAME = 'Zé Microfone';

class NarratorEngine {
  private el: HTMLElement | null = null;
  private voice: SpeechSynthesisVoice | null = null;
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
    const pick = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      this.voice =
        voices.find((v) => v.lang === 'pt-PT') ??
        voices.find((v) => v.lang.toLowerCase().startsWith('pt-pt')) ??
        voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
        null;
    };
    pick();
    window.speechSynthesis?.addEventListener?.('voiceschanged', pick);
  }

  get speaking(): boolean {
    return !!this.skip;
  }

  /**
   * Diz as frases, uma a uma. Resolve quando acabar ou quando alguém saltar.
   * Sem voz disponível (ou com o narrador desligado da voz), mostra só o texto o tempo de o ler.
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
    sound.duck(true);
    let skipped = false;
    const skipPromise = new Promise<void>((resolve) => {
      this.skip = () => {
        skipped = true;
        window.speechSynthesis?.cancel();
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
    sound.duck(false);
    this.portrait?.stop();
    el.classList.add('out');
    await wait(220);
    el.hidden = true;
  }

  private speak(line: string): Promise<void> {
    const synth = window.speechSynthesis;
    const readTime = 900 + line.split(/\s+/).length * 330;
    if (!synth || !sound.unlocked || settings.value.sfxVolume <= 0) {
      const words = setInterval(() => this.portrait?.word(), 300);
      return wait(readTime).then(() => clearInterval(words));
    }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(speakable(line));
      u.lang = this.voice?.lang ?? 'pt-PT';
      if (this.voice) u.voice = this.voice;
      u.rate = 1.05;
      u.pitch = 1.05;
      u.volume = Math.min(1, settings.value.sfxVolume + 0.25);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      u.onboundary = (e) => {
        if (e.name === 'word' || e.name === undefined) this.portrait?.word();
      };
      u.onend = finish;
      u.onerror = finish;
      // Segurança: alguns browsers nunca chamam onend.
      setTimeout(finish, readTime * 2 + 2000);
      synth.speak(u);
    });
  }
}

/** Tira emojis e símbolos que a voz leria mal. */
export function speakable(text: string): string {
  return text
    .replace(/Ⓐ/g, 'A')
    .replace(/Ⓑ/g, 'B')
    .replace(/🕹️/g, 'joystick')
    .replace(/[«»]/g, '')
    .replace(/ · /g, ', ')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const narrator = new NarratorEngine();
