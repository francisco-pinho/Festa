import type { MinigameMode, Rng } from '@festa/game';
import { CoinShower } from './CoinShower';
import { Marksman } from './Marksman';
import { QuickDraw } from './QuickDraw';
import { Sumo } from './Sumo';
import { Tag } from './Tag';
import { TugOfWar, TugOfWarTeams } from './TugOfWar';
import { Balloon } from './Balloon';
import { Canoe } from './Canoe';
import { ColorFloor } from './ColorFloor';
import { Hammer } from './Hammer';
import { HotPotato } from './HotPotato';
import { JumpRope } from './JumpRope';
import { Maestro } from './Maestro';
import { Snowballs } from './Snowballs';
import { Bomber } from './Bomber';
import { LookAway } from './LookAway';
import { Meteors } from './Meteors';
import { CountSheep } from './CountSheep';
import { RightForce } from './RightForce';
import { WallHole } from './WallHole';
import { Fishing } from './Fishing';
import { MemoryCards } from './MemoryCards';
import { IceRace } from './IceRace';
import { FallingTiles } from './FallingTiles';
import { ShellSoccer } from './ShellSoccer';
import { PizzaRush } from './PizzaRush';
import { PhotoShoot } from './PhotoShoot';
import { ConveyorBombs } from './ConveyorBombs';
import { Pinball } from './Pinball';
import { Bobsled } from './Bobsled';
import { BeachVolley } from './BeachVolley';
import type { MinigameDef } from './types';

/** Para adicionar um minijogo: cria o ficheiro e acrescenta-o aqui. */
export const MINIGAMES: MinigameDef[] = [
  CoinShower, Sumo, Tag, QuickDraw, TugOfWar, TugOfWarTeams, Marksman,
  ColorFloor, Snowballs, JumpRope, Maestro, Balloon, HotPotato, Hammer, Canoe,
  LookAway, Bomber, Meteors,
  CountSheep, RightForce, WallHole, Fishing,
  MemoryCards, IceRace,
  FallingTiles, ShellSoccer, PizzaRush, PhotoShoot,
  ConveyorBombs, Pinball, Bobsled, BeachVolley,
];

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
