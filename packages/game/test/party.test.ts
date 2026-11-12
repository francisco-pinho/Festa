import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  RULES,
  addCoins,
  applyTurnOrder,
  awardMinigame,
  bonusStars,
  botChooseNext,
  buyStar,
  createIslandBoard,
  createParty,
  createRng,
  decideMinigameTeams,
  distancesTo,
  isDoubles,
  ranking,
  resolveLanding,
  rollTurnOrder,
  seatCount,
  type PartyState,
} from '../src';

function party(n = 4, seed = 1): PartyState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `J${i}`,
    characterId: CHARACTERS[i]!.id,
    isBot: false,
  }));
  return createParty(createIslandBoard(), players, 10, createRng(seed));
}

describe('tabuleiro', () => {
  const board = createIslandBoard();

  it('todas as casas ligam a casas que existem e todas são alcançáveis a partir da partida', () => {
    for (const s of board.spaces) for (const n of s.next) expect(board.spaces[n]).toBeDefined();
    const seen = new Set([board.startId]);
    const queue = [board.startId];
    while (queue.length) for (const n of board.spaces[queue.shift()!]!.next) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(board.spaces.length);
  });

  it('tem cruzamentos, várias casas candidatas a estrela e casas não sobrepostas', () => {
    expect(board.spaces.filter((s) => s.next.length > 1).length).toBeGreaterThanOrEqual(3);
    expect(board.spaces.filter((s) => s.starCandidate).length).toBeGreaterThanOrEqual(5);
    for (const a of board.spaces)
      for (const b of board.spaces) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.4);
  });

  it('distâncias até uma casa seguem o sentido do tabuleiro', () => {
    const d = distancesTo(board, 10);
    expect(d.get(10)).toBe(0);
    expect(d.get(9)).toBe(1);
  });
});

