/**
 * Menu de pausa e definições.
 *
 * - Durante um jogo (`mode = 'game'`): Esc no PC ou + em qualquer comando abre a pausa.
 *   O tempo do jogo para (Engine.paused) e os telemóveis mostram "Pausa".
 * - No lobby (`mode = 'lobby'`): Esc abre só as definições.
 * - Noutros ecrãs (`mode = 'off'`): o menu não abre.
 *
 * "Sair para o lobby" recarrega o ecrã principal: a sala mantém-se e os
 * telemóveis voltam sozinhos.
 */
import type { Engine } from '../three/Engine';
import type { HubPlayer, PlayerHub } from '../PlayerHub';
import { ANIM_SPEEDS, BOT_LEVELS, GRAPHICS_LEVELS, VOLUMES, settings } from '../game/Settings';
import { sound } from '../audio/Sound';
import { esc } from './Hud';

type Screen = 'main' | 'settings' | 'confirm' | 'quit';

/** Na app de computador: fecha a janela (o mesmo que «Sair do jogo» do menu principal). */
const desktopApp = (window as unknown as { festaDesktop?: { quit(): Promise<void> } }).festaDesktop;
export type MenuMode = 'off' | 'lobby' | 'game';

interface Item {
  label: string;
  run: () => void;
}

export class GameMenu {
  mode: MenuMode = 'off';
  private open = false;
  private screen: Screen = 'main';
  private selected = 0;
  /** Quem abriu o menu (só esse comando navega). */
  private controller: HubPlayer | null = null;
  private readonly el: HTMLElement;

  constructor(
    private readonly engine: Engine,
    private readonly hub: PlayerHub,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'game-menu';
    this.el.hidden = true;
    document.getElementById('ui')!.appendChild(this.el);

    // Captura antes dos outros atalhos do jogo, para não "passarem" para trás do menu.
    window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
    // Comando: + abre/fecha; com o menu aberto, a cruz, A e B de quem o abriu navegam.
    hub.events.on('press', ({ player, button }) => {
      if (button === 'plus') {
        if (!this.open) this.controller = player;
        this.toggle();
        return;
      }
      if (!this.open || (this.controller && player !== this.controller)) return;
      const items = this.items();
      if (button === 'down') this.selected = (this.selected + 1) % items.length;
      else if (button === 'up') this.selected = (this.selected + items.length - 1) % items.length;
      else if (button === 'a') return items[this.selected]?.run();
      else if (button === 'b') {
        if (this.screen === 'main' || this.mode === 'lobby') this.close();
        else this.goto('main');
        return;
      } else return;
      this.render();
    });
    settings.events.on('changed', () => {
      this.engine.timeScale = settings.value.animSpeed;
      if (this.open) this.render();
    });
    this.engine.timeScale = settings.value.animSpeed;
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show(this.mode === 'lobby' ? 'settings' : 'main');
  }

  show(screen: Screen = 'main'): void {
    if (this.mode === 'off') return;
    this.open = true;
    this.screen = screen;
    this.selected = 0;
    if (this.mode === 'game') {
      this.engine.paused = true;
      this.hub.suspendLayouts({ kind: 'pad', title: '⏸ Pausa', sub: 'Menu no ecrã grande', stick: 'dpad', buttons: { a: 'Escolher', b: 'Voltar', plus: 'Continuar' } });
    }
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    if (this.mode === 'game' || this.engine.paused) {
      this.engine.paused = false;
      this.hub.restoreLayouts();
    }
  }

  // ── Conteúdo ────────────────────────────────────────────

