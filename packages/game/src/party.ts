/**
 * Regras da festa (sem gráficos nem rede). O ecrã principal usa estas funções
 * e trata só da encenação: animações, câmara e pedidos aos telemóveis.
 *
 * Ciclo: ordem de jogo → N rondas (cada jogador lança 2 dados e anda; no fim da
 * ronda há minijogo) → estrelas bónus → classificação final.
 */
import { distancesTo, getSpace, type Board, type SpaceType } from './board';
import type { Rng } from './rng';

export const RULES = {
  minPlayers: 4,
  maxPlayers: 10,
  startCoins: 10,
  starCost: 20,
  blueCoins: 3,
  redCoins: 3,
  luckyCoins: [5, 10] as const,
  unluckyCoins: [3, 8] as const,
  minigamePrize: 10,
  roundOptions: [5, 10, 15, 20] as const,
  /** Nas últimas rondas, azuis/vermelhas valem o dobro. */
  lastRoundsDouble: 3,
};

export type SpaceColor = 'blue' | 'red';
export type MinigameMode = 'ffa' | 'teams' | 'oneVsAll';

export interface PlayerStats {
  minigameCoins: number;
  maxCoins: number;
  eventSpaces: number;
  redSpaces: number;
}

export interface PartyPlayer {
  id: string;
  name: string;
  characterId: string;
  isBot: boolean;
  coins: number;
  stars: number;
  spaceId: number;
  /** Cor da última casa onde parou (decide o tipo de minijogo). */
  color: SpaceColor | null;
  stats: PlayerStats;
}

export interface PartyState {
  board: Board;
  /** Já ordenados pela ordem de jogo depois de `decideTurnOrder`. */
  players: PartyPlayer[];
  round: number;
  totalRounds: number;
  starSpaceId: number;
}

export interface PartyPlayerInput {
  id: string;
  name: string;
  characterId: string;
  isBot: boolean;
}

/** Quantos lugares no total (humanos + bots): mínimo 4, número par, máximo 10. */
export function seatCount(humans: number): number {
  const even = humans % 2 === 0 ? humans : humans + 1;
  return Math.min(RULES.maxPlayers, Math.max(RULES.minPlayers, even));
}

export function createParty(
  board: Board,
  players: PartyPlayerInput[],
  totalRounds: number,
  rng: Rng,
): PartyState {
  if (players.length < RULES.minPlayers || players.length > RULES.maxPlayers) {
    throw new Error(`Número de jogadores inválido: ${players.length}`);
  }
  const state: PartyState = {
    board,
    players: players.map((p) => ({
      ...p,
      coins: RULES.startCoins,
      stars: 0,
      spaceId: board.startId,
      color: null,
      stats: { minigameCoins: 0, maxCoins: RULES.startCoins, eventSpaces: 0, redSpaces: 0 },
    })),
    round: 1,
    totalRounds,
    starSpaceId: -1,
  };
  relocateStar(state, rng);
  return state;
}