describe('festa', () => {
  it('lugares: mínimo 4, sempre par, máximo 10', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seatCount)).toEqual([4, 4, 4, 4, 6, 6, 8, 8, 10, 10]);
  });

  it('começa com moedas iniciais, na partida, e a estrela numa casa candidata', () => {
    const s = party();
    expect(s.players.every((p) => p.coins === RULES.startCoins && p.spaceId === s.board.startId)).toBe(true);
    expect(s.board.spaces[s.starSpaceId]!.starCandidate).toBe(true);
  });

  it('ordem de jogo: valores diferentes, maior primeiro', () => {
    const s = party(10);
    const rolls = rollTurnOrder(s, createRng(3));
    expect(new Set(rolls.values()).size).toBe(10);
    applyTurnOrder(s, rolls);
    const values = s.players.map((p) => rolls.get(p.id)!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('dados iguais', () => {
    expect(isDoubles([3, 3])).toBe(true);
    expect(isDoubles([3, 4])).toBe(false);
  });

  it('moedas nunca ficam negativas', () => {
    const p = party().players[0]!;
    expect(addCoins(p, -50)).toBe(-RULES.startCoins);
    expect(p.coins).toBe(0);
  });

  it('casa azul dá moedas, vermelha tira, e as últimas rondas valem o dobro', () => {
    const s = party();
    const p = s.players[0]!;
    const blue = s.board.spaces.find((sp) => sp.type === 'blue')!;
    const red = s.board.spaces.find((sp) => sp.type === 'red')!;
    p.spaceId = blue.id;
    expect(resolveLanding(s, p, createRng(1))).toMatchObject({ color: 'blue', effect: { kind: 'coins', amount: 3 } });
    p.spaceId = red.id;
    expect(resolveLanding(s, p, createRng(1))).toMatchObject({ color: 'red', effect: { kind: 'coins', amount: -3 } });
    s.round = 10;
    p.spaceId = blue.id;
    expect(resolveLanding(s, p, createRng(1)).effect).toEqual({ kind: 'coins', amount: 6 });
  });

  it('casa de evento troca o jogador de lugar com outro', () => {
    const s = party();
    const [p, q] = s.players as [typeof s.players[0], typeof s.players[0]];
    const ev = s.board.spaces.find((sp) => sp.type === 'event')!;
    p.spaceId = ev.id;
    s.players.slice(1).forEach((o) => (o.spaceId = 7));
    const res = resolveLanding(s, p, createRng(2));
    expect(res.effect.kind).toBe('swap');
    expect(p.spaceId).toBe(7);
    expect(s.players.some((o) => o.spaceId === ev.id)).toBe(true);
    void q;
  });

  it('comprar estrela custa moedas e muda a estrela de sítio', () => {
    const s = party();
    const p = s.players[0]!;
    const rng = createRng(4);
    expect(buyStar(s, p, rng)).toBe(false);
    p.coins = 25;
    const before = s.starSpaceId;
    expect(buyStar(s, p, rng)).toBe(true);
    expect(p).toMatchObject({ coins: 5, stars: 1 });
    expect(s.starSpaceId).not.toBe(before);
  });

  it('tipo de minijogo pelas cores', () => {
    const s = party(6);
    const rng = createRng(5);
    const set = (colors: ('blue' | 'red')[]) => s.players.forEach((p, i) => (p.color = colors[i]!));

    set(['blue', 'blue', 'blue', 'blue', 'blue', 'blue']);
    expect(decideMinigameTeams(s, rng).mode).toBe('ffa');

    set(['red', 'blue', 'blue', 'blue', 'blue', 'blue']);
    const one = decideMinigameTeams(s, rng);
    expect(one).toMatchObject({ mode: 'oneVsAll', blue: ['p0'] });
    expect(one.red).toHaveLength(5);

    set(['red', 'red', 'blue', 'blue', 'blue', 'blue']);
    const teams = decideMinigameTeams(s, rng);
    expect(teams.mode).toBe('teams');
    expect(teams.blue).toHaveLength(3);
    expect(teams.red).toHaveLength(3);
  });

  it('prémio por lugar (10/3/2/0, empates partilham o lugar)', () => {
    const s = party();
    const ids = s.players.map((p) => p.id);
    const before = s.players.map((p) => p.coins);
    // 1.º sozinho, dois empatados em 2.º, último sem nada.
    const got = awardMinigame(s, [ids[0]!], [[ids[0]!], [ids[1]!, ids[2]!], [ids[3]!]]);
    expect(got.get(ids[0]!)).toBe(10);
    expect(got.get(ids[1]!)).toBe(3);
    expect(got.get(ids[2]!)).toBe(3);
    expect(got.has(ids[3]!)).toBe(false);
    expect(s.players[3]!.coins).toBe(before[3]);
  });

  it('prémio do minijogo, estrelas bónus e classificação', () => {
    const s = party();
    awardMinigame(s, ['p1']);
    expect(s.players[1]!.coins).toBe(RULES.startCoins + RULES.minigamePrize);
    const bonuses = bonusStars(s);
    expect(bonuses.find((b) => b.id === 'minigame')?.winners).toEqual(['p1']);

    // Com sorteio: 3 categorias diferentes, que mudam conforme a semente.
    s.players[0]!.stats.steps = 30;
    s.players[2]!.stats.redSpaces = 4;
    s.players[3]!.stats.itemsUsed = 2;
    s.players[1]!.stats.duelsWon = 1;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const pick = bonusStars(s, createRng(seed));
      expect(pick).toHaveLength(3);
      expect(new Set(pick.map((b) => b.id)).size).toBe(3);
      for (const b of pick) seen.add(b.id);
    }
    expect(seen.size).toBeGreaterThan(3);

    s.players[2]!.stars = 2;
    const r = ranking(s);
    expect(r[0]).toMatchObject({ rank: 1, player: { id: 'p2' } });
    expect(r[1]).toMatchObject({ rank: 2, player: { id: 'p1' } });
    expect(r[2]!.rank).toBe(3);
    expect(r[3]!.rank).toBe(3); // empate
  });

  it('bot prefere o caminho mais curto até à estrela', () => {
    const s = party();
    const junction = s.board.spaces.find((sp) => sp.next.length > 1)!;
    const dist = distancesTo(s.board, s.starSpaceId);
    const best = [...junction.next].sort((a, b) => dist.get(a)! - dist.get(b)!)[0];
    const picks = Array.from({ length: 50 }, (_, i) => botChooseNext(s, junction.next, createRng(i)));
    expect(picks.filter((p) => p === best).length).toBeGreaterThan(30);
  });
});