  private items(): Item[] {
    const s = settings.value;
    if (this.screen === 'quit') {
      return [
        { label: '🚪 Sim, fechar o jogo', run: () => void desktopApp?.quit() },
        { label: '↩ Não', run: () => this.goto(this.mode === 'lobby' ? 'settings' : 'main') },
      ];
    }
    if (this.screen === 'confirm') {
      return [
        { label: '✅ Sim, sair para o lobby', run: () => location.reload() },
        { label: '↩ Não, continuar a jogar', run: () => this.goto('main') },
      ];
    }
    if (this.screen === 'settings') {
      const speed = ANIM_SPEEDS.find((a) => a.value === s.animSpeed) ?? ANIM_SPEEDS[0]!;
      return [
        // A dificuldade dos bots só se escolhe antes de começar (a meio do jogo fica bloqueada).
        this.mode === 'lobby'
          ? { label: `🤖 Dificuldade dos bots: ${settings.botLevelLabel}`, run: () => settings.cycleBotLevel() }
          : { label: `🔒 Dificuldade dos bots: ${settings.botLevelLabel} (só antes de começar)`, run: () => undefined },
        {
          label: `⏩ Velocidade das animações: ${speed.label}`,
          run: () => {
            const i = ANIM_SPEEDS.indexOf(speed);
            settings.set('animSpeed', ANIM_SPEEDS[(i + 1) % ANIM_SPEEDS.length]!.value);
          },
        },
        { label: `💡 Dicas no ecrã: ${s.hints ? 'Sim' : 'Não'}`, run: () => settings.set('hints', !s.hints) },
        { label: `🔊 Efeitos: ${volLabel(s.sfxVolume)}`, run: () => (settings.set('sfxVolume', nextVol(s.sfxVolume)), sound.play('coin')) },
        { label: `🎵 Música: ${volLabel(s.musicVolume)}`, run: () => settings.set('musicVolume', nextVol(s.musicVolume)) },
        { label: `🎙️ Narrador: ${s.narrator ? 'Sim' : 'Não'}`, run: () => settings.set('narrator', !s.narrator) },
        {
          label: `🖼️ Gráficos: ${GRAPHICS_LEVELS.find((g) => g.id === s.graphics)?.label ?? 'Alto'}`,
          run: () => {
            const i = GRAPHICS_LEVELS.findIndex((g) => g.id === s.graphics);
            settings.set('graphics', GRAPHICS_LEVELS[(i + 1) % GRAPHICS_LEVELS.length]!.id);
          },
        },
        ...(desktopApp && this.mode === 'lobby' ? [{ label: '🚪 Fechar o jogo', run: () => this.goto('quit') }] : []),
        { label: this.mode === 'lobby' ? '✔ Fechar' : '↩ Voltar', run: () => (this.mode === 'lobby' ? this.close() : this.goto('main')) },
      ];
    }
    return [
      { label: '▶ Continuar', run: () => this.close() },
      { label: '⚙️ Definições', run: () => this.goto('settings') },
      { label: '🚪 Sair para o lobby', run: () => this.goto('confirm') },
      ...(desktopApp ? [{ label: '❌ Fechar o jogo', run: () => this.goto('quit') }] : []),
    ];
  }

  private goto(screen: Screen): void {
    this.screen = screen;
    this.selected = 0;
    this.render();
  }

  private render(): void {
    const title = this.screen === 'settings' ? '⚙️ Definições' : this.screen === 'confirm' ? 'Sair do jogo?' : this.screen === 'quit' ? 'Fechar o jogo?' : '⏸ Pausa';
    const sub =
      this.screen === 'confirm'
        ? 'O jogo atual acaba. Os jogadores continuam na sala.'
        : this.screen === 'settings'
          ? `Os bots ${BOT_LEVELS.map((l) => l.label).join(' · ')}: mais precisos e rápidos nos níveis altos.`
          : 'Esc ou + no comando para continuar';
    this.el.innerHTML = `
      <div class="menu-card">
        <h1>${title}</h1>
        <p class="menu-sub">${esc(sub)}</p>
        <div class="menu-items">
          ${this.items()
            .map((it, i) => `<button class="menu-item ${i === this.selected ? 'sel' : ''}" data-i="${i}">${esc(it.label)}</button>`)
            .join('')}
        </div>
        <p class="menu-keys">✚ escolher · Ⓐ confirmar · Ⓑ ou + fechar (no PC: setas, Enter, Esc)</p>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('.menu-item').forEach((b) =>
      b.addEventListener('click', () => this.items()[Number(b.dataset.i)]?.run()),
    );
  }

  /** Há um menu no ecrã a usar o teclado (o Esc é dele). */
  keyboardBusy: () => boolean = () => false;

  private onKey(e: KeyboardEvent): void {
    if (!this.open) {
      if (this.keyboardBusy()) return;
      if (e.code === 'Escape' && this.mode !== 'off') {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.toggle();
      }
      return;
    }
    // Com o menu aberto, nenhuma tecla chega ao jogo.
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.type !== 'keydown' || e.repeat) return;
    const items = this.items();
    if (e.code === 'ArrowDown') this.selected = (this.selected + 1) % items.length;
    else if (e.code === 'ArrowUp') this.selected = (this.selected + items.length - 1) % items.length;
    else if (e.code === 'Enter' || e.code === 'Space') items[this.selected]?.run();
    else if (e.code === 'Escape') {
      if (this.screen === 'main' || this.mode === 'lobby') this.close();
      else this.goto('main');
      return;
    } else return;
    this.render();
  }
}

function volLabel(v: number): string {
  return v <= 0 ? 'Desligado' : `${Math.round(v * 100)} %`;
}

function nextVol(v: number): number {
  const i = VOLUMES.findIndex((x) => Math.abs(x - v) < 0.01);
  return VOLUMES[(i + 1) % VOLUMES.length]!;
}
