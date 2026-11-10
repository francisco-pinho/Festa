/**
 * Lugares na festa: humanos (telemóvel ou teclado) e bots, todos com a mesma
 * interface. Um humano desligado passa a ser controlado pelo computador até voltar.
 */
import type { ButtonId, ControllerLayout } from '@festa/shared';
import type { Engine } from '../three/Engine';
import type { HubPlayer, PlayerHub } from '../PlayerHub';

export interface PadInput {
  readonly stick: { x: number; y: number };
  readonly held: Record<ButtonId, boolean>;
  consumePress(button: ButtonId): boolean;
}

/** Comando virtual que a IA dos bots preenche. */
export class BotPad implements PadInput {
  readonly stick = { x: 0, y: 0 };
  readonly held: Record<ButtonId, boolean> = { a: false, b: false };
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

const IDLE_PAD: PadInput = { stick: { x: 0, y: 0 }, held: { a: false, b: false }, consumePress: () => false };

export interface DecideOptions {
  layout: ControllerLayout;
  valid: string[];
  /** Decisão automática (bots, desligados e jogadores de teclado). */
  bot: () => string;
  /** Jogadores de teclado: carregar em A escolhe este id (senão decide o bot). */
  keyboardA?: string;
  /** Quanto tempo o bot "pensa" (s). */
  botDelay?: number;
}

export class SeatControl {
  constructor(
    private readonly hub: PlayerHub,
    private readonly engine: Engine,
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

  setLayout(seat: Seat, layout: ControllerLayout): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.setLayout(layout, hp);
  }

  setLayoutAll(seats: Seat[], layout: ControllerLayout | ((seat: Seat) => ControllerLayout)): void {
    for (const s of seats) this.setLayout(s, typeof layout === 'function' ? layout(s) : layout);
  }

  vibrate(seat: Seat, pattern: number | number[]): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.vibrate(hp, pattern);
  }

  toast(seat: Seat, text: string): void {
    const hp = this.hubPlayer(seat);
    if (hp) this.hub.toast(hp, text);
  }

  /** Pede uma decisão a um lugar e espera pela resposta (telemóvel, teclado ou bot). */
  decide(seat: Seat, opts: DecideOptions): Promise<string> {
    this.setLayout(seat, opts.layout);
    this.hubPlayer(seat)?.clearPresses();
    return new Promise((resolve) => {
      let done = false;
      const finish = (id: string) => {
        if (done) return;
        done = true;
        offs.forEach((off) => off());
        resolve(id);
      };
      const offs = [
        this.hub.events.on('choice', ({ player, id }) => {
          if (player.id === seat.id && opts.valid.includes(id)) finish(id);
        }),
        this.hub.events.on('press', ({ player, button }) => {
          if (player.id === seat.id && player.source === 'keyboard' && button === 'a' && opts.keyboardA) {
            finish(opts.keyboardA);
          }
        }),
      ];
      void (async () => {
        let thinking = 0;
        const delay = opts.botDelay ?? 0.9;
        while (!done) {
          await this.engine.wait(0.1);
          const auto = this.isAuto(seat) || (this.isKeyboard(seat) && !opts.keyboardA);
          thinking = auto ? thinking + 0.1 : 0;
          if (thinking >= delay) finish(opts.bot());
        }
      })();
    });
  }
}
