/**
 * O Realizador: conduz a festa do princípio ao fim, encadeando regras
 * (@festa/game), animações (palcos 3D), interface (Hud) e telemóveis (Seats).
 *
 *   lobby → escolha de personagens → ordem de jogo → rondas
 *   (cada jogador: dados → andar → casa) → minijogo → … → estrelas bónus → pódio
 */
import QRCode from 'qrcode';
import * as THREE from 'three';
import {
  CHARACTERS,
  RULES,
  applyBonusStars,
  applyTurnOrder,
  awardMinigame,
  bonusStars,
  botChooseNext,
  botWantsStar,
  buyStar,
  canBuyStar,
  createIslandBoard,
  createParty,
  createRng,
  decideMinigameTeams,
  getCharacter,
  getPlayer,
  getSpace,
  isDoubles,
  isLastRounds,
  ranking,
  resolveLanding,
  rollDie,
  rollTurnOrder,
  seatCount,
  type MinigameMode,
  type PartyPlayer,
  type PartyState,
  type Rng,
} from '@festa/game';
import { MAX_PLAYERS } from '@festa/shared';
import type { HostConnection } from '../HostConnection';
import type { PlayerHub } from '../PlayerHub';
import { cycleLanAddress, getJoinBaseUrl, getJoinUrl } from '../joinUrl';
import type { Engine } from '../three/Engine';
import { BoardStage } from '../stages/BoardStage';
import { ShowcaseStage } from '../stages/ShowcaseStage';
import { Hud, esc, type ScoreEntry } from '../ui/Hud';
import { MINIGAMES, MODE_LABEL, pickMinigame } from '../minigames';
import { SPORTS } from '../sports';
import type { SportDef } from '../sports/types';
import type { MinigameContext, MinigameSeat } from '../minigames/types';
import { BotPad, SeatControl, type Seat } from './Seats';

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
  ) {
    this.seatsCtl = new SeatControl(hub, engine);
    conn.events.on('status', (s) =>
      this.hud.status(s === 'online' ? null : s === 'connecting' ? 'A ligar ao servidor…' : 'Sem ligação ao servidor'),
    );
  }

  async run(): Promise<void> {
    for (;;) {
      const choice = await this.lobby();
      if (choice.mode === 'sports') {
        await this.sports();
        continue;
      }
      await this.characterSelect();
      const state = await this.party(choice.rounds);
      await this.finale(state);
    }
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
    this.hud.setRound(null);
    this.hud.setScoreboard(null);
    this.hud.hint('Teclas 1 / 2: jogador de teclado  ·  I: trocar IP  ·  Enter: Festa  ·  D: Desportos');

    this.hud.panel(`
      <h1>FESTA 🎉</h1>
      <div class="lobby">
        <div class="join">
          <canvas id="qr" width="400" height="400"></canvas>
          <div class="label">CÓDIGO DA SALA</div>
          <div class="code" id="code">····</div>
          <div class="url" id="url"></div>
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
      panel.querySelector('#lobby-hint')!.textContent = humans
        ? `${humans} jogador${humans > 1 ? 'es' : ''}${bots ? ` + ${bots} bot${bots > 1 ? 's' : ''}` : ''} · ${this.hub.vip ? `⭐ ${this.hub.vip.name} escolhe o modo no telemóvel` : 'Enter: Festa · D: Desportos'}`
        : 'Lê o código com o telemóvel para entrar!';
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
        this.hub.events.on('choice', ({ player, id }) => {
          if (player.isVip && id.startsWith('start:')) tryStart(Number(id.split(':')[1]));
          if (player.isVip && id === 'sports') tryStart('sports');
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

  private scoreboard(state: PartyState, activeId: string | null = null): void {
    const entries: ScoreEntry[] = state.players.map((p) => {
      const hp = this.seatsCtl.hubPlayer(this.seat(p.id));
      return {
        id: p.id,
        name: p.name,
        color: getCharacter(p.characterId).color,
        coins: p.coins,
        stars: p.stars,
        active: p.id === activeId,
        isBot: p.isBot,
        connected: p.isBot || !!hp?.connected,
      };
    });
    this.hud.setScoreboard(entries);
  }

  private waitAll(message: string, except?: string): void {
    for (const s of this.seats) if (s.id !== except) this.seatsCtl.setLayout(s, { kind: 'wait', message });
  }

  private async party(totalRounds: number): Promise<PartyState> {
    this.rng = createRng();
    const board = createIslandBoard();
    const state = createParty(
      board,
      this.seats.map((s) => ({ id: s.id, name: s.name, characterId: s.characterId, isBot: s.isBot })),
      totalRounds,
      this.rng,
    );
    const stage = new BoardStage(this.engine, board, this.seats);
    this.engine.setStage(stage);
    await stage.arrange(new Map(state.players.map((p) => [p.id, p.spaceId])), true);
    stage.overview();
    this.scoreboard(state);
    this.waitAll('Olha para o ecrã 👀');
    await this.hud.banner(board.name, { sub: `${totalRounds} ronda${totalRounds > 1 ? 's' : ''} · a estrela custa ${RULES.starCost} 🪙`, hold: 2.5 });

    const start = getSpace(board, board.startId);
    stage.focusPoint(start.x, start.z, 1.1);
    await this.engine.wait(1);
    await this.turnOrder(state, stage);

    // A estrela aparece
    const star = getSpace(board, state.starSpaceId);
    stage.focusPoint(star.x, star.z, 1.2);
    await this.engine.wait(0.8);
    await stage.placeStar(state.starSpaceId, false);
    await this.hud.banner('A estrela está aqui!', { sub: `Passa por ela com ${RULES.starCost} 🪙 para a comprar`, hold: 2 });

    for (state.round = 1; state.round <= state.totalRounds; state.round++) {
      this.hud.setRound(`Ronda ${state.round} / ${state.totalRounds}`);
      stage.overview();
      const last = state.totalRounds - state.round + 1;
      await this.hud.banner(`Ronda ${state.round}`, {
        sub: isLastRounds(state)
          ? `${last === 1 ? 'Última ronda' : `Últimas ${last} rondas`}! Casas azuis e vermelhas valem o dobro`
          : undefined,
        hold: 1.6,
      });
      for (const p of state.players) await this.turn(state, stage, p);
      await this.minigame(state, stage);
    }
    this.hud.setRound(null);
    return state;
  }

  private async turnOrder(state: PartyState, stage: BoardStage): Promise<void> {
    await this.hud.banner('Quem começa?', { sub: 'Lancem o dado! O maior número joga primeiro', hold: 1.6 });
    const rolls = rollTurnOrder(state, this.rng);
    await Promise.all(
      state.players.map(async (p) => {
        const seat = this.seat(p.id);
        stage.faceCamera(p.id);
        await this.seatsCtl.decide(seat, {
          layout: { kind: 'dice', prompt: 'Lança o dado para decidir a ordem!', label: 'Lançar!' },
          valid: ['roll'],
          bot: () => 'roll',
          keyboardA: 'roll',
          botDelay: 0.6 + this.rng.next() * 1.5,
        });
        this.seatsCtl.setLayout(seat, { kind: 'wait', message: `Tiraste ${rolls.get(p.id)}!` });
        stage.token(p.id).setAnim('cheer');
        stage.floatText(p.id, String(rolls.get(p.id)), '#ffd23f');
        await this.engine.wait(0.7);
        stage.token(p.id).setAnim('idle');
      }),
    );
    applyTurnOrder(state, rolls);
    this.scoreboard(state);
    this.hud.panel(`
      <h1>Ordem de jogo</h1>
      <div class="rows">${state.players
        .map(
          (p, i) => `<div class="row" style="animation-delay:${i * 0.08}s">
            <span>${i + 1}.</span><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>
            <span>${esc(p.name)}</span><span>🎲 ${rolls.get(p.id)}</span><span></span></div>`,
        )
        .join('')}</div>`);
    await this.engine.wait(Math.min(5, 2 + state.players.length * 0.3));
    this.hud.panel(null);
  }

  private async turn(state: PartyState, stage: BoardStage, p: PartyPlayer): Promise<void> {
    const seat = this.seat(p.id);
    this.scoreboard(state, p.id);
    stage.focus(p.id);
    this.waitAll(`Vez de ${p.name}`, p.id);
    await this.hud.banner(`Vez de ${p.name}!`, { hold: 1.1 });
    stage.faceCamera(p.id);

    // Dados
    stage.spawnDice(p.id, 2);
    await this.rollPrompt(seat, 'Lança os dois dados!');
    const values = [rollDie(this.rng), rollDie(this.rng)];
    await stage.hitDice(p.id, values);
    await this.engine.wait(0.7);
    if (isDoubles(values)) {
      stage.token(p.id).setAnim('cheer');
      await this.hud.banner('Dados iguais!', { sub: 'Lança o terceiro dado!', hold: 1.3, color: '#ffd23f' });
      stage.token(p.id).setAnim('idle');
      stage.spawnDice(p.id, 1, true);
      await this.rollPrompt(seat, 'Dados iguais! Lança o terceiro dado!');
      const third = rollDie(this.rng);
      values.push(third);
      await stage.hitDice(p.id, [third]);
      await this.engine.wait(0.7);
    }
    const total = values.reduce((a, b) => a + b, 0);
    await stage.collapseDice(p.id, total);
    this.seatsCtl.setLayout(seat, { kind: 'wait', message: `Andas ${total} casas!` });
    await this.engine.wait(0.3);

    // Andar
    let steps = total;
    while (steps > 0) {
      const here = getSpace(state.board, p.spaceId);
      let next = here.next[0]!;
      if (here.next.length > 1) next = await this.chooseJunction(state, stage, p, here.id);
      await stage.hop(p.id, next);
      p.spaceId = next;
      steps--;
      stage.setStepCounter(p.id, steps > 0 ? steps : null);
      if (next === state.starSpaceId) await this.starOffer(state, stage, p);
    }
    stage.token(p.id).faceYaw(stage.cameraYawTo(stage.token(p.id).root.position.x, stage.token(p.id).root.position.z));

    // Casa
    await this.land(state, stage, p);
    await stage.arrange(new Map(state.players.map((o) => [o.id, o.spaceId])));
    this.scoreboard(state, p.id);
    await this.engine.wait(0.5);
    stage.token(p.id).setAnim('idle');
  }

  private rollPrompt(seat: Seat, prompt: string): Promise<string> {
    return this.seatsCtl.decide(seat, {
      layout: { kind: 'dice', prompt, label: 'Lançar!' },
      valid: ['roll'],
      bot: () => 'roll',
      keyboardA: 'roll',
      botDelay: 1.1,
    });
  }

  private async chooseJunction(state: PartyState, stage: BoardStage, p: PartyPlayer, spaceId: number): Promise<number> {
    const options = getSpace(state.board, spaceId).next;
    stage.showArrows(spaceId, options.map((id, i) => ({ spaceId: id, color: PATH_COLORS[i % PATH_COLORS.length]! })));
    this.hud.hint(`${p.name}: por onde vais?`);
    const choice = await this.seatsCtl.decide(this.seat(p.id), {
      layout: {
        kind: 'choices',
        prompt: 'Por onde vais?',
        options: options.map((id, i) => ({
          id: `path:${id}`,
          label: `${stage.screenDirection(spaceId, id)}  Caminho ${i + 1}`,
          color: PATH_COLORS[i % PATH_COLORS.length],
        })),
      },
      valid: options.map((id) => `path:${id}`),
      bot: () => `path:${botChooseNext(state, options, this.rng)}`,
      botDelay: 1.2,
    });
    stage.hideArrows();
    this.hud.hint(null);
    this.seatsCtl.setLayout(this.seat(p.id), { kind: 'wait', message: 'A caminho…' });
    return Number(choice.slice(5));
  }

  private async starOffer(state: PartyState, stage: BoardStage, p: PartyPlayer): Promise<void> {
    const seat = this.seat(p.id);
    stage.focus(p.id, true);
    stage.faceCamera(p.id);
    if (!canBuyStar(p)) {
      stage.token(p.id).setAnim('sad');
      await this.hud.banner('A estrela!', { sub: `${p.name} precisa de ${RULES.starCost} 🪙 (tem ${p.coins})`, hold: 2 });
      stage.token(p.id).setAnim('idle');
      stage.focus(p.id);
      return;
    }
    const answer = await this.seatsCtl.decide(seat, {
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
    this.seatsCtl.setLayout(seat, { kind: 'wait', message: 'A caminho…' });
    if (answer === 'buy' && buyStar(state, p, this.rng)) {
      this.scoreboard(state, p.id);
      this.seatsCtl.vibrate(seat, [60, 40, 60, 40, 200]);
      await stage.collectStar(p.id);
      await this.hud.banner(`${p.name} ganhou uma estrela!`, { hold: 1.8, color: '#ffd23f' });
      const next = getSpace(state.board, state.starSpaceId);
      stage.focusPoint(next.x, next.z, 1.4);
      await stage.placeStar(state.starSpaceId, true);
      await this.engine.wait(0.8);
    }
    stage.focus(p.id);
  }

  private async land(state: PartyState, stage: BoardStage, p: PartyPlayer): Promise<void> {
    const seat = this.seat(p.id);
    const landing = resolveLanding(state, p, this.rng);
    const token = stage.token(p.id);
    const e = landing.effect;

    if (e.kind === 'coins') {
      const good = e.amount >= 0;
      stage.floatText(p.id, `${good ? '+' : ''}${e.amount} 🪙`, good ? '#ffd23f' : '#ff6b7a');
      token.setAnim(good ? 'cheer' : 'sad');
      this.seatsCtl.vibrate(seat, good ? 40 : [80, 60, 80]);
      if (landing.type === 'lucky') await this.hud.banner('Casa da sorte!', { sub: `+${e.amount} moedas`, hold: 1.4, color: '#25c26b' });
      else if (landing.type === 'unlucky') await this.hud.banner('Que azar!', { sub: `${e.amount} moedas`, hold: 1.4, color: '#b98cff' });
      else await this.engine.wait(1.1);
    } else if (e.kind === 'give') {
      const to = getPlayer(state, e.to);
      stage.floatText(p.id, `-${e.amount} 🪙`, '#ff6b7a');
      stage.floatText(to.id, `+${e.amount} 🪙`, '#ffd23f');
      token.setAnim('sad');
      stage.token(to.id).setAnim('cheer');
      await this.hud.banner('Que azar!', { sub: `${p.name} dá ${e.amount} moedas a ${to.name}`, hold: 1.8, color: '#b98cff' });
      stage.token(to.id).setAnim('idle');
    } else if (e.kind === 'swap') {
      const other = getPlayer(state, e.with);
      await this.hud.banner('Tornado!', { sub: `${p.name} troca de lugar com ${other.name}`, hold: 1.4, color: '#ffa41b' });
      await this.tornadoSwap(stage, p.id, other.id);
    } else {
      await this.engine.wait(0.6);
    }
  }

  private async tornadoSwap(stage: BoardStage, a: string, b: string): Promise<void> {
    const ta = stage.token(a);
    const tb = stage.token(b);
    const pa = ta.root.position.clone();
    const pb = tb.root.position.clone();
    ta.setAnim('dizzy');
    tb.setAnim('dizzy');
    stage.overview();
    await this.engine.tween(2.2, (t) => {
      const lift = Math.sin(t * Math.PI) * 8;
      ta.root.position.lerpVectors(pa, pb, t).setY(pa.y + lift);
      tb.root.position.lerpVectors(pb, pa, t).setY(pb.y + lift);
      ta.root.rotation.y += 0.4;
      tb.root.rotation.y += 0.4;
    });
    ta.setAnim('idle');
    tb.setAnim('idle');
    stage.focus(a);
  }

  // ── Minijogo ────────────────────────────────────────────

  private async minigame(state: PartyState, board: BoardStage): Promise<void> {
    this.scoreboard(state);
    const teams = decideMinigameTeams(state, this.rng);
    const def =
      MINIGAMES.find((m) => m.id === this.forcedMinigame && m.modes.includes(teams.mode)) ??
      pickMinigame(teams.mode, this.rng, this.lastMinigame);
    this.lastMinigame = def.id;
    const teamOf = (id: string): MinigameSeat['team'] =>
      teams.mode === 'ffa' ? null : teams.blue.includes(id) ? 'blue' : 'red';
    const mgSeats: MinigameSeat[] = state.players.map((p) => ({
      id: p.id,
      name: p.name,
      characterId: p.characterId,
      team: teamOf(p.id),
    }));

    this.waitAll('Minijogo! Olha para o ecrã 👀');
    board.overview();
    await this.hud.banner('Minijogo!', { sub: MODE_LABEL[teams.mode], hold: 1.6, color: '#ffd23f' });

    const chip = (id: string) => {
      const p = getPlayer(state, id);
      return `<span class="chip"><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>${esc(p.name)}</span>`;
    };
    const teamsHtml =
      teams.mode === 'ffa'
        ? `<div class="teams"><div class="team ffa">${teams.blue.map(chip).join('')}</div></div>`
        : `<div class="teams"><div class="team blue">${teams.blue.map(chip).join('')}</div><div class="vs">VS</div><div class="team red">${teams.red.map(chip).join('')}</div></div>`;
    const INTRO = 7;
    this.hud.panel(`
      <h1>${esc(def.name)}</h1>
      <h2>${MODE_LABEL[teams.mode]}</h2>
      ${teamsHtml}
      <p>${esc(def.description(teams.mode))}</p>
      <p><span class="controls">${esc(def.controls)}</span></p>
      <div class="timerbar"><div style="animation-duration:${INTRO}s"></div></div>
    `);
    const layout = (seat: Seat) => ({
      kind: 'gamepad' as const,
      stick: def.stick,
      buttons: def.buttons,
      hint:
        teams.mode === 'ffa'
          ? def.name
          : `${def.name} · equipa ${teamOf(seat.id) === 'blue' ? '🔵 azul' : '🔴 vermelha'}`,
    });
    this.seatsCtl.setLayoutAll(this.seats, layout);
    await this.engine.wait(INTRO);
    this.hud.panel(null);

    const ctx: MinigameContext = {
      engine: this.engine,
      mode: teams.mode,
      seats: mgSeats,
      rng: this.rng,
      pad: (id) => this.seatsCtl.pad(this.seat(id)),
      botPad: (id) => this.seat(id).botPad,
      isBot: (id) => this.seatsCtl.needsBot(this.seat(id)),
      vibrate: (id, ms) => this.seatsCtl.vibrate(this.seat(id), ms),
    };
    for (const s of this.seats) s.botPad.reset();
    this.hub.clearPresses();
    const run = def.create(ctx);
    this.engine.setStage(run, false);

    const updateHud = () => {
      const scores = new Map(run.scores().map((s) => [s.id, s.value]));
      this.hud.setRound(`⏱ ${Math.ceil(run.timeLeft())}`);
      this.hud.setScoreboard(
        state.players.map((p) => ({
          id: p.id,
          name: p.name,
          color: getCharacter(p.characterId).color,
          coins: p.coins,
          stars: p.stars,
          active: false,
          isBot: p.isBot,
          connected: true,
          tag: scores.get(p.id),
        })),
      );
    };
    updateHud();
    for (const n of ['3', '2', '1']) await this.hud.big(n, 0.8);
    run.start();
    void this.hud.big('JÁ!', 0.6);
    while (!run.finished) {
      updateHud();
      await this.engine.wait(0.2);
    }
    updateHud();
    this.waitAll('Fim do minijogo!');
    await this.hud.big('FIM!', 1.4);

    const winners = run.winners();
    const awarded = awardMinigame(state, winners);
    for (const id of winners) {
      this.seatsCtl.vibrate(this.seat(id), [80, 50, 80]);
      this.seatsCtl.toast(this.seat(id), `Ganhaste! +${awarded.get(id) ?? 0} 🪙`);
    }
    const sorted = [...state.players].sort((a, b) => Number(winners.includes(b.id)) - Number(winners.includes(a.id)));
    this.hud.panel(`
      <h1>${winners.length ? 'Vencedores!' : 'Ninguém ganhou!'}</h1>
      <div class="rows">${sorted
        .map((p, i) => {
          const win = winners.includes(p.id);
          return `<div class="row ${win ? 'win' : ''}" style="animation-delay:${i * 0.07}s">
            <span>${win ? '🏆' : ''}</span><span class="dot" style="background:${getCharacter(p.characterId).color}"></span>
            <span>${esc(p.name)}</span><span class="gain">${win ? `+${awarded.get(p.id) ?? 0} 🪙` : ''}</span><span>🪙 ${p.coins}</span></div>`;
        })
        .join('')}</div>`);
    await this.engine.wait(4);
    this.hud.panel(null);

    run.dispose();
    this.engine.setStage(board, false);
    this.hud.setRound(`Ronda ${state.round} / ${state.totalRounds}`);
    this.scoreboard(state);
    for (const p of state.players) board.token(p.id).setAnim(winners.includes(p.id) ? 'cheer' : 'idle');
    await this.engine.wait(1.2);
    for (const p of state.players) board.token(p.id).setAnim('idle');
  }

  /**
   * Desenvolvimento: corre um minijogo sozinho (abrir /?minigame=<id>&mode=<modo>).
   * Bots em todos os lugares, mais quem estiver ligado (telemóvel ou teclado).
   */
  async testMinigame(id: string, mode: MinigameMode, players = 4): Promise<void> {
    const humans = this.hub.players.slice(0, players);
    const bots = CHARACTERS.slice(humans.length, players);
    this.seats = [
      ...humans.map((h, i) => ({ id: h.id, name: h.name, characterId: CHARACTERS[i]!.id, isBot: false, botPad: new BotPad() })),
      ...bots.map((c) => ({ id: `bot-${c.id}`, name: c.name, characterId: c.id, isBot: true, botPad: new BotPad() })),
    ];
    const state = createParty(
      createIslandBoard(),
      this.seats.map((s) => ({ id: s.id, name: s.name, characterId: s.characterId, isBot: s.isBot })),
      1,
      this.rng,
    );
    state.players.forEach((p, i) => {
      p.color = mode === 'ffa' ? 'blue' : mode === 'oneVsAll' ? (i === 0 ? 'red' : 'blue') : i % 2 ? 'red' : 'blue';
    });
    const board = new BoardStage(this.engine, state.board, this.seats);
    this.engine.setStage(board);
    this.forcedMinigame = id;
    for (;;) await this.minigame(state, board);
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
    });
    this.engine.setStage(run);
    const standings = await run.play();
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

  // ── Final ───────────────────────────────────────────────

  private async finale(state: PartyState): Promise<void> {
    this.waitAll('Fim da festa! Olha para o ecrã 👀');
    this.hud.setScoreboard(null);
    await this.hud.banner('Fim da festa!', { sub: 'Hora das estrelas bónus…', hold: 2.4, color: '#ffd23f' });

    for (const bonus of bonusStars(state)) {
      const names = bonus.winners.map((id) => getPlayer(state, id).name).join(', ');
      this.hud.panel(`<h1>⭐ ${esc(bonus.title)}</h1><h2>${esc(bonus.description)}</h2><p style="font-size:5vh;font-weight:bold">${esc(names)}</p>`);
      applyBonusStars(state, [bonus]);
      await this.engine.wait(3.2);
    }
    this.hud.panel(null);

    const ranked = ranking(state);
    const stage = new ShowcaseStage();
    this.engine.setStage(stage);
    stage.showPodium(ranked.map((r) => ({ key: r.player.id, characterId: r.player.characterId, rank: r.rank, name: r.player.name })));
    const winners = ranked.filter((r) => r.rank === 1).map((r) => r.player.name);
    await this.hud.banner(winners.length > 1 ? `${winners.join(' e ')} empatam!` : `${winners[0]} é a estrela da festa!`, {
      hold: 3,
      color: '#ffd23f',
    });
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
    for (const r of ranked) {
      const seat = this.seat(r.player.id);
      this.seatsCtl.setLayout(seat, { kind: 'wait', message: `Ficaste em ${r.rank}.º lugar com ${r.player.stars} ⭐!` });
    }
    this.hud.hint('Enter ou o VIP no telemóvel: voltar ao lobby');

    const vip = this.hub.vip;
    if (vip) this.hub.setLayout({ kind: 'choices', prompt: 'Obrigado por jogares!', options: [{ id: 'lobby', label: 'Voltar ao lobby' }] }, vip);
    await new Promise<void>((resolve) => {
      const offs = [
        this.hub.events.on('choice', ({ player, id }) => player.isVip && id === 'lobby' && done()),
      ];
      const onKey = (e: KeyboardEvent) => e.code === 'Enter' && done();
      window.addEventListener('keydown', onKey);
      function done() {
        offs.forEach((off) => off());
        window.removeEventListener('keydown', onKey);
        resolve();
      }
    });
    panel.classList.remove('compact');
    this.hud.panel(null);
    this.hud.hint(null);
  }
}
