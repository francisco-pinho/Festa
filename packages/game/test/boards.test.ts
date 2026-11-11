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
  ghostCanSell,
  ghostSellStar,
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
  botWantsLever,
  cannonAt,
  eventKindAt,
  leverAt,
  passBank,
  payToll,
  pullLever,
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
    const keys = Object.keys(board.initialFlags);
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const flags = Object.fromEntries(keys.map((k, i) => [k, !!(mask & (1 << i))]));
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

describe('mecânicas dos mapas novos', () => {
  const byId = (id: string) => BOARDS.find((b) => b.id === id)!.create();

  it('vulcão: erupção a cada 3 rondas fecha a cratera e queima moedas', () => {
    const s = party(byId('vulcao'));
    const crater = s.board.spaces.find((x) => x.zone === 'crater')!;
    s.players[0]!.spaceId = crater.id;
    const rng = createRng(1);
    s.round = 3;
    const ev = startRound(s, rng);
    expect(s.flags.erupting).toBe(true);
    expect(ev.find((e) => e.kind === 'eruption')).toMatchObject({ active: true, burned: [{ id: 'p0', amount: RULES.eruptionCoins }] });
    const gate = s.board.gates[0]!;
    expect(openNext(s.board, s.flags, gate.from)).not.toContain(gate.to);
    s.round = 4;
    startRound(s, rng);
    expect(s.flags.erupting).toBe(false);
  });

  it('castelo: as portas alternam, os elevadores ligam andares e o fantasma vende estrelas', () => {
    const s = party(byId('castelo'));
    const [g0, g1] = s.board.gates as [Board['gates'][number], Board['gates'][number]];
    expect(openNext(s.board, s.flags, g0.from)).toContain(g0.to);
    expect(openNext(s.board, s.flags, g1.from)).not.toContain(g1.to);
    s.round = 2;
    startRound(s, createRng(2));
    expect(openNext(s.board, s.flags, g0.from)).not.toContain(g0.to);
    expect(openNext(s.board, s.flags, g1.from)).toContain(g1.to);
    expect(new Set(s.board.spaces.map((x) => x.y ?? 0)).size).toBeGreaterThanOrEqual(3);
    const p = s.players[0]!;
    expect(ghostCanSell(p)).toBe(false);
    p.coins = 35;
    expect(ghostSellStar(p)).toBe(true);
    expect([p.coins, p.stars]).toEqual([5, 1]);
  });

  it('parque: a roda gigante gira duas casas por ronda', () => {
    const s = party(byId('parque'));
    const wheel = s.board.wheel!;
    expect(wheel).toHaveLength(8);
    s.players[0]!.spaceId = wheel[0]!;
    s.players[1]!.spaceId = wheel[7]!;
    s.round = 2;
    const ev = startRound(s, createRng(3));
    expect(s.players[0]!.spaceId).toBe(wheel[2]);
    expect(s.players[1]!.spaceId).toBe(wheel[1]);
    expect(ev.find((e) => e.kind === 'wheel')).toBeDefined();
  });

  it('casa de evento da mina: a vagoneta leva-te em frente', () => {
    const s = party(byId('vulcao'));
    const ev = s.board.spaces.find((x) => x.type === 'event')!;
    const p = s.players[0]!;
    p.spaceId = ev.id;
    const res = resolveLanding(s, p, createRng(4));
    expect(res.effect.kind).toBe('minecart');
    expect(p.spaceId).not.toBe(ev.id);
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

describe('interações dos tabuleiros (alavancas, portagens, canhões, banco)', () => {
  it.each(BOARDS.map((b) => [b.id, b.create()] as const))('%s: objetos interativos bem ligados', (_id, board) => {
    expect(board.levers.length).toBeGreaterThanOrEqual(1);
    expect(board.cannons.length + board.tolls.length).toBeGreaterThanOrEqual(1);
    for (const l of board.levers) {
      expect(board.spaces[l.spaceId]!.type).toBe('lever');
      expect(board.initialFlags).toHaveProperty(l.flag);
      expect(board.gates.some((g) => g.lever && g.flag === l.flag)).toBe(true);
    }
    for (const c of board.cannons) {
      expect(board.spaces[c.spaceId]!.type).toBe('cannon');
      for (const t of c.targets) expect(board.spaces[t]).toBeDefined();
    }
    for (const t of board.tolls) expect(board.spaces[t.from]!.next).toContain(t.to);
    if (board.spaces.some((s) => s.type === 'bank')) expect(board.bankName).toBeTruthy();
  });

  it('alavanca troca o caminho aberto', () => {
    const state = party(BOARDS[0]!.create());
    const lever = state.board.levers[0]!;
    const gate = state.board.gates.find((g) => g.flag === lever.flag)!;
    expect(openNext(state.board, state.flags, gate.from)).not.toContain(gate.to);
    expect(pullLever(state, lever)).toBe(true);
    expect(openNext(state.board, state.flags, gate.from)).toContain(gate.to);
    expect(leverAt(state.board, lever.spaceId)).toBe(lever);
  });

  it('bot puxa a alavanca quando isso o aproxima da estrela', () => {
    const state = party(BOARDS[0]!.create());
    const lever = state.board.levers[0]!;
    const gate = state.board.gates.find((g) => g.flag === lever.flag)!;
    // Estrela no fim do trilho da selva: com o portão aberto fica muito mais perto.
    let end = gate.to;
    while (state.board.spaces[end]!.zone === 'jungle') end = state.board.spaces[end]!.next[0]!;
    state.starSpaceId = end;
    const p = state.players[0]!;
    p.spaceId = lever.spaceId;
    const rng = createRng(3);
    const pulls = Array.from({ length: 20 }, () => botWantsLever(state, p, lever, rng, 1)).filter(Boolean).length;
    expect(pulls).toBe(20);
  });

  it('banco: quem passa deposita, quem para leva tudo', () => {
    const state = party(BOARDS[0]!.create());
    const [a, b] = state.players;
    a!.coins = 3;
    expect(passBank(state, a!)).toBe(3);
    expect(passBank(state, b!)).toBe(5);
    expect(state.bank).toBe(8);
    const bankId = state.board.spaces.find((s) => s.type === 'bank')!.id;
    b!.spaceId = bankId;
    const before = b!.coins;
    const landing = resolveLanding(state, b!, createRng(1));
    expect(landing.effect).toEqual({ kind: 'bank', amount: 8 });
    expect(b!.coins).toBe(before + 8);
    expect(state.bank).toBe(0);
  });

  it('portagem: a primeira vai para o banco, depois para quem pagou antes; a própria é grátis', () => {
    const state = party(BOARDS[1]!.create());
    const toll = state.board.tolls[0]!;
    const [a, b] = state.players;
    expect(payToll(state, a!, toll)).toEqual({ paid: toll.cost, to: null });
    expect(state.bank).toBe(toll.cost);
    const aCoins = a!.coins;
    expect(payToll(state, b!, toll)).toEqual({ paid: toll.cost, to: a!.id });
    expect(a!.coins).toBe(aCoins + toll.cost);
    expect(payToll(state, b!, toll)).toEqual({ paid: 0, to: b!.id });
  });

  it('canhão dispara para uma das casas alvo', () => {
    for (const make of BOARDS) {
      const state = party(make.create());
      const cannon = state.board.cannons[0];
      if (!cannon) continue;
      const p = state.players[0]!;
      p.spaceId = cannon.spaceId;
      const landing = resolveLanding(state, p, createRng(5));
      expect(landing.effect.kind).toBe('cannon');
      expect(cannon.targets).toContain(p.spaceId);
      expect(cannonAt(state.board, cannon.spaceId)).toBe(cannon);
    }
  });

  it('eventos por zona: baú na praia, derrocada na cratera', () => {
    const island = party(BOARDS[0]!.create());
    const beach = island.board.spaces.find((s) => s.zone === 'beach' && s.type === 'event');
    expect(beach).toBeDefined();
    expect(eventKindAt(island.board, beach!.id)).toBe('chest');
    island.players[0]!.spaceId = beach!.id;
    expect(resolveLanding(island, island.players[0]!, createRng(2)).effect.kind).toBe('chest');

    const volcano = party(BOARDS[2]!.create());
    const crater = volcano.board.spaces.find((s) => s.zone === 'crater')!;
    crater.type = 'event';
    const p = volcano.players[0]!;
    p.spaceId = crater.id;
    const e = resolveLanding(volcano, p, createRng(2)).effect;
    expect(e.kind).toBe('rockfall');
    if (e.kind === 'rockfall') expect(e.to).not.toBe(e.from);
  });
});