export function getPlayer(state: PartyState, id: string): PartyPlayer {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Jogador desconhecido: ${id}`);
  return p;
}

// ── Ordem de jogo ─────────────────────────────────────────

/** Cada jogador lança um dado de 1 a 10 (sem repetidos, como no género); maior joga primeiro. */
export function rollTurnOrder(state: PartyState, rng: Rng): Map<string, number> {
  const values = rng.shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
  return new Map(state.players.map((p, i) => [p.id, values[i]!]));
}

export function applyTurnOrder(state: PartyState, rolls: Map<string, number>): void {
  state.players.sort((a, b) => (rolls.get(b.id) ?? 0) - (rolls.get(a.id) ?? 0));
}

// ── Dados ─────────────────────────────────────────────────

export function rollDie(rng: Rng): number {
  return rng.int(1, 6);
}

/** Dois dados iguais dão direito a um terceiro dado. */
export function isDoubles(dice: readonly number[]): boolean {
  return dice.length === 2 && dice[0] === dice[1];
}

// ── Moedas e estrela ──────────────────────────────────────

/** Soma (ou tira) moedas sem ficar negativo. Devolve a variação real. */
export function addCoins(p: PartyPlayer, amount: number): number {
  const before = p.coins;
  p.coins = Math.max(0, p.coins + amount);
  p.stats.maxCoins = Math.max(p.stats.maxCoins, p.coins);
  return p.coins - before;
}

export function canBuyStar(p: PartyPlayer): boolean {
  return p.coins >= RULES.starCost;
}

export function buyStar(state: PartyState, p: PartyPlayer, rng: Rng): boolean {
  if (!canBuyStar(p)) return false;
  addCoins(p, -RULES.starCost);
  p.stars++;
  relocateStar(state, rng);
  return true;
}

/** Muda a estrela para outra casa candidata, longe de onde estava. */
export function relocateStar(state: PartyState, rng: Rng): void {
  const candidates = state.board.spaces.filter((s) => s.starCandidate && s.id !== state.starSpaceId);
  if (state.starSpaceId >= 0) {
    const from = getSpace(state.board, state.starSpaceId);
    const far = candidates.filter((s) => Math.hypot(s.x - from.x, s.z - from.z) > 15);
    if (far.length) {
      state.starSpaceId = rng.pick(far).id;
      return;
    }
  }
  state.starSpaceId = rng.pick(candidates).id;
}

// ── Casas ─────────────────────────────────────────────────

export type LandingEffect =
  | { kind: 'coins'; amount: number }
  | { kind: 'give'; to: string; amount: number }
  | { kind: 'swap'; with: string }
  | { kind: 'none' };

export interface Landing {
  type: SpaceType;
  color: SpaceColor;
  effect: LandingEffect;
}

export function isLastRounds(state: PartyState): boolean {
  return state.totalRounds - state.round < RULES.lastRoundsDouble;
}

/** Efeito de parar numa casa. Já aplica as moedas/trocas ao estado. */
export function resolveLanding(state: PartyState, p: PartyPlayer, rng: Rng): Landing {
  const space = getSpace(state.board, p.spaceId);
  const mult = isLastRounds(state) ? 2 : 1;
  let color: SpaceColor = rng.next() < 0.5 ? 'blue' : 'red';
  let effect: LandingEffect = { kind: 'none' };

  switch (space.type) {
    case 'blue':
    case 'start':
      color = 'blue';
      effect = { kind: 'coins', amount: addCoins(p, RULES.blueCoins * mult) };
      break;
    case 'red':
      color = 'red';
      p.stats.redSpaces++;
      effect = { kind: 'coins', amount: addCoins(p, -RULES.redCoins * mult) };
      break;
    case 'lucky':
      p.stats.eventSpaces++;
      effect = { kind: 'coins', amount: addCoins(p, rng.int(...RULES.luckyCoins)) };
      break;
    case 'unlucky': {
      p.stats.eventSpaces++;
      const others = state.players.filter((o) => o.id !== p.id);
      const amount = rng.int(...RULES.unluckyCoins);
      if (rng.next() < 0.5 && others.length) {
        const to = rng.pick(others);
        const given = -addCoins(p, -amount);
        addCoins(to, given);
        effect = { kind: 'give', to: to.id, amount: given };
      } else {
        effect = { kind: 'coins', amount: addCoins(p, -amount) };
      }
      break;
    }
    case 'event': {
      // Tornado: troca de lugar com outro jogador ao acaso.
      p.stats.eventSpaces++;
      const others = state.players.filter((o) => o.id !== p.id && o.spaceId !== p.spaceId);
      if (others.length) {
        const other = rng.pick(others);
        [p.spaceId, other.spaceId] = [other.spaceId, p.spaceId];
        effect = { kind: 'swap', with: other.id };
      }
      break;
    }
  }
  p.color = color;
  return { type: space.type, color, effect };
}

// ── Minijogos ─────────────────────────────────────────────

export interface MinigameTeams {
  mode: MinigameMode;
  /** Equipa azul (no 1 contra todos, a equipa de quem está sozinho). */
  blue: string[];
  red: string[];
}

/**
 * Decide o tipo de minijogo pelas cores onde todos pararam:
 * todos iguais → todos contra todos; um diferente → 1 contra todos;
 * resto → duas equipas do mesmo tamanho (reequilibradas ao acaso).
 */
export function decideMinigameTeams(state: PartyState, rng: Rng): MinigameTeams {
  const blue: string[] = [];
  const red: string[] = [];
  for (const p of state.players) {
    const c = p.color ?? (rng.next() < 0.5 ? 'blue' : 'red');
    (c === 'blue' ? blue : red).push(p.id);
  }
  const n = state.players.length;
  if (blue.length === n || red.length === n) return { mode: 'ffa', blue: [...blue, ...red], red: [] };
  if (blue.length === 1) return { mode: 'oneVsAll', blue, red };
  if (red.length === 1) return { mode: 'oneVsAll', blue: red, red: blue };
  while (blue.length !== red.length) {
    const [big, small] = blue.length > red.length ? [blue, red] : [red, blue];
    const moved = big.splice(rng.int(0, big.length - 1), 1)[0]!;
    small.push(moved);
  }
  return { mode: 'teams', blue, red };
}

/** Dá o prémio do minijogo aos vencedores. */
export function awardMinigame(state: PartyState, winners: string[]): Map<string, number> {
  const awarded = new Map<string, number>();
  for (const id of winners) {
    const p = getPlayer(state, id);
    const got = addCoins(p, RULES.minigamePrize);
    p.stats.minigameCoins += got;
    awarded.set(id, got);
  }
  return awarded;
}

// ── Fim da festa ──────────────────────────────────────────

export interface BonusStar {
  id: 'minigame' | 'rich' | 'event';
  title: string;
  description: string;
  winners: string[];
}

export function bonusStars(state: PartyState): BonusStar[] {
  const top = (value: (p: PartyPlayer) => number) => {
    const max = Math.max(...state.players.map(value));
    return max > 0 ? state.players.filter((p) => value(p) === max).map((p) => p.id) : [];
  };
  return [
    {
      id: 'minigame' as const,
      title: 'Estrela dos Minijogos',
      description: 'Quem ganhou mais moedas em minijogos',
      winners: top((p) => p.stats.minigameCoins),
    },
    {
      id: 'rich' as const,
      title: 'Estrela da Fortuna',
      description: 'Quem chegou a ter mais moedas',
      winners: top((p) => p.stats.maxCoins),
    },
    {
      id: 'event' as const,
      title: 'Estrela da Aventura',
      description: 'Quem parou em mais casas especiais',
      winners: top((p) => p.stats.eventSpaces),
    },
  ].filter((b) => b.winners.length > 0);
}

export function applyBonusStars(state: PartyState, bonuses: BonusStar[]): void {
  for (const b of bonuses) for (const id of b.winners) getPlayer(state, id).stars++;
}

/** Classificação: estrelas, depois moedas. Empates partilham o lugar. */
export function ranking(state: PartyState): { player: PartyPlayer; rank: number }[] {
  const sorted = [...state.players].sort((a, b) => b.stars - a.stars || b.coins - a.coins);
  return sorted.map((player) => ({
    player,
    rank: sorted.findIndex((o) => o.stars === player.stars && o.coins === player.coins) + 1,
  }));
}

// ── Bots ──────────────────────────────────────────────────

/** Num cruzamento, o bot vai pelo caminho mais curto até à estrela (com algum acaso). */
export function botChooseNext(state: PartyState, options: number[], rng: Rng): number {
  const dist = distancesTo(state.board, state.starSpaceId);
  if (rng.next() < 0.2) return rng.pick(options);
  return [...options].sort((a, b) => (dist.get(a) ?? 999) - (dist.get(b) ?? 999))[0]!;
}

export function botWantsStar(p: PartyPlayer): boolean {
  return canBuyStar(p);
}
