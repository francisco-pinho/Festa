/**
 * Lugares na festa: humanos (telemóvel ou teclado) e bots, todos com a mesma
 * interface. Um humano desligado passa a ser controlado pelo computador até voltar.
 *
 * O telemóvel é sempre o mesmo comando (layout `pad`). O jogo pode pedir layouts "de alto
 * nível" (escolhas, dados, gamepad, movimento): aqui são traduzidos para o comando, e as
 * escolhas aparecem no ecrã grande (ScreenMenus).
 */
import { getCharacter } from '@festa/game';
import { narrator } from '../audio/Narrator';
import type { ButtonId, ControllerLayout, MotionAction, PadLayout, SwingInput } from '@festa/shared';
import type { Engine } from '../three/Engine';
import { emptyButtons, type HubPlayer, type PlayerHub } from '../PlayerHub';
import type { MenuOption, ScreenMenus } from '../ui/ScreenMenu';

/** Escolhas: aparecem no ecrã grande; o comando navega. */
export interface ChoicesLayout {
  kind: 'choices';
  prompt: string;
  options: MenuOption[];
  columns?: number;
}

/** Lançar dados: A lança (ou abanar); − mapa; X abre os itens no ecrã grande. */
export interface DiceLayout {
  kind: 'dice';
  prompt: string;
  label: string;
  extras?: { id: string; label: string; color?: string }[];
}

/** Minijogos: joystick + A/B. */
export interface GamepadLayout {
  kind: 'gamepad';
  stick: boolean;
  buttons: { id: 'a' | 'b'; label: string }[];
  hint?: string;
}

/** Desportos com movimento. */
export interface MotionLayout {
  kind: 'motion';
  prompt: string;
  action: MotionAction;
  /** Joystick para posicionar/apontar. */
  aim: boolean;
  aimLabel?: string;
  /** B = defender (a segurar). */
  guard?: boolean;
  /** Inclinar (ou X/Y) para esquivar. */
  dodge?: boolean;
  /** X muda uma opção (ex.: tipo de lançamento); o texto é a legenda do X. */
  pick?: string;
  hint?: string;
}

export type HostLayout = ControllerLayout | ChoicesLayout | DiceLayout | GamepadLayout | MotionLayout;

export interface PadInput {
  readonly stick: { x: number; y: number };
  readonly held: Record<ButtonId, boolean>;
  consumePress(button: ButtonId): boolean;
}

/** Comando virtual que a IA dos bots preenche. */
export class BotPad implements PadInput {
  readonly stick = { x: 0, y: 0 };
  readonly held: Record<ButtonId, boolean> = emptyButtons();
  private readonly presses = new Set<ButtonId>();

  press(button: ButtonId): void {
    this.presses.add(button);
  }

  consumePress(button: ButtonId): boolean {
    return this.presses.delete(button);
  }

  reset(): void {
    this.stick.x = this.stick.y = 0;
    this.presses.clear();
  }
}

export interface Seat {
  id: string;
  name: string;
  characterId: string;
  isBot: boolean;
  botPad: BotPad;
}

const IDLE_PAD: PadInput = { stick: { x: 0, y: 0 }, held: emptyButtons(), consumePress: () => false };

export interface DecideOptions {
  layout: ChoicesLayout | DiceLayout;
  valid: string[];
  /** Decisão automática (bots e desligados). */
  bot: () => string;
  /** Antigo atalho do teclado (o teclado agora navega como um comando). */
  keyboardA?: string;
  /** Quanto tempo o bot "pensa" (s). */
  botDelay?: number;
  /** B nas escolhas devolve este id. */
  cancel?: string;
  /** O cursor mudou (escolhas). */
  onFocus?: (id: string) => void;
}

export class SeatControl {
  constructor(
    private readonly hub: PlayerHub,
    private readonly engine: Engine,
    readonly menus: ScreenMenus,
  ) {}

  hubPlayer(seat: Seat): HubPlayer | undefined {
    return seat.isBot ? undefined : this.hub.get(seat.id);
  }

  /** O computador decide por este lugar? */
  isAuto(seat: Seat): boolean {
    const hp = this.hubPlayer(seat);
    return !hp || !hp.connected;
  }

  isKeyboard(seat: Seat): boolean {
    return this.hubPlayer(seat)?.source === 'keyboard';
  }

  /** Comando a ler durante minijogos. */
  pad(seat: Seat): PadInput {
    if (this.isAuto(seat)) return seat.botPad;
    return this.hubPlayer(seat) ?? IDLE_PAD;
  }

  /** O minijogo deve correr a IA para este lugar? */
  needsBot(seat: Seat): boolean {
    return this.isAuto(seat);
  }

