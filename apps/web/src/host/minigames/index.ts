import type { MinigameMode, Rng } from '@festa/game';
import { CoinShower } from './CoinShower';
import { Sumo } from './Sumo';
import { Tag } from './Tag';
import type { MinigameDef } from './types';

/** Para adicionar um minijogo: cria o ficheiro e acrescenta-o aqui. */
export const MINIGAMES: MinigameDef[] = [CoinShower, Sumo, Tag];

/** Escolhe um minijogo que suporte o modo, evitando repetir o anterior. */
export function pickMinigame(mode: MinigameMode, rng: Rng, lastId: string | null): MinigameDef {
  const options = MINIGAMES.filter((m) => m.modes.includes(mode));
  const fresh = options.filter((m) => m.id !== lastId);
  return rng.pick(fresh.length ? fresh : options);
}

export const MODE_LABEL: Record<MinigameMode, string> = {
  ffa: 'Todos contra todos',
  teams: 'Equipas',
  oneVsAll: '1 contra todos',
};
