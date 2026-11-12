/**
 * O Realizador: conduz tudo, do menu principal ao fim de cada jogo, encadeando regras
 * (@festa/game), palcos 3D, interface (Hud, menus no ecrã) e comandos (Seats).
 *
 *   menu principal (cada um escolhe a personagem ao entrar) → Festa ou Desportos
 *   → Festa: mapa, rondas e bots → rondas → estrelas bónus → pódio → menu principal
 *   → Desportos: escolher desporto → jogar → outra vez / outro / menu principal
 */
import { sound } from '../audio/Sound';
import { narrator } from '../audio/Narrator';
import { THEME_PROPS, loadProps } from '../three/props';
import QRCode from 'qrcode';
import * as THREE from 'three';
import { BOARDS, CHARACTERS, RULES, createRng, getCharacter, seatCount, type MinigameMode, type Rng } from '@festa/game';
import { MAX_PLAYERS } from '@festa/shared';
import type { HostConnection } from '../HostConnection';
import type { HubPlayer, PlayerHub } from '../PlayerHub';
import { cycleLanAddress, getJoinBaseUrl, getJoinUrl, isOnline } from '../joinUrl';
import type { Engine } from '../three/Engine';
import { ShowcaseStage } from '../stages/ShowcaseStage';
import { Hud, esc } from '../ui/Hud';
import type { MenuRequest, ScreenMenus } from '../ui/ScreenMenu';
import { MINIGAMES } from '../minigames';
import { SPORTS } from '../sports';
import type { SportDef } from '../sports/types';
import type { GameMenu } from '../ui/GameMenu';
import { BOT_LEVELS, settings } from './Settings';
import { BotPad, SeatControl, type Seat } from './Seats';
import { PartyFlow } from './PartyFlow';

type LobbyChoice = { mode: 'party'; rounds: number; boardId: string } | { mode: 'sports'; sport: SportDef };

const BOARD_ICON: Record<string, string> = { city: '🌃', volcano: '🌋', castle: '🏰', park: '🎡', island: '🏝️' };

export class Director {
  private readonly seatsCtl: SeatControl;
  private seats: Seat[] = [];
  private rng: Rng = createRng();
  private lastMinigame: string | null = null;
  private forcedMinigame: string | null = null;
  /** Personagem de cada jogador (escolhida ao entrar; fica até sair da sala). */
  private readonly picks = new Map<string, { char: string; ready: boolean }>();
  private lastRounds: number = RULES.roundOptions[1];
  private lastBoard = BOARDS[0]!.id;

  constructor(
    private readonly engine: Engine,
    private readonly hud: Hud,
    private readonly hub: PlayerHub,
    private readonly conn: HostConnection,
    private readonly menu: GameMenu,
    private readonly menus: ScreenMenus,
  ) {
    this.seatsCtl = new SeatControl(hub, engine, menus);
    conn.events.on('status', (s) =>
      this.hud.status(s === 'online' ? null : s === 'connecting' ? 'A ligar ao servidor…' : 'Sem ligação ao servidor'),
    );
  }

  async run(): Promise<void> {
    for (;;) {
      sound.music('lobby');
      const choice = await this.lobby();
      if (choice.mode === 'sports') {
        await this.sports(choice.sport);
        continue;
      }
      await this.buildSeats(seatCount);
      this.rng = createRng();
      const flow = this.partyFlow();
      sound.music('board');
      const state = await flow.play(choice.rounds, choice.boardId);
      sound.music('finale');
      await flow.finale(state);
    }
  }

  /** Última festa (para depurar na consola: `festa.director.flow`). */
  flow: PartyFlow | null = null;

  private partyFlow(): PartyFlow {
    return (this.flow = new PartyFlow({
      engine: this.engine,
      hud: this.hud,
      hub: this.hub,
      seatsCtl: this.seatsCtl,
      seats: this.seats,
      rng: this.rng,
      menu: this.menu,
      forcedMinigame: this.forcedMinigame,
    }));
  }

  /** Quem escolhe nos menus: o VIP (telemóvel) ou o primeiro jogador de teclado. */
  private get leader(): HubPlayer | null {
    return this.hub.vip ?? this.hub.players[0] ?? null;
  }

