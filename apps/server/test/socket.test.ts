/**
 * Teste de integração: servidor Socket.IO real + clientes reais (host e telemóveis).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@festa/shared';
import { registerSocketHandlers, type FestaServer } from '../src/socketServer';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let io: FestaServer;
let url: string;
const clients: Client[] = [];

function client(): Client {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  return c;
}

function next<E extends keyof ServerToClientEvents>(
  c: Client,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    (c as unknown as { once: (e: string, fn: (v: unknown) => void) => void }).once(event, (v) =>
      resolve(v as Parameters<ServerToClientEvents[E]>[0]),
    );
  });
}

beforeEach(async () => {
  const http = createServer();
  io = new Server(http);
  registerSocketHandlers(io, {
    hostGraceMs: 1_000,
    playerLobbyGraceMs: 1_000,
    maxRooms: 10,
    inputRatePerSec: 100,
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await io.close();
});

async function hostWithRoom() {
  const host = client();
  const res = await host.emitWithAck('host:create');
  if (!res.ok) throw new Error(res.error);
  return { host, roomCode: res.roomCode, hostToken: res.hostToken };
}

describe('socket server', () => {
  it('telemóvel entra, envia input e o host recebe-o', async () => {
    const { host, roomCode } = await hostWithRoom();
    const phone = client();

    const playersPromise = next(host, 'room:players');
    const join = await phone.emitWithAck('player:join', { roomCode: roomCode.toLowerCase(), name: 'Ana' });
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect((await playersPromise).map((p) => p.name)).toEqual(['Ana']);

    const inputPromise = next(host, 'host:input');
    phone.emit('player:input', { t: 'button', button: 'a', pressed: true });
    expect(await inputPromise).toEqual({
      playerId: join.player.id,
      input: { t: 'button', button: 'a', pressed: true },
    });
  });

  it('input inválido é ignorado', async () => {
    const { host, roomCode } = await hostWithRoom();
    const phone = client();
    await phone.emitWithAck('player:join', { roomCode, name: 'Ana' });

    const received: unknown[] = [];
    host.on('host:input', (e) => received.push(e.input));
    phone.emit('player:input', { t: 'stick', x: 50, y: 0 } as never);
    phone.emit('player:input', { t: 'stick', x: 0.5, y: -1 });
    await next(host, 'host:input');
    expect(received).toEqual([{ t: 'stick', x: 0.5, y: -1 }]);
  });

  it('o host envia layouts e o telemóvel recebe-o de novo ao reconectar', async () => {
    const { host, roomCode } = await hostWithRoom();
    const phone = client();
    const join = await phone.emitWithAck('player:join', { roomCode, name: 'Ana' });
    if (!join.ok) throw new Error();

    const layout = { kind: 'wait' as const, message: 'Espera' };
    const msg = next(phone, 'controller:message');
    host.emit('host:send', { to: 'all', message: { t: 'layout', layout } });
    expect(await msg).toEqual({ t: 'layout', layout });

    phone.disconnect();
    const phone2 = client();
    const msg2 = next(phone2, 'controller:message');
    const rejoin = await phone2.emitWithAck('player:join', {
      roomCode,
      name: 'Ignorado',
      sessionToken: join.sessionToken,
    });
    expect(rejoin.ok && rejoin.player.id).toBe(join.player.id);
    expect(await msg2).toEqual({ t: 'layout', layout });
  });

  it('o host recarrega a página e recupera a sala; os telemóveis são avisados', async () => {
    const { host, roomCode, hostToken } = await hostWithRoom();
    const phone = client();
    await phone.emitWithAck('player:join', { roomCode, name: 'Ana' });

    const down = next(phone, 'room:hostStatus');
    host.disconnect();
    expect(await down).toBe(false);

    const up = next(phone, 'room:hostStatus');
    const host2 = client();
    const res = await host2.emitWithAck('host:resume', { roomCode, hostToken });
    expect(res.ok).toBe(true);
    expect(await up).toBe(true);
  });

  it('telemóveis são avisados quando a sala fecha', async () => {
    const { host, roomCode } = await hostWithRoom();
    const phone = client();
    await phone.emitWithAck('player:join', { roomCode, name: 'Ana' });
    const closed = next(phone, 'room:closed');
    host.disconnect();
    expect(await closed).toBe('HOST_LEFT');
  });

  it('sala trancada não aceita novos jogadores', async () => {
    const { host, roomCode } = await hostWithRoom();
    host.emit('host:lock', true);
    await host.emitWithAck('host:resume', { roomCode: 'ZZZZ', hostToken: 'x'.repeat(20) }); // sincroniza
    const res = await client().emitWithAck('player:join', { roomCode, name: 'Ana' });
    expect(res).toEqual({ ok: false, error: 'ROOM_LOCKED' });
  });
});
