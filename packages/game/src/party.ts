/**
 * Regras da festa (sem gráficos nem rede). O ecrã principal usa estas funções
 * e trata só da encenação: animações, câmara e pedidos aos telemóveis.
 *
 * Ciclo: ordem de jogo → N rondas (cada jogador lança 2 dados e anda; no fim da
 * ronda há minijogo) → estrelas bónus → classificação final.
 */
import { distancesTo, getSpace, openNext, previousOf, tunnelBetween, type Board, type SpaceType } from './board';
import { MAX_ITEMS, type ItemId } from './items';
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
  /** Duelo: quem perde dá estas moedas e recua estas casas. */
  duelCoins: 5,
  duelStepsBack: 3,
  /** Casa VS: cada um põe isto no pote. */
  vsStake: 5,
  /** Armadilha: quem cai nela paga isto ao dono. */
  trapCoins: 10,
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
  /** Inventário (máx. MAX_ITEMS). */
  items: ItemId[];
  /** Afetado pelo Dado Preguiçoso: na próxima vez só tira 1–3 por dado. */
  slowDice: boolean;
}

export interface PartyState {
  board: Board;
  /** Já ordenados pela ordem de jogo depois de `decideTurnOrder`. */
  players: PartyPlayer[];
  round: number;
  totalRounds: number;
  starSpaceId: number;
  /** Interruptores do mapa (maré alta, semáforo…). */
  flags: Record<string, boolean>;
  /** Armadilhas: casa → id de quem a pôs. */
  traps: Record<number, string>;
  /** Loja em saldos nesta ronda (metade do preço). */
  saleShopId: string | null;
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
      items: [],
      slowDice: false,
    })),
    round: 1,
    totalRounds,
    starSpaceId: -1,
    flags: { ...board.initialFlags },
    traps: {},
    saleShopId: null,
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
  | { kind: 'taxi'; from: number; to: number }
  | { kind: 'item'; item: ItemId | null; coins: number }
  | { kind: 'vs' }
  | { kind: 'villain'; event: VillainEvent }
  | { kind: 'shop' }
  | { kind: 'none' };

export interface Landing {
  type: SpaceType;
  color: SpaceColor;
  effect: LandingEffect;
  /** Caiu numa armadilha de outro jogador. */
  trap?: { owner: string; amount: number };
}

/** Itens que podem sair de graça na casa de item. */
const FREE_ITEMS: ItemId[] = ['turbo', 'dadoExtra', 'ima', 'armadilha', 'bilheteLoja', 'espelho', 'dadoLento'];

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
      p.stats.eventSpaces++;
      if (state.board.eventKind === 'taxi') {
        // Táxi: leva-te para perto da estrela.
        const from = p.spaceId;
        p.spaceId = taxiDestination(state, rng);
        effect = { kind: 'taxi', from, to: p.spaceId };
        break;
      }
      // Tornado: troca de lugar com outro jogador ao acaso.
      const others = state.players.filter((o) => o.id !== p.id && o.spaceId !== p.spaceId);
      if (others.length) {
        const other = rng.pick(others);
        [p.spaceId, other.spaceId] = [other.spaceId, p.spaceId];
        effect = { kind: 'swap', with: other.id };
      }
      break;
    }
    case 'item': {
      p.stats.eventSpaces++;
      const item = rng.pick(FREE_ITEMS);
      if (addItem(p, item)) effect = { kind: 'item', item, coins: 0 };
      else effect = { kind: 'item', item: null, coins: addCoins(p, 5) };
      break;
    }
    case 'vs':
      p.stats.eventSpaces++;
      effect = { kind: 'vs' };
      break;
    case 'villain':
      p.stats.eventSpaces++;
      color = 'red';
      effect = { kind: 'villain', event: villainRoll(state, p, rng) };
      break;
    case 'shop':
      color = 'blue';
      effect = { kind: 'shop' };
      break;
  }
  // Armadilha de outro jogador nesta casa (a casa onde ficou no fim)
  let trap: Landing['trap'];
  const owner = state.traps[p.spaceId];
  if (owner && owner !== p.id) {
    const amount = stealCoins(p, getPlayer(state, owner), RULES.trapCoins);
    delete state.traps[p.spaceId];
    trap = { owner, amount };
  }
  p.color = color;
  return { type: space.type, color, effect, trap };
}


