/**
 * Modo Festa, do princípio ao fim: mapa, ordem de jogo, rondas (itens, dados,
 * caminho com portões/túneis/lojas/estrela, duelos e casas), minijogo de cada
 * ronda e final com cerimónia das estrelas bónus.
 *
 * As regras vivem em @festa/game; aqui só se encena e se pergunta aos telemóveis.
 */
import { sound } from '../audio/Sound';
import { narrator } from '../audio/Narrator';
import { MINIGAME_PROPS, THEME_PROPS, loadProps } from '../three/props';
import * as THREE from 'three';
import {
  ITEMS,
  LAST_PLACE_GIFT,
  RULES,
  SHOP_STOCK,
  VILLAIN_LABELS,
  addCoins,
  applyBonusStars,
  applySlowDice,
  applyTurnOrder,
  awardMinigame,
  awardVs,
  bonusStars,
  botChooseBuy,
  botChooseItem,
  botChooseNext,
  botWantsStar,
  buyStar,
  canBuyStar,
  canUseShop,
  clearSlowDice,
  collectVs,
  createBoard,
  createParty,
  decideMinigameTeams,
  distancesTo,
  getCharacter,
  getPlayer,
  getSpace,
  ghostCanSell,
  ghostSellStar,
  ghostSteal,
  isDoubles,
  isLastRounds,
  lastPlaceIds,
  nearestShop,
  openNext,
  botWantsLever,
  leverAt,
  passBank,
  pathCost,
  payToll,
  pullLever,
  tollBetween,
  tollKey,
  type Lever,
  type SpaceType,
  type Toll,
  playersOnSpace,
  priceFor,
  ranking,
  BONUS_POOL,
  SHOP_LABEL,
  splitDice,
  removeItem,
  resolveDuel,
  resolveLanding,
  rollDieFor,
  rollTurnOrder,
  startRound,
  stealCoins,
  stealStar,
  tunnelBetween,
  type ItemId,
  type MinigameTeams,
  type MinigameMode,
  type PartyPlayer,
  type PartyState,
  type Rng,
  type RoundEvent,
  type ShopDef,
} from '@festa/game';
import type { Engine } from '../three/Engine';
import type { PlayerHub } from '../PlayerHub';
import { BoardStage, SPACE_STYLE } from '../stages/BoardStage';
import type { ControllerLayout } from '@festa/shared';
import { ShowcaseStage } from '../stages/ShowcaseStage';
import { starMesh } from '../stages/environment';
import { Hud, esc, type ScoreEntry } from '../ui/Hud';
import type { GameMenu } from '../ui/GameMenu';
import { MINIGAMES, MODE_LABEL, pickDuel, pickMinigame } from '../minigames';
import type { MinigameContext, MinigameDef, MinigameRun, MinigameSeat } from '../minigames/types';
import type { DiceLayout, Seat, SeatControl } from './Seats';
import { settings } from './Settings';
import { rankBy, rankWinners } from '../minigames/rank';
import { ResultsStage } from '../stages/ResultsStage';
import type { Theme } from '../minigames/scenery';

const PATH_COLORS = ['#ffd23f', '#3fd0ff', '#ff6fb5'];
/** Moedas para quem acerta no vencedor de um duelo (apostas no telemóvel). */
const BET_COINS = 2;

export interface PartyDeps {
  engine: Engine;
  hud: Hud;
  hub: PlayerHub;
  seatsCtl: SeatControl;
  seats: Seat[];
  rng: Rng;
  menu: GameMenu;
  /** Desenvolvimento: força um minijogo. */
  forcedMinigame?: string | null;
}

interface RollPlan {
  dice: number;
  bonus: number;
  golden: boolean;
}

export class PartyFlow {
  private state!: PartyState;
  private stage!: BoardStage;
  private lastMinigame: string | null = null;
  /** Minijogos já jogados nesta festa (para não repetir enquanto houver outros). */
  private readonly playedMinigames = new Set<string>();
  /** Lugares do último minijogo (grupos do melhor para o pior), para o prémio por lugar. */
  private lastPlaces: string[][] | null = null;
  private mapOpen = false;
  /** Quem está a jogar agora (destacado no mapa dos telemóveis). */
  private activeId: string | null = null;
  /** Telemóveis que estão a mostrar o mapa (e com que mensagem): atualizam-se a cada casa. */
  /** Apostas do duelo a decorrer (quem está de fora → em quem apostou) e se ainda estão abertas. */
  private duelBets: Map<string, string> | null = null;
  private betsOpen = false;
  private readonly boardWatchers = new Map<string, string>();

  constructor(private readonly d: PartyDeps) {}

  // ── Atalhos ─────────────────────────────────────────────

  private get engine() {
    return this.d.engine;
  }
  private get hud() {
    return this.d.hud;
  }
  private get ctl() {
    return this.d.seatsCtl;
  }
  private get rng() {
    return this.d.rng;
  }
  private seat(id: string): Seat {
    return this.d.seats.find((s) => s.id === id)!;
  }
  private wait(s: number) {
    return this.engine.wait(s);
  }

  private waitAll(message: string, except?: string): void {
    this.boardWatchers.clear();
    for (const s of this.d.seats) {
      if (s.id === except) continue;
      if (this.state) this.boardWatchers.set(s.id, message);
      this.ctl.setLayout(s, this.state ? this.boardLayout(message, s.id) : { kind: 'wait', message });
    }
  }

  /** Mapa dos telemóveis em tempo real: volta a enviar as posições a quem o está a ver. */
  private refreshBoards(): void {
    if (!this.state) return;
    for (const [id, message] of this.boardWatchers) this.ctl.setLayout(this.seat(id), this.boardLayout(message, id));
  }

  /** As minhas estatísticas para o telemóvel: moedas, estrelas, lugar e itens. */
  private phoneStats(id: string): { icon: string; label: string; value: string }[] {
    const p = getPlayer(this.state, id);
    const rank = ranking(this.state).find((r) => r.player.id === id)?.rank ?? 0;
    return [
      { icon: '🪙', label: 'Moedas', value: String(p.coins) },
      { icon: '⭐', label: 'Estrelas', value: String(p.stars) },
      { icon: '🏅', label: 'Lugar', value: `${rank}.º` },
      { icon: '🎒', label: 'Itens', value: p.items.map((i) => ITEMS[i].emoji).join('') || '—' },
    ];
  }

  /** Classificação da festa (para o telemóvel), comigo destacado. */
  private phoneTable(meId: string, extra?: (p: PartyPlayer) => string | undefined) {
    return {
      title: `Ronda ${this.state.round} / ${this.state.totalRounds}`,
      rows: ranking(this.state).map((r) => ({
        name: r.player.name,
        color: getCharacter(r.player.characterId).color,
        value: `⭐ ${r.player.stars} · 🪙 ${r.player.coins}`,
        me: r.player.id === meId || undefined,
        mark: extra?.(r.player),
      })),
    };
  }

  /** Mapa em miniatura para o telemóvel de quem está à espera (com a posição de toda a gente). */
  private boardLayout(message: string, seatId: string): ControllerLayout {
    const board = this.state.board;
    const types = Object.keys(SPACE_STYLE) as SpaceType[];
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const spaces = board.spaces.map((s) => [r1(s.x), r1(s.z), Math.max(0, types.indexOf(s.type))] as [number, number, number]);
    const links: [number, number][] = [];
    for (const s of board.spaces)
      for (const n of s.next) if (!board.tunnels.some((t) => t.from === s.id && t.to === n)) links.push([s.id, n]);
    const count = new Map<number, number>();
    const players = this.state.players.map((p) => {
      const s = getSpace(board, p.spaceId);
      const k = count.get(p.spaceId) ?? 0;
      count.set(p.spaceId, k + 1);
      const a = k * 2.1;
      return {
        x: r1(s.x + (k ? Math.cos(a) * 1.4 : 0)),
        z: r1(s.z + (k ? Math.sin(a) * 1.4 : 0)),
        color: getCharacter(p.characterId).color,
        label: [...p.name][0]?.toUpperCase() ?? '?',
        me: p.id === seatId || undefined,
        active: p.id === this.activeId || undefined,
      };
    });
    const star = this.state.starSpaceId >= 0 ? getSpace(board, this.state.starSpaceId) : null;
    return {
      kind: 'board',
      message,
      palette: types.map((t) => SPACE_STYLE[t].color),
      symbols: types.map((t) => (['blue', 'red', 'start'].includes(t) ? '' : SPACE_STYLE[t].symbol)),
      tunnels: board.tunnels.map((t) => [t.from, t.to] as [number, number]),
      spaces,
      links: links.slice(0, 500),
      players,
      star: star ? [r1(star.x), r1(star.z)] : null,
      stats: this.phoneStats(seatId),
      color: getCharacter(getPlayer(this.state, seatId).characterId).color,
    };
  }

  private scoreboard(activeId: string | null = null): void {
    // Ordenado pela classificação atual (1.º lugar em cima).
    const entries: ScoreEntry[] = ranking(this.state).map(({ player: p, rank }) => {
      const hp = this.ctl.hubPlayer(this.seat(p.id));
      return {
        rank,
        characterId: p.characterId,
        id: p.id,
        name: p.name,
        color: getCharacter(p.characterId).color,
        coins: p.coins,
        stars: p.stars,
        active: p.id === activeId,
        isBot: p.isBot,
        connected: p.isBot || !!hp?.connected,
        tag: p.items.map((i) => ITEMS[i].emoji).join('') || undefined,
      };
    });
    this.hud.setScoreboard(entries);
    this.pushStatus();
  }

  /** Último estado enviado a cada telemóvel (para só enviar quando muda). */
  private readonly sentStatus = new Map<string, string>();

  /** Menu 📊 do telemóvel: moedas, estrelas, lugar, itens e classificação, sempre atualizados. */
  private pushStatus(end = false): void {
    for (const p of this.state.players) {
      if (p.isBot) continue;
      const status = end
        ? null
        : { title: `Ronda ${this.state.round} / ${this.state.totalRounds}`, stats: this.phoneStats(p.id), rows: this.phoneTable(p.id).rows };
      const json = JSON.stringify(status);
      if (this.sentStatus.get(p.id) === json) continue;
      this.sentStatus.set(p.id, json);
      this.ctl.status(this.seat(p.id), status);
    }
  }

  private arrangeAll(instant = false): Promise<void> {
    this.refreshBoards();
    return this.stage.arrange(new Map(this.state.players.map((o) => [o.id, o.spaceId])), instant);
  }

  // ── Festa ───────────────────────────────────────────────

