/**
 * Modo Desportos: cada desporto é um palco 3D que conduz o seu próprio jogo
 * (`play()`), pede gestos aos telemóveis e devolve a classificação.
 */
import type { Rng } from '@festa/game';
import type { SwingInput } from '@festa/shared';
import type { Engine, Stage } from '../three/Engine';
import type { Hud } from '../ui/Hud';
import type { PlayerHub } from '../PlayerHub';
import type { Seat, SeatControl } from '../game/Seats';

export interface SportContext {
  engine: Engine;
  hud: Hud;
  hub: PlayerHub;
  seats: SeatControl;
  /** Jogadores (humanos e bots) por ordem. */
  players: Seat[];
  rng: Rng;
  /** Habilidade dos bots (definições), 0–1. */
  botSkill: number;
}

export interface SportStanding {
  id: string;
  rank: number;
  /** Texto da pontuação ("187 pinos", "+3", "Venceu"…). */
  score: string;
}

export interface SportRun extends Stage {
  /** Joga o desporto do princípio ao fim. */
  play(): Promise<SportStanding[]>;
  dispose(): void;
}

export interface SportDef {
  id: string;
  /** Ordem no menu. */
  order: number;
  name: string;
  emoji: string;
  description: string;
  /** Como se joga com o telemóvel (aparece antes de começar). */
  howTo: string;
  /** O que o narrador diz antes de começar (frase a frase). */
  narration: string[];
  /** Quantos lugares no total (humanos + bots) para `humans` jogadores. */
  seatCount(humans: number): number;
  create(ctx: SportContext): SportRun;
}

/** Gesto aleatório "razoável" para bots, com um nível de habilidade 0–1. */
export function botSwing(rng: Rng, skill = 0.7, base: Partial<SwingInput> = {}): SwingInput {
  const noise = (1 - skill) * 0.6;
  return {
    t: 'swing',
    power: Math.min(1, Math.max(0.2, 0.7 + (rng.next() - 0.5) * 0.4 + (rng.next() - 0.5) * noise)),
    dir: Math.max(-1, Math.min(1, (rng.next() - 0.5) * noise)),
    spin: Math.max(-1, Math.min(1, (rng.next() - 0.5) * noise)),
    source: 'key',
    ...base,
  };
}

/** Classificação com empates a partilhar o lugar (maior = melhor por omissão). */
export function rankBy<T>(items: T[], value: (t: T) => number, higherIsBetter = true): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => (higherIsBetter ? value(b) - value(a) : value(a) - value(b)));
  return sorted.map((it) => ({ ...it, rank: sorted.findIndex((o) => value(o) === value(it)) + 1 }));
}