// ── Itens ─────────────────────────────────────────────────

/** Guarda um item no inventário. Devolve false se estiver cheio. */
export function addItem(p: PartyPlayer, item: ItemId): boolean {
  if (p.items.length >= MAX_ITEMS) return false;
  p.items.push(item);
  return true;
}

export function removeItem(p: PartyPlayer, item: ItemId): boolean {
  const i = p.items.indexOf(item);
  if (i < 0) return false;
  p.items.splice(i, 1);
  return true;
}

/** Quem vai em último (menos estrelas, depois menos moedas). Empate: todos os empatados. */
export function lastPlaceIds(state: PartyState): string[] {
  const key = (p: PartyPlayer) => p.stars * 1000 + p.coins;
  const min = Math.min(...state.players.map(key));
  return state.players.filter((p) => key(p) === min).map((p) => p.id);
}

/** Íman: rouba 5–10 moedas (ou o que houver). Devolve quanto passou. */
export function stealCoins(from: PartyPlayer, to: PartyPlayer, amount: number): number {
  const taken = -addCoins(from, -amount);
  addCoins(to, taken);
  return taken;
}

/** Ladrão de estrelas: passa uma estrela. */
export function stealStar(from: PartyPlayer, to: PartyPlayer): boolean {
  if (from.stars <= 0) return false;
  from.stars--;
  to.stars++;
  return true;
}

/** Dado Preguiçoso: todos os outros só tiram 1–3 por dado na próxima vez. */
export function applySlowDice(state: PartyState, user: PartyPlayer): void {
  for (const p of state.players) if (p.id !== user.id) p.slowDice = true;
}

/** Lança um dado respeitando o Dado Preguiçoso. */
export function rollDieFor(p: PartyPlayer, rng: Rng): number {
  return p.slowDice ? rng.int(1, 3) : rng.int(1, 6);
}

/** Depois de lançar, o efeito do Dado Preguiçoso acaba. */
export function clearSlowDice(p: PartyPlayer): void {
  p.slowDice = false;
}

/** Loja mais próxima (em passos, seguindo o tabuleiro). */
export function nearestShop(state: PartyState, fromSpace: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const shop of state.board.shops) {
    const d = distancesTo(state.board, shop.spaceId, state.flags).get(fromSpace);
    if (d !== undefined && d > 0 && d < bestD) {
      bestD = d;
      best = shop.spaceId;
    }
  }
  return best;
}

// ── Duelo ─────────────────────────────────────────────────

/** Recua `n` casas pelo caminho de onde se veio (o principal, nos cruzamentos). */
export function stepsBack(board: Board, spaceId: number, n: number): number {
  let cur = spaceId;
  for (let i = 0; i < n; i++) {
    const prev = previousOf(board, cur);
    if (!prev.length) break;
    cur = Math.min(...prev);
  }
  return cur;
}

export interface DuelResult {
  coins: number;
  loserFrom: number;
  loserTo: number;
}

/** Quem perde o duelo dá moedas a quem ganha e recua casas. */
export function resolveDuel(state: PartyState, winner: PartyPlayer, loser: PartyPlayer): DuelResult {
  const coins = stealCoins(loser, winner, RULES.duelCoins);
  const loserFrom = loser.spaceId;
  loser.spaceId = stepsBack(state.board, loser.spaceId, RULES.duelStepsBack);
  return { coins, loserFrom, loserTo: loser.spaceId };
}

/** Outros jogadores na mesma casa (candidatos a duelo). */
export function playersOnSpace(state: PartyState, p: PartyPlayer): PartyPlayer[] {
  return state.players.filter((o) => o.id !== p.id && o.spaceId === p.spaceId);
}

// ── Casa VS ───────────────────────────────────────────────

/** Todos põem moedas no pote. Devolve o pote e quanto cada um pôs. */
export function collectVs(state: PartyState): { pot: number; paid: Map<string, number> } {
  const paid = new Map<string, number>();
  let pot = 0;
  for (const p of state.players) {
    const v = -addCoins(p, -RULES.vsStake);
    paid.set(p.id, v);
    pot += v;
  }
  return { pot, paid };
}

