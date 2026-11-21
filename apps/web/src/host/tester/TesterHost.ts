/**
 * Modo tester (só em `npm run dev`, página /teste): QR para o painel no telemóvel, cenário
 * guardado que volta a arrancar depois de cada recarregamento e comandos do painel.
 */
import QRCode from 'qrcode';
import type { TesterCatalog, TesterCmd, TesterScenario, TesterState } from '@festa/shared';
import { BOARDS, ITEMS, createBoard } from '@festa/game';
import type { HostConnection } from '../HostConnection';
import type { Director } from '../game/Director';
import { BOT_LEVELS, settings, type BotLevel } from '../game/Settings';
import { getJoinBaseUrl } from '../joinUrl';
import { MINIGAMES } from '../minigames';
import { SPORTS } from '../sports';
import type { Engine } from '../three/Engine';
import { loading } from '../ui/loading';
import { PartyHooks } from './PartyHooks';
import { clearScenario, loadScenario, saveScenario, type StoredTester } from './scenarioStore';
import './tester.css';

interface Deps {
  engine: Engine;
  director: Director;
  connection: HostConnection;
}

const catalog = (): TesterCatalog => ({
  boards: BOARDS.map((b) => ({ id: b.id, name: createBoard(b.id).name })),
  minigames: MINIGAMES.map((m) => ({ id: m.id, name: m.name, modes: [...m.modes], duel: !!m.duel })),
  sports: SPORTS.map((s) => ({ id: s.id, name: s.name })),
  botLevels: BOT_LEVELS.map((l) => ({ id: l.id, label: l.label })),
  items: Object.values(ITEMS).map((i) => ({ id: i.id, name: `${i.emoji} ${i.name}` })),
});

/** O cenário ainda existe no código? (um minijogo pode ter mudado de nome) */
function isKnown(s: TesterScenario): boolean {
  if ('botLevel' in s && !BOT_LEVELS.some((l) => l.id === s.botLevel)) return false;
  switch (s.kind) {
    case 'lobby':
    case 'menu':
      return true;
    case 'party':
    case 'finale':
      return BOARDS.some((b) => b.id === s.board);
    case 'minigame':
      return MINIGAMES.some((m) => m.id === s.id && (m.duel || m.modes.includes(s.mode)));
    case 'sport':
      return SPORTS.some((x) => x.id === s.id);
  }
}

export class TesterHost {
  private readonly hooks = new PartyHooks();
  private stored: StoredTester | null = loadScenario();
  private readonly catalog = catalog();
  private lastSent = '';

  constructor(private readonly d: Deps) {}

  async start(): Promise<void> {
    const { connection, director, engine } = this.d;
    if (this.stored && !isKnown(this.stored.scenario)) {
      clearScenario();
      this.stored = null;
    }
    connection.announceTesterHost();
    connection.onTesterCmd((cmd) => this.onCmd(cmd));
    void this.drawQr();
    window.setInterval(() => this.sendState(), 500);

    const s: TesterScenario = this.stored?.scenario ?? { kind: 'lobby' };
    engine.timeScale = this.stored?.timeScale ?? 1;
    director.testerHooks = this.hooks;
    if (s.kind === 'lobby') {
      director.extraBots = s.bots ?? 0;
      if (s.botLevel) settings.overrideBotLevel(s.botLevel as BotLevel);
      return director.run();
    }

    // Fora do lobby: sem telemóveis de jogadores, só bots (e o teclado, se pedido).
    const lock = () => connection.setLocked(true);
    lock();
    connection.events.on('room', lock);
    settings.overrideBotLevel(s.botLevel as BotLevel);
    director.useTesterSeats(s.kind === 'finale' ? null : s.keyboardSeat);
    loading.hide();
    switch (s.kind) {
      case 'menu':
        for (;;) await director.testMenu(s.players);
      case 'party':
        return director.testParty(s.board, s.players, s.rounds);
      case 'minigame':
        return director.testMinigame(s.id, s.mode, s.players);
      case 'sport':
        return director.testSport(s.id, s.players);
      case 'finale':
        return director.testFinale(s.board, s.players);
    }
  }

  private onCmd(cmd: TesterCmd): void {
    switch (cmd.t) {
      case 'scenario':
        saveScenario({ scenario: cmd.scenario, timeScale: this.d.engine.timeScale });
        location.reload();
        return;
      case 'reload':
        location.reload();
        return;
      case 'time':
        this.d.engine.timeScale = cmd.scale;
        if (this.stored) saveScenario({ ...this.stored, timeScale: cmd.scale });
        return;
      default:
        this.hooks.apply(cmd);
    }
  }

  private phase(): TesterState['phase'] {
    if (this.hooks.phase !== 'other') return this.hooks.phase;
    const kind = this.stored?.scenario.kind ?? 'lobby';
    if (kind === 'lobby' || kind === 'menu') return kind;
    return kind === 'sport' ? 'sport' : 'other';
  }

  private sendState(): void {
    const phase = this.phase();
    // De volta ao lobby, a festa anterior já não interessa ao painel.
    const party = phase === 'lobby' ? undefined : this.d.director.flow?.partyState;
    const state: TesterState = {
      phase,
      scenario: this.stored?.scenario ?? null,
      timeScale: this.d.engine.timeScale,
      round: party?.round,
      totalRounds: party?.totalRounds,
      starSpaceId: party?.starSpaceId,
      spaces: party?.board.spaces.map((sp) => ({ id: sp.id, type: sp.type })),
      players: party
        ? party.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, coins: p.coins, stars: p.stars, items: [...p.items], spaceId: p.spaceId }))
        : this.d.director.seatList.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
      catalog: this.catalog,
    };
    const json = JSON.stringify(state);
    if (json === this.lastSent) return;
    this.lastSent = json;
    this.d.connection.sendTesterState(state);
  }

  private async drawQr(): Promise<void> {
    const url = `${await getJoinBaseUrl()}/tester`;
    const box = document.createElement('a');
    box.className = 'tester-qr';
    box.href = url;
    box.target = '_blank';
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, url, { width: 112, margin: 1 });
    const label = document.createElement('span');
    label.textContent = 'Painel de tester';
    box.append(canvas, label);
    document.body.appendChild(box);
  }
}