  // ── Menu principal ──────────────────────────────────────

  private async lobby(): Promise<LobbyChoice> {
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.view({ distance: 9.5, height: 2.6, orbitSpeed: 0, target: new THREE.Vector3(0, 1.3, -2.2) });
    this.conn.setLocked(false);
    this.menu.mode = 'lobby';
    this.hud.setRound(null);
    this.hud.setScoreboard(null);
    this.hud.panel(null);
    this.hud.hint(null);

    const ui = document.createElement('div');
    ui.className = 'lobby-ui';
    ui.innerHTML = `
      <div class="lobby-logo">FESTA <span>🎉</span></div>
      <div class="lobby-join">
        <canvas id="qr" width="220" height="220"></canvas>
        <div class="lobby-join-text">
          <div class="label" id="join-label">Entra com o telemóvel</div>
          <div class="code" id="code">····</div>
          <div class="url" id="url"></div>
          <div class="tip" id="join-tip"></div>
          <button class="go-online" id="go-online" hidden>🌍 Jogar online</button>
        </div>
      </div>
      <div class="lobby-cards" id="cards"></div>
      <div class="lobby-help" id="help"></div>
      <button class="lobby-quit" id="lobby-quit" hidden>🚪 Sair do jogo</button>`;
    document.getElementById('ui')!.appendChild(ui);

    // Sair logo no ecrã inicial (só na app de computador): carrega duas vezes para confirmar.
    {
      const app = (window as unknown as { festaDesktop?: { quit(): Promise<void> } }).festaDesktop;
      const quitBtn = ui.querySelector<HTMLButtonElement>('#lobby-quit')!;
      if (app) {
        quitBtn.hidden = false;
        let armed = 0;
        quitBtn.addEventListener('click', () => {
          if (Date.now() - armed < 4000) {
            quitBtn.textContent = '👋 Até à próxima!';
            void app.quit();
            return;
          }
          armed = Date.now();
          quitBtn.textContent = '🚪 Carrega outra vez para sair';
          quitBtn.classList.add('armed');
          setTimeout(() => {
            if (Date.now() - armed >= 4000) {
              quitBtn.textContent = '🚪 Sair do jogo';
              quitBtn.classList.remove('armed');
            }
          }, 4100);
        });
      }
    }

    const renderRoom = async () => {
      const code = this.conn.roomCode;
      if (!code) return;
      const [url, base, online] = await Promise.all([getJoinUrl(code), getJoinBaseUrl(), isOnline()]);
      const canvas = ui.querySelector<HTMLCanvasElement>('#qr');
      if (!canvas) return;
      if (canvas.dataset.url === url) return;
      canvas.dataset.url = url;
      ui.querySelector('#code')!.textContent = code;
      ui.querySelector('#url')!.textContent = `${base.replace(/^https?:\/\//, '')}/play`;
      ui.querySelector('#join-label')!.textContent = online ? '🌍 Online · entra em casa ou fora' : 'Entra com o telemóvel';
      ui.querySelector('#join-tip')!.innerHTML = online
        ? `📺 Quem está fora vê o ecrã em <b>${esc(base.replace(/^https?:\/\//, ''))}/ver</b> (partilha o ecrã com a tecla <b>V</b>).`
        : '📱 Android: se não abrir, dá ao Chrome a permissão <b>Dispositivos próximos</b>. Aviso de ligação não privada? <b>Avançadas → Continuar</b>.';
      await QRCode.toCanvas(canvas, url, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
    };

    const players = () => this.hub.players.slice(0, MAX_PLAYERS);
    const takenBy = (charId: string, except: string) => [...this.picks].some(([id, p]) => id !== except && p.ready && p.char === charId && players().some((x) => x.id === id));
    const ensurePicks = () => {
      for (const id of [...this.picks.keys()]) if (!this.hub.get(id)) this.picks.delete(id);
      for (const p of players()) {
        if (this.picks.has(p.id)) continue;
        const used = new Set([...this.picks.values()].map((x) => x.char));
        const free = CHARACTERS.find((c) => !used.has(c.id)) ?? CHARACTERS[0]!;
        this.picks.set(p.id, { char: free.id, ready: false });
      }
    };
    const allReady = () => players().length > 0 && players().every((p) => this.picks.get(p.id)?.ready || !p.connected);

    let mainMenu: MenuRequest | null = null;
    const render = () => {
      ensurePicks();
      const list = players();
      stage.setLineup(
        list.map((p) => {
          const pick = this.picks.get(p.id)!;
          return { key: p.id, characterId: pick.char, label: `${p.isVip ? '⭐ ' : ''}${p.name}`, labelColor: pick.ready ? '#ffd23f' : '#ffffff' };
        }),
      );
      for (const p of list) {
        const pick = this.picks.get(p.id)!;
        stage.setAnim(p.id, pick.ready ? 'cheer' : 'idle');
        stage.setFaded(p.id, !p.connected);
      }
      ui.querySelector('#cards')!.innerHTML = list
        .map((p) => {
          const pick = this.picks.get(p.id)!;
          const c = getCharacter(pick.char);
          const clash = !pick.ready && takenBy(pick.char, p.id);
          return `<div class="lcard ${pick.ready ? 'ready' : ''}" style="--c:${c.color}">
            <div class="lname">${p.isVip ? '⭐ ' : ''}${esc(p.name)}</div>
            <div class="lchar">${pick.ready ? '' : '◀ '}${esc(c.name)}${pick.ready ? '' : ' ▶'}</div>
            <div class="lstate">${pick.ready ? '✔ Pronto' : clash ? 'Já escolhida' : 'Ⓐ Pronto'}</div>
          </div>`;
        })
        .join('');
      const humans = list.length;
      const bots = humans ? seatCount(humans) - humans : 0;
      const waiting = list.filter((p) => !this.picks.get(p.id)?.ready && p.connected).map((p) => p.name);
      ui.querySelector('#help')!.textContent = !humans
        ? 'Lê o código com o telemóvel para entrar!'
        : waiting.length
          ? `◀ ▶ escolhe a personagem · Ⓐ pronto · À espera de ${waiting.join(', ')}`
          : `Todos prontos! ${this.leader ? `${this.leader.name} escolhe o modo` : 'Enter para escolher'}${bots ? ` · na Festa entram ${bots} bot${bots > 1 ? 's' : ''}` : ''}`;
      // Comandos
      for (const p of list) {
        const pick = this.picks.get(p.id)!;
        const c = getCharacter(pick.char);
        const lead = p === this.leader && allReady();
        this.hub.setLayout(
          pick.ready
            ? {
                kind: 'pad',
                color: c.color,
                title: `Pronto com ${c.name}! ✔`,
                sub: lead ? 'Escolhe o modo no ecrã grande' : allReady() ? `${this.leader?.name ?? 'O VIP'} escolhe o modo…` : 'À espera dos outros…',
                stick: 'dpad',
                buttons: { a: lead ? 'Escolher' : undefined, b: lead ? undefined : 'Mudar', plus: 'Definições' },
              }
            : {
                kind: 'pad',
                color: c.color,
                title: 'Escolhe a tua personagem',
                sub: `◀ ${c.name} ▶`,
                stick: 'dpad',
                buttons: { a: 'Pronto!', plus: 'Definições' },
              },
          p,
        );
      }
      // Menu principal só com todos prontos.
      if (mainMenu && !allReady()) {
        this.menus.cancel(mainMenu);
        mainMenu = null;
      }
    };

    const cycle = (p: HubPlayer, d: number, feedback = true) => {
      const pick = this.picks.get(p.id);
      if (!pick || pick.ready) return;
      let i = CHARACTERS.findIndex((c) => c.id === pick.char);
      for (let k = 0; k < CHARACTERS.length; k++) {
        i = (i + d + CHARACTERS.length) % CHARACTERS.length;
        if (!takenBy(CHARACTERS[i]!.id, p.id)) break;
      }
      pick.char = CHARACTERS[i]!.id;
      if (feedback) {
        sound.play('tick');
        this.hub.vibrate(p, 10);
      }
      render();
    };

    // Na app de computador: botão «Jogar online» (abre o túnel da Cloudflare).
    const desktop = (window as unknown as { festaDesktop?: { goOnline(): Promise<{ url?: string; error?: string }> } }).festaDesktop;
    const onlineBtn = ui.querySelector<HTMLButtonElement>('#go-online')!;
    const goOnline = async () => {
      if (!desktop || onlineBtn.disabled) return;
      onlineBtn.disabled = true;
      onlineBtn.textContent = '🌍 A abrir o túnel…';
      const res = await desktop.goOnline();
      if (res.url) {
        onlineBtn.hidden = true;
        void renderRoom();
      } else {
        onlineBtn.disabled = false;
        onlineBtn.textContent = '🌍 Tentar outra vez';
        ui.querySelector('#join-tip')!.textContent = `⚠ ${res.error ?? 'Não deu para abrir o túnel.'}`;
      }
    };
    if (desktop) {
      void isOnline().then((on) => (onlineBtn.hidden = on));
      onlineBtn.addEventListener('click', () => void goOnline());
    }

    // O link público pode chegar depois (túnel a abrir): verifica de vez em quando.
    const infoTimer = window.setInterval(() => void renderRoom(), 4000);
    const offs: (() => void)[] = [
      () => window.clearInterval(infoTimer),
      this.conn.events.on('room', () => void renderRoom()),
      this.hub.events.on('changed', render),
      settings.events.on('changed', render),
      this.hub.events.on('press', ({ player, button }) => {
        if (this.menu.isOpen) return;
        const pick = this.picks.get(player.id);
        if (!pick) return;
        if (button === 'left' || button === 'up') cycle(player, -1);
        else if (button === 'right' || button === 'down') cycle(player, 1);
        else if (button === 'a' && !pick.ready && !mainMenu) {
          if (takenBy(pick.char, player.id)) {
            sound.play('block');
            return;
          }
          pick.ready = true;
          // Quem ainda não escolheu e estava na mesma personagem passa para uma livre.
          for (const other of players()) {
            const op = this.picks.get(other.id);
            if (other !== player && op && !op.ready && op.char === pick.char) cycle(other, 1, false);
          }
          sound.play('coin');
          this.hub.vibrate(player, [30, 40, 60]);
          render();
        } else if (button === 'b' && pick.ready && !(mainMenu && player === this.leader)) {
          pick.ready = false;
          render();
        }
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyI') void cycleLanAddress().then((ok) => ok && void renderRoom());
    };
    window.addEventListener('keydown', onKey);
    offs.push(() => window.removeEventListener('keydown', onKey));

    void renderRoom();
    render();
    let choice: LobbyChoice | null = null;
    while (!choice) {
      // Espera que estejam todos prontos.
      while (!allReady()) await this.engine.wait(0.2);
      render();
      const leader = this.leader;
      mainMenu = {
        player: leader,
        keyboard: true,
        big: true,
        title: 'Menu principal',
        name: leader?.name,
        color: leader ? getCharacter(this.picks.get(leader.id)?.char ?? CHARACTERS[0]!.id).color : undefined,
        options: [
          { id: 'party', label: '🎲 Festa', sub: 'Tabuleiro, estrelas, itens e minijogos' },
          { id: 'sports', label: '🏆 Desportos', sub: 'Bowling, ténis, golfe, boxe e basebol' },
          { id: 'settings', label: '⚙️ Definições' },
          { id: 'quit', label: '🚪 Sair do jogo' },
        ],
      };
      const pickMode = await this.menus.ask(mainMenu);
      mainMenu = null;
      if (pickMode === 'party') choice = await this.partySetup(leader);
      else if (pickMode === 'sports') {
        const sport = await this.pickSport(leader);
        if (sport) choice = { mode: 'sports', sport };
      } else if (pickMode === 'settings') {
        this.menu.show('settings');
        while (this.menu.isOpen) await this.engine.wait(0.2);
      } else if (pickMode === 'quit') {
        const sure = await this.menus.ask({
          player: leader,
          keyboard: true,
          title: 'Sair do jogo?',
          options: [
            { id: 'no', label: '↩ Não, continuar' },
            { id: 'yes', label: '🚪 Sim, sair' },
          ],
        });
        if (sure === 'yes') {
          const app = (window as unknown as { festaDesktop?: { quit(): Promise<void> } }).festaDesktop;
          if (app) await app.quit();
          else this.hud.panel('<h1>Até à próxima! 👋</h1><p>Já podes fechar este separador.</p>');
          await new Promise(() => undefined); // fica aqui até a janela fechar
        }
      }
      render();
    }
    offs.forEach((off) => off());
    ui.remove();
    this.menu.close();
    this.menu.mode = 'off';
    return choice;
  }

  /** Festa: mapa, rondas e dificuldade dos bots. */
  private async partySetup(leader: HubPlayer | null): Promise<LobbyChoice | null> {
    const boards = BOARDS.map((b) => b.create());
    let board = Math.max(0, boards.findIndex((b) => b.id === this.lastBoard));
    let rounds = Math.max(0, RULES.roundOptions.findIndex((r) => r === this.lastRounds));
    let bots = Math.max(0, BOT_LEVELS.findIndex((l) => l.id === settings.value.botLevel));
    const describe = () => `${boards[board]!.description} · ${boards[board]!.spaces.length} casas · ${boards[board]!.shops.length} lojas`;
    const req: MenuRequest = {
      player: leader,
      keyboard: true,
      big: true,
      title: '🎲 Festa',
      name: leader?.name,
      cancel: 'back',
      options: [
        { id: 'board', label: '🗺️ Mapa', values: boards.map((b) => `${BOARD_ICON[b.theme] ?? '🗺️'} ${b.name}`), value: board, sub: describe() },
        { id: 'rounds', label: '🔄 Rondas', values: RULES.roundOptions.map(String), value: rounds },
        { id: 'bots', label: '🤖 Bots', values: BOT_LEVELS.map((l) => l.label), value: bots, sub: 'Os bots completam a mesa até um número par (mínimo 4)' },
        { id: 'start', label: '▶ Começar a festa!' },
        { id: 'back', label: '↩ Voltar' },
      ],
      onChange: (id, v) => {
        if (id === 'board') {
          board = v;
          req.options[0]!.sub = describe();
        }
        if (id === 'rounds') rounds = v;
        if (id === 'bots') {
          bots = v;
          settings.set('botLevel', BOT_LEVELS[v]!.id);
        }
      },
    };
    const id = await this.menus.ask(req);
    if (id !== 'start') return null;
    this.lastBoard = boards[board]!.id;
    this.lastRounds = RULES.roundOptions[rounds]!;
    return { mode: 'party', rounds: this.lastRounds, boardId: this.lastBoard };
  }

  private async pickSport(leader: HubPlayer | null): Promise<SportDef | null> {
    if (SPORTS.length === 0) return null;
    const id = await this.menus.ask({
      player: leader,
      keyboard: true,
      big: true,
      title: '🏆 Desportos',
      name: leader?.name,
      cancel: 'back',
      columns: 2,
      options: [...SPORTS.map((s) => ({ id: s.id, label: `${s.emoji} ${s.name}`, sub: s.description })), { id: 'back', label: '↩ Voltar' }],
    });
    return SPORTS.find((s) => s.id === id) ?? null;
  }

  /** Lugares para um jogo: os jogadores com as personagens escolhidas, mais bots. */
  private async buildSeats(seats: (humans: number) => number): Promise<void> {
    this.conn.setLocked(true);
    const humans = this.hub.players.slice(0, Math.min(MAX_PLAYERS, seats(MAX_PLAYERS)));
    const used = new Set<string>();
    this.seats = humans.map((h) => {
      let char = this.picks.get(h.id)?.char;
      if (!char || used.has(char)) char = CHARACTERS.find((c) => !used.has(c.id))!.id;
      used.add(char);
      return { id: h.id, name: h.name, characterId: char, isBot: false, botPad: new BotPad() };
    });
    const botCount = Math.max(0, seats(humans.length) - humans.length);
    const free = this.rng.shuffle(CHARACTERS.filter((c) => !used.has(c.id)));
    for (let i = 0; i < botCount; i++) {
      const c = free[i]!;
      this.seats.push({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() });
    }
    if (botCount) {
      await this.hud.banner(`${botCount} bot${botCount > 1 ? 's' : ''} entra${botCount > 1 ? 'm' : ''} no jogo!`, {
        sub: `${this.seats.filter((s) => s.isBot).map((s) => s.name).join(', ')} · ${settings.botLevelLabel}`,
        hold: 1.8,
      });
    }
  }

  // ── Festa ───────────────────────────────────────────────

  private waitAll(message: string, except?: string): void {
    for (const s of this.seats) if (s.id !== except) this.seatsCtl.setLayout(s, { kind: 'wait', message });
  }

  /**
   * Desenvolvimento: corre um minijogo sozinho (abrir /?minigame=<id>&mode=<modo>).
   * Bots em todos os lugares, mais quem estiver ligado (telemóvel ou teclado).
   */
  async testMinigame(id: string, mode: MinigameMode, players = 4): Promise<void> {
    const duel = MINIGAMES.find((m) => m.id === id)?.duel ?? false;
    if (duel) players = Math.max(4, players);
    this.menu.mode = 'game';
    await this.engine.wait(1.5); // deixa a lista de telemóveis sincronizar
    const humans = this.hub.players.slice(0, players);
    const bots = CHARACTERS.slice(humans.length, players);
    this.seats = [
      ...humans.map((h, i) => ({ id: h.id, name: h.name, characterId: CHARACTERS[i]!.id, isBot: false, botPad: new BotPad() })),
      ...bots.map((c) => ({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() })),
    ];
    const colors = this.seats.map((_, i) => (mode === 'ffa' ? 'blue' : mode === 'oneVsAll' ? (i === 0 ? 'red' : 'blue') : i % 2 ? 'red' : 'blue')) as ('blue' | 'red')[];
    this.forcedMinigame = id;
    if (duel) await this.partyFlow().duelLoop('ilha');
    else await this.partyFlow().minigameLoop('ilha', colors);
  }

  /** Desenvolvimento: festa de N rondas diretamente num mapa, só com bots e quem estiver ligado (/?party=<mapa>). */
  async testParty(boardId: string, players = 4, rounds = 2): Promise<void> {
    await this.engine.wait(1.5);
    const humans = this.hub.players.slice(0, players);
    const total = Math.max(seatCount(humans.length), players);
    this.seats = [
      ...humans.map((h, i) => ({ id: h.id, name: h.name, characterId: CHARACTERS[i]!.id, isBot: false, botPad: new BotPad() })),
      ...CHARACTERS.slice(humans.length, total).map((c) => ({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() })),
    ];
    const flow = this.partyFlow();
    const state = await flow.play(rounds, boardId);
    await flow.finale(state);
  }

  // ── Desportos ───────────────────────────────────────────

  private async sports(first: SportDef): Promise<void> {
    let def = first;
    await this.buildSeats(def.seatCount);
    for (;;) {
      const next = await this.playSport(def);
      if (next === 'lobby') return;
      if (next === 'other') {
        const other = await this.pickSport(this.leader);
        if (!other) return;
        const humans = this.seats.filter((s) => !s.isBot).length;
        const needsNewSeats = other.seatCount(humans) !== this.seats.length;
        def = other;
        if (needsNewSeats) await this.buildSeats(def.seatCount);
      }
    }
  }

  /** Joga um desporto e devolve o que fazer a seguir. */
  private async playSport(def: SportDef): Promise<'again' | 'other' | 'lobby'> {
    this.hud.setScoreboard(null);
    this.hud.setRound(null);
    this.hud.panel(`<h1>${def.emoji} ${esc(def.name)}</h1><h2>${esc(def.description)}</h2>
      <p><span class="controls">${esc(def.howTo)}</span></p>
      <div class="timerbar"><div style="animation-duration:6s"></div></div>`);
    for (const s of this.seats) this.seatsCtl.setLayout(s, { kind: 'pad', title: `${def.emoji} ${def.name}!`, sub: 'Ouve a explicação no ecrã grande', stick: 'none', buttons: { minus: 'Saltar' } });
    await Promise.all([this.engine.wait(2.5), narrator.say(def.narration)]);
    this.hud.panel(null);

    await loadProps(THEME_PROPS[def.id] ?? []);
    const run = def.create({
      engine: this.engine,
      hud: this.hud,
      hub: this.hub,
      seats: this.seatsCtl,
      players: this.seats,
      rng: this.rng,
      botSkill: settings.botSkill,
    });
    this.engine.setStage(run);
    this.menu.mode = 'game';
    sound.music('sports');
    const standings = await run.play();
    sound.music('finale');
    sound.play('cheer');
    this.menu.mode = 'off';
    this.hud.setScoreboard(null);
    this.hud.setRound(null);
    this.hud.hint(null);

    const byId = new Map(this.seats.map((s) => [s.id, s]));
    const winners = standings.filter((s) => s.rank === 1).map((s) => byId.get(s.id)?.name ?? '?');
    for (const st of standings) {
      const seat = byId.get(st.id)!;
      this.seatsCtl.vibrate(seat, st.rank === 1 ? [80, 40, 80, 40, 250] : 60);
    }
    await this.hud.banner(winners.length > 1 ? `Empate: ${winners.join(' e ')}!` : `${winners[0]} ganhou!`, {
      hold: 2.5,
      color: '#ffd23f',
    });
    this.hud.panel(`
      <h1>${def.emoji} Resultados</h1>
      <div class="rows">${standings
        .map((st, i) => {
          const seat = byId.get(st.id)!;
          return `<div class="row ${st.rank === 1 ? 'win' : ''}" style="animation-delay:${i * 0.07}s">
            <span>${st.rank}.</span><span class="dot" style="background:${getCharacter(seat.characterId).color}"></span>
            <span>${esc(seat.name)}${seat.isBot ? ' <small>CPU</small>' : ''}</span><span>${esc(st.score)}</span><span></span></div>`;
        })
        .join('')}</div>`);
    this.hud.panelElement().classList.add('compact');
    for (const st of standings) {
      const seat = byId.get(st.id)!;
      this.seatsCtl.setLayout(seat, {
        kind: 'info',
        title: st.rank === 1 ? `🏆 Ganhaste! ${def.emoji}` : `Ficaste em ${st.rank}.º lugar`,
        sub: st.score,
        table: {
          title: `${def.emoji} ${def.name}`,
          rows: standings.map((o) => {
            const os = byId.get(o.id)!;
            return { name: os.name, color: getCharacter(os.characterId).color, value: o.score.slice(0, 32), me: o.id === st.id || undefined, mark: o.rank === 1 ? '🏆' : undefined };
          }),
        },
        color: getCharacter(seat.characterId).color,
      });
    }
    const leader = this.leader;
    if (leader) this.hub.setLayout({ kind: 'pad', title: 'E agora?', sub: 'Escolhe no ecrã grande', stick: 'dpad', buttons: { a: 'Escolher' } }, leader);
    const next = (await this.menus.ask({
      player: leader,
      keyboard: true,
      title: 'E agora?',
      name: leader?.name,
      options: [
        { id: 'again', label: `${def.emoji} Jogar outra vez` },
        { id: 'other', label: '🏆 Outro desporto' },
        { id: 'lobby', label: '↩ Menu principal' },
      ],
    })) as 'again' | 'other' | 'lobby';
    this.hud.panelElement().classList.remove('compact');
    this.hud.panel(null);
    return next;
  }

  /** Desenvolvimento: joga um desporto diretamente (/?sport=<id>&players=N). */
  async testSport(id: string, players: number): Promise<void> {
    const def = SPORTS.find((s) => s.id === id);
    if (!def) throw new Error(`Desporto desconhecido: ${id}`);
    await this.engine.wait(1.5); // deixa a lista de telemóveis sincronizar
    const humans = this.hub.players.slice(0, players);
    const total = Math.max(def.seatCount(humans.length), players);
    this.seats = [
      ...humans.map((h, i) => ({ id: h.id, name: h.name, characterId: CHARACTERS[i]!.id, isBot: false, botPad: new BotPad() })),
      ...CHARACTERS.slice(humans.length, total).map((c) => ({
        id: `bot-${c.id}`,
        name: c.name,
        characterId: c.id,
        isBot: true,
        botPad: new BotPad(),
      })),
    ];
    for (;;) await this.playSport(def);
  }
}