/** Os vencedores dividem o pote (o resto da divisão vai para o primeiro). */
export function awardVs(state: PartyState, winners: string[], pot: number): Map<string, number> {
  const got = new Map<string, number>();
  if (!winners.length) return got;
  const share = Math.floor(pot / winners.length);
  winners.forEach((id, i) => {
    const v = share + (i === 0 ? pot - share * winners.length : 0);
    addCoins(getPlayer(state, id), v);
    got.set(id, v);
  });
  return got;
}

// ── Casa do Trapaceiro ────────────────────────────────────

export type VillainEvent =
  | { kind: 'loseCoins'; amount: number }
  | { kind: 'payEveryone'; each: number }
  | { kind: 'shuffle' }
  | { kind: 'equalize'; each: number }
  | { kind: 'loseStar' };

export const VILLAIN_LABELS: Record<VillainEvent['kind'], string> = {
  loseCoins: 'Perdes 10 moedas',
  payEveryone: 'Pagas 3 moedas a cada um',
  shuffle: 'Toda a gente troca de lugar!',
  equalize: 'Moedas divididas por igual!',
  loseStar: 'Perdes uma estrela!',
};

/** Sorteia e aplica uma partida do Trapaceiro. */
export function villainRoll(state: PartyState, p: PartyPlayer, rng: Rng): VillainEvent {
  const options: VillainEvent['kind'][] = ['loseCoins', 'loseCoins', 'payEveryone', 'shuffle', 'equalize'];
  if (p.stars > 0 && rng.next() < 0.35) options.push('loseStar');
  const kind = rng.pick(options);
  switch (kind) {
    case 'loseCoins':
      return { kind, amount: -addCoins(p, -10) };
    case 'payEveryone': {
      for (const o of state.players) if (o.id !== p.id) stealCoins(p, o, 3);
      return { kind, each: 3 };
    }
    case 'shuffle': {
      const spots = rng.shuffle(state.players.map((o) => o.spaceId));
      state.players.forEach((o, i) => (o.spaceId = spots[i]!));
      return { kind };
    }
    case 'equalize': {
      const total = state.players.reduce((a, o) => a + o.coins, 0);
      const each = Math.floor(total / state.players.length);
      for (const o of state.players) {
        o.coins = each;
        o.stats.maxCoins = Math.max(o.stats.maxCoins, each);
      }
      return { kind, each };
    }
    case 'loseStar':
      p.stars = Math.max(0, p.stars - 1);
      return { kind };
  }
}

// ── Mecânicas do mapa (início de cada ronda) ──────────────

export type RoundEvent =
  | { kind: 'tide'; high: boolean }
  | { kind: 'traffic'; greenNS: boolean }
  | { kind: 'sale'; shopId: string };

/** Atualiza interruptores e saldos no início de uma ronda. */
export function startRound(state: PartyState, rng: Rng): RoundEvent[] {
  const events: RoundEvent[] = [];
  if (state.board.mechanic === 'tide' && state.round > 1 && (state.round - 1) % 3 === 0) {
    state.flags.highTide = !state.flags.highTide;
    events.push({ kind: 'tide', high: state.flags.highTide });
  }
  if (state.board.mechanic === 'traffic' && state.round > 1) {
    state.flags.greenNS = !state.flags.greenNS;
    events.push({ kind: 'traffic', greenNS: state.flags.greenNS });
  }
  state.saleShopId = null;
  const shops = state.board.shops.filter((s) => s.kind !== 'ultimo');
  if (shops.length && state.round > 1 && rng.next() < 0.35) {
    state.saleShopId = rng.pick(shops).id;
    events.push({ kind: 'sale', shopId: state.saleShopId });
  }
  return events;
}

/** Táxi: leva-te para perto da estrela (3 a 6 casas antes dela). */
export function taxiDestination(state: PartyState, rng: Rng): number {
  const dist = distancesTo(state.board, state.starSpaceId, state.flags);
  const near = [...dist].filter(([, d]) => d >= 3 && d <= 6).map(([id]) => id);
  return near.length ? rng.pick(near) : state.board.startId;
}

