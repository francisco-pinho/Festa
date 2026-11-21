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
import { ROOM_PROPS, ROOM_SEATS, TV_VIEW } from '../stages/livingRoom';
import { portraitSmall } from '../three/portraits';
import { Hud, esc } from '../ui/Hud';
import type { MenuRequest, ScreenMenus } from '../ui/ScreenMenu';
import { MINIGAMES } from '../minigames';
import { SPORTS } from '../sports';
import type { SportDef } from '../sports/types';
import type { GameMenu } from '../ui/GameMenu';
import { BOT_LEVELS, settings } from './Settings';
import { BotPad, SeatControl, type Seat } from './Seats';
import { PartyFlow } from './PartyFlow';
import type { PartyHooks } from '../tester/PartyHooks';
import { creditsHtml, creditsLines } from '../ui/credits';
import { loading } from '../ui/loading';

type LobbyChoice = { mode: 'party'; rounds: number; boardId: string } | { mode: 'sports'; sport: SportDef } | { mode: 'test' };

const BOARD_ICON: Record<string, string> = { city: '🌃', volcano: '🌋', castle: '🏰', park: '🎡', island: '🏝️' };

export class Director {
  private readonly seatsCtl: SeatControl;
  private seats: Seat[] = [];
  private rng: Rng = createRng();
  private forcedMinigame: string | null = null;
  /** Modo tester: lugares só com bots (e o teclado num lugar), sem telemóveis. */
  private testerSeats: { keyboardSeat: number | null } | null = null;
  /** Modo tester: ganchos entregues a cada festa nova. */
  testerHooks: PartyHooks | null = null;
  /** Modo tester: bots a mais na festa saída do lobby (o total fica par, como sempre). */
  extraBots = 0;
  /** Versão portátil da app: o menu principal tem «Testar minijogos». */
  private portable = false;
  /** Lugar de cada jogador na sala de estar (ecrã inicial). */
  private readonly roomSeats = new Map<string, number>();
  /** Personagem de cada jogador (escolhida ao entrar; fica até sair da sala). */
  private readonly picks = new Map<string, { char: string; ready: boolean }>();
  private lastRounds: number = RULES.roundOptions[1];
  private lastBoard = BOARDS[0]!.id;
  /** A sala de estar já foi preparada na placa gráfica (ao abrir o jogo). */
  private roomWarm = false;
  /** TV da sala de estar: se ainda estiver ligada ao montar os lugares, o aviso dos bots passa lá. */
  private roomTv: ShowcaseStage['tv'] = null;