  async play(totalRounds: number, boardId: string): Promise<PartyState> {
    this.d.menu.mode = 'game';
    const board = createBoard(boardId);
    this.state = createParty(
      board,
      this.d.seats.map((s) => ({ id: s.id, name: s.name, characterId: s.characterId, isBot: s.isBot })),
      totalRounds,
      this.rng,
    );
    const state = this.state;
    await loadProps(THEME_PROPS[board.theme] ?? []);
    // Música do tabuleiro (cada mapa tem a sua).
    sound.boardTheme = board.theme;
    sound.music('board');
    this.stage = new BoardStage(this.engine, board, this.d.seats);
    this.engine.setStage(this.stage);
    this.stage.setFlags(state.flags);
    this.stage.setBank(state.bank);
    await this.arrangeAll(true);
    this.stage.overview();
    this.scoreboard();
    for (const s of this.d.seats) this.ctl.setLayout(s, { kind: 'pad', title: 'Bem-vindos à festa!', sub: 'Ouve a explicação no ecrã grande', stick: 'none', buttons: { minus: 'Saltar' } });
    void this.hud.banner(board.name, { sub: board.description, hold: 3.2 });
    await narrator.say([
      `Bem-vindos à festa no mapa ${board.name}!`,
      `Em cada ronda, cada um lança os dados com o botão A, ou abanando o telemóvel, e anda pelo tabuleiro.`,
      'As casas azuis dão moedas e as vermelhas tiram. Há casas de sorte, de azar, de itens e de eventos.',
      `O objetivo é juntar estrelas: quando passares pela estrela com ${RULES.starCost} moedas, podes comprá-la. Ganha quem tiver mais estrelas no fim!`,
      'Nas lojas compras itens, que usas antes de lançar os dados com o botão X. O botão menos mostra o mapa todo.',
      'Se parares numa casa onde já está alguém, há duelo! E no fim de cada ronda há um minijogo que dá moedas.',
      'Atenção às alavancas, que abrem e fecham caminhos, às portagens, aos canhões e ao banco: quem passa deposita moedas, e quem lá para leva o cofre todo!',
      `Neste mapa: ${board.description}`,
    ]);

    const start = getSpace(board, board.startId);
    this.stage.focusPoint(start.x, start.z, 1.1);
    await this.wait(1);
    await this.turnOrder();

    const star = getSpace(board, state.starSpaceId);
    this.stage.focusPoint(star.x, star.z, 1.2);
    await this.wait(0.8);
    await this.stage.placeStar(state.starSpaceId, false);
    await this.hud.banner('A estrela está aqui!', { sub: `Passa por ela com ${RULES.starCost} 🪙 para a comprar`, hold: 2 });

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') this.toggleMap();
    };
    window.addEventListener('keydown', onKey);
    try {
      for (state.round = 1; state.round <= state.totalRounds; state.round++) {
        this.hud.setRound(`Ronda ${state.round} / ${state.totalRounds}`);
        this.stage.overview();
        const last = state.totalRounds - state.round + 1;
        await this.hud.banner(`Ronda ${state.round}`, {
          sub: isLastRounds(state) ? `${last === 1 ? 'Última ronda' : `Últimas ${last} rondas`}! Casas azuis e vermelhas valem o dobro` : undefined,
          hold: 1.6,
        });
        await this.roundEvents(startRound(state, this.rng));
        for (const p of state.players) await this.turn(p);
        await this.roundMinigame();
      }
    } finally {
      window.removeEventListener('keydown', onKey);
    }
    this.hud.setRound(null);
    this.pushStatus(true);
    return state;
  }

  /** Casas que faltam até à estrela, pelo caminho mais curto (com portões e alavancas como estão). */
  private starDistance(p: PartyPlayer): number | null {
    const d = distancesTo(this.state.board, this.state.starSpaceId, this.state.flags).get(p.spaceId);
    return d === undefined || !Number.isFinite(d) ? null : d;
  }

  private toggleMap(): void {
    this.mapOpen = !this.mapOpen;
    this.stage.showMap(this.mapOpen, this.state.players.map((p) => ({ id: p.id, name: p.name })));
    this.hud.hint(this.mapOpen ? '🗺️ Mapa · M para fechar' : null, true);
  }

  private closeMap(): void {
    if (this.mapOpen) this.toggleMap();
  }

  /** Moedas a voar + vibração no comando de quem ganha (curta) ou perde (forte). */
  private coinBurst(id: string, amount: number): void {
    this.stage.coinBurst(id, amount);
    const seat = this.d.seats.find((x) => x.id === id);
    if (seat && amount) this.ctl.vibrate(seat, amount > 0 ? [20, 30, 20] : [90, 50, 90]);
  }

  private buzz(id: string, pattern: number | number[]): void {
    const seat = this.d.seats.find((x) => x.id === id);
    if (seat) this.ctl.vibrate(seat, pattern);
  }

  /**
   * Vibração em todos os telemóveis (acontecimentos do mapa). Intensidades usadas:
   * passo 15 ms · aviso curto 40 · mudança do mapa [60,40,60] · sismo/erupção longo e forte.
   */
  private buzzAll(pattern: number | number[], except?: string): void {
    for (const p of this.state.players) if (p.id !== except) this.buzz(p.id, pattern);
  }

  private async roundEvents(events: RoundEvent[]): Promise<void> {
    for (const ev of events) {
      if (ev.kind === 'tide') {
        this.stage.setFlags(this.state.flags);
        this.stage.overview();
        this.buzzAll([60, 40, 60, 40, 60]);
        await this.hud.banner(ev.high ? '🌊 Maré alta!' : '🏖️ Maré baixa!', {
          sub: ev.high ? 'A ponte ficou debaixo de água · o túnel da gruta abriu' : 'A ponte voltou · a gruta fechou',
          hold: 2.6,
          color: '#3fd0ff',
        });
      } else if (ev.kind === 'traffic') {
        this.stage.setFlags(this.state.flags);
        this.buzzAll([40, 30, 40]);
        await this.hud.banner('🚦 Os semáforos mudaram!', {
          sub: ev.greenNS ? 'Verde na Avenida Norte · vermelho na Oeste' : 'Verde na Avenida Oeste · vermelho na Norte',
          hold: 2,
        });
      } else if (ev.kind === 'eruption') {
        this.stage.setFlags(this.state.flags);
        this.stage.overview();
        if (ev.active) {
          // A terra treme para toda a gente; quem está na cratera sente muito mais.
          this.buzzAll([250, 80, 250, 80, 400]);
          await this.hud.banner('🌋 Erupção!', { sub: 'A cratera fechou nesta ronda · quem lá estava queimou-se', hold: 2.4, color: '#ff5a1f' });
          for (const b of ev.burned) {
            this.stage.focus(b.id, true);
            this.stage.token(b.id).setAnim('hurt');
            this.coinBurst(b.id, -b.amount);
            this.stage.floatText(b.id, `🔥 -${b.amount} 🪙`, '#ff6b7a');
            this.ctl.vibrate(this.seat(b.id), [400, 100, 400, 100, 600]);
            await this.wait(1.1);
            this.stage.token(b.id).setAnim('idle');
          }
          this.scoreboard();
        } else {
          await this.hud.banner('🌋 O vulcão acalmou', { sub: 'A cratera voltou a abrir', hold: 1.8, color: '#ffa41b' });
        }
      } else if (ev.kind === 'doors') {
        this.stage.setFlags(this.state.flags);
        this.stage.overview();
        this.buzzAll([50, 60, 50]);
        await this.hud.banner('🚪 As portas do castelo mudaram!', { sub: ev.open ? 'Abriu a escadaria Este · fechou a Oeste' : 'Abriu a escadaria Oeste · fechou a Este', hold: 2.2, color: '#b98cff' });
      } else if (ev.kind === 'wheel') {
        this.stage.spinWheel();
        for (const m of ev.moved) this.buzz(m.id, [120, 60, 120]);
        const s = getSpace(this.state.board, this.state.board.wheel![0]!);
        this.stage.focusPoint(s.x, s.z, 1.4);
        await this.hud.banner('🎡 A roda gigante girou!', { sub: ev.moved.length ? 'Quem estava na roda mudou de lugar' : 'Ninguém estava lá em cima', hold: 1.8, color: '#ff6fb5' });
        await Promise.all(ev.moved.map((m) => this.stage.hop(m.id, m.to, 0.7)));
        if (ev.moved.length) await this.arrangeAll();
      } else if (ev.kind === 'sale') {
        const shop = this.state.board.shops.find((s) => s.id === ev.shopId)!;
        const s = getSpace(this.state.board, shop.spaceId);
        this.stage.focusPoint(s.x, s.z, 1.3);
        this.buzzAll(40);
        await this.hud.banner('💥 Saldos relâmpago!', { sub: `${shop.name}: tudo a metade do preço nesta ronda`, hold: 2.2, color: '#ff6fb5' });
      }
    }
  }

  private async turnOrder(): Promise<void> {
    const state = this.state;
    await this.hud.banner('Quem começa?', { sub: 'Lancem os dois dados! A maior soma joga primeiro', hold: 1.6 });
    const rolls = rollTurnOrder(state, this.rng);
    // Um de cada vez, com o bloco de dados por cima da cabeça e a câmara bem perto
    // (estão todos na partida, uns em cima dos outros). Os outros ficam afastados.
    this.waitAll('À espera da tua vez de lançar…');
    for (const p of state.players) {
      const seat = this.seat(p.id);
      await this.stage.spotlight(p.id, true);
      this.stage.faceCamera(p.id);
      this.stage.spawnDice(p.id, 2);
      this.hud.hint(`${p.name}: lança os dados!`, true);
      const pair = splitDice(rolls.get(p.id)!, this.rng);
      for (let i = 0; i < 2; i++) {
        await this.ctl.decide(seat, {
          layout: { kind: 'dice', prompt: i === 0 ? 'Lança o primeiro dado para decidir a ordem!' : 'Agora o segundo dado!', label: 'Lançar!' },
          valid: ['roll'],
          bot: () => 'roll',
          keyboardA: 'roll',
          botDelay: 0.6 + this.rng.next() * 0.5,
        });
        this.buzz(p.id, [30, 30, 60]);
        await this.stage.hitDice(p.id, [pair[i]!]);
        await this.wait(0.3);
      }
      this.ctl.setLayout(seat, { kind: 'wait', message: `Tiraste ${rolls.get(p.id)}!` });
      this.stage.token(p.id).setAnim('cheer');
      await this.wait(1.1);
      this.stage.clearDice();
      this.stage.floatText(p.id, `🎲 ${rolls.get(p.id)}`, '#ffd23f');
      this.stage.token(p.id).setAnim('idle');
    }
    this.hud.hint(null);
    await this.stage.spotlight(null, true);
    applyTurnOrder(state, rolls);
    this.scoreboard();
    this.hud.panel(`
      <h1>Ordem de jogo</h1>
      <div class="rows">${state.players
        .map(
          (p, i) => `<div class="row" style="animation-delay:${i * 0.08}s">
            <span>${i + 1}.</span><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>
            <span>${esc(p.name)}</span><span>🎲 ${rolls.get(p.id)}</span><span></span></div>`,
        )
        .join('')}</div>`);
    await this.wait(Math.min(5, 2 + state.players.length * 0.3));
    this.hud.panel(null);
  }

  // ── Vez de um jogador ───────────────────────────────────

  private async turn(p: PartyPlayer): Promise<void> {
    const state = this.state;
    const seat = this.seat(p.id);
    this.scoreboard(p.id);
    this.stage.focus(p.id);
    this.activeId = p.id;
    this.waitAll(`Vez de ${p.name}`, p.id);
    this.buzz(p.id, [70, 50, 70]); // «é a tua vez!»
    // Vários na mesma casa (ex.: partida): o da vez vem para a frente e os outros afastam-se.
    const crowded = playersOnSpace(state, p).length > 0;
    if (crowded) await this.stage.spotlight(p.id);
    await this.hud.banner(`Vez de ${p.name}!`, { sub: p.slowDice ? '🐌 Dados preguiçosos: só 1 a 3' : undefined, hold: 1.1 });
    this.stage.faceCamera(p.id);
    // Quanto falta para a estrela (fica até lançar os dados).
    this.hud.setStarDistance(this.starDistance(p));

    // Antes de lançar: itens e mapa
    const plan = await this.beforeRoll(p);

    // Dados: câmara pessoal atrás de quem lança, virada para o caminho.
    const ahead = openNext(state.board, state.flags, p.spaceId)[0];
    const aheadSpace = ahead !== undefined ? getSpace(state.board, ahead) : undefined;
    this.stage.rollView(p.id, aheadSpace);
    await this.wait(0.6);
    this.stage.spawnDice(p.id, plan.dice);
    // Um dado de cada vez: cada toque (ou abanão) para um dado; depois de todos, anda.
    const values: number[] = [];
    for (let i = 0; i < plan.dice; i++) {
      const ord = ['primeiro', 'segundo', 'terceiro'][i];
      await this.rollPrompt(seat, plan.dice === 1 ? 'Lança o dado!' : `Lança o ${ord} dado!`);
      const v = rollDieFor(p, this.rng);
      values.push(v);
      this.buzz(p.id, [30, 30, 60]);
      await this.stage.hitDice(p.id, [v]);
      this.stage.floatText(p.id, `${v}`, '#ffffff');
      await this.wait(0.35);
    }
    clearSlowDice(p);
    await this.wait(0.35);
    if (plan.dice === 2 && isDoubles(values)) {
      this.stage.token(p.id).setAnim('cheer');
      await this.hud.banner('Dados iguais!', { sub: 'Lança o terceiro dado!', hold: 1.3, color: '#ffd23f' });
      this.stage.token(p.id).setAnim('idle');
      this.stage.spawnDice(p.id, 1, true);
      await this.rollPrompt(seat, 'Dados iguais! Lança o terceiro dado!');
      const third = rollDieFor(p, this.rng);
      values.push(third);
      await this.stage.hitDice(p.id, [third]);
      await this.wait(0.7);
    }
    let total = values.reduce((a, b) => a + b, 0);
    if (plan.golden) {
      const got = addCoins(p, total);
      this.coinBurst(p.id, got);
      await this.hud.banner(`🪙 Dado Dourado: +${got} moedas!`, { hold: 1.3, color: '#ffd23f' });
    }
    if (plan.bonus) {
      total += plan.bonus;
      this.stage.floatText(p.id, `⚡ +${plan.bonus}`, '#ffd23f');
    }
    this.hud.setStarDistance(null);
    await this.stage.collapseDice(p.id, total);
    if (crowded) await this.stage.spotlight(null);
    this.ctl.setLayout(seat, { kind: 'wait', message: `Andas ${total} casas!` });
    this.scoreboard(p.id);
    await this.wait(0.3);

    // Andar
    let steps = total;
    while (steps > 0) {
      // Câmara de perto a seguir (volta a ela depois de lojas, estrelas, cruzamentos…).
      this.stage.walkView(p.id);
      const here = p.spaceId;
      const options = openNext(state.board, state.flags, here);
      let next = options[0]!;
      if (options.length > 1) next = await this.chooseJunction(p, here, options);
      const toll = tollBetween(state.board, here, next);
      if (toll) await this.payTollStep(p, toll);
      const tunnel = tunnelBetween(state.board, here, next);
      if (tunnel) {
        if (tunnel.cost) {
          addCoins(p, -tunnel.cost);
          this.stage.floatText(p.id, `-${tunnel.cost} 🪙`, '#ff6b7a');
          this.scoreboard(p.id);
        }
        await this.stage.travelTunnel(p.id, next, tunnel.kind);
        this.stage.focus(p.id);
      } else {
        this.buzz(p.id, 15);
        await this.stage.hop(p.id, next);
      }
      p.spaceId = next;
      p.stats.steps++;
      this.refreshBoards();
      steps--;
      this.stage.setStepCounter(p.id, steps > 0 ? steps : null);
      if (next === state.starSpaceId) await this.starOffer(p);
      const shop = state.board.shops.find((s) => s.spaceId === next);
      if (shop) await this.shopVisit(p, shop);
      if (steps > 0 && getSpace(state.board, next).type === 'bank') await this.bankDeposit(p);
      const lever = leverAt(state.board, next);
      if (lever) await this.leverOffer(p, lever);
    }
    // Chegou: a câmara volta à vista normal e a personagem vira-se para ela.
    this.stage.focus(p.id);
    this.stage.faceCamera(p.id);

    // Chegada: duelo e casa
    const lostDuel = await this.arrivalDuel(p);
    if (!lostDuel) await this.land(p);
    await this.arrangeAll();
    this.refreshBoards();
    this.scoreboard(p.id);
    await this.wait(0.5);
    this.stage.token(p.id).setAnim('idle');
  }

  private rollPrompt(seat: Seat, prompt: string): Promise<string> {
    return this.ctl.decide(seat, {
      layout: { kind: 'dice', prompt, label: 'Lançar!' },
      valid: ['roll'],
      bot: () => 'roll',
      keyboardA: 'roll',
      botDelay: 1.1,
    });
  }

  /** Antes de lançar: ver o mapa, usar um item (um por vez) ou lançar. */
  private async beforeRoll(p: PartyPlayer): Promise<RollPlan> {
    const plan: RollPlan = { dice: 2, bonus: 0, golden: false };
    let usedItem = false;
    const seat = this.seat(p.id);
    for (;;) {
      const itemExtras = usedItem ? [] : p.items.map((i, idx) => ({ id: `item:${idx}:${i}`, label: `${ITEMS[i].emoji} ${ITEMS[i].name}`, color: '#ff6fb5' }));
      const layout: DiceLayout = {
        kind: 'dice',
        prompt: `${usedItem || !p.items.length ? 'Lança os dados!' : 'Usa um item ou lança os dados!'} · ⭐ a ${this.starDistance(p) ?? '?'} casas`,
        label: 'Lançar!',
        extras: [{ id: 'map', label: this.mapOpen ? '🗺️ Fechar mapa' : '🗺️ Ver mapa' }, ...itemExtras],
      };
      const botPlan = usedItem ? null : botChooseItem(this.state, p, this.rng, settings.botSkill);
      const choice = await this.ctl.decide(seat, {
        layout,
        valid: ['roll', 'map', ...itemExtras.map((x) => x.id)],
        bot: () => (botPlan ? `item:${p.items.indexOf(botPlan.item)}:${botPlan.item}` : 'roll'),
        keyboardA: 'roll',
        botDelay: 1,
      });
      if (choice === 'map') {
        this.toggleMap();
        continue;
      }
      this.closeMap();
      if (choice === 'roll') return plan;
      const item = choice.split(':')[2] as ItemId;
      usedItem = true;
      await this.useItem(p, item, plan, botPlan?.item === item ? botPlan.target : undefined);
      this.scoreboard(p.id);
      // Bots lançam logo; humanos voltam ao ecrã de lançar (podem ainda ver o mapa).
      if (this.ctl.isAuto(seat)) return plan;
    }
  }

  // ── Itens ───────────────────────────────────────────────

  private async chooseTarget(p: PartyPlayer, item: ItemId, botTarget?: string): Promise<PartyPlayer | null> {
    let others = this.state.players.filter((o) => o.id !== p.id);
    if (item === 'ladraoEstrela') others = others.filter((o) => o.stars > 0);
    if (!others.length) return null;
    const choice = await this.ctl.decide(this.seat(p.id), {
      layout: {
        kind: 'choices',
        prompt: `${ITEMS[item].emoji} ${ITEMS[item].name}: escolhe um jogador`,
        options: others.map((o) => ({
          id: `target:${o.id}`,
          label: `${o.name} · ⭐${o.stars} 🪙${o.coins}`,
          color: getCharacter(o.characterId).color,
        })),
      },
      valid: others.map((o) => `target:${o.id}`),
      bot: () => `target:${botTarget && others.some((o) => o.id === botTarget) ? botTarget : others.sort((a, b) => b.stars - a.stars || b.coins - a.coins)[0]!.id}`,
      botDelay: 1,
    });
    return getPlayer(this.state, choice.slice(7));
  }

  private async useItem(p: PartyPlayer, item: ItemId, plan: RollPlan, botTarget?: string): Promise<void> {
    const def = ITEMS[item];
    const needsTarget = def.targetsPlayer;
    const target = needsTarget ? await this.chooseTarget(p, item, botTarget) : null;
    if (needsTarget && !target) {
      await this.hud.banner(`${def.emoji} ${def.name}`, { sub: 'Não há ninguém a quem usar isto agora', hold: 1.4 });
      return;
    }
    removeItem(p, item);
    p.stats.itemsUsed++;
    const token = this.stage.token(p.id);
    token.setAnim('throw');
    await this.hud.banner(`${def.emoji} ${def.name}!`, { sub: def.description, hold: 1.4, color: '#ff6fb5' });
    switch (item) {
      case 'turbo':
        plan.bonus += 3;
        break;
      case 'dadoExtra':
        plan.dice = 3;
        break;
      case 'dadoDourado':
        plan.golden = true;
        break;
      case 'dadoLento':
        applySlowDice(this.state, p);
        for (const o of this.state.players) if (o.id !== p.id) this.stage.floatText(o.id, '🐌', '#ffffff');
        await this.wait(1);
        break;
      case 'bilheteLoja': {
        const shopSpace = nearestShop(this.state, p.spaceId);
        if (shopSpace === null) break;
        await this.stage.travelTunnel(p.id, shopSpace, 'metro');
        p.spaceId = shopSpace;
        this.stage.focus(p.id);
        const shop = this.state.board.shops.find((s) => s.spaceId === shopSpace)!;
        await this.shopVisit(p, shop);
        break;
      }
      case 'espelho':
        await this.swapPlayers(p, target!);
        break;
      case 'ima': {
        this.buzz(target!.id, [150, 60, 150]);
        const got = stealCoins(target!, p, this.rng.int(5, 10));
        this.coinBurst(target!.id, -got);
        this.coinBurst(p.id, got);
        this.stage.focusPoint(this.stage.token(target!.id).root.position.x, this.stage.token(target!.id).root.position.z, 1.4);
        await this.hud.banner(`🧲 ${p.name} roubou ${got} moedas a ${target!.name}!`, { hold: 1.8 });
        this.stage.focus(p.id);
        break;
      }
      case 'armadilha':
        this.state.traps[p.spaceId] = p.id;
        this.stage.setTraps(this.state.traps);
        await this.wait(0.8);
        break;
      case 'luva':
        await this.duel(p, target!, '🥊 Desafio!');
        break;
      case 'ladraoEstrela':
        if (stealStar(target!, p)) {
          this.buzz(target!.id, [300, 100, 300]);
          await this.starFly(target!.id, p.id);
          await this.hud.banner(`🦹 ${p.name} roubou uma estrela a ${target!.name}!`, { hold: 2, color: '#ffd23f' });
        }
        break;
    }
    token.setAnim('idle');
    await this.arrangeAll();
  }

  /** Uma estrela voa de uma personagem para outra. */
  private async starFly(fromId: string, toId: string): Promise<void> {
    const from = this.stage.token(fromId).root.position.clone().add(new THREE.Vector3(0, 2.6, 0));
    const to = this.stage.token(toId).root.position.clone().add(new THREE.Vector3(0, 2.6, 0));
    const star = starMesh(0.6);
    this.stage.scene.add(star);
    this.stage.token(fromId).setAnim('sad');
    this.stage.focusPoint((from.x + to.x) / 2, (from.z + to.z) / 2, 1.6);
    await this.engine.tween(1.4, (k) => {
      star.position.lerpVectors(from, to, k);
      star.position.y += Math.sin(k * Math.PI) * 4;
      star.rotation.y = k * 12;
    });
    this.stage.scene.remove(star);
    this.stage.token(toId).setAnim('cheer');
    await this.wait(0.8);
    this.stage.token(fromId).setAnim('idle');
    this.stage.token(toId).setAnim('idle');
  }

  // ── Cruzamentos, estrela e lojas ────────────────────────

  private async chooseJunction(p: PartyPlayer, spaceId: number, options: number[]): Promise<number> {
    const state = this.state;
    const dist = distancesTo(state.board, state.starSpaceId, state.flags);
    const info = options.map((id, i) => {
      const tunnel = tunnelBetween(state.board, spaceId, id);
      const toll = tollBetween(state.board, spaceId, id);
      const d = (dist.get(id) ?? 99) + 1;
      const TUNNEL_NAMES = { metro: 'Ⓜ️ Metro', cave: '🕳️ Gruta', cart: '🛤️ Vagoneta', elevator: '🛗 Elevador', coaster: '🎢 Montanha-russa' } as const;
      const name = tunnel ? (tunnel.kind === 'cave' ? `🕳️ ${tunnel.name}` : TUNNEL_NAMES[tunnel.kind]) : toll ? `💰 ${toll.name}` : `Caminho ${i + 1}`;
      const price = pathCost(state, p, spaceId, id);
      const cost = price ? ` · ${price}🪙` : toll ? ' · grátis (é tua)' : '';
      return {
        id,
        color: PATH_COLORS[i % PATH_COLORS.length]!,
        label: `${name}${cost} · ⭐ a ${d}`,
        disabled: price > 0 && p.coins < price,
      };
    });
    // Nunca fica preso: se não puder pagar nenhum, paga o que tiver.
    if (info.every((o) => o.disabled)) for (const o of info) o.disabled = false;
    this.stage.showArrows(spaceId, info.map((o) => ({ spaceId: o.id, color: o.color })));
    this.stage.showJunction(spaceId, info.map((o) => ({ spaceId: o.id, label: o.label, color: o.color })));
    this.hud.hint(`${p.name}: por onde vais?`, true);
    const enabled = info.filter((o) => !o.disabled);
    // Também se pode ver o tabuleiro inteiro antes de escolher.
    let choice: string;
    for (;;) {
      choice = await this.ctl.decide(this.seat(p.id), {
        layout: {
          kind: 'choices',
          prompt: 'Por onde vais?',
          options: [
            ...info.map((o) => ({ id: `path:${o.id}`, label: `${this.stage.screenDirection(spaceId, o.id)}  ${o.label}`, color: o.color, disabled: o.disabled })),
            { id: 'map', label: this.mapOpen ? '🗺️ Fechar mapa' : '🗺️ Ver mapa' },
          ],
        },
        valid: [...enabled.map((o) => `path:${o.id}`), 'map'],
        bot: () => `path:${botChooseNext(state, enabled.map((o) => o.id), this.rng, settings.botSkill, p.coins)}`,
        botDelay: 1.2,
        corner: this.mapOpen,
      });
      if (choice !== 'map') break;
      this.toggleMap();
    }
    this.closeMap();
    this.stage.hideArrows();
    this.stage.clearJunction();
    this.stage.focus(p.id);
    this.hud.hint(null);
    this.ctl.setLayout(this.seat(p.id), { kind: 'wait', message: 'A caminho…' });
    return Number(choice.slice(5));
  }

  /** Portagem: paga a quem pagou antes (ou ao banco) e fica dono dela. */
  private async payTollStep(p: PartyPlayer, toll: Toll): Promise<void> {
    const state = this.state;
    const key = tollKey(toll);
    const res = payToll(state, p, toll);
    this.stage.focus(p.id, true);
    this.stage.openToll(key);
    this.stage.setTollOwner(key, p.name);
    if (res.paid) {
      this.coinBurst(p.id, -res.paid);
      if (res.to) this.coinBurst(res.to, res.paid);
      else this.stage.setBank(state.bank);
    }
    const owner = res.to && res.to !== p.id ? getPlayer(state, res.to).name : null;
    await this.hud.banner(`💰 ${toll.name}`, {
      sub: !res.paid ? 'Portagem tua: passas de graça!' : owner ? `${p.name} paga ${res.paid} 🪙 a ${owner}` : `${p.name} paga ${res.paid} 🪙 e fica dono da portagem`,
      hold: 1.5,
      color: '#ffd23f',
    });
    this.scoreboard(p.id);
    this.stage.focus(p.id);
  }

  /** Passar pelo banco: deposita moedas. */
  private async bankDeposit(p: PartyPlayer): Promise<void> {
    const paid = passBank(this.state, p);
    if (!paid) return;
    this.stage.focus(p.id, true);
    this.buzz(p.id, [50, 40, 50]);
    this.stage.floatText(p.id, `🏦 -${paid} 🪙`, '#ff6b7a');
    await this.stage.bankCoins(p.id, paid, true);
    this.stage.setBank(this.state.bank);
    this.scoreboard(p.id);
    this.stage.focus(p.id);
  }

  /** Alavanca: quem passa decide se a puxa (abre um caminho e fecha outro). */
  private async leverOffer(p: PartyPlayer, lever: Lever): Promise<void> {
    const state = this.state;
    const seat = this.seat(p.id);
    const on = !!state.flags[lever.flag];
    this.stage.focus(p.id, true);
    this.stage.faceCamera(p.id);
    // Pode ver o tabuleiro inteiro antes de decidir (abre/fecha o mapa e volta a perguntar).
    let answer: string;
    for (;;) {
      answer = await this.ctl.decide(seat, {
        layout: {
          kind: 'choices',
          prompt: `🎚️ ${lever.name}: puxar?`,
          options: [
            { id: 'pull', label: `🎚️ Puxar · ${on ? lever.offText : lever.onText}`, color: '#ffa41b' },
            { id: 'skip', label: 'Deixar como está' },
            { id: 'map', label: this.mapOpen ? '🗺️ Fechar mapa' : '🗺️ Ver mapa' },
          ],
        },
        valid: ['pull', 'skip', 'map'],
        bot: () => (botWantsLever(state, p, lever, this.rng, settings.botSkill) ? 'pull' : 'skip'),
        botDelay: 1.1,
        corner: this.mapOpen,
      });
      if (answer !== 'map') break;
      this.toggleMap();
    }
    this.closeMap();
    this.ctl.setLayout(seat, { kind: 'wait', message: 'A caminho…' });
    if (answer === 'pull') {
      const now = pullLever(state, lever);
      this.buzz(p.id, [40, 30, 120]);
      this.buzzAll(40, p.id);
      await this.stage.pullLever(p.id, lever.spaceId, state.flags);
      await this.hud.banner(`🎚️ ${now ? lever.onText : lever.offText}`, { sub: `${p.name} puxou a ${lever.name}`, hold: 1.6, color: '#ffa41b' });
    }
    this.stage.focus(p.id);
  }

  /** Fantasma do castelo: vende uma estrela; quem não compra é assaltado. */
  private async ghost(p: PartyPlayer): Promise<void> {
    const seat = this.seat(p.id);
    const token = this.stage.token(p.id);
    this.stage.focus(p.id, true);
    token.setAnim('dizzy');
    this.stage.floatText(p.id, '👻', '#ffffff');
    await this.hud.banner('👻 Buuu! O fantasma!', { sub: `Vende uma estrela por ${RULES.ghostStarPrice} 🪙… ou leva-te moedas`, hold: 1.8, color: '#b98cff' });
    let bought = false;
    if (ghostCanSell(p)) {
      const answer = await this.ctl.decide(seat, {
        layout: {
          kind: 'choices',
          prompt: `O fantasma vende-te uma estrela por ${RULES.ghostStarPrice} 🪙 (tens ${p.coins}). Se recusares, rouba-te moedas!`,
          options: [
            { id: 'buy', label: `Comprar ⭐ (${RULES.ghostStarPrice} 🪙)`, color: '#ffd23f' },
            { id: 'skip', label: 'Não, obrigado' },
          ],
        },
        valid: ['buy', 'skip'],
        bot: () => 'buy',
        botDelay: 1.2,
      });
      this.ctl.setLayout(seat, { kind: 'wait', message: '👻' });
      if (answer === 'buy' && ghostSellStar(p)) {
        bought = true;
        this.coinBurst(p.id, -RULES.ghostStarPrice);
        this.ctl.vibrate(seat, [60, 40, 200]);
        this.scoreboard(p.id);
        const shown = this.stage.showPurchase(p.id, '⭐', '#ffd23f');
        await this.hud.banner(`${p.name} comprou uma estrela ao fantasma!`, { hold: 1.8, color: '#ffd23f' });
        await shown;
      }
    }
    if (!bought) {
      const lost = ghostSteal(p, this.rng);
      token.setAnim('sad');
      this.coinBurst(p.id, -lost);
      this.ctl.vibrate(seat, [80, 60, 80]);
      this.scoreboard();
      await this.hud.banner('👻 O fantasma roubou-te!', { sub: lost ? `${p.name} perdeu ${lost} moedas` : 'Mas não tinhas moedas…', hold: 1.6, color: '#b98cff' });
    }
    token.setAnim('idle');
    this.stage.focus(p.id);
  }

  private async starOffer(p: PartyPlayer): Promise<void> {
    const seat = this.seat(p.id);
    this.stage.focus(p.id, true);
    this.stage.faceCamera(p.id);
    if (!canBuyStar(p)) {
      this.stage.token(p.id).setAnim('sad');
      await this.hud.banner('A estrela!', { sub: `${p.name} precisa de ${RULES.starCost} 🪙 (tem ${p.coins})`, hold: 2 });
      this.stage.token(p.id).setAnim('idle');
      this.stage.focus(p.id);
      return;
    }
    const answer = await this.ctl.decide(seat, {
      layout: {
        kind: 'choices',
        prompt: `Encontraste a estrela! Comprar por ${RULES.starCost} 🪙? (tens ${p.coins})`,
        options: [
          { id: 'buy', label: `Comprar ⭐ (${RULES.starCost} 🪙)`, color: '#ffd23f' },
          { id: 'skip', label: 'Agora não' },
        ],
      },
      valid: ['buy', 'skip'],
      bot: () => (botWantsStar(p) ? 'buy' : 'skip'),
      botDelay: 1.3,
    });
    this.ctl.setLayout(seat, { kind: 'wait', message: 'A caminho…' });
    if (answer === 'buy' && buyStar(this.state, p, this.rng)) {
      this.scoreboard(p.id);
      this.ctl.vibrate(seat, [60, 40, 60, 40, 200]);
      this.coinBurst(p.id, -RULES.starCost);
      await this.stage.collectStar(p.id);
      await this.hud.banner(`${p.name} ganhou uma estrela!`, { hold: 1.8, color: '#ffd23f' });
      const next = getSpace(this.state.board, this.state.starSpaceId);
      this.stage.focusPoint(next.x, next.z, 1.4);
      await this.stage.placeStar(this.state.starSpaceId, true);
      await this.wait(0.8);
    }
    this.stage.focus(p.id);
  }

  private async shopVisit(p: PartyPlayer, shop: ShopDef): Promise<void> {
    const state = this.state;
    const seat = this.seat(p.id);
    const isLast = lastPlaceIds(state).includes(p.id);
    if (!canUseShop(shop.kind, isLast)) {
      this.stage.floatText(p.id, '🔒 Só para o último', '#ffffff');
      await this.wait(0.6);
      return;
    }
    const s = getSpace(state.board, shop.spaceId);
    this.stage.focusPoint(s.x, s.z, 0.8);
    if (shop.kind === 'ultimo') {
      const got = addCoins(p, LAST_PLACE_GIFT);
      this.coinBurst(p.id, got);
      this.scoreboard(p.id);
    }
    const sale = state.saleShopId === shop.id;
    const stock = SHOP_STOCK[shop.kind].map((item) => ({ item, price: priceFor(item, shop.kind, sale) }));
    const full = p.items.length >= 3;
    // Um só menu: o painel grande da loja. O cursor (comando ou teclado) realça o cartão escolhido.
    const options = stock.map(({ item, price }) => ({
      id: `buy:${item}`,
      label: `${ITEMS[item].emoji} ${ITEMS[item].name} · ${price}🪙`,
      disabled: full || p.coins < price,
    }));
    const all = [...options, { id: 'buy:none', label: '🚪 Sair da loja', disabled: false }];
    const cols = Math.min(all.length, 5);
    const icon = shop.kind === 'luxo' ? '💎' : '🛒';
    this.hud.panel(`
      <h1>${icon} ${esc(shop.name)}</h1>
      <h2>${esc(SHOP_LABEL[shop.kind])}${sale ? ' · 💥 SALDOS: metade do preço!' : ''} · ${esc(p.name)} tem ${p.coins} 🪙${full ? ' · inventário cheio' : ''}</h2>
      <div class="shop-items" style="grid-template-columns:repeat(${cols}, 1fr)">${stock
        .map(({ item, price }) => {
          const def = ITEMS[item];
          const ok = !full && p.coins >= price;
          const base = priceFor(item, shop.kind, false);
          return `<div class="shop-item ${ok ? '' : 'no'}" data-id="buy:${item}"><span class="emoji">${def.emoji}</span><span class="nm">${esc(def.name)}</span>
            <span class="ds">${esc(def.description)}</span><span class="pr">${sale ? `<span class="old">${base}</span>` : ''}${price} 🪙</span></div>`;
        })
        .join('')}<div class="shop-item exit" data-id="buy:none"><span class="emoji">🚪</span><span class="nm">Sair da loja</span><span class="ds">Não comprar nada</span></div></div>
      <p class="shop-keys">✚ escolher · Ⓐ comprar</p>`);
    const highlight = (id: string) => {
      for (const el of this.hud.panelElement().querySelectorAll<HTMLElement>('.shop-item')) el.classList.toggle('sel', el.dataset.id === id);
    };
    const choice = await this.ctl.decide(seat, {
      layout: { kind: 'choices', prompt: `${shop.name} · tens ${p.coins} 🪙`, columns: cols, options: all },
      valid: ['buy:none', ...options.filter((o) => !o.disabled).map((o) => o.id)],
      bot: () => {
        const pick = botChooseBuy(state, p, stock, this.rng);
        return pick ? `buy:${pick}` : 'buy:none';
      },
      botDelay: 1.6,
      hideMenu: true,
      onFocus: highlight,
    });
    this.hud.panel(null);
    this.ctl.setLayout(seat, { kind: 'wait', message: 'A caminho…' });
    if (choice !== 'buy:none') {
      const item = choice.slice(4) as ItemId;
      const price = stock.find((x) => x.item === item)!.price;
      addCoins(p, -price);
      p.stats.shopSpent += price;
      p.items.push(item);
      this.coinBurst(p.id, -price);
      this.scoreboard(p.id);
      // Grande plano: o item aparece por cima da cabeça e entra na personagem.
      const shown = this.stage.showPurchase(p.id, ITEMS[item].emoji);
      await this.hud.banner(`${ITEMS[item].emoji} ${p.name} comprou: ${ITEMS[item].name}`, { hold: 1.4 });
      await shown;
      this.stage.token(p.id).setAnim('idle');
    }
    this.stage.focus(p.id);
  }

  // ── Chegada: duelo e casa ───────────────────────────────

  /** Se já houver alguém na casa, há duelo. Devolve true se quem chegou perdeu. */
  private async arrivalDuel(p: PartyPlayer): Promise<boolean> {
    const others = playersOnSpace(this.state, p);
    if (!others.length || p.spaceId === this.state.board.startId) return false;
    const opponent = others.length === 1 ? others[0]! : this.rng.pick(others);
    const winner = await this.duel(p, opponent, '⚔️ Duelo!');
    return winner === opponent.id;
  }

  /** Duelo 1 contra 1. Devolve o id de quem ganhou (ou null em empate). */
  private async duel(a: PartyPlayer, b: PartyPlayer, title: string): Promise<string | null> {
    this.buzz(a.id, [60, 40, 60]);
    this.buzz(b.id, [60, 40, 60]);
    this.stage.focusPoint(this.stage.token(a.id).root.position.x, this.stage.token(a.id).root.position.z, 0.9);
    this.stage.token(a.id).setAnim('block');
    this.stage.token(b.id).setAnim('block');
    await this.hud.banner(title, { sub: `${a.name} vs ${b.name} · quem perde dá ${RULES.duelCoins} 🪙 e recua ${RULES.duelStepsBack} casas`, hold: 2.2, color: '#ff6b7a' });
    const teams: MinigameTeams = { mode: 'ffa', blue: [a.id, b.id], red: [] };
    // Quem está de fora aposta no telemóvel (os bots apostam ao acaso).
    const bets = new Map<string, string>();
    this.duelBets = bets;
    this.betsOpen = true;
    const offBets = this.d.hub.events.on('choice', ({ player, id }) => {
      if (!this.betsOpen || !id.startsWith('bet:') || player.id === a.id || player.id === b.id || bets.has(player.id)) return;
      if (this.state.players.some((p) => p.id === player.id)) bets.set(player.id, id.slice(4));
    });
    for (const p of this.state.players) if (p.isBot && p.id !== a.id && p.id !== b.id) bets.set(p.id, this.rng.next() < 0.5 ? a.id : b.id);
    let winners: string[];
    try {
      winners = await this.runMinigame([a, b], teams, title, true);
    } finally {
      offBets();
      this.duelBets = null;
      this.betsOpen = false;
    }
    if (winners.length === 1) {
      const right = [...bets].filter(([, pick]) => pick === winners[0]).map(([id]) => getPlayer(this.state, id));
      if (right.length) {
        for (const p of right) {
          addCoins(p, BET_COINS);
          this.coinBurst(p.id, BET_COINS);
        }
        this.scoreboard();
        await this.hud.banner('🔮 Apostas certas!', { sub: `${right.map((p) => p.name).join(', ')} ganha${right.length > 1 ? 'm' : ''} ${BET_COINS} 🪙`, hold: 1.6, color: '#b98cff' });
      }
    }
    this.stage.token(a.id).setAnim('idle');
    this.stage.token(b.id).setAnim('idle');
    if (winners.length !== 1) {
      await this.hud.banner('Empate!', { sub: 'Ninguém recua', hold: 1.6 });
      return null;
    }
    const winner = getPlayer(this.state, winners[0]!);
    const loser = winner.id === a.id ? b : a;
    const res = resolveDuel(this.state, winner, loser);
    this.scoreboard();
    this.stage.focus(loser.id);
    this.coinBurst(loser.id, -res.coins);
    this.coinBurst(winner.id, res.coins);
    this.stage.token(winner.id).setAnim('cheer');
    this.stage.token(loser.id).setAnim('sad');
    await this.hud.banner(`${winner.name} ganha o duelo!`, { sub: `${loser.name} dá ${res.coins} 🪙 e recua ${RULES.duelStepsBack} casas`, hold: 2, color: '#ffd23f' });
    await this.stage.hop(loser.id, res.loserTo, 0.6);
    await this.arrangeAll();
    this.stage.token(winner.id).setAnim('idle');
    this.stage.token(loser.id).setAnim('idle');
    return winner.id;
  }

  private async land(p: PartyPlayer): Promise<void> {
    const state = this.state;
    const seat = this.seat(p.id);
    const landing = resolveLanding(state, p, this.rng);
    const token = this.stage.token(p.id);
    const e = landing.effect;

    if (e.kind === 'coins') {
      const good = e.amount >= 0;
      this.stage.floatText(p.id, `${good ? '+' : ''}${e.amount} 🪙`, good ? '#ffd23f' : '#ff6b7a');
      this.coinBurst(p.id, e.amount);
      token.setAnim(good ? 'cheer' : 'sad');
      this.ctl.vibrate(seat, good ? 40 : [80, 60, 80]);
      if (landing.type === 'lucky') await this.hud.banner('Casa da sorte!', { sub: `+${e.amount} moedas`, hold: 1.4, color: '#25c26b' });
      else if (landing.type === 'unlucky') await this.hud.banner('Que azar!', { sub: `${e.amount} moedas`, hold: 1.4, color: '#b98cff' });
      else await this.wait(1.1);
    } else if (e.kind === 'give') {
      const to = getPlayer(state, e.to);
      this.coinBurst(p.id, -e.amount);
      this.coinBurst(to.id, e.amount);
      token.setAnim('sad');
      this.stage.token(to.id).setAnim('cheer');
      await this.hud.banner('Que azar!', { sub: `${p.name} dá ${e.amount} moedas a ${to.name}`, hold: 1.8, color: '#b98cff' });
      this.stage.token(to.id).setAnim('idle');
    } else if (e.kind === 'swap') {
      const other = getPlayer(state, e.with);
      await this.hud.banner('🌪️ Tornado!', { sub: `${p.name} troca de lugar com ${other.name}`, hold: 1.4, color: '#ffa41b' });
      await this.swapAnimation(p.id, other.id);
    } else if (e.kind === 'taxi') {
      await this.hud.banner('🚕 Táxi!', { sub: 'Uma boleia até perto da estrela', hold: 1.4, color: '#ffd23f' });
      await this.stage.travelTunnel(p.id, e.to, 'metro');
    } else if (e.kind === 'minecart') {
      await this.hud.banner('🛤️ Vagoneta!', { sub: `${p.name} apanha boleia pela mina`, hold: 1.3, color: '#ffa41b' });
      await this.stage.travelTunnel(p.id, e.to, 'cart');
      await this.arrangeAll();
    } else if (e.kind === 'ghost') {
      await this.ghost(p);
    } else if (e.kind === 'item') {
      const names = ['⚡ Turbo', '🎲 Dado Extra', '🧲 Íman', '🪤 Armadilha', '🎟️ Bilhete', '🪞 Espelho', '🐌 Preguiçoso'];
      const result = e.item ? `${ITEMS[e.item].emoji} ${ITEMS[e.item].name}` : '🪙 +5 moedas';
      const list = e.item ? names.map((n) => (n.startsWith(ITEMS[e.item!].emoji) ? result : n)) : [...names.slice(0, 6), result];
      const idx = Math.max(0, list.indexOf(result));
      await this.hud.roulette('🎁 Item grátis!', list, idx, 1.2);
      if (!e.item) this.coinBurst(p.id, e.coins);
      const shown = e.item ? this.stage.showPurchase(p.id, ITEMS[e.item].emoji) : Promise.resolve();
      if (!e.item) token.setAnim('cheer');
      await this.hud.banner(e.item ? `${p.name} ganhou: ${ITEMS[e.item].name}` : 'Inventário cheio: +5 moedas', { hold: 1.4 });
      await shown;
      this.stage.focus(p.id);
    } else if (e.kind === 'bank') {
      const name = state.board.bankName ?? 'Banco';
      this.stage.focus(p.id, true);
      await this.hud.banner(`🏦 ${name}`, { sub: e.amount ? `${p.name} leva o cofre todo: +${e.amount} 🪙!` : 'O cofre está vazio…', hold: 1.6, color: '#ffd23f' });
      if (e.amount) {
        token.setAnim('cheer');
        this.ctl.vibrate(seat, [40, 30, 40, 30, 160]);
        await this.stage.bankCoins(p.id, e.amount, false);
      } else token.setAnim('sad');
      this.stage.setBank(state.bank);
      await this.wait(0.6);
    } else if (e.kind === 'cannon') {
      const cannon = state.board.cannons.find((c) => c.spaceId === e.from);
      const volcano = state.board.theme === 'volcano';
      this.buzz(p.id, [200]);
      await this.hud.banner(`${volcano ? '💨' : '💥'} ${cannon?.name ?? 'Canhão'}!`, { sub: `${p.name} vai pelos ares!`, hold: 1.2, color: '#ff6b3d' });
      await this.stage.launch(p.id, e.from, e.to);
      this.buzz(p.id, [80, 40, 80]);
      await this.arrangeAll();
    } else if (e.kind === 'chest') {
      const result = e.item ? `${ITEMS[e.item].emoji} ${ITEMS[e.item].name}` : e.coins ? `+${e.coins} 🪙` : 'Vazio! 🕸️';
      await this.hud.banner('🧰 Baú do tesouro!', { sub: `Vamos ver o que tem…`, hold: 1, color: '#ffa41b' });
      await this.stage.openChest(p.id, result);
      if (e.coins) this.coinBurst(p.id, e.coins);
      token.setAnim(e.coins || e.item ? 'cheer' : 'sad');
      await this.hud.banner(e.item ? `${p.name} encontrou: ${ITEMS[e.item].name}` : e.coins ? `${p.name} encontrou ${e.coins} moedas!` : 'O baú estava vazio…', { hold: 1.4 });
    } else if (e.kind === 'rockfall') {
      this.buzz(p.id, [120, 50, 120, 50, 120]);
      await this.hud.banner('🪨 Derrocada!', { sub: `${p.name} perde ${e.coins} 🪙 e recua`, hold: 1.2, color: '#b0784a' });
      await this.stage.rockfall(p.id);
      this.coinBurst(p.id, -e.coins);
      await this.stage.hop(p.id, e.to, 0.6);
      token.setAnim('idle');
    } else if (e.kind === 'vs') {
      await this.vs(p);
    } else if (e.kind === 'villain') {
      this.buzz(p.id, [150, 60, 150]);
      const kinds = Object.keys(VILLAIN_LABELS) as (keyof typeof VILLAIN_LABELS)[];
      token.setAnim('dizzy');
      await this.hud.banner('😈 O Trapaceiro apareceu!', { sub: `Vamos ver que partida prega a ${p.name}…`, hold: 1.6, color: '#b98cff' });
      await this.hud.roulette('😈 Partida do Trapaceiro', kinds.map((k) => VILLAIN_LABELS[k]), kinds.indexOf(e.event.kind), 1.4);
      if (e.event.kind === 'shuffle') {
        this.stage.overview();
        await this.arrangeAll();
        await this.wait(1);
      } else if (e.event.kind === 'equalize') {
        for (const o of state.players) this.stage.floatText(o.id, `= ${o.coins} 🪙`, '#ffd23f');
        await this.wait(1.2);
      } else if (e.event.kind === 'loseCoins') {
        this.coinBurst(p.id, -e.event.amount);
        await this.wait(1);
      } else if (e.event.kind === 'payEveryone') {
        this.coinBurst(p.id, -e.event.each * (state.players.length - 1));
        await this.wait(1);
      } else if (e.event.kind === 'loseStar') {
        token.setAnim('sad');
        await this.wait(1.2);
      }
      token.setAnim('idle');
    } else {
      await this.wait(0.6);
    }
    if (landing.trap) {
      const owner = getPlayer(state, landing.trap.owner);
      this.stage.setTraps(state.traps);
      this.coinBurst(p.id, -landing.trap.amount);
      this.coinBurst(owner.id, landing.trap.amount);
      token.setAnim('dizzy');
      await this.hud.banner('🪤 Armadilha!', { sub: `${p.name} paga ${landing.trap.amount} 🪙 a ${owner.name}`, hold: 1.8, color: '#ff6b7a' });
      token.setAnim('idle');
    }
  }

  private async swapPlayers(a: PartyPlayer, b: PartyPlayer): Promise<void> {
    [a.spaceId, b.spaceId] = [b.spaceId, a.spaceId];
    await this.swapAnimation(a.id, b.id);
  }

  private async swapAnimation(a: string, b: string): Promise<void> {
    this.buzz(a, [40, 40, 40]);
    this.buzz(b, [40, 40, 40]);
    const ta = this.stage.token(a);
    const tb = this.stage.token(b);
    const pa = ta.root.position.clone();
    const pb = tb.root.position.clone();
    ta.setAnim('dizzy');
    tb.setAnim('dizzy');
    this.stage.overview();
    const ra = ta.root.rotation.y;
    const rb = tb.root.rotation.y;
    await this.engine.tween(2.2, (t) => {
      const lift = Math.sin(t * Math.PI) * 8;
      ta.root.position.lerpVectors(pa, pb, t).setY(pa.y + lift);
      tb.root.position.lerpVectors(pb, pa, t).setY(pb.y + lift);
      // Volta e meia suave durante a viagem (acelera e trava), em vez de rodar a cada imagem.
      const spin = (t * t * (3 - 2 * t)) * Math.PI * 3;
      ta.root.rotation.y = ra + spin;
      tb.root.rotation.y = rb - spin;
    });
    ta.setAnim('idle');
    tb.setAnim('idle');
    this.stage.focus(a);
  }

  private async vs(p: PartyPlayer): Promise<void> {
    const state = this.state;
    const { pot } = collectVs(state);
    for (const o of state.players) this.coinBurst(o.id, -RULES.vsStake);
    this.scoreboard();
    await this.hud.banner('⚔️ VS!', { sub: `${p.name} chamou todos! Cada um põe ${RULES.vsStake} 🪙 · pote de ${pot} 🪙`, hold: 2.4, color: '#ffd23f' });
    const teams: MinigameTeams = { mode: 'ffa', blue: state.players.map((o) => o.id), red: [] };
    const winners = await this.runMinigame(state.players, teams, '⚔️ VS: o pote é de quem ganhar');
    const got = awardVs(state, winners, pot);
    for (const [id, v] of got) this.coinBurst(id, v);
    this.scoreboard();
    await this.hud.banner(winners.length ? `${winners.map((id) => getPlayer(state, id).name).join(' e ')} leva${winners.length > 1 ? 'm' : ''} o pote!` : 'Ninguém ganhou — o pote perde-se!', { hold: 2 });
  }

  // ── Minijogos ───────────────────────────────────────────

  private async roundMinigame(): Promise<void> {
    const state = this.state;
    this.scoreboard();
    const teams = decideMinigameTeams(state, this.rng);
    this.waitAll('Minijogo! Olha para o ecrã 👀');
    this.stage.overview();
    await this.hud.banner('Minijogo!', { sub: MODE_LABEL[teams.mode], hold: 1.6, color: '#ffd23f' });
    const winners = await this.runMinigame(state.players, teams, null, false, true);
    // Todos contra todos: paga por lugar (10/3/2/0). Equipas e 1 contra 3: 10 a cada vencedor.
    const places = teams.mode === 'ffa' && winners.length ? this.lastPlaces : null;
    const awarded = awardMinigame(state, winners, places ?? undefined);
    const placeOf = new Map<string, number>();
    if (places) {
      let rank = 1;
      for (const g of places) {
        for (const id of g) placeOf.set(id, rank);
        rank += g.length;
      }
    }
    for (const id of winners) this.ctl.vibrate(this.seat(id), [80, 50, 80]);
    for (const p of state.players) {
      const win = winners.includes(p.id);
      this.ctl.setLayout(this.seat(p.id), {
        kind: 'info',
        title: win
          ? `🏆 Ganhaste! +${awarded.get(p.id) ?? 0} 🪙`
          : awarded.get(p.id)
            ? `${placeOf.get(p.id) ?? ''}.º lugar: +${awarded.get(p.id)} 🪙`
            : winners.length
              ? 'Desta vez não…'
              : 'Ninguém ganhou!',
        sub: 'Classificação depois do minijogo',
        stats: this.phoneStats(p.id),
        table: this.phoneTable(p.id, (o) => (winners.includes(o.id) ? '🏆' : undefined)),
        color: getCharacter(p.characterId).color,
      });
    }
    // Ecrã de resultados no cenário do minijogo: pódio, animações e as moedas a entrar.
    const showPlaces = this.lastPlaces ?? [state.players.map((p) => p.id)];
    const placeNum = new Map<string, number>();
    {
      let rank = 1;
      for (const g of showPlaces) {
        for (const id of g) placeNum.set(id, rank);
        rank += g.length;
      }
    }
    const run = this.resultsRun;
    this.resultsRun = null;
    if (run) {
      run.hideCharacters?.();
      this.hud.setScoreboard(null);
      this.hud.setRound(null);
      await ResultsStage.show(
        this.engine,
        run.scene,
        run.camera,
        state.players.map((p) => ({
          id: p.id,
          name: p.name,
          characterId: p.characterId,
          place: placeNum.get(p.id) ?? state.players.length,
          gained: awarded.get(p.id) ?? 0,
          total: p.coins,
        })),
        6.5,
      );
      run.dispose();
    }
    sound.music('board');
    this.engine.setStage(this.stage, false);
    this.hud.setRound(`Ronda ${state.round} / ${state.totalRounds}`);
    this.scoreboard();
    for (const p of state.players) this.stage.token(p.id).setAnim(winners.includes(p.id) ? 'cheer' : 'idle');
    await this.wait(1.2);
    for (const p of state.players) this.stage.token(p.id).setAnim('idle');
    await this.reorderByMinigame();
  }

  /**
   * Nova ordem de jogada: pela classificação no último minijogo (1.º joga primeiro). Empates mantêm a
   * ordem que tinham. Só a primeira ordem da festa é decidida pelos dados.
   */
  private async reorderByMinigame(): Promise<void> {
    const state = this.state;
    const places = this.lastPlaces;
    if (!places?.length || state.round >= state.totalRounds) return;
    const rankOf = new Map<string, number>();
    places.forEach((g, i) => g.forEach((id) => rankOf.set(id, i)));
    const before = [...state.players];
    state.players.sort((x, y) => (rankOf.get(x.id) ?? 99) - (rankOf.get(y.id) ?? 99) || before.indexOf(x) - before.indexOf(y));
    if (state.players.every((p, i) => p === before[i])) return;
    this.scoreboard();
    this.hud.panel(`
      <h1>Nova ordem de jogada</h1>
      <h2>Pela classificação no minijogo</h2>
      <div class="rows">${state.players
        .map(
          (p, i) => `<div class="row" style="animation-delay:${i * 0.08}s">
            <span>${i + 1}.</span><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>
            <span>${esc(p.name)}</span><span></span><span></span></div>`,
        )
        .join('')}</div>`);
    await this.wait(2.8);
    this.hud.panel(null);
  }

  /**
   * Corre um minijogo com estes jogadores e devolve os vencedores.
   * `title` aparece no topo do ecrã de apresentação (duelos/VS).
   */
  /** O último minijogo, guardado para o ecrã de resultados se montar no cenário dele. */
  private resultsRun: MinigameRun | null = null;

  private async runMinigame(players: PartyPlayer[], teams: MinigameTeams, title: string | null, duel = false, keepScene = false): Promise<string[]> {
    let finalRun: MinigameRun | null = null;
    const def =
      MINIGAMES.find((m) => m.id === this.d.forcedMinigame && m.modes.includes(teams.mode) && (duel || players.length === 2 || !m.duel)) ??
      (duel ? pickDuel(this.rng, this.lastMinigame, this.playedMinigames) : pickMinigame(teams.mode, this.rng, this.lastMinigame, this.playedMinigames));
    this.lastMinigame = def.id;
    this.playedMinigames.add(def.id);
    const teamOf = (id: string): MinigameSeat['team'] => (teams.mode === 'ffa' ? null : teams.blue.includes(id) ? 'blue' : 'red');
    const mgSeats: MinigameSeat[] = players.map((p) => ({ id: p.id, name: p.name, characterId: p.characterId, team: teamOf(p.id) }));
    const ids = new Set(players.map((p) => p.id));

    const chip = (id: string) => {
      const p = getPlayer(this.state, id);
      return `<span class="chip"><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>${esc(p.name)}</span>`;
    };
    const teamsHtml =
      teams.mode === 'ffa'
        ? `<div class="teams"><div class="team ffa">${teams.blue.map(chip).join('')}</div></div>`
        : `<div class="teams"><div class="team blue">${teams.blue.map(chip).join('')}</div><div class="vs">VS</div><div class="team red">${teams.red.map(chip).join('')}</div></div>`;
    const INTRO = 7;
    this.hud.panel(`
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <h1>${esc(def.name)}</h1>
      <h2>${players.length === 2 ? '1 contra 1' : MODE_LABEL[teams.mode]}</h2>
      ${teamsHtml}
      ${settings.value.narrator ? '' : `<p>${esc(def.description(teams.mode))}</p>`}
      <div class="controls-list">${def.controls
        .split('·')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => `<div class="ctrl">${esc(c)}</div>`)
        .join('')}</div>
      <div class="timerbar"><div style="animation-duration:${INTRO}s"></div></div>`);
    for (const s of this.d.seats) {
      if (!ids.has(s.id))
        this.ctl.setLayout(s, {
          kind: 'info',
          title: `A ver: ${def.name}`,
          sub: duel ? `Duelo: ${players.map((p) => p.name).join(' vs ')} · aposta e ganha ${BET_COINS} 🪙 se acertares` : undefined,
          stats: this.phoneStats(s.id),
          ask: duel
            ? { prompt: 'Quem ganha o duelo?', options: players.map((p) => ({ id: `bet:${p.id}`, label: p.name, color: getCharacter(p.characterId).color })) }
            : undefined,
          table: this.phoneTable(s.id),
          color: getCharacter(s.characterId).color,
        });
      else
        this.ctl.setLayout(s, {
          kind: 'gamepad',
          stick: def.stick,
          buttons: def.buttons,
          hint: teams.mode === 'ffa' ? def.name : `${def.name} · equipa ${teamOf(s.id) === 'blue' ? '🔵 azul' : '🔴 vermelha'}`,
        });
    }
    const intro = [
      `${title ? `${title.replace(/[^\p{L}\p{N}!?\s]/gu, '').trim()} ` : ''}${def.name}! ${players.length === 2 ? 'Um contra um.' : MODE_LABEL[teams.mode] + '.'}`,
      def.description(teams.mode),
      `Controlos: ${def.controls}.`,
    ];
    await Promise.all([this.wait(3), narrator.say(intro)]);
    this.hud.panel(null);
    // As apostas fecham antes de o jogo começar: quem está de fora vê em quem apostou.
    if (duel && this.betsOpen) {
      this.betsOpen = false;
      for (const s of this.d.seats) {
        if (ids.has(s.id)) continue;
        const pick = this.duelBets?.get(s.id);
        const who = players.find((p) => p.id === pick);
        this.ctl.setLayout(s, {
          kind: 'info',
          title: `A ver: ${def.name}`,
          sub: who ? `🔒 Apostas fechadas · apostaste em ${who.name}` : '🔒 Apostas fechadas · não apostaste',
          stats: this.phoneStats(s.id),
          ask: who ? { prompt: 'A tua aposta', options: [{ id: `bet:${who.id}`, label: who.name, color: getCharacter(who.characterId).color }], chosen: `bet:${who.id}` } : undefined,
          table: this.phoneTable(s.id),
          color: getCharacter(s.characterId).color,
        });
      }
    }

    const ctx: MinigameContext = {
      engine: this.engine,
      mode: teams.mode,
      seats: mgSeats,
      rng: this.rng,
      pad: (id) => this.ctl.pad(this.seat(id)),
      botPad: (id) => this.seat(id).botPad,
      isBot: (id) => this.ctl.needsBot(this.seat(id)),
      vibrate: (id, ms) => this.ctl.vibrate(this.seat(id), ms),
      botSkill: settings.botSkill,
      theme: this.state.board.theme as Theme,
    };
    this.boardWatchers.clear();
    await loadProps(MINIGAME_PROPS);
    // Vários rounds (melhor de N): ganha quem ganhar mais rondas.
    const totalRounds = def.rounds ?? 1;
    const roundWins = new Map<string, number>();
    /** Soma dos lugares de cada um nas rondas (desempata quem ganhou as mesmas rondas). */
    const placeSum = new Map<string, number>();
    const winsTag = (id: string) => (totalRounds > 1 && roundWins.get(id) ? ` 🏆${roundWins.get(id)}` : '');
    sound.music('minigame');
    // Empate no fim das rondas (no topo há gente de lados diferentes, ou ninguém ganhou nada)?
    // Joga-se uma ronda de desempate (até 2).
    const tied = () => {
      const best = Math.max(0, ...roundWins.values());
      if (best === 0) return true;
      const top = players.filter((p) => roundWins.get(p.id) === best);
      return new Set(top.map((p) => (teams.mode === 'ffa' ? p.id : teamOf(p.id)))).size > 1;
    };
    const MAX_TIEBREAKS = 2;
    await this.practice(def, ctx);
    for (let round = 1; round <= totalRounds || (totalRounds > 1 && round <= totalRounds + MAX_TIEBREAKS && tied()); round++) {
      const tiebreak = round > totalRounds;
      for (const s of this.d.seats) s.botPad.reset();
      this.d.hub.clearPresses();
      ctx.round = round;
      ctx.rounds = totalRounds;
      finalRun?.dispose();
      finalRun = null;
      const run = def.create(ctx);
      this.engine.setStage(run, false);
      const updateHud = () => {
        const scores = new Map(run.scores().map((sc) => [sc.id, sc.value]));
        this.hud.setRound(`${tiebreak ? 'Desempate · ' : totalRounds > 1 ? `Ronda ${round}/${totalRounds} · ` : ''}⏱ ${Math.ceil(run.timeLeft())}`);
        // Em minijogos de várias rondas, ordena por rondas ganhas e depois pela classificação da festa.
        const order = ranking(this.state).map((r) => r.player.id);
        const sorted = [...players].sort((a, b) => (roundWins.get(b.id) ?? 0) - (roundWins.get(a.id) ?? 0) || order.indexOf(a.id) - order.indexOf(b.id));
        this.hud.setScoreboard(
          sorted.map((p, i) => ({
            rank: totalRounds > 1 && roundWins.size ? i + 1 - sorted.slice(0, i).filter((o) => (roundWins.get(o.id) ?? 0) === (roundWins.get(p.id) ?? 0)).length : undefined,
            characterId: p.characterId,
            id: p.id,
            name: p.name,
            color: getCharacter(p.characterId).color,
            coins: p.coins,
            stars: p.stars,
            active: false,
            isBot: p.isBot,
            connected: true,
            tag: `${scores.get(p.id) ?? ''}${winsTag(p.id)}`,
          })),
        );
      };
      updateHud();
      if (tiebreak) await this.hud.banner('Desempate!', { sub: 'Quem ganhar esta ronda leva o minijogo', hold: 1.4, color: '#ff6b7a' });
      else if (totalRounds > 1) await this.hud.big(`Ronda ${round}`, 1);
      if (!def.noCountdown) for (const n of ['3', '2', '1']) await this.hud.big(n, 0.8);
      run.start();
      if (!def.noCountdown) {
        for (const p of players) this.buzz(p.id, 120); // «Já!»
        void this.hud.big('JÁ!', 0.6);
      }
      while (!run.finished) {
        updateHud();
        await this.wait(0.2);
      }
      updateHud();
      const roundWinners = run.winners();
      for (const id of roundWinners) roundWins.set(id, (roundWins.get(id) ?? 0) + 1);
      // Lugares desta ronda (todos contra todos: os do minijogo; equipas: quem ganhou e os outros).
      const ids = players.map((p) => p.id);
      const roundRank = teams.mode === 'ffa' && run.ranking ? run.ranking() : rankWinners(ids, roundWinners);
      let pos = 1;
      for (const g of roundRank) {
        for (const id of g) placeSum.set(id, (placeSum.get(id) ?? 0) + pos);
        pos += g.length;
      }
      updateHud();
      if (totalRounds > 1) {
        const names = roundWinners.map((id) => getPlayer(this.state, id).name);
        await this.hud.banner(round >= totalRounds && !tied() ? 'FIM!' : tiebreak ? 'Fim do desempate' : `Fim da ronda ${round}`, {
          sub: names.length ? `🏆 ${names.join(', ')}` : 'Ninguém ganhou esta ronda',
          hold: 1.6,
          color: '#ffd23f',
        });
      } else await this.hud.big('FIM!', 1.4);
      finalRun = run;
      // Já não há como apanhar o primeiro? Acaba mais cedo.
      const counts = [...roundWins.values()].sort((a, b) => b - a);
      const left = totalRounds - round;
      if (totalRounds > 1 && (counts[0] ?? 0) > (counts[1] ?? 0) + left) break;
    }
    this.waitAll('Fim do minijogo!');
    const best = Math.max(0, ...roundWins.values());
    const winners = best > 0 ? players.filter((p) => roundWins.get(p.id) === best).map((p) => p.id) : [];
    // Lugares finais (prémio por lugar e ordem de jogada): quem ganhou primeiro; depois mais rondas
    // ganhas; empates desfeitos pelos lugares em cada ronda (soma mais baixa = melhor).
    {
      const ids = players.map((p) => p.id);
      const key = (id: string) => (winners.includes(id) ? 1e6 : 0) + (roundWins.get(id) ?? 0) * 1000 - (placeSum.get(id) ?? 0);
      this.lastPlaces = rankBy(ids, key);
    }
    sound.play(winners.length ? 'cheer' : 'aww');
    if (keepScene && finalRun) {
      // Fica o cenário do minijogo para o ecrã de resultados (quem chamou mostra-o e volta ao tabuleiro).
      this.resultsRun = finalRun;
      return winners;
    }
    finalRun?.dispose();
    sound.music('board');
    this.engine.setStage(this.stage, false);
    this.hud.setRound(`Ronda ${this.state.round} / ${this.state.totalRounds}`);
    this.scoreboard();
    return winners;
  }

  // ── Final ───────────────────────────────────────────────

  async finale(state: PartyState): Promise<void> {
    this.d.menu.mode = 'off';
    this.waitAll('Fim da festa! Olha para o ecrã 👀');
    this.hud.setScoreboard(null);
    await this.hud.banner('Fim da festa!', { sub: 'Hora das estrelas bónus…', hold: 2.4, color: '#ffd23f' });

    // Cerimónia: cada estrela bónus entregue em palco
    const ceremony = new ShowcaseStage();
    this.engine.setStage(ceremony);
    ceremony.view({ distance: 11, height: 3.5, orbitSpeed: 0.05 });
    // Com suspense: todos em palco, os números aparecem um a um, rufar de tambores e só depois
    // a estrela desce para quem ganhou (os outros apagam-se). O título fica no topo.
    const everyone = [...state.players];
    const UNITS: Record<string, string> = { minigame: '🪙', rich: '🪙', shopper: '🪙', event: 'casas', unlucky: 'casas', blue: 'casas', walker: 'casas', stroll: 'casas', items: 'itens', duel: 'duelos' };
    for (const bonus of bonusStars(state, this.rng)) {
      const winners = bonus.winners.map((id) => getPlayer(state, id));
      const pool = BONUS_POOL.find((b) => b.id === bonus.id);
      const shown = (p: PartyPlayer) => (bonus.id === 'stroll' ? p.stats.steps : (pool?.value(p) ?? 0));
      ceremony.setLineup(everyone.map((p) => ({ key: p.id, characterId: p.characterId, label: p.name, labelColor: '#ffffff' })));
      for (const p of everyone) {
        ceremony.setFaded(p.id, false);
        ceremony.setAnim(p.id, 'idle');
      }
      sound.play('banner');
      this.hud.headline(`⭐ ${bonus.title}`, { sub: bonus.description, color: '#ffd23f' });
      await this.wait(2.2);
      // Os números de cada um, um de cada vez.
      for (const p of everyone) {
        ceremony.setLabel(p.id, '…', '#ffffff');
        sound.play('tick');
        await this.wait(0.55);
        ceremony.setLabel(p.id, `${shown(p)} ${UNITS[bonus.id] ?? ''}`.trim(), '#ffd23f');
        sound.play('beep', { vol: 0.4 });
        await this.wait(0.65);
      }
      // Rufar: tiques cada vez mais depressa.
      this.hud.headline(`⭐ ${bonus.title}`, { sub: 'E a estrela vai para…', color: '#ffd23f' });
      for (let i = 0; i < 14; i++) {
        sound.play('tick', { pitch: 1 + i * 0.04 });
        await this.wait(0.22 - i * 0.012);
      }
      // Revelação: os outros apagam-se e a estrela desce para quem ganhou.
      for (const p of everyone) if (!bonus.winners.includes(p.id)) ceremony.setFaded(p.id, true);
      const spots = winners.map((w) => ceremony.positionOf(w.id) ?? new THREE.Vector3());
      const stars = winners.map(() => starMesh(0.7));
      stars.forEach((s) => ceremony.scene.add(s));
      await this.engine.tween(1.4, (k) => {
        stars.forEach((s, i) => {
          const at = spots[i]!;
          s.position.set(at.x, 12 - k * 8.5, at.z);
          s.rotation.y = k * 10;
        });
      });
      applyBonusStars(state, [bonus]);
      sound.play('win');
      for (const w of winners) {
        ceremony.setAnim(w.id, 'cheer');
        ceremony.setLabel(w.id, `${w.name} +1 ⭐`, '#ffd23f');
      }
      stars.forEach((s) => ceremony.scene.remove(s));
      this.hud.headline(winners.map((w) => w.name).join(' e '), { sub: `${bonus.title} · +1 ⭐`, color: '#ffd23f' });
      await this.wait(2.6);
    }
    this.hud.headline(null);
    ceremony.dispose();

    const ranked = ranking(state);
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.showPodium(ranked.map((r) => ({ key: r.player.id, characterId: r.player.characterId, rank: r.rank, name: r.player.name })));
    const winners = ranked.filter((r) => r.rank === 1).map((r) => r.player.name);
    await this.hud.banner(winners.length > 1 ? `${winners.join(' e ')} empatam!` : `${winners[0]} é a estrela da festa!`, { hold: 3, color: '#ffd23f' });
    this.hud.panel(`
      <h1>Classificação</h1>
      <div class="rows">${ranked
        .map(
          (r, i) => `<div class="row ${r.rank === 1 ? 'win' : ''}" style="animation-delay:${i * 0.07}s">
            <span>${r.rank}.</span><span class="dot" style="background:${getCharacter(r.player.characterId).color}"></span>
            <span>${esc(r.player.name)}</span><span>⭐ ${r.player.stars}</span><span>🪙 ${r.player.coins}</span></div>`,
        )
        .join('')}</div>`);
    const panel = this.hud.panelElement();
    panel.classList.add('compact');
    for (const r of ranked)
      this.ctl.setLayout(this.seat(r.player.id), {
        kind: 'info',
        title: r.rank === 1 ? '👑 Ganhaste a festa!' : `Ficaste em ${r.rank}.º lugar`,
        sub: `${r.player.stars} ⭐ · ${r.player.coins} 🪙`,
        stats: [
          { icon: '🎮', label: 'Moedas em minijogos', value: String(r.player.stats.minigameCoins) },
          { icon: '💰', label: 'Mais moedas', value: String(r.player.stats.maxCoins) },
          { icon: '❗', label: 'Casas especiais', value: String(r.player.stats.eventSpaces) },
          { icon: '🔴', label: 'Casas vermelhas', value: String(r.player.stats.redSpaces) },
        ],
        table: { title: 'Classificação final', rows: ranked.map((o) => ({ name: o.player.name, color: getCharacter(o.player.characterId).color, value: `⭐ ${o.player.stars} · 🪙 ${o.player.coins}`, me: o.player.id === r.player.id || undefined })) },
        color: getCharacter(r.player.characterId).color,
      });
    const vip = this.d.hub.vip;
    if (vip) this.d.hub.setLayout({ kind: 'pad', title: 'Obrigado por jogares!', sub: 'Escolhe no ecrã grande', stick: 'dpad', buttons: { a: 'Escolher' } }, vip);
    await this.ctl.menus.ask({ player: vip ?? null, keyboard: true, corner: true, title: 'Fim da festa', options: [{ id: 'lobby', label: '↩ Voltar ao menu principal' }] });
    panel.classList.remove('compact');
    this.hud.panel(null);
    this.hud.hint(null);
  }

  /** Desenvolvimento: só o minijogo de ronda, em ciclo (usado por /?minigame=…). */
  async minigameLoop(boardId: string, colors: ('blue' | 'red')[]): Promise<void> {
    this.state = createParty(
      createBoard(boardId),
      this.d.seats.map((s) => ({ id: s.id, name: s.name, characterId: s.characterId, isBot: s.isBot })),
      1,
      this.rng,
    );
    this.state.players.forEach((p, i) => (p.color = colors[i] ?? 'blue'));
    await loadProps(THEME_PROPS[this.state.board.theme] ?? []);
    this.stage = new BoardStage(this.engine, this.state.board, this.d.seats);
    this.engine.setStage(this.stage);
    for (;;) await this.roundMinigame();
  }

  /** Modo de testes: joga um minijogo escolhido (no modo escolhido) e mostra quem ganhou. */
  async testMinigame(id: string, mode: MinigameMode): Promise<void> {
    if (!this.state) await this.minigameSetup('ilha');
    const def = MINIGAMES.find((m) => m.id === id)!;
    this.d.forcedMinigame = id;
    let winners: string[];
    if (def.duel) {
      const [a, b] = this.state.players as [PartyPlayer, PartyPlayer];
      winners = await this.runMinigame([a, b], { mode: 'ffa', blue: [a.id, b.id], red: [] }, '⚔️ Duelo!', true);
    } else {
      const ids = this.state.players.map((p) => p.id);
      const teams: MinigameTeams =
        mode === 'ffa'
          ? { mode, blue: ids, red: [] }
          : mode === 'oneVsAll'
            ? { mode, blue: [ids[0]!], red: ids.slice(1) }
            : { mode, blue: ids.filter((_, i) => i % 2 === 0), red: ids.filter((_, i) => i % 2 === 1) };
      winners = await this.runMinigame(this.state.players, teams, null);
    }
    const names = winners.map((w) => getPlayer(this.state, w).name);
    await this.hud.banner(names.length ? `Ganhou: ${names.join(', ')}` : 'Ninguém ganhou', { sub: def.name, hold: 2, color: '#ffd23f' });
  }

  /**
   * Treino (como no Mario Party): antes de contar, o minijogo corre uns segundos a fingir para todos
   * experimentarem os comandos. Acaba ao fim de 12 s, quando alguém carregar em − (ou Enter/Espaço
   * no PC) ou se o minijogo acabar sozinho. Nada do que acontece conta.
   */
  private async practice(def: MinigameDef, ctx: MinigameContext): Promise<void> {
    const humans = ctx.seats.filter((s) => !ctx.isBot(s.id));
    if (!humans.length) return; // só bots: não há nada para treinar
    for (const s of this.d.seats) s.botPad.reset();
    this.d.hub.clearPresses();
    const run = def.create({ ...ctx, round: 1, rounds: 1 });
    this.engine.setStage(run, false);
    let skip = false;
    const off = this.d.hub.events.on('press', ({ button }) => {
      if (button === 'minus') skip = true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') skip = true;
    };
    window.addEventListener('keydown', onKey);
    this.hud.setRound('🏋️ TREINO · − para começar a sério');
    void this.hud.big('Treino!', 0.9);
    run.start();
    const LIMIT = 12;
    let t = 0;
    while (!skip && !run.finished && t < LIMIT) {
      await this.wait(0.2);
      t += 0.2;
      this.hud.setRound(`🏋️ TREINO · ${Math.ceil(LIMIT - t)} s · − para começar a sério`);
    }
    off();
    window.removeEventListener('keydown', onKey);
    run.dispose();
    this.hud.setRound(null);
    await this.hud.banner('Agora a sério!', { hold: 1.1, color: '#ffd23f' });
  }

  /** Desenvolvimento: duelos seguidos entre os dois primeiros jogadores. */
  async duelLoop(boardId: string): Promise<void> {
    await this.minigameSetup(boardId);
    const [a, b] = this.state.players as [PartyPlayer, PartyPlayer];
    for (;;) await this.duel(a, b, '⚔️ Duelo!');
  }

  private async minigameSetup(boardId: string): Promise<void> {
    this.state = createParty(
      createBoard(boardId),
      this.d.seats.map((s) => ({ id: s.id, name: s.name, characterId: s.characterId, isBot: s.isBot })),
      1,
      this.rng,
    );
    await loadProps(THEME_PROPS[this.state.board.theme] ?? []);
    this.stage = new BoardStage(this.engine, this.state.board, this.d.seats);
    this.engine.setStage(this.stage);
    await this.arrangeAll();
  }
}
