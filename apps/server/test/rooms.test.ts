import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PLAYERS } from '@festa/shared';
import { RoomManager, sanitizeName, type RoomHooks } from '../src/rooms';

function setup() {
  const hooks = {
    onPlayersChanged: vi.fn(),
    onHostStatus: vi.fn(),
    onRoomClosed: vi.fn(),
  } satisfies RoomHooks;
  const manager = new RoomManager(hooks, {
    hostGraceMs: 1_000,
    playerLobbyGraceMs: 500,
    maxRooms: 3,
  });
  return { manager, hooks };
}

function createRoom(manager: RoomManager, socketId = 'host') {
  const res = manager.createRoom(socketId);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

describe('RoomManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cria salas com códigos únicos de 4 letras', () => {
    const { manager } = setup();
    const a = createRoom(manager, 'h1');
    const b = createRoom(manager, 'h2');
    expect(a.code).toMatch(/^[A-Z]{4}$/);
    expect(a.code).not.toBe(b.code);
  });

  it('limita o número de salas', () => {
    const { manager } = setup();
    createRoom(manager, 'h1');
    createRoom(manager, 'h2');
    createRoom(manager, 'h3');
    expect(manager.createRoom('h4')).toEqual({ ok: false, error: 'SERVER_FULL' });
  });

  it('o mesmo host a criar outra sala fecha a anterior (não enche o servidor)', () => {
    const { manager, hooks } = setup();
    const first = createRoom(manager, 'h1');
    for (let i = 0; i < 10; i++) createRoom(manager, 'h1');
    expect(manager.roomCount).toBe(1);
    expect(manager.getRoom(first.code)).toBeUndefined();
    expect(hooks.onRoomClosed).toHaveBeenCalledWith(first, 'HOST_LEFT');
  });

  it('jogadores entram com cores diferentes e o primeiro é VIP', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    manager.joinPlayer(room.code, 'Rui', undefined, 'p2');
    const [ana, rui] = room.snapshot();
    expect(ana).toMatchObject({ name: 'Ana', isVip: true, connected: true });
    expect(rui).toMatchObject({ name: 'Rui', isVip: false });
    expect(ana!.color).not.toBe(rui!.color);
  });

  it('recusa um nome já usado na sala', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    expect(manager.joinPlayer(room.code, 'ana', undefined, 'p2')).toEqual({ ok: false, error: 'NAME_TAKEN' });
  });

  it('rejeita sala cheia, trancada, inexistente ou nome inválido', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    expect(manager.joinPlayer('ZZZZ', 'Ana', undefined, 'x').ok).toBe(false);
    expect(manager.joinPlayer(room.code, '   ', undefined, 'x')).toEqual({ ok: false, error: 'INVALID_NAME' });
    for (let i = 0; i < MAX_PLAYERS; i++) manager.joinPlayer(room.code, `J${i}`, undefined, `p${i}`);
    expect(manager.joinPlayer(room.code, 'Extra', undefined, 'x')).toEqual({ ok: false, error: 'ROOM_FULL' });

    const other = createRoom(manager, 'h2');
    manager.setLocked('h2', true);
    expect(manager.joinPlayer(other.code, 'Ana', undefined, 'y')).toEqual({ ok: false, error: 'ROOM_LOCKED' });
  });

  it('um jogador desligado volta ao mesmo lugar com o sessionToken, mesmo com a sala trancada', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const joined = manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    if (!joined.ok) throw new Error();
    manager.setLocked('host', true);
    manager.disconnect('p1');
    expect(room.snapshot()[0]!.connected).toBe(false);

    const back = manager.joinPlayer(room.code, 'Outro nome', joined.player.sessionToken, 'p1b');
    expect(back.ok && back.player.id).toBe(joined.player.id);
    expect(room.snapshot()[0]).toMatchObject({ name: 'Ana', connected: true });
  });

  it('no lobby, um jogador desligado perde o lugar após o período de graça', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    manager.disconnect('p1');
    vi.advanceTimersByTime(499);
    expect(room.players.size).toBe(1);
    vi.advanceTimersByTime(1);
    expect(room.players.size).toBe(0);
  });

  it('durante o jogo (sala trancada) o lugar é mantido', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    manager.setLocked('host', true);
    manager.disconnect('p1');
    vi.advanceTimersByTime(10_000);
    expect(room.players.size).toBe(1);
  });

  it('o VIP passa para o próximo jogador ligado', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    manager.joinPlayer(room.code, 'Rui', undefined, 'p2');
    manager.disconnect('p1');
    expect(room.snapshot().find((p) => p.isVip)?.name).toBe('Rui');
  });

  it('o host pode recarregar a página e recuperar a sala', () => {
    const { manager, hooks } = setup();
    const room = createRoom(manager);
    manager.disconnect('host');
    expect(hooks.onHostStatus).toHaveBeenLastCalledWith(room, false);
    vi.advanceTimersByTime(900);

    expect(manager.resumeHost(room.code, 'token-errado-123456', 'host2').ok).toBe(false);
    const res = manager.resumeHost(room.code, room.hostToken, 'host2');
    expect(res.ok).toBe(true);
    expect(hooks.onHostStatus).toHaveBeenLastCalledWith(room, true);
    vi.advanceTimersByTime(5_000);
    expect(manager.getRoom(room.code)).toBeDefined();
  });

  it('a sala fecha se o host não voltar a tempo', () => {
    const { manager, hooks } = setup();
    const room = createRoom(manager);
    vi.advanceTimersByTime(0);
    manager.disconnect('host');
    vi.advanceTimersByTime(1_000);
    expect(hooks.onRoomClosed).toHaveBeenCalledWith(room, 'HOST_LEFT');
    expect(manager.getRoom(room.code)).toBeUndefined();
  });

  it('setVip: só o VIP passa a coroa, e só a quem está ligado', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const a = manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    const b = manager.joinPlayer(room.code, 'Rui', undefined, 'p2');
    if (!a.ok || !b.ok) throw new Error('join');
    const vipName = () => room.snapshot().find((p) => p.isVip)?.name;
    expect(manager.setVip('p2', a.player.id)).toBeNull(); // o Rui não é VIP
    expect(manager.setVip('p1', b.player.id)).toBe(room);
    expect(vipName()).toBe('Rui');
    manager.disconnect('p2');
    expect(vipName()).toBe('Ana'); // o escolhido saiu: volta ao ligado há mais tempo
    expect(manager.setVip('p1', b.player.id)).toBeNull(); // desligado
  });

  it('rename: limpa o nome e recusa um já usado na sala', () => {
    const { manager, hooks } = setup();
    const room = createRoom(manager);
    const a = manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    manager.joinPlayer(room.code, 'Rui', undefined, 'p2');
    if (!a.ok) throw new Error('join');
    hooks.onPlayersChanged.mockClear();
    expect(manager.rename('p1', '  rui ')).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(a.player.name).toBe('Ana');
    expect(manager.rename('p1', '  Rita ')).toBe(room);
    expect(a.player.name).toBe('Rita');
    expect(hooks.onPlayersChanged).toHaveBeenCalledOnce();
    expect(manager.rename('p1', 'Rita')).toBeNull(); // igual ao atual: nada muda
    expect(manager.rename('p1', '   ')).toEqual({ ok: false, error: 'INVALID_NAME' });
    expect(manager.rename('host', 'X')).toBeNull(); // só jogadores
  });

  it('kick remove o jogador e devolve o socket', () => {
    const { manager } = setup();
    const room = createRoom(manager);
    const j = manager.joinPlayer(room.code, 'Ana', undefined, 'p1');
    if (!j.ok) throw new Error();
    expect(manager.kick('p1', j.player.id)).toBeNull(); // só o host pode
    expect(manager.kick('host', j.player.id)?.socketId).toBe('p1');
    expect(room.players.size).toBe(0);
    expect(manager.lookup('p1')).toBeNull();
  });
});

describe('sanitizeName', () => {
  it('limpa espaços, caracteres de controlo e limita o tamanho', () => {
    expect(sanitizeName('  Ana   Maria ')).toBe('Ana Maria');
    expect(sanitizeName('a\u0000b')).toBe('ab');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
    expect(sanitizeName('🎉'.repeat(20))).toBe('🎉'.repeat(16));
    expect(sanitizeName('   ')).toBeNull();
  });
});
