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
  /** Ronda atual (1, 2, …) e total de rondas: os minijogos podem ficar mais difíceis a cada ronda. */
  round?: number;
  rounds?: number;
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
  /** Joystick, cruz direcional ('dpad', ex.: memória de setas) ou nada. */
  stick: boolean | 'dpad';
  buttons: { id: 'a' | 'b'; label: string }[];
  /** Rondas (melhor de N; por omissão 1). Os jogos curtos têm várias para não acabarem num instante. */
  rounds?: number;
  create(ctx: MinigameContext): MinigameRun;
}