// ── Bots: itens e lojas ───────────────────────────────────

export type BotItemPlan = { item: ItemId; target?: string } | null;

/** Decide se o bot usa um item antes de lançar os dados. */
export function botChooseItem(state: PartyState, p: PartyPlayer, rng: Rng, skill = 0.6): BotItemPlan {
  if (!p.items.length || rng.next() > 0.35 + skill * 0.5) return null;
  const others = state.players.filter((o) => o.id !== p.id);
  const leader = [...others].sort((a, b) => b.stars - a.stars || b.coins - a.coins)[0];
  const dist = distancesTo(state.board, state.starSpaceId, state.flags);
  const myDist = dist.get(p.spaceId) ?? 99;
  const has = (i: ItemId) => p.items.includes(i);
  if (has('ladraoEstrela') && leader && leader.stars > 0) return { item: 'ladraoEstrela', target: leader.id };
  if (has('espelho')) {
    const closer = others.filter((o) => (dist.get(o.spaceId) ?? 99) + 4 < myDist);
    if (closer.length) return { item: 'espelho', target: closer.sort((a, b) => (dist.get(a.spaceId) ?? 99) - (dist.get(b.spaceId) ?? 99))[0]!.id };
  }
  if (has('ima')) {
    const rich = [...others].sort((a, b) => b.coins - a.coins)[0];
    if (rich && rich.coins >= 8) return { item: 'ima', target: rich.id };
  }
  if (has('dadoExtra') && myDist > 8) return { item: 'dadoExtra' };
  if (has('turbo') && myDist > 5) return { item: 'turbo' };
  if (has('dadoDourado') && p.coins < RULES.starCost) return { item: 'dadoDourado' };
  if (has('dadoLento') && others.some((o) => (dist.get(o.spaceId) ?? 99) <= 8)) return { item: 'dadoLento' };
  if (has('luva') && leader && rng.next() < 0.5) return { item: 'luva', target: leader.id };
  if (has('armadilha') && !state.traps[p.spaceId]) return { item: 'armadilha' };
  return null;
}

/** O que o bot compra numa loja (ou null). Guarda moedas para a estrela quando está perto. */
export function botChooseBuy(state: PartyState, p: PartyPlayer, stock: { item: ItemId; price: number }[], rng: Rng): ItemId | null {
  if (p.items.length >= MAX_ITEMS) return null;
  const someoneHasStar = state.players.some((o) => o.id !== p.id && o.stars > 0);
  const reserve = p.coins >= RULES.starCost + 5 ? RULES.starCost : 0;
  const affordable = stock.filter((s) => p.coins - s.price >= reserve || (s.item === 'ladraoEstrela' && someoneHasStar && p.coins >= s.price));
  if (!affordable.length || rng.next() < 0.25) return null;
  const steal = affordable.find((s) => s.item === 'ladraoEstrela' && someoneHasStar);
  if (steal) return steal.item;
  return affordable.sort((a, b) => b.price - a.price)[0]!.item;
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

/**
 * Num cruzamento, o bot vai pelo caminho mais curto até à estrela.
 * `skill` (0–1): quanto menor, mais vezes escolhe ao acaso.
 */
export function botChooseNext(state: PartyState, options: number[], rng: Rng, skill = 0.6, coins = Infinity): number {
  const dist = distancesTo(state.board, state.starSpaceId, state.flags);
  // Não escolhe um metro que não consegue pagar.
  const from = state.board.spaces.find((s) => options.every((o) => s.next.includes(o)))?.id;
  const affordable = options.filter((o) => {
    const t = from !== undefined ? tunnelBetween(state.board, from, o) : undefined;
    return !t || t.cost <= coins;
  });
  if (affordable.length) options = affordable;
  if (rng.next() < 0.5 * (1 - skill)) return rng.pick(options);
  return [...options].sort((a, b) => (dist.get(a) ?? 999) - (dist.get(b) ?? 999))[0]!;
}

export function botWantsStar(p: PartyPlayer): boolean {
  return canBuyStar(p);
}
