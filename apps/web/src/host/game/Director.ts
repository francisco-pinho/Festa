/**
 * O Realizador: conduz a festa do princípio ao fim, encadeando regras
 * (@festa/game), animações (palcos 3D), interface (Hud) e telemóveis (Seats).
 *
 *   lobby → escolha de personagens → ordem de jogo → rondas
 *   (cada jogador: dados → andar → casa) → minijogo → … → estrelas bónus → pódio
 */
import { sound } from '../audio/Sound';
import QRCode from 'qrcode';
import * as THREE from 'three';
import { BOARDS, CHARACTERS, RULES, createRng, getCharacter, seatCount, type MinigameMode, type Rng } from '@festa/game';
import { MAX_PLAYERS } from '@festa/shared';
import type { HostConnection } from '../HostConnection';
import type { PlayerHub } from '../PlayerHub';
import { cycleLanAddress, getJoinBaseUrl, getJoinUrl } from '../joinUrl';
import type { Engine } from '../three/Engine';
import { ShowcaseStage } from '../stages/ShowcaseStage';
import { Hud, esc } from '../ui/Hud';
import { MINIGAMES } from '../minigames';
import { SPORTS } from '../sports';
import type { SportDef } from '../sports/types';
import type { GameMenu } from '../ui/GameMenu';
import { settings } from './Settings';
import { BotPad, SeatControl, type Seat } from './Seats';
import { PartyFlow } from './PartyFlow';

const PATH_COLORS = ['#ffd23f', '#3fd0ff', '#ff6fb5'];

type LobbyChoice = { mode: 'party'; rounds: number } | { mode: 'sports' };

