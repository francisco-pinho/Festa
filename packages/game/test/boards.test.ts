import { describe, expect, it } from 'vitest';
import {
  BOARDS,
  CHARACTERS,
  ITEMS,
  MAX_ITEMS,
  RULES,
  addItem,
  awardVs,
  botChooseBuy,
  botChooseItem,
  canUseShop,
  collectVs,
  createParty,
  createRng,
  distancesTo,
  lastPlaceIds,
  nearestShop,
  openNext,
  priceFor,
  resolveDuel,
  resolveLanding,
  startRound,
  stealStar,
  stepsBack,
  tunnelBetween,
  villainRoll,
  type Board,
  type PartyState,
} from '../src';

function party(board: Board, n = 4, seed = 1): PartyState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, characterId: CHARACTERS[i]!.id, isBot: false }));
  return createParty(board, players, 10, createRng(seed));
}

describe.each(BOARDS.map((b) => [b.id, b.create()] as const))('mapa %s', (_id, board) => {
  it('é grande, todas as casas existem e são alcançáveis', () => {
    expect(board.spaces.length).toBeGreaterThanOrEqual(60);
    for (const s of board.spaces) for (const n of s.next) expect(board.spaces[n]).toBeDefined();
    const seen = new Set([board.startId]);
    const queue = [board.startId];
    while (queue.length) for (const n of board.spaces[queue.shift()!]!.next) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(board.spaces.length);
  });

  it('casas não se sobrepõem', () => {
    for (const a of board.spaces)
      for (const b of board.spaces) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id}/${b.id}`).toBeGreaterThan(2.4);
  });

  it('tem lojas, casas especiais e candidatas a estrela', () => {
    expect(board.shops.length).toBeGreaterThanOrEqual(2);
    for (const shop of board.shops) expect(board.spaces[shop.spaceId]!.type).toBe('shop');
    for (const t of ['item', 'vs', 'villain'] as const) expect(board.spaces.some((s) => s.type === t)).toBe(true);
    expect(board.spaces.filter((s) => s.starCandidate).length).toBeGreaterThanOrEqual(6);
  });

  it('túneis e portões ligam casas que existem', () => {
    for (const t of board.tunnels) expect(board.spaces[t.from]!.next).toContain(t.to);
    for (const g of board.gates) expect(board.spaces[g.from]!.next).toContain(g.to);
  });

  it('com qualquer estado dos interruptores, a estrela é alcançável de todo o lado', () => {
    for (const value of [true, false]) {
      const flags = Object.fromEntries(Object.keys(board.initialFlags).map((k) => [k, value]));
      for (const target of board.spaces.filter((s) => s.starCandidate)) {
        const dist = distancesTo(board, target.id, flags);
        expect(dist.size).toBe(board.spaces.length);
      }
    }
  });
});

describe('mecânicas dos mapas', () => {
  it('ilha: a maré muda a cada 3 rondas e troca ponte por gruta', () => {
    const s = party(BOARDS[0]!.create());
    const bridgeGate = s.board.gates.find((g) => g.name === 'Ponte')!;
    const caveGate = s.board.gates.find((g) => g.name === 'Gruta')!;
    expect(openNext(s.board, s.flags, bridgeGate.from)).toContain(bridgeGate.to);
    expect(openNext(s.board, s.flags, caveGate.from)).not.toContain(caveGate.to);
    const rng = createRng(1);
    for (s.round = 2; s.round <= 4; s.round++) startRound(s, rng);
    expect(s.flags.highTide).toBe(true);
    expect(openNext(s.board, s.flags, bridgeGate.from)).not.toContain(bridgeGate.to);
    expect(openNext(s.board, s.flags, caveGate.from)).toContain(caveGate.to);
  });

  it('cidade: o semáforo muda todas as rondas e o metro custa moedas', () => {
    const s = party(BOARDS[1]!.create());
    const before = s.flags.greenNS;
    s.round = 2;
    startRound(s, createRng(2));
    expect(s.flags.greenNS).toBe(!before);
    const metro = s.board.tunnels[0]!;
    expect(tunnelBetween(s.board, metro.from, metro.to)?.cost).toBe(3);
  });
});

describe('itens e lojas', () => {
  it('inventário com limite', () => {
    const p = party(BOARDS[0]!.create()).players[0]!;
    for (let i = 0; i < MAX_ITEMS; i++) expect(addItem(p, 'turbo')).toBe(true);
    expect(addItem(p, 'turbo')).toBe(false);
  });

  it('preços: barata mais barata, saldos a metade, loja do último só para o último', () => {
    expect(priceFor('dadoExtra', 'barata', false)).toBeLessThan(priceFor('dadoExtra', 'geral', false));
    expect(priceFor('luva', 'geral', true)).toBe(Math.round(ITEMS.luva.price / 2));
    expect(canUseShop('ultimo', false)).toBe(false);
    expect(canUseShop('ultimo', true)).toBe(true);
  });

  it('ladrão de estrelas passa uma estrela', () => {
    const s = party(BOARDS[0]!.create());
    const [a, b] = s.players as [typeof s.players[0], typeof s.players[0]];
    expect(stealStar(b, a)).toBe(false);
    b.stars = 2;
    expect(stealStar(b, a)).toBe(true);
    expect([a.stars, b.stars]).toEqual([1, 1]);
  });

  it('último lugar e loja mais próxima', () => {
    const s = party(BOARDS[1]!.create());
    s.players[0]!.stars = 1;
    s.players[1]!.coins = 0;
    expect(lastPlaceIds(s)).toEqual(['p1']);
    expect(nearestShop(s, s.board.startId)).not.toBeNull();
  });

  it('bots: compram e usam itens com bom senso', () => {
    const s = party(BOARDS[0]!.create());
    const p = s.players[0]!;
    p.coins = 50;
    s.players[1]!.stars = 2;
    const buy = botChooseBuy(s, p, [{ item: 'ladraoEstrela', price: 40 }, { item: 'turbo', price: 3 }], createRng(5));
    expect(buy).toBe('ladraoEstrela');
    p.items = ['ladraoEstrela'];
    expect(botChooseItem(s, p, createRng(1), 1)).toEqual({ item: 'ladraoEstrela', target: 'p1' });
  });
});

describe('duelo, VS, armadilha e trapaceiro', () => {
  it('quem perde o duelo dá 5 moedas e recua 3 casas', () => {
    const s = party(BOARDS[0]!.create());
    const [w, l] = s.players as [typeof s.players[0], typeof s.players[0]];
    w.spaceId = l.spaceId = 10;
    const r = resolveDuel(s, w, l);
    expect(r.coins).toBe(RULES.duelCoins);
    expect(l.spaceId).toBe(stepsBack(s.board, 10, 3));
    expect(l.spaceId).toBe(7);
  });

  it('VS: todos pagam e os vencedores dividem o pote', () => {
    const s = party(BOARDS[0]!.create());
    const { pot } = collectVs(s);
    expect(pot).toBe(RULES.vsStake * 4);
    const got = awardVs(s, ['p0', 'p1'], pot);
    expect(got.get('p0')).toBe(10);
    expect(s.players[0]!.coins).toBe(RULES.startCoins - RULES.vsStake + 10);
  });

  it('armadilha: quem cai paga ao dono', () => {
    const s = party(BOARDS[0]!.create());
    const blue = s.board.spaces.find((x) => x.type === 'blue' && x.id > 5)!;
    s.traps[blue.id] = 'p1';
    const p = s.players[0]!;
    p.spaceId = blue.id;
    const res = resolveLanding(s, p, createRng(1));
    expect(res.trap).toEqual({ owner: 'p1', amount: RULES.trapCoins });
    expect(s.traps[blue.id]).toBeUndefined();
  });

  it('trapaceiro aplica sempre um efeito válido', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = party(BOARDS[0]!.create(), 4, seed);
      const ev = villainRoll(s, s.players[0]!, createRng(seed));
      expect(['loseCoins', 'payEveryone', 'shuffle', 'equalize', 'loseStar']).toContain(ev.kind);
      for (const p of s.players) expect(p.coins).toBeGreaterThanOrEqual(0);
    }
  });
});
