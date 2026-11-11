import type { MinigameMode, Rng } from '@festa/game';
import type { Stage } from '../three/Engine';
import type { Engine } from '../three/Engine';
import type { BotPad, PadInput } from '../game/Seats';

export interface MinigameSeat {
  id: string;
  name: string;
  characterId: string;
  /** null em todos contra todos. No 1 contra todos, o solitário é 'blue'. */
  team: 'blue' | 'red' | null;
}

export interface MinigameContext {
  engine: Engine;
  mode: MinigameMode;
  seats: MinigameSeat[];
  rng: Rng;
  /** Habilidade dos bots (definições), 0–1. */
  botSkill: number;
  /** Comando efetivo (telemóvel/teclado, ou o do bot). */
  pad(id: string): PadInput;
  /** Se for preciso, a IA escreve aqui. */
  botPad(id: string): BotPad;
  isBot(id: string): boolean;
  vibrate(id: string, ms: number): void;
}

export interface MinigameScore {
  id: string;
  value: string;
}

export interface MinigameRun extends Stage {
  /** Começa a contar (depois da contagem decrescente). */
  start(): void;
  readonly finished: boolean;
  /** Segundos que faltam (para o HUD). */
  timeLeft(): number;
  /** Pontuações para mostrar no placar durante o jogo. */
  scores(): MinigameScore[];
  winners(): string[];
  dispose(): void;
}

export interface MinigameDef {
  id: string;
  name: string;
  modes: MinigameMode[];
  /** Só para duelos (1 contra 1). */
  duel?: boolean;
  description(mode: MinigameMode): string;
  controls: string;
  stick: boolean;
  buttons: { id: 'a' | 'b'; label: string }[];
  create(ctx: MinigameContext): MinigameRun;
}
