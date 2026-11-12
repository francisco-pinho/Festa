import type { MinigameMode, Rng } from '@festa/game';
import { CoinShower } from './CoinShower';
import { Marksman } from './Marksman';
import { QuickDraw } from './QuickDraw';
import { Sumo } from './Sumo';
import { Tag } from './Tag';
import { TugOfWar } from './TugOfWar';
import { Balloon } from './Balloon';
import { Canoe } from './Canoe';
import { ColorFloor } from './ColorFloor';
import { Hammer } from './Hammer';
import { HotPotato } from './HotPotato';
import { JumpRope } from './JumpRope';
import { Maestro } from './Maestro';
import { Snowballs } from './Snowballs';
import type { MinigameDef } from './types';

/** Para adicionar um minijogo: cria o ficheiro e acrescenta-o aqui. */
export const MINIGAMES: MinigameDef[] = [
  CoinShower, Sumo, Tag, QuickDraw, TugOfWar, Marksman,
  ColorFloor, Snowballs, JumpRope, Maestro, Balloon, HotPotato, Hammer, Canoe,
];

/** Escolhe um minijogo que suporte o modo, evitando repetir o anterior. */
/**
 * Escolhe ao calhas um que ainda não se jogou nesta festa (`played`). Só repete quando já saíram
 * todos os possíveis para este modo — e mesmo aí nunca o último que se jogou.
 */
function pickFresh(options: MinigameDef[], rng: Rng, lastId: string | null, played: ReadonlySet<string>): MinigameDef {
  const unplayed = options.filter((m) => !played.has(m.id));
  if (unplayed.length) return rng.pick(unplayed);
  const notLast = options.filter((m) => m.id !== lastId);
  return rng.pick(notLast.length ? notLast : options);
}

/** Escolhe um minijogo para o modo, sem repetir enquanto houver outros por jogar. */
export function pickMinigame(mode: MinigameMode, rng: Rng, lastId: string | null, played: ReadonlySet<string> = new Set()): MinigameDef {
  return pickFresh(MINIGAMES.filter((m) => m.modes.includes(mode) && !m.duel), rng, lastId, played);
}

/** Escolhe um minijogo de duelo (1 contra 1), sem repetir enquanto houver outros por jogar. */
export function pickDuel(rng: Rng, lastId: string | null, played: ReadonlySet<string> = new Set()): MinigameDef {
  return pickFresh(MINIGAMES.filter((m) => m.duel), rng, lastId, played);
}

export const MODE_LABEL: Record<MinigameMode, string> = {
  ffa: 'Todos contra todos',
  teams: 'Equipas',
  oneVsAll: '1 contra todos',
};