  constructor(
    private readonly engine: Engine,
    private readonly hud: Hud,
    private readonly hub: PlayerHub,
    private readonly conn: HostConnection,
    private readonly menu: GameMenu,
    private readonly menus: ScreenMenus,
  ) {
    void (window as unknown as { festaDesktop?: { info?(): Promise<{ portable: boolean }> } }).festaDesktop
      ?.info?.()
      .then((i) => (this.portable = !!i.portable))
      .catch(() => undefined);
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
      if (choice.mode === 'test') {
        await this.testMenu();
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
    this.flow = new PartyFlow({
      engine: this.engine,
      hud: this.hud,
      hub: this.hub,
      seatsCtl: this.seatsCtl,
      seats: this.seats,
      rng: this.rng,
      menu: this.menu,
      forcedMinigame: this.forcedMinigame,
    });
    this.flow.tester = this.testerHooks;
    return this.flow;
  }

  /** Quem escolhe nos menus: o VIP (telemóvel) ou o primeiro jogador de teclado. */
  private get leader(): HubPlayer | null {
    return this.hub.vip ?? this.hub.players[0] ?? null;
  }

  // ── Menu principal ──────────────────────────────────────

  /**
   * Entrada do lobby: código, link e dicas no balão do «i» (painel do canto); o QR é desenhado
   * numa tela à parte e entregue a `onQr` (vai para o quadro em cima da mesa). Devolve o que o redesenha.
   */
  private setupJoinPanel(ui: HTMLElement, onQr: (canvas: HTMLCanvasElement) => void): () => Promise<void> {
    const canvas = document.createElement('canvas');
    const renderRoom = async () => {
      const code = this.conn.roomCode;
      if (!code) return;
      const [url, base, online] = await Promise.all([getJoinUrl(code), getJoinBaseUrl(), isOnline()]);
      if (canvas.dataset.url === url) return;
      canvas.dataset.url = url;
      ui.querySelector('#code')!.textContent = code;
      ui.querySelector('#url')!.textContent = `${base.replace(/^https?:\/\//, '')}/play`;
      ui.querySelector('#join-label')!.textContent = online ? 'Online · entra em casa ou fora' : 'Entra com o telemóvel';
      ui.querySelector('#join-tip')!.innerHTML = online
        ? `Quem está fora vê o ecrã em <b>${esc(base.replace(/^https?:\/\//, ''))}/ver</b> (partilha o ecrã com a tecla <b>V</b>).`
        : 'Android: se não abrir, dá ao Chrome a permissão <b>Dispositivos próximos</b>. Aviso de ligação não privada? <b>Avançadas → Continuar</b>.';
      await QRCode.toCanvas(canvas, url, { width: 256, margin: 2, errorCorrectionLevel: 'M' });
      onQr(canvas);
    };

    const tipEl = ui.querySelector<HTMLDivElement>('#join-tip')!;
    const tooltip = ui.querySelector<HTMLDivElement>('#qr-tooltip')!;
    const showTip = () => {
      tooltip.innerHTML = tipEl.innerHTML;
      tooltip.hidden = !tooltip.innerHTML;
    };
    const hideTip = () => (tooltip.hidden = true);
    const infoBtn = ui.querySelector<HTMLButtonElement>('#qr-info')!;
    infoBtn.addEventListener('mouseenter', showTip);
    infoBtn.addEventListener('focus', showTip);
    infoBtn.addEventListener('mouseleave', hideTip);
    infoBtn.addEventListener('blur', hideTip);

    return renderRoom;
  }

  private async lobby(): Promise<LobbyChoice> {
    // Ecrã inicial: a sala de estar (quem entra vai-se sentando no sofá, cadeirões…).
    // A mobília da sala (sofá, estantes, lareira, mesa…) carrega antes de a montar.
    await loadProps(ROOM_PROPS);
    const stage = new ShowcaseStage({ room: true });
    this.engine.setStage(stage);
    this.roomTv = stage.tv;
    // Perto e ao centro, a apanhar os 10 lugares (sofá, cadeirões, chão, estante e lareira).
    stage.view({ distance: 11, height: 3.6, orbitSpeed: 0, target: new THREE.Vector3(0.5, 1.6, -5.2) });
    // A placa gráfica prepara a sala (e o ecrã ligado da TV) ainda atrás do ecrã de carregamento.
    // (Só da primeira vez: ao voltar de um jogo já está tudo preparado.)
    if (!this.roomWarm) {
      loading.show('A preparar a sala…', 0.95);
      stage.tv?.preview(true);
      await this.engine.warmUp(stage);
      stage.tv?.preview(false);
      this.roomWarm = true;
    }
    loading.hide();
    this.conn.setLocked(false);
    this.menu.mode = 'lobby';
    this.hud.setRound(null);
    this.hud.setScoreboard(null);
    this.hud.panel(null);
    this.hud.hint(null);

    const ui = document.createElement('div');
    ui.className = 'lobby-ui';
    ui.innerHTML = `
      <div class="lobby-logo">FESTA</div>
      <div class="lobby-join">
        <div class="lobby-join-text">
          <div class="label" id="join-label">Entra com o telemóvel</div>
          <div class="code" id="code">····</div>
          <div class="url" id="url"></div>
          <div class="tip" id="join-tip"></div>
        </div>
        <button class="qr-info" id="qr-info" title="Dicas de ligação" aria-label="Dicas de ligação">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 17v-4"/><path d="M12 9h.01"/></svg>
        </button>
        <div class="qr-tooltip" id="qr-tooltip" hidden></div>
      </div>
      <div class="lobby-cards" id="cards"></div>
      <div class="lobby-help" id="help"></div>`;
    document.getElementById('ui')!.appendChild(ui);

    const renderRoom = this.setupJoinPanel(ui, (canvas) => {
      if (!stage.qr) return;
      stage.qr.setImage(canvas);
      stage.qr.group.visible = qrShown;
    });

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
    // Lugar de cada um na sala (Ⓧ muda): quem entra fica no primeiro lugar livre.
    const ensureRoomSeats = () => {
      const here = new Set(players().map((p) => p.id));
      for (const id of [...this.roomSeats.keys()]) if (!here.has(id)) this.roomSeats.delete(id);
      for (const p of players()) {
        if (this.roomSeats.has(p.id)) continue;
        const used = new Set(this.roomSeats.values());
        const free = ROOM_SEATS.findIndex((_, i) => !used.has(i));
        this.roomSeats.set(p.id, Math.max(0, free));
      }
    };
    /** Ⓧ: passa para o lugar seguinte da sala (se estiver ocupado, troca com quem lá está). */
    const moveSeat = (p: HubPlayer) => {
      const cur = this.roomSeats.get(p.id) ?? 0;
      const n = ROOM_SEATS.length;
      const owner = (i: number) => [...this.roomSeats].find(([, s]) => s === i)?.[0];
      let next = (cur + 1) % n;
      for (let k = 0; k < n - 1 && owner(next); k++) next = (next + 1) % n;
      const other = owner(next);
      if (other) this.roomSeats.set(other, cur);
      this.roomSeats.set(p.id, next);
      sound.play('whoosh', { vol: 0.4 });
      this.hub.vibrate(p, 15);
      render();
    };
    // As caras das personagens vão para cada telemóvel uma vez (o telemóvel guarda-as).
    const facesSent = new Set<string>();

    /** O VIP pode esconder o QR com «−» (quando já estão todos lá dentro). */
    let qrShown = true;
    let mainMenu: MenuRequest | null = null;
    /** O VIP carregou em Ⓨ (com todos prontos): a câmara vai à televisão e aparece lá o menu dos jogos. */
    let startRequested = false;
    let atTv = false;
    const tv = stage.tv;
    /**
     * Ir à televisão: a câmara anda até ela, a TV liga (como as de tubo) e os menus passam no ecrã dela.
     * Voltar: a TV desliga e só depois a câmara regressa à sala.
     */
    const setTv = async (on: boolean) => {
      atTv = on;
      ui.classList.toggle('at-tv', on);
      if (on) {
        stage.flyTo(TV_VIEW.pos, TV_VIEW.look);
        if (tv) {
          this.menus.setSink((v) => tv.show(v));
          this.menu.setSink((v) => tv.show(v));
        }
        await this.engine.wait(0.9);
        tv?.powerOn();
        await this.engine.wait(0.6);
      } else {
        this.menus.setSink(null);
        this.menu.setSink(null);
        const t = tv?.powerOff() ?? 0;
        await this.engine.wait(t * 0.8);
        stage.flyHome();
      }
    };
    const requestStart = (p: HubPlayer | null) => {
      if (atTv) return;
      if (!allReady()) {
        sound.play('block');
        const waiting = players().filter((o) => !this.picks.get(o.id)?.ready && o.connected).map((o) => o.name);
        if (p) this.hub.toast(p, `À espera de ${waiting.join(', ')}`);
        return;
      }
      sound.play('go');
      startRequested = true;
    };
    const render = () => {
      ensurePicks();
      ensureRoomSeats();
      const list = players();
      // Modo tester: os bots a mais já se sentam na sala (personagens e lugares que sobram).
      const botTotal = !this.extraBots ? 0 : list.length ? seatCount(list.length + this.extraBots) - list.length : this.extraBots;
      const usedChars = new Set(list.map((p) => this.picks.get(p.id)!.char));
      const usedSeats = new Set(this.roomSeats.values());
      const freeSeats = ROOM_SEATS.map((_, i) => i).filter((i) => !usedSeats.has(i));
      const lobbyBots = CHARACTERS.filter((c) => !usedChars.has(c.id))
        .slice(0, Math.min(botTotal, freeSeats.length))
        .map((c, i) => ({ key: `bot-${c.id}`, characterId: c.id, label: `🤖 ${c.name}`, labelColor: '#9fd3ff', seat: freeSeats[i] }));
      stage.setLineup([
        ...list.map((p) => {
          const pick = this.picks.get(p.id)!;
          return { key: p.id, characterId: pick.char, label: `${p.isVip ? '⭐ ' : ''}${p.name}`, labelColor: pick.ready ? '#ffd23f' : '#ffffff', seat: this.roomSeats.get(p.id) };
        }),
        ...lobbyBots,
      ]);
      for (const p of list) {
        const pick = this.picks.get(p.id)!;
        stage.setAnim(p.id, pick.ready ? 'cheer' : 'idle');
        // Ao ir para a TV, todos ficam no lugar (o festejo dos prontos já passou).
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
      const bots = humans ? seatCount(humans + this.extraBots) - humans : 0;
      const waiting = list.filter((p) => !this.picks.get(p.id)?.ready && p.connected).map((p) => p.name);
      ui.querySelector('#help')!.textContent = !humans
        ? 'Lê o código com o telemóvel para entrar!'
        : waiting.length
          ? `◀ ▶ escolhe a personagem · Ⓐ pronto · Ⓧ muda de lugar · À espera de ${waiting.join(', ')}`
          : `Todos prontos! ${this.leader ? `${this.leader.name} carrega em Ⓨ para começar` : 'Enter para começar'}${bots ? ` · na Festa entram ${bots} bot${bots > 1 ? 's' : ''}` : ''}`;
      // Comandos
      for (const p of list) {
        const pick = this.picks.get(p.id)!;
        const c = getCharacter(pick.char);
        const lead = p === this.leader && atTv;
        const vip = p === this.leader;
        if (!p.connected) facesSent.delete(p.id);
        // Escolha da personagem no telemóvel: carrossel com as caras e o que cada botão faz
        // (Ⓐ escolher, Ⓧ mudar de lugar, «+» mudar o nome; só o VIP: Ⓑ definições gerais, Ⓨ começar a jogar, «−» QR).
        // Só o VIP, já na televisão, volta ao comando normal, para navegar no menu dos jogos.
        // Depois de escolher: comando completo (cruz e todos os botões), com Ⓐ para mudar de personagem
        // (volta ao carrossel).
        if (pick.ready && !lead) {
          this.hub.setLayout(
            {
              kind: 'pad',
              color: c.color,
              title: `Pronto com ${c.name}! ✔`,
              sub: atTv
                ? `${this.leader?.name ?? 'O VIP'} está a escolher o jogo na televisão…`
                : vip
                  ? allReady()
                    ? 'Todos prontos! Carrega em Ⓨ para começar'
                    : 'À espera dos outros… (Ⓨ começa quando estiverem prontos)'
                  : `À espera que ${this.leader?.name ?? 'o VIP'} comece (Ⓨ)…`,
              stick: 'dpad',
              buttons: {
                a: atTv ? undefined : 'Mudar personagem',
                b: vip && !atTv ? 'Definições' : undefined,
                x: 'Mudar de lugar',
                y: vip && !atTv ? 'Jogar' : undefined,
                minus: vip && !atTv ? (qrShown ? 'Esconder QR' : 'Mostrar QR') : undefined,
                plus: atTv ? undefined : 'Mudar nome',
              },
            },
            p,
          );
          continue;
        }
        if (!lead) {
          // As caras vão uma a uma (cada mensagem tem de ser pequena), só da primeira vez.
          if (!facesSent.has(p.id)) {
            const faces = CHARACTERS.map((ch) => [ch.id, portraitSmall(ch.id)] as const);
            if (faces.every(([, img]) => img)) {
              for (const [id, img] of faces) this.hub.sendFace(p, id, img);
              facesSent.add(p.id);
            }
          }
          const items = CHARACTERS.map((ch) => ({ id: ch.id, name: ch.name, color: ch.color, taken: takenBy(ch.id, p.id) }));
          this.hub.setLayout(
            {
              kind: 'pick',
              color: c.color,
              title: pick.ready ? `Pronto com ${c.name}! ✔` : 'Escolhe a tua personagem',
              sub: atTv
                ? `${this.leader?.name ?? 'O VIP'} está a escolher o jogo na televisão…`
                : !pick.ready
                  ? `${c.name} · ◀ ▶ para mudar`
                  : vip
                    ? allReady()
                      ? 'Todos prontos! Carrega em Ⓨ para começar'
                      : 'À espera dos outros… (Ⓨ começa quando estiverem prontos)'
                    : `À espera que ${this.leader?.name ?? 'o VIP'} comece (Ⓨ)…`,
              items,
              index: Math.max(0, CHARACTERS.findIndex((ch) => ch.id === pick.char)),
              ready: pick.ready,
              buttons: {
                a: atTv ? undefined : 'Escolher',
                b: vip && !atTv ? 'Definições' : undefined,
                x: 'Mudar de lugar',
                y: vip && !atTv ? 'Jogar' : undefined,
                minus: vip && !atTv ? (qrShown ? 'Esconder QR' : 'Mostrar QR') : undefined,
                plus: atTv ? undefined : 'Mudar nome',
              },
            },
            p,
          );
          continue;
        }
        this.hub.setLayout(
          pick.ready
            ? {
                kind: 'pad',
                color: c.color,
                title: `Pronto com ${c.name}! ✔`,
                sub: 'Escolhe o jogo na televisão',
                stick: 'dpad',
                buttons: { a: 'Escolher', b: 'Voltar' },
              }
            : {
                kind: 'pad',
                color: c.color,
                title: 'Escolhe a tua personagem',
                sub: `◀ ${c.name} ▶`,
                stick: 'dpad',
                buttons: { a: 'Pronto!' },
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

    // O link público pode chegar depois (túnel a abrir): verifica de vez em quando.
    const infoTimer = window.setInterval(() => void renderRoom(), 4000);
    const offs: (() => void)[] = [
      () => window.clearInterval(infoTimer),
      this.conn.events.on('room', () => void renderRoom()),
      this.hub.events.on('changed', render),
      // Tocar numa cara no carrossel do telemóvel escolhe logo essa personagem.
      this.hub.events.on('choice', ({ player, id }) => {
        const pick = this.picks.get(player.id);
        if (!pick || pick.ready || this.menu.isOpen) return;
        if (!CHARACTERS.some((ch) => ch.id === id) || takenBy(id, player.id)) {
          sound.play('block');
          return;
        }
        pick.char = id;
        sound.play('tick');
        render();
      }),
      settings.events.on('changed', render),
      this.hub.events.on('press', ({ player, button }) => {
        if (this.menu.isOpen) return;
        const pick = this.picks.get(player.id);
        if (!pick) return;
        if (button === 'x') moveSeat(player);
        // «+»: mudar o nome (a caixa abre no telemóvel de quem carregou).
        else if (button === 'plus' && !atTv) this.hub.askName(player);
        // «−» do VIP: mostra/esconde o quadro do QR.
        else if (button === 'minus' && player === this.leader && !atTv) {
          qrShown = !qrShown;
          ui.querySelector<HTMLElement>('.lobby-join')!.hidden = !qrShown;
          if (stage.qr) stage.qr.group.visible = qrShown;
          sound.play('click');
          render();
        }
        else if (button === 'y' && player === this.leader) requestStart(player);
        // Definições gerais: só o VIP, e só na sala (na TV o Ⓑ volta atrás nos menus).
        else if (button === 'b' && player === this.leader && !atTv) this.menu.openFor(player);
        else if (button === 'a' && pick.ready && !atTv) {
          // Ⓐ «Mudar personagem»: volta ao carrossel com todas as personagens.
          pick.ready = false;
          sound.play('click');
          render();
        }
        else if (button === 'left' || button === 'up') cycle(player, -1);
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
        }
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyI') void cycleLanAddress().then((ok) => ok && void renderRoom());
      // Sem comando de VIP (só teclado): Enter começa.
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !this.menu.isOpen && (!this.leader || this.leader.source !== 'phone')) requestStart(this.leader);
    };
    window.addEventListener('keydown', onKey);
    offs.push(() => window.removeEventListener('keydown', onKey));

    void renderRoom();
    render();
    let choice: LobbyChoice | null = null;
    while (!choice) {
      // Fica tudo na sala (pode estar gente a entrar) até o VIP carregar em Ⓨ com todos prontos.
      startRequested = false;
      while (!startRequested) await this.engine.wait(0.15);
      // A câmara anda até à televisão; o menu dos jogos aparece no ecrã dela.
      const going = setTv(true);
      render();
      await going;
      while (!choice && atTv && allReady()) {
      const leader = this.leader;
      mainMenu = {
        player: leader,
        keyboard: true,
        big: true,
        title: 'Menu principal',
        name: leader?.name,
        color: leader ? getCharacter(this.picks.get(leader.id)?.char ?? CHARACTERS[0]!.id).color : undefined,
        cancel: 'room',
        options: [
          { id: 'party', label: 'Festa', sub: 'Tabuleiro, estrelas, itens e minijogos' },
          { id: 'sports', label: 'Desportos', sub: 'Bowling, ténis, golfe, boxe e basebol' },
          { id: 'settings', label: 'Definições' },
          ...(this.portable ? [{ id: 'test', label: 'Testar minijogos', sub: 'Escolhe um minijogo e joga-o já' }] : []),
          { id: 'credits', label: 'Créditos' },
        ],
      };
      const pickMode = await this.menus.ask(mainMenu);
      mainMenu = null;
      if (pickMode === 'room' || pickMode === '__cancel') break;
      if (pickMode === 'party') choice = await this.partySetup(leader);
      else if (pickMode === 'sports') {
        const sport = await this.pickSport(leader);
        if (sport) choice = { mode: 'sports', sport };
      } else if (pickMode === 'test') {
        choice = { mode: 'test' };
      } else if (pickMode === 'credits') {
        if (tv) {
          // Na TV: o menu fica escondido (só para o Ⓑ voltar) e os créditos passam no ecrã dela.
          const back = this.menus.ask({ player: leader, keyboard: true, hidden: true, title: 'Créditos', options: [{ id: 'back', label: 'Voltar' }], cancel: 'back' });
          tv.showPage('Créditos', creditsLines(), 'Ⓐ ou Ⓑ voltar');
          await back;
        } else {
          this.hud.panel(creditsHtml());
          this.hud.panelElement().classList.add('compact');
          await this.menus.ask({ player: leader, keyboard: true, corner: true, title: 'Créditos', options: [], cancel: 'back' });
          this.hud.panelElement().classList.remove('compact');
          this.hud.panel(null);
        }
      } else if (pickMode === 'settings') {
        this.menu.show('settings');
        while (this.menu.isOpen) await this.engine.wait(0.2);
      }
      render();
      }
      // Voltou à sala (Ⓑ, alguém deixou de estar pronto ou entrou alguém novo).
      if (!choice) {
        await setTv(false);
        render();
      }
    }
    this.menus.setSink(null);
    this.menu.setSink(null);
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
      title: 'Festa',
      name: leader?.name,
      cancel: 'back',
      options: [
        { id: 'board', label: 'Mapa', values: boards.map((b) => `${BOARD_ICON[b.theme] ?? ''} ${b.name}`.trim()), value: board, sub: describe() },
        { id: 'rounds', label: 'Rondas', values: RULES.roundOptions.map(String), value: rounds },
        { id: 'bots', label: 'Bots', values: BOT_LEVELS.map((l) => l.label), value: bots, sub: 'Os bots completam a mesa até um número par (mínimo 4)' },
        { id: 'start', label: '▶ Começar a festa!' },
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
      title: 'Desportos',
      name: leader?.name,
      cancel: 'back',
      columns: 2,
      options: SPORTS.map((s) => ({ id: s.id, label: `${s.emoji} ${s.name}`, sub: s.description })),
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
    const botCount = Math.max(0, Math.min(MAX_PLAYERS, seats(humans.length + this.extraBots)) - humans.length);
    const left = CHARACTERS.filter((c) => !used.has(c.id));
    // Com bots a mais (tester), entram os mesmos que estavam sentados na sala.
    const free = this.extraBots ? left : this.rng.shuffle(left);
    for (let i = 0; i < botCount; i++) {
      const c = free[i]!;
      this.seats.push({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() });
    }
    if (botCount) {
      const title = `${botCount} bot${botCount > 1 ? 's' : ''} entra${botCount > 1 ? 'm' : ''} no jogo!`;
      const sub = `${this.seats.filter((s) => s.isBot).map((s) => s.name).join(', ')} · ${settings.botLevelLabel}`;
      // Ainda na sala, com a câmara na TV: o aviso passa no ecrã dela.
      const tv = this.roomTv?.isOn ? this.roomTv : null;
      if (tv) {
        sound.play('banner');
        tv.showText(title, sub);
        await this.engine.wait(1.8);
      } else await this.hud.banner(title, { sub, hold: 1.8 });
    }
  }

  // ── Festa ───────────────────────────────────────────────

  /**
   * Desenvolvimento: corre um minijogo sozinho (abrir /?minigame=<id>&mode=<modo>).
   * Bots em todos os lugares, mais quem estiver ligado (telemóvel ou teclado).
   */
  /**
   * Modo de testes (só na versão portátil): lista de todos os minijogos; escolhe-se um (e o modo)
   * e joga-se logo, com quem está ligado e bots até 4. No fim volta à lista.
   */
  async testMenu(players?: number): Promise<void> {
    if (players) this.devSeats(Math.max(4, players));
    else await this.buildSeats((h) => Math.max(4, h));
    this.menu.mode = 'game';
    const flow = this.partyFlow();
    const MODE_NAME: Record<MinigameMode, string> = { ffa: 'Todos contra todos', teams: 'Equipas', oneVsAll: '1 contra todos' };
    let last: string | undefined;
    for (;;) {
      const pick = await this.menus.ask({
        player: this.leader,
        keyboard: true,
        title: 'Testar minijogos',
        columns: 4,
        initial: last,
        options: [
          ...MINIGAMES.map((m) => ({ id: m.id, label: m.name, sub: m.duel ? 'Duelo' : m.modes.map((x) => MODE_NAME[x]).join(' · ') })),
        ],
        cancel: 'back',
      });
      if (pick === 'back') break;
      last = pick;
      const def = MINIGAMES.find((m) => m.id === pick)!;
      let mode: MinigameMode = def.modes[0]!;
      if (!def.duel && def.modes.length > 1) {
        const m = await this.menus.ask({
          player: this.leader,
          keyboard: true,
          title: `${def.name}: que modo?`,
          options: def.modes.map((x) => ({ id: x, label: MODE_NAME[x] })),
          cancel: 'back',
        });
        if (m === 'back') continue;
        mode = m as MinigameMode;
      }
      await flow.testMinigame(def.id, mode);
    }
    this.menu.mode = 'lobby';
  }

  async testMinigame(id: string, mode: MinigameMode, players = 4): Promise<void> {
    const duel = MINIGAMES.find((m) => m.id === id)?.duel ?? false;
    if (duel) players = Math.max(4, players);
    this.menu.mode = 'game';
    await this.engine.wait(1.5); // deixa a lista de telemóveis sincronizar
    this.devSeats(players);
    const colors = this.seats.map((_, i) => (mode === 'ffa' ? 'blue' : mode === 'oneVsAll' ? (i === 0 ? 'red' : 'blue') : i % 2 ? 'red' : 'blue')) as ('blue' | 'red')[];
    this.forcedMinigame = id;
    if (duel) await this.partyFlow().duelLoop('ilha');
    else await this.partyFlow().minigameLoop('ilha', colors);
  }

  /** Desenvolvimento: festa de N rondas diretamente num mapa, só com bots e quem estiver ligado (/?party=<mapa>). */
  async testParty(boardId: string, players = 4, rounds = 2): Promise<void> {
    await this.engine.wait(1.5);
    this.devSeats(players, seatCount);
    const flow = this.partyFlow();
    const state = await flow.play(rounds, boardId);
    await flow.finale(state);
  }

  /** Desenvolvimento: só o fim da festa (estrelas bónus e pódio), com moedas e estrelas ao calhas. */
  async testFinale(boardId: string, players = 4): Promise<void> {
    await this.engine.wait(1.5);
    this.devSeats(players, seatCount);
    await this.partyFlow().testFinale(boardId);
  }

  /** Modo tester: a partir daqui os testes não sentam telemóveis; `keyboardSeat` é o Teclado 1. */
  useTesterSeats(keyboardSeat: number | null): void {
    this.testerSeats = { keyboardSeat };
  }

  /** Lugares do jogo atual (para o painel de tester). */
  get seatList(): readonly Seat[] {
    return this.seats;
  }

  /**
   * Lugares dos testes: quem está ligado (telemóvel ou teclado) e bots até `players`
   * (ou até `min(humanos)`, se for mais). No modo tester: só bots e, se pedido, o teclado.
   */
  private devSeats(players: number, min: (humans: number) => number = () => 0): void {
    const kbSeat = this.testerSeats?.keyboardSeat ?? null;
    const humans = this.testerSeats ? (kbSeat === null ? [] : [this.hub.addKeyboardPlayer('kb1')]) : this.hub.players.slice(0, players);
    const total = Math.max(min(humans.length), players);
    const bot = (i: number): Seat => {
      const c = CHARACTERS[i]!;
      return { id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() };
    };
    const human = (h: HubPlayer, i: number): Seat => ({ id: h.id, name: h.name, characterId: CHARACTERS[i]!.id, isBot: false, botPad: new BotPad() });
    if (this.testerSeats) {
      const at = kbSeat === null ? -1 : Math.min(kbSeat, total - 1);
      this.seats = Array.from({ length: total }, (_, i) => (i === at ? human(humans[0]!, i) : bot(i)));
    } else this.seats = [...humans.map(human), ...Array.from({ length: total - humans.length }, (_, i) => bot(humans.length + i))];
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

    await loadProps([...(THEME_PROPS[def.id] ?? []), ...(def.props ?? [])]);
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
        title: st.rank === 1 ? `Ganhaste! ${def.emoji}` : `Ficaste em ${st.rank}.º lugar`,
        sub: st.score,
        table: {
          title: `${def.emoji} ${def.name}`,
          rows: standings.map((o) => {
            const os = byId.get(o.id)!;
            return { name: os.name, color: getCharacter(os.characterId).color, value: o.score.slice(0, 32), me: o.id === st.id || undefined };
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
        { id: 'other', label: 'Outro desporto' },
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
    this.devSeats(players, def.seatCount);
    for (;;) await this.playSport(def);
  }
}
