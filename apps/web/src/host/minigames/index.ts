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
export function pickMinigame(mode: MinigameMode, rng: Rng, lastId: string | null): MinigameDef {
  const options = MINIGAMES.filter((m) => m.modes.includes(mode) && !m.duel);
  const fresh = options.filter((m) => m.id !== lastId);
  return rng.pick(fresh.length ? fresh : options);
}

/** Escolhe um minijogo de duelo (1 contra 1), evitando repetir o anterior. */
export function pickDuel(rng: Rng, lastId: string | null): MinigameDef {
  const options = MINIGAMES.filter((m) => m.duel);
  const fresh = options.filter((m) => m.id !== lastId);
  return rng.pick(fresh.length ? fresh : options);
}

export const MODE_LABEL: Record<MinigameMode, string> = {
  ffa: 'Todos contra todos',
  teams: 'Equipas',
  oneVsAll: '1 contra todos',
};