  setLayout(seat: Seat, layout: HostLayout): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.setLayout(this.toPhone(seat, layout), hp);
  }

  setLayoutAll(seats: Seat[], layout: HostLayout | ((seat: Seat) => HostLayout)): void {
    for (const s of seats) this.setLayout(s, typeof layout === 'function' ? layout(s) : layout);
  }

  /** Traduz um layout de alto nível para o comando do telemóvel. */
  toPhone(seat: Seat, l: HostLayout): ControllerLayout {
    const color = getCharacter(seat.characterId).color;
    const pad = (p: Omit<PadLayout, 'kind' | 'color'>): PadLayout => ({ kind: 'pad', color, ...p });
    switch (l.kind) {
      case 'wait':
      case 'pad':
      case 'board':
      case 'info':
        return l;
      case 'choices':
        return pad({ title: l.prompt, sub: 'Escolhe no ecrã grande', stick: 'dpad', buttons: { a: 'Escolher', plus: 'Menu' } });
      case 'dice': {
        const items = (l.extras ?? []).filter((x) => x.id !== 'map');
        const map = l.extras?.find((x) => x.id === 'map');
        return pad({
          title: l.prompt,
          sub: '…ou abana o telemóvel!',
          stick: 'none',
          shake: true,
          buttons: { a: l.label, x: items.length ? `Itens (${items.length})` : undefined, minus: map ? 'Mapa' : undefined, plus: 'Menu' },
        });
      }
      case 'gamepad': {
        const b = Object.fromEntries(l.buttons.map((x) => [x.id, x.label]));
        return pad({ title: l.hint ?? 'Joga!', stick: l.stick ? 'stick' : 'none', buttons: { a: b.a, b: b.b, plus: 'Menu', minus: narrator.speaking ? 'Saltar' : undefined } });
      }
      case 'motion': {
        const holdA = l.action === 'throw' || l.action === 'pitch';
        return pad({
          title: l.prompt,
          sub: l.hint,
          stick: l.aim ? 'stick' : 'none',
          stickLabel: l.aimLabel,
          buttons: {
            a: holdA ? 'Segura' : undefined,
            b: l.guard ? 'Defender' : undefined,
            x: l.pick ? l.pick : l.dodge ? 'Esquiva ◀' : undefined,
            y: l.dodge ? 'Esquiva ▶' : undefined,
            plus: 'Menu',
          },
          motion: { action: l.action, hold: holdA ? 'a' : 'none', tilt: l.action === 'throw' ? 'aim' : l.dodge ? 'dodge' : undefined },
        });
      }
    }
  }

  vibrate(seat: Seat, pattern: number | number[]): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.vibrate(hp, pattern);
  }

  /** Pontaria por inclinação do telemóvel (0 para bots e teclado). */
  aim(seat: Seat): number {
    return this.isAuto(seat) ? 0 : (this.hubPlayer(seat)?.aim ?? 0);
  }

  toast(seat: Seat, text: string): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.toast(hp, text);
  }

  /** Estado para o menu 📊 do telemóvel (moedas, estrelas, itens, classificação). */
  status(seat: Seat, status: Parameters<PlayerHub['status']>[1]): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.status(hp, status);
  }

  /**
   * Pede um gesto de desporto (lançar, tacada…) e espera por ele.
   * Bots, desligados e quem não responder a tempo usam `bot()`.
   */
  awaitSwing(seat: Seat, opts: { layout: HostLayout; bot: () => SwingInput; botDelay?: number }): Promise<SwingInput> {
    this.setLayout(seat, opts.layout);
    return new Promise((resolve) => {
      let done = false;
      const finish = (s: SwingInput) => {
        if (done) return;
        done = true;
        off();
        resolve(s);
      };
      const off = this.hub.events.on('swing', ({ player, swing }) => {
        if (player.id === seat.id) finish(swing);
      });
      void (async () => {
        let waited = 0;
        const delay = opts.botDelay ?? 1.2;
        while (!done) {
          await this.engine.wait(0.1);
          waited = this.isAuto(seat) ? waited + 0.1 : 0;
          if (waited >= delay) finish(opts.bot());
        }
      })();
    });
  }

  /** Pede uma decisão a um lugar e espera pela resposta (comando, teclado ou bot). */
  async decide(seat: Seat, opts: DecideOptions): Promise<string> {
    this.setLayout(seat, opts.layout);
    this.hubPlayer(seat)?.clearPresses();
    if (opts.layout.kind === 'choices') return this.choose(seat, opts.layout, opts);
    return this.dice(seat, opts.layout, opts);
  }

  private choose(seat: Seat, l: ChoicesLayout, opts: DecideOptions): Promise<string> {
    return this.menus.ask({
      player: this.hubPlayer(seat) ?? null,
      title: l.prompt,
      name: seat.name,
      color: getCharacter(seat.characterId).color,
      options: l.options,
      columns: l.columns,
      cancel: opts.cancel,
      onFocus: opts.onFocus,
      isAuto: () => this.isAuto(seat),
      bot: { pick: opts.bot, delay: opts.botDelay ?? 0.9 },
    });
  }

  /** Dados: A lança (ou abanar), − abre o mapa, X mostra os itens no ecrã grande. */
  private dice(seat: Seat, l: DiceLayout, opts: DecideOptions): Promise<string> {
    const items = (l.extras ?? []).filter((x) => x.id !== 'map');
    const hasMap = !!l.extras?.some((x) => x.id === 'map');
    return new Promise((resolve) => {
      let done = false;
      let inMenu = false;
      const finish = (id: string) => {
        if (done) return;
        done = true;
        off();
        resolve(id);
      };
      const off = this.hub.events.on('press', ({ player, button }) => {
        if (player.id !== seat.id || inMenu || done || this.menus.blocked) return;
        if (button === 'a' && opts.valid.includes('roll')) finish('roll');
        else if (button === 'minus' && hasMap) finish('map');
        else if (button === 'x' && items.length) {
          inMenu = true;
          this.setLayout(seat, { kind: 'choices', prompt: 'Escolhe um item', options: [] });
          void this.menus
            .ask({
              player,
              title: 'Itens',
              name: seat.name,
              color: getCharacter(seat.characterId).color,
              options: items.map((x) => ({ id: x.id, label: x.label, color: x.color })),
              cancel: 'back',
            })
            .then((id) => {
              inMenu = false;
              if (id !== 'back') finish(id);
              else this.setLayout(seat, l);
            });
        }
      });
      void (async () => {
        let thinking = 0;
        const delay = opts.botDelay ?? 0.9;
        while (!done) {
          await this.engine.wait(0.1);
          thinking = this.isAuto(seat) && !inMenu ? thinking + 0.1 : 0;
          if (thinking >= delay) finish(opts.bot());
        }
      })();
    });
  }
}