export class Director {
  private readonly seatsCtl: SeatControl;
  private seats: Seat[] = [];
  private rng: Rng = createRng();
  private lastMinigame: string | null = null;
  private forcedMinigame: string | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly hud: Hud,
    private readonly hub: PlayerHub,
    private readonly conn: HostConnection,
    private readonly menu: GameMenu,
  ) {
    this.seatsCtl = new SeatControl(hub, engine);
    conn.events.on('status', (s) =>
      this.hud.status(s === 'online' ? null : s === 'connecting' ? 'A ligar ao servidor…' : 'Sem ligação ao servidor'),
    );
  }

  async run(): Promise<void> {
    for (;;) {
      sound.music('lobby');
      const choice = await this.lobby();
      if (choice.mode === 'sports') {
        await this.sports();
        continue;
      }
      const boardId = await this.pickBoard();
      await this.characterSelect();
      this.rng = createRng();
      const flow = this.partyFlow();
      sound.music('board');
      const state = await flow.play(choice.rounds, boardId);
      sound.music('finale');
      await flow.finale(state);
    }
  }

  // ── Escolha do mapa ─────────────────────────────────────

  private async pickBoard(): Promise<string> {
    const boards = BOARDS.map((b) => b.create());
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.view({ distance: 16, height: 5, orbitSpeed: 0.1 });
    let selected = 0;
    const icon = (theme: string) => ({ city: '🌃', volcano: '🌋', castle: '🏰', park: '🎡' })[theme] ?? '🏝️';
    const render = () =>
      this.hud.panel(`
        <h1>🗺️ Escolhe o mapa</h1>
        <h2>${this.hub.vip ? `⭐ ${esc(this.hub.vip.name)} escolhe no telemóvel` : '↑ ↓ para escolher · Enter para jogar'}</h2>
        <div class="sports">${boards
          .map(
            (b, i) => `<div class="sport ${i === selected ? 'selected' : ''}"><span class="emoji">${icon(b.theme)}</span>
              <span class="name">${esc(b.name)}</span><span class="desc">${esc(b.description)}</span>
              <span class="desc">${b.spaces.length} casas · ${b.shops.length} lojas</span></div>`,
          )
          .join('')}</div>`);
    render();
    const vip = this.hub.vip;
    for (const p of this.hub.players) {
      this.hub.setLayout(
        p === vip
          ? { kind: 'choices', prompt: 'Escolhe o mapa', options: boards.map((b) => ({ id: `board:${b.id}`, label: `${icon(b.theme)} ${b.name}` })) }
          : { kind: 'wait', message: vip ? `${vip.name} está a escolher o mapa…` : 'À espera…' },
        p,
      );
    }
    const id = await new Promise<string>((resolve) => {
      const finish = (v: string) => {
        off();
        window.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const off = this.hub.events.on('choice', ({ player, id }) => {
        if (player.isVip && id.startsWith('board:')) finish(id.slice(6));
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          selected = (selected + (e.code === 'ArrowDown' ? 1 : boards.length - 1)) % boards.length;
          render();
        }
        if (e.code === 'Enter') finish(boards[selected]!.id);
      };
      window.addEventListener('keydown', onKey);
    });
    this.hud.panel(null);
    return id;
  }

  private partyFlow(): PartyFlow {
    return new PartyFlow({
      engine: this.engine,
      hud: this.hud,
      hub: this.hub,
      seatsCtl: this.seatsCtl,
      seats: this.seats,
      rng: this.rng,
      menu: this.menu,
      forcedMinigame: this.forcedMinigame,
    });
  }


  // ── Lobby ───────────────────────────────────────────────

  private async lobby(): Promise<LobbyChoice> {
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.view({ distance: 16, height: 5, orbitSpeed: 0.12 });
    stage.setLineup(
      ['bolota', 'coral', 'nuvem', 'musgo', 'ameixa'].map((id, i) => ({ key: `deco${i}`, characterId: id })),
    );
    ['bolota', 'coral', 'nuvem', 'musgo', 'ameixa'].forEach((_, i) => stage.setAnim(`deco${i}`, i % 2 ? 'cheer' : 'idle'));
    this.conn.setLocked(false);
    this.menu.mode = 'lobby';
    this.hud.setRound(null);
    this.hud.setScoreboard(null);
    this.hud.hint('Teclas 1 / 2: jogador de teclado  ·  I: trocar IP  ·  Enter: Festa  ·  D: Desportos  ·  Esc: definições');

    this.hud.panel(`
      <h1>FESTA 🎉</h1>
      <div class="lobby">
        <div class="join">
          <canvas id="qr" width="400" height="400"></canvas>
          <div class="label">CÓDIGO DA SALA</div>
          <div class="code" id="code">····</div>
          <div class="url" id="url"></div>
          <div class="android-tip">📱 Android: se não abrir (<b>ERR_TOO_MANY_RETRIES</b>), dá ao Chrome a permissão
            <b>Dispositivos próximos</b> (Definições → Apps → Chrome → Permissões) ou usa o Firefox.<br />
            Aviso "ligação não privada"? Toca em <b>Avançadas → Continuar</b>.</div>
        </div>
        <div>
          <h2 id="lobby-hint">Lê o código com o telemóvel para entrar!</h2>
          <div class="slots" id="slots"></div>
        </div>
      </div>
    `);
    const panel = this.hud.panelElement();
    const renderRoom = async () => {
      const code = this.conn.roomCode;
      if (!code) return;
      const [url, base] = await Promise.all([getJoinUrl(code), getJoinBaseUrl()]);
      const canvas = panel.querySelector<HTMLCanvasElement>('#qr');
      if (!canvas) return;
      panel.querySelector('#code')!.textContent = code;
      panel.querySelector('#url')!.textContent = `${base.replace(/^https?:\/\//, '')}/play`;
      await QRCode.toCanvas(canvas, url, { width: 400, margin: 2, errorCorrectionLevel: 'M' });
    };
    const renderPlayers = () => {
      const players = this.hub.players.slice(0, MAX_PLAYERS);
      const slots = panel.querySelector('#slots');
      if (!slots) return;
      slots.innerHTML = Array.from({ length: MAX_PLAYERS }, (_, i) => {
        const p = players[i];
        if (!p) return `<div class="slot empty">${i < RULES.minPlayers ? 'À espera…' : 'Lugar livre'}</div>`;
        const tags = [p.isVip ? '⭐ VIP' : '', p.source === 'keyboard' ? '⌨ teclado' : '', p.connected ? '' : 'desligado']
          .filter(Boolean)
          .join(' · ');
        return `<div class="slot" style="opacity:${p.connected ? 1 : 0.5}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)} <small>${tags}</small></div>`;
      }).join('');
      const humans = players.length;
      const bots = humans ? seatCount(humans) - humans : 0;
      panel.querySelector('#lobby-hint')!.textContent = `🤖 Bots: ${settings.botLevelLabel} · ` + (humans
        ? `${humans} jogador${humans > 1 ? 'es' : ''}${bots ? ` + ${bots} bot${bots > 1 ? 's' : ''}` : ''} · ${this.hub.vip ? `⭐ ${this.hub.vip.name} escolhe o modo no telemóvel` : 'Enter: Festa · D: Desportos'}`
        : 'Lê o código com o telemóvel para entrar!');
      // Telemóveis
      const vip = this.hub.vip;
      for (const p of this.hub.players) {
        if (p === vip) {
          this.hub.setLayout(
            {
              kind: 'choices',
              prompt: 'És o VIP ⭐ Quando estiverem todos, escolhe o modo:',
              options: [
                ...RULES.roundOptions.map((r) => ({ id: `start:${r}`, label: `🎲 Festa · ${r} rondas`, color: '#ffd23f' })),
                { id: 'sports', label: '🏆 Desportos', color: '#3fd0ff' },
                { id: 'bots', label: `🤖 Bots: ${settings.botLevelLabel} (mudar)` },
              ],
            },
            p,
          );
        } else {
          this.hub.setLayout({ kind: 'wait', message: vip ? `Estás dentro! À espera que ${vip.name} comece…` : 'Estás dentro!' }, p);
        }
      }
    };

    void renderRoom();
    renderPlayers();
    const offs: (() => void)[] = [];
    const choice = await new Promise<LobbyChoice>((resolve) => {
      const tryStart = (r: number | 'sports') => {
        if (this.hub.players.length === 0) return;
        resolve(r === 'sports' ? { mode: 'sports' } : { mode: 'party', rounds: r });
      };
      offs.push(
        this.conn.events.on('room', () => void renderRoom()),
        this.hub.events.on('changed', renderPlayers),
        settings.events.on('changed', renderPlayers),
        this.hub.events.on('choice', ({ player, id }) => {
          if (player.isVip && id.startsWith('start:')) tryStart(Number(id.split(':')[1]));
          if (player.isVip && id === 'sports') tryStart('sports');
          if (player.isVip && id === 'bots') settings.cycleBotLevel();
        }),
      );
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Enter') tryStart(10);
        if (e.code === 'KeyD') tryStart('sports');
        // Atalho de desenvolvimento: festa de 1 ronda para testar o final.
        if (e.code === 'KeyT' && import.meta.env.DEV) tryStart(1);
        if (e.code === 'KeyI') void cycleLanAddress().then((ok) => { if (ok) void renderRoom(); });
      };
      window.addEventListener('keydown', onKey);
      offs.push(() => window.removeEventListener('keydown', onKey));
    });
    offs.forEach((off) => off());
    this.menu.close();
    this.menu.mode = 'off';
    this.hud.panel(null);
    this.hud.hint(null);
    return choice;
  }

  // ── Escolha de personagens ─────────────────────────────

  /** Escolha de personagens; `seats` diz quantos lugares (humanos + bots) há. */
  private async characterSelect(seats: (humans: number) => number = seatCount): Promise<void> {
    this.conn.setLocked(true);
    const humans = this.hub.players.slice(0, Math.min(MAX_PLAYERS, seats(MAX_PLAYERS)));
    const picks = new Map<string, string>(); // jogador → personagem
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.view({ distance: 17, height: 4.5, orbitSpeed: 0, target: new THREE.Vector3(0, 1.4, 0) });
    stage.setLineup(CHARACTERS.map((c) => ({ key: c.id, characterId: c.id, label: c.name })));
    await this.hud.banner('Escolhe a tua personagem!', { hold: 1.2 });
    this.hud.hint('Escolhe no telemóvel  ·  Enter: escolher ao acaso para quem falta');

    const ownerOf = (charId: string) => [...picks].find(([, c]) => c === charId)?.[0];
    const refresh = () => {
      for (const c of CHARACTERS) {
        const owner = ownerOf(c.id);
        const player = owner ? humans.find((h) => h.id === owner) : undefined;
        stage.setLabel(c.id, player ? `${c.name} · ${player.name}` : c.name, player ? '#ffd23f' : '#ffffff');
        stage.setAnim(c.id, player ? 'cheer' : 'idle');
      }
      for (const h of humans) {
        const mine = picks.get(h.id);
        this.hub.setLayout(
          mine
            ? { kind: 'wait', message: `Escolheste ${getCharacter(mine).name}! À espera dos outros…` }
            : {
                kind: 'choices',
                prompt: 'Escolhe a tua personagem',
                columns: 2,
                options: CHARACTERS.map((c) => ({
                  id: `char:${c.id}`,
                  label: c.name,
                  color: c.color,
                  disabled: !!ownerOf(c.id),
                })),
              },
          h,
        );
      }
    };
    const pickRandom = (playerId: string) => {
      const free = CHARACTERS.filter((c) => !ownerOf(c.id));
      picks.set(playerId, this.rng.pick(free).id);
    };
    refresh();

    await new Promise<void>((resolve) => {
      const check = () => {
        refresh();
        if (humans.every((h) => picks.has(h.id))) {
          offs.forEach((off) => off());
          resolve();
        }
      };
      const offs = [
        this.hub.events.on('choice', ({ player, id }) => {
          if (!id.startsWith('char:') || picks.has(player.id) || !humans.includes(player)) return;
          const charId = id.slice(5);
          if (ownerOf(charId) || !CHARACTERS.some((c) => c.id === charId)) return;
          picks.set(player.id, charId);
          this.hub.vibrate(player, 40);
          check();
        }),
      ];
      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Enter') return;
        for (const h of humans) if (!picks.has(h.id)) pickRandom(h.id);
        check();
      };
      window.addEventListener('keydown', onKey);
      offs.push(() => window.removeEventListener('keydown', onKey));
      // Teclado e desligados escolhem ao acaso.
      void (async () => {
        while (!humans.every((h) => picks.has(h.id))) {
          await this.engine.wait(0.6);
          for (const h of humans) {
            if (!picks.has(h.id) && (h.source === 'keyboard' || !h.connected)) {
              pickRandom(h.id);
              check();
              break;
            }
          }
        }
      })();
    });

    this.seats = humans.map((h) => ({
      id: h.id,
      name: h.name,
      characterId: picks.get(h.id)!,
      isBot: false,
      botPad: new BotPad(),
    }));
    const botCount = Math.max(0, seats(humans.length) - humans.length);
    const free = this.rng.shuffle(CHARACTERS.filter((c) => !ownerOf(c.id)));
    for (let i = 0; i < botCount; i++) {
      const c = free[i]!;
      this.seats.push({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() });
      stage.setLabel(c.id, `${c.name} · CPU`, '#b9a9e8');
      stage.setAnim(c.id, 'cheer');
    }
    this.hud.hint(null);
    if (botCount) {
      await this.hud.banner(`${botCount} bot${botCount > 1 ? 's' : ''} entra${botCount > 1 ? 'm' : ''} na festa!`, {
        sub: this.seats.filter((s) => s.isBot).map((s) => s.name).join(', '),
        hold: 2,
      });
    } else {
      await this.engine.wait(1);
    }
  }

  // ── Festa ───────────────────────────────────────────────

  private seat(id: string): Seat {
    return this.seats.find((s) => s.id === id)!;
  }

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

  private async sports(): Promise<void> {
    let def = await this.pickSport();
    if (!def) return;
    await this.characterSelect(def.seatCount);
    for (;;) {
      const next = await this.playSport(def);
      if (next === 'lobby') return;
      if (next === 'other') {
        const other = await this.pickSport();
        if (!other) return;
        const humans = this.seats.filter((s) => !s.isBot).length;
        const needsNewSeats = other.seatCount(humans) !== this.seats.length;
        def = other;
        if (needsNewSeats) await this.characterSelect(def.seatCount);
      }
    }
  }

  private async pickSport(): Promise<SportDef | null> {
    this.menu.mode = 'off';
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.view({ distance: 16, height: 5, orbitSpeed: 0.1 });
    this.conn.setLocked(true);
    this.hud.setScoreboard(null);
    this.hud.setRound(null);
    if (SPORTS.length === 0) {
      await this.hud.banner('Ainda não há desportos', { sub: 'A voltar ao lobby…', hold: 2.5 });
      return null;
    }
    let selected = 0;
    const render = () =>
      this.hud.panel(`
        <h1>🏆 Desportos</h1>
        <h2>${this.hub.vip ? `⭐ ${esc(this.hub.vip.name)} escolhe no telemóvel` : '↑ ↓ para escolher · Enter para jogar'}</h2>
        <div class="sports">${SPORTS.map(
          (s, i) => `<div class="sport ${i === selected ? 'selected' : ''}"><span class="emoji">${s.emoji}</span>
            <span class="name">${esc(s.name)}</span><span class="desc">${esc(s.description)}</span></div>`,
        ).join('')}</div>
        <p style="font-size:2.2vh;color:#b9a9e8">Esc: voltar ao lobby</p>`);
    render();
    const vip = this.hub.vip;
    for (const p of this.hub.players) {
      this.hub.setLayout(
        p === vip
          ? {
              kind: 'choices',
              prompt: 'Escolhe o desporto',
              options: [
                ...SPORTS.map((s) => ({ id: `sport:${s.id}`, label: `${s.emoji} ${s.name}` })),
                { id: 'back', label: '↩ Voltar ao lobby' },
              ],
            }
          : { kind: 'wait', message: vip ? `${vip.name} está a escolher o desporto…` : 'À espera…' },
        p,
      );
    }
    const result = await new Promise<SportDef | null>((resolve) => {
      const finish = (d: SportDef | null) => {
        off();
        window.removeEventListener('keydown', onKey);
        resolve(d);
      };
      const off = this.hub.events.on('choice', ({ player, id }) => {
        if (!player.isVip) return;
        if (id === 'back') finish(null);
        const d = SPORTS.find((s) => `sport:${s.id}` === id);
        if (d) finish(d);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          selected = (selected + (e.code === 'ArrowDown' ? 1 : SPORTS.length - 1)) % SPORTS.length;
          render();
        }
        if (e.code === 'Enter') finish(SPORTS[selected]!);
        if (e.code === 'Escape') finish(null);
      };
      window.addEventListener('keydown', onKey);
    });
    this.hud.panel(null);
    return result;
  }

  /** Joga um desporto e devolve o que fazer a seguir. */
  private async playSport(def: SportDef): Promise<'again' | 'other' | 'lobby'> {
    this.hud.setScoreboard(null);
    this.hud.setRound(null);
    this.hud.panel(`<h1>${def.emoji} ${esc(def.name)}</h1><h2>${esc(def.description)}</h2>
      <p><span class="controls">${esc(def.howTo)}</span></p>
      <div class="timerbar"><div style="animation-duration:6s"></div></div>`);
    this.waitAll(`${def.emoji} ${def.name}! Olha para o ecrã 👀`);
    await this.engine.wait(6);
    this.hud.panel(null);

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
        .join('')}</div>
      <p style="font-size:2.2vh;color:#b9a9e8">Enter: outra vez · O: outro desporto · Esc: lobby</p>`);
    for (const st of standings) {
      this.seatsCtl.setLayout(byId.get(st.id)!, { kind: 'wait', message: `Ficaste em ${st.rank}.º lugar (${st.score})` });
    }
    const vip = this.hub.vip;
    if (vip) {
      this.hub.setLayout(
        {
          kind: 'choices',
          prompt: 'E agora?',
          options: [
            { id: 'again', label: `${def.emoji} Jogar outra vez` },
            { id: 'other', label: '🏆 Outro desporto' },
            { id: 'lobby', label: '↩ Voltar ao lobby' },
          ],
        },
        vip,
      );
    }
    const next = await new Promise<'again' | 'other' | 'lobby'>((resolve) => {
      const finish = (v: 'again' | 'other' | 'lobby') => {
        off();
        window.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const off = this.hub.events.on('choice', ({ player, id }) => {
        if (player.isVip && (id === 'again' || id === 'other' || id === 'lobby')) finish(id);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Enter') finish('again');
        if (e.code === 'KeyO') finish('other');
        if (e.code === 'Escape') finish('lobby');
      };
      window.addEventListener('keydown', onKey);
    });
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
