/**
 * Painel de tester: validação dos comandos e reencaminhamento no servidor (só em dev).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, TesterState } from '@festa/shared';
import { testerCmdSchema } from '@festa/shared/schemas';
import { registerSocketHandlers, type FestaServer } from '../src/socketServer';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let io: FestaServer | null = null;
let url: string;
const clients: Client[] = [];

async function startServer(tester: boolean) {
  const http = createServer();
  io = new Server(http);
  registerSocketHandlers(io, { hostGraceMs: 1_000, playerLobbyGraceMs: 1_000, maxRooms: 10, inputRatePerSec: 100, tester });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

async function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  await new Promise<void>((r) => c.once('connect', () => r()));
  return c;
}

function next<E extends keyof ServerToClientEvents>(c: Client, event: E, ms = 1_000): Promise<Parameters<ServerToClientEvents[E]>[0] | 'timeout'> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    (c as unknown as { once: (e: string, fn: (v: unknown) => void) => void }).once(event, (v) => {
      clearTimeout(t);
      resolve(v as Parameters<ServerToClientEvents[E]>[0]);
    });
  });
}

/** Dá tempo ao servidor para processar o que já foi emitido. */
const settle = () => new Promise((r) => setTimeout(r, 50));

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await io?.close();
  io = null;
});

const STATE: TesterState = {
  phase: 'lobby',
  scenario: null,
  timeScale: 1,
  players: [],
  catalog: { boards: [], minigames: [], sports: [], botLevels: [], items: [] },
};

describe('canal do tester', () => {
  it('painel sem ecrã /teste recebe hostStatus false', async () => {
    await startServer(true);
    const panel = await client();
    const status = next(panel, 'tester:hostStatus');
    panel.emit('tester:join');
    expect(await status).toBe(false);
  });

  it('comando do painel chega ao host', async () => {
    await startServer(true);
    const host = await client();
    host.emit('tester:host');
    const panel = await client();
    panel.emit('tester:join');
    await settle();
    const got = next(host, 'tester:cmd');
    panel.emit('tester:cmd', { t: 'time', scale: 2 });
    expect(await got).toEqual({ t: 'time', scale: 2 });
  });

  it('comando inválido não chega', async () => {
    await startServer(true);
    const host = await client();
    host.emit('tester:host');
    const panel = await client();
    panel.emit('tester:join');
    await settle();
    const got = next(host, 'tester:cmd');
    panel.emit('tester:cmd', { t: 'time', scale: 3 } as never);
    panel.emit('tester:cmd', { t: 'reload' });
    expect(await got).toEqual({ t: 'reload' });
  });

  it('estado chega aos painéis e fica guardado para os novos', async () => {
    await startServer(true);
    const host = await client();
    host.emit('tester:host');
    await settle();
    host.emit('tester:state', STATE);
    await settle();
    const panel = await client();
    const got = next(panel, 'tester:state');
    panel.emit('tester:join');
    expect(await got).toEqual(STATE);
  });

  it('host novo substitui o antigo', async () => {
    await startServer(true);
    const a = await client();
    a.emit('tester:host');
    await settle();
    const b = await client();
    b.emit('tester:host');
    const panel = await client();
    panel.emit('tester:join');
    await settle();
    const toA = next(a, 'tester:cmd', 200);
    const toB = next(b, 'tester:cmd');
    panel.emit('tester:cmd', { t: 'reload' });
    expect(await toB).toEqual({ t: 'reload' });
    expect(await toA).toBe('timeout');
  });

  it('host sai: painel é avisado', async () => {
    await startServer(true);
    const host = await client();
    host.emit('tester:host');
    const panel = await client();
    panel.emit('tester:join');
    await settle();
    const status = next(panel, 'tester:hostStatus');
    host.disconnect();
    expect(await status).toBe(false);
  });

  it('sem a opção tester o canal não existe', async () => {
    await startServer(false);
    const host = await client();
    host.emit('tester:host');
    const panel = await client();
    panel.emit('tester:join');
    await settle();
    const got = next(host, 'tester:cmd', 200);
    panel.emit('tester:cmd', { t: 'reload' });
    expect(await got).toBe('timeout');
  });
});

describe('testerCmdSchema', () => {
  it('aceita velocidades conhecidas e recusa outras', () => {
    expect(testerCmdSchema.safeParse({ t: 'time', scale: 4 }).success).toBe(true);
    expect(testerCmdSchema.safeParse({ t: 'time', scale: 3 }).success).toBe(false);
  });

  it('recusa dados fora de 1–6', () => {
    expect(testerCmdSchema.safeParse({ t: 'nextDice', values: [7] }).success).toBe(false);
  });

  it('limita os jogadores do cenário a 10', () => {
    const party = { kind: 'party', board: 'ilha', rounds: 2, players: 11, botLevel: 'normal', keyboardSeat: null };
    expect(testerCmdSchema.safeParse({ t: 'scenario', scenario: party }).success).toBe(false);
  });

  it('aceita um cenário de minijogo com teclado', () => {
    const mg = { kind: 'minigame', id: 'Tag', mode: 'teams', players: 4, botLevel: 'normal', keyboardSeat: 0 };
    expect(testerCmdSchema.safeParse({ t: 'scenario', scenario: mg }).success).toBe(true);
  });
});

// O PartyHooks não depende do browser: testa-se aqui (a app web não tem vitest).
import { PartyHooks } from '../../web/src/host/tester/PartyHooks';

describe('PartyHooks', () => {
  it('um fim de minijogo pedido tarde não passa para o minijogo seguinte', () => {
    const h = new PartyHooks();
    h.phase = 'minigame';
    h.apply({ t: 'endMinigame' });
    h.phase = 'board'; // o minijogo acabou sozinho antes de o pedido ser usado
    h.phase = 'minigame';
    expect(h.ending).toBe(false);
  });

  it('saltar o treino pedido tarde não passa para o treino seguinte', () => {
    const h = new PartyHooks();
    h.phase = 'practice';
    h.apply({ t: 'skipPractice' });
    h.phase = 'minigame';
    h.phase = 'practice';
    expect(h.takeSkipPractice()).toBe(false);
  });

  it('dentro da mesma fase o pedido mantém-se', () => {
    const h = new PartyHooks();
    h.phase = 'minigame';
    h.apply({ t: 'endMinigame', winners: ['a'] });
    expect(h.ending).toBe(true);
    expect(h.takeEnd()).toEqual(['a']);
  });
});
