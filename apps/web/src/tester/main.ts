/**
 * Página /tester: painel de controlo do modo tester, no telemóvel (só em `npm run dev`).
 * Lê o QR do ecrã /teste. Não entra como jogador: fala com o ecrã pelo canal `tester:*`.
 */
import { MAX_PLAYERS, type TesterCmd, type TesterScenario, type TesterState } from '@festa/shared';
import { connectSocket } from '../common/socket';
import './tester.css';

type Tab = 'cenario' | 'tempo' | 'tabuleiro' | 'minijogo' | 'estado';
type Kind = TesterScenario['kind'];

const TABS: { id: Tab; label: string }[] = [
  { id: 'cenario', label: 'Cenário' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'tabuleiro', label: 'Tabuleiro' },
  { id: 'minijogo', label: 'Minijogo' },
  { id: 'estado', label: 'Estado' },
];
const KINDS: { id: Kind; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'menu', label: 'Menu de minijogos' },
  { id: 'party', label: 'Festa' },
  { id: 'minigame', label: 'Minijogo' },
  { id: 'sport', label: 'Desporto' },
  { id: 'finale', label: 'Fim da festa' },
];
const MODES: Record<string, string> = { ffa: 'Todos contra todos', teams: 'Equipas', oneVsAll: '1 contra todos' };
const PHASES: Record<TesterState['phase'], string> = {
  lobby: 'Lobby',
  menu: 'Menu',
  board: 'Tabuleiro',
  minigame: 'Minijogo',
  practice: 'Treino',
  sport: 'Desporto',
  finale: 'Fim da festa',
  other: 'A preparar…',
};

/** Últimos valores do formulário do cenário (lembrados neste telemóvel). */
interface Form {
  kind: Kind;
  board: string;
  rounds: number;
  minigame: string;
  mode: string;
  sport: string;
  players: number;
  botLevel: string;
  keyboardSeat: number | null;
  lobbyBots: number;
}
const FORM_KEY = 'festa.tester.form';
const form: Form = {
  kind: 'party',
  board: 'ilha',
  rounds: 2,
  minigame: '',
  mode: 'ffa',
  sport: '',
  players: 4,
  botLevel: 'normal',
  keyboardSeat: null,
  lobbyBots: 0,
  ...readForm(),
};
function readForm(): Partial<Form> {
  try {
    return JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>;
  } catch {
    return {};
  }
}
function saveForm(): void {
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(form));
  } catch {
    /* sem armazenamento */
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const opt = (value: string, label: string, selected: boolean) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

let tab: Tab = 'cenario';
let state: TesterState | null = null;
let hostOnline = false;
/** Jogador escolhido no separador Tabuleiro. */
let target = '';
/** Valores de dado a forçar (1 a 3). */
let dice: number[] = [];
/** Vencedores escolhidos para «Terminar com vencedor». */
const winners = new Set<string>();

const socket = connectSocket();
socket.on('connect', () => socket.emit('tester:join'));
socket.on('disconnect', () => {
  hostOnline = false;
  render();
});
socket.on('tester:hostStatus', (on) => {
  hostOnline = on;
  render();
});
socket.on('tester:state', (s) => {
  const first = !state;
  state = s;
  // O formulário do cenário só se redesenha quando chegam as listas (para não apagar o que se escreve).
  if (tab !== 'cenario' || first) render();
  else renderTop();
});

const send = (cmd: TesterCmd) => {
  if (hostOnline) socket.emit('tester:cmd', cmd);
};

const app = document.getElementById('app')!;
app.innerHTML = `
  <header id="top"></header>
  <nav id="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join('')}</nav>
  <main id="body"></main>`;
const top = document.getElementById('top')!;
const body = document.getElementById('body')!;

function renderTop(): void {
  const status = !socket.connected ? 'Sem ligação ao servidor…' : hostOnline ? 'Ligado ao ecrã' : 'À espera do ecrã /teste…';
  const phase = hostOnline && state ? PHASES[state.phase] : '—';
  top.innerHTML = `
    <div class="status ${hostOnline ? 'on' : 'off'}">${status}</div>
    <div class="phase">${phase}${state?.round ? ` · ronda ${state.round}/${state.totalRounds}` : ''}</div>
    <button class="small" data-cmd="reload"${hostOnline ? '' : ' disabled'}>↻ Recarregar</button>`;
}

function render(): void {
  renderTop();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  body.innerHTML = hostOnline && state ? VIEWS[tab](state) : `<p class="dim">Abre <b>localhost:5173/teste</b> no PC. O painel liga-se sozinho.</p>`;
  body.classList.toggle('locked', !hostOnline);
}

// ── Separadores ─────────────────────────────────────────

const VIEWS: Record<Tab, (s: TesterState) => string> = {
  cenario: (s) => {
    const c = s.catalog;
    if (!form.minigame) form.minigame = c.minigames[0]?.id ?? '';
    if (!form.sport) form.sport = c.sports[0]?.id ?? '';
    const mg = c.minigames.find((m) => m.id === form.minigame);
    const k = form.kind;
    const field = (label: string, html: string) => `<label><span>${label}</span>${html}</label>`;
    const parts = [field('Tipo', `<select data-f="kind">${KINDS.map((x) => opt(x.id, x.label, x.id === k)).join('')}</select>`)];
    if (k === 'party' || k === 'finale') parts.push(field('Mapa', `<select data-f="board">${c.boards.map((b) => opt(b.id, b.name, b.id === form.board)).join('')}</select>`));
    if (k === 'party') parts.push(field('Rondas', `<input type="number" min="1" max="30" data-f="rounds" value="${form.rounds}">`));
    if (k === 'minigame') {
      parts.push(field('Minijogo', `<select data-f="minigame">${c.minigames.map((m) => opt(m.id, `${m.name}${m.duel ? ' (duelo)' : ''}`, m.id === form.minigame)).join('')}</select>`));
      if (mg && !mg.duel) parts.push(field('Modo', `<select data-f="mode">${mg.modes.map((m) => opt(m, MODES[m] ?? m, m === form.mode)).join('')}</select>`));
    }
    if (k === 'sport') parts.push(field('Desporto', `<select data-f="sport">${c.sports.map((x) => opt(x.id, x.name, x.id === form.sport)).join('')}</select>`));
    if (k === 'lobby') {
      parts.push(field('Bots a mais', `<input type="number" min="0" max="${MAX_PLAYERS}" data-f="lobbyBots" value="${form.lobbyBots}">`));
      parts.push(field('Nível dos bots', `<select data-f="botLevel">${c.botLevels.map((l) => opt(l.id, l.label, l.id === form.botLevel)).join('')}</select>`));
    } else {
      parts.push(field('Jogadores', `<input type="number" min="1" max="${MAX_PLAYERS}" data-f="players" value="${form.players}">`));
      parts.push(field('Bots', `<select data-f="botLevel">${c.botLevels.map((l) => opt(l.id, l.label, l.id === form.botLevel)).join('')}</select>`));
    }
    if (k !== 'lobby' && k !== 'finale') {
      const seats = ['nenhum', ...Array.from({ length: MAX_PLAYERS }, (_, i) => `lugar ${i + 1}`)];
      parts.push(field('Teclado do PC', `<select data-f="keyboardSeat">${seats.map((l, i) => opt(String(i - 1), l, i - 1 === (form.keyboardSeat ?? -1))).join('')}</select>`));
    }
    return `<div class="form">${parts.join('')}</div><button class="big" data-cmd="launch">▶ Lançar</button>`;
  },

  tempo: (s) =>
    `<div class="row">${[0, 1, 2, 4]
      .map((x) => `<button class="big ${s.timeScale === x ? 'active' : ''}" data-time="${x}">${x === 0 ? '⏸' : `×${x}`}</button>`)
      .join('')}</div>`,

  tabuleiro: (s) => {
    if (s.phase !== 'board' && s.phase !== 'minigame' && s.phase !== 'practice') return `<p class="dim">Só durante uma festa.</p>`;
    if (!s.players.some((p) => p.id === target)) target = s.players[0]?.id ?? '';
    const p = s.players.find((x) => x.id === target);
    const items = s.catalog.items;
    return `
      <p class="dim">As alterações aplicam-se no início da próxima vez.</p>
      <div class="chips">${s.players.map((x) => `<button class="${x.id === target ? 'active' : ''}" data-target="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>
      <h3>Próximo dado</h3>
      <div class="row">${[1, 2, 3, 4, 5, 6].map((v) => `<button data-die="${v}">${v}</button>`).join('')}</div>
      <div class="row"><span class="dice">${dice.length ? dice.join(' + ') : '—'}</span><button data-cmd="dice-clear">Limpar</button><button data-cmd="dice-send"${dice.length ? '' : ' disabled'}>Forçar</button></div>
      ${
        p
          ? `<h3>${esc(p.name)} · 🪙 ${p.coins ?? 0} · ⭐ ${p.stars ?? 0}</h3>
      <div class="row">${[-20, -5, 5, 20].map((v) => `<button data-coins="${v}">${v > 0 ? '+' : ''}${v} 🪙</button>`).join('')}</div>
      <div class="row"><button data-stars="-1">−1 ⭐</button><button data-stars="1">+1 ⭐</button></div>
      <h3>Itens (toca para tirar)</h3>
      <div class="chips">${(p.items ?? []).map((it, i) => `<button data-take="${i}">${esc(items.find((x) => x.id === it)?.name ?? it)} ✕</button>`).join('') || '<span class="dim">nenhum</span>'}</div>
      <div class="row"><select id="item">${items.map((it) => opt(it.id, it.name, false)).join('')}</select><button data-cmd="give-item">Dar</button></div>
      <h3>Ir para a casa</h3>
      <div class="row"><select id="space">${(s.spaces ?? []).map((sp) => opt(String(sp.id), `${sp.id} · ${sp.type}${sp.id === s.starSpaceId ? ' ⭐' : ''}`, sp.id === p.spaceId)).join('')}</select><button data-cmd="teleport">Ir</button></div>`
          : ''
      }
      <h3>Festa</h3>
      <div class="row"><input type="number" id="round" min="1" max="${s.totalRounds ?? 30}" value="${s.round ?? 1}"><button data-cmd="round">Mudar ronda</button><button data-cmd="star">Mover ⭐</button></div>`;
  },

  minijogo: (s) => {
    const cur = s.scenario?.kind === 'minigame' ? s.scenario.id : '';
    const pick = `
      <h3>Iniciar minijogo</h3>
      <div class="chips">${s.catalog.minigames.map((m) => `<button class="${m.id === cur ? 'active' : ''}" data-mg="${esc(m.id)}">${esc(m.name)}${m.duel ? ' ⚔' : ''}</button>`).join('')}</div>`;
    if (s.phase !== 'minigame' && s.phase !== 'practice') return pick;
    return `
      <div class="row">${s.phase === 'practice' ? '<button class="big" data-cmd="skip">Saltar treino</button>' : ''}<button class="big" data-cmd="end">Terminar já</button></div>
      <h3>Terminar com vencedor</h3>
      <div class="chips">${s.players.map((p) => `<button class="${winners.has(p.id) ? 'active' : ''}" data-win="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
      <button class="big" data-cmd="end-win"${winners.size ? '' : ' disabled'}>Terminar com estes</button>${pick}`;
  },

  estado: (s) => `
    <p>${PHASES[s.phase]}${s.round ? ` · ronda ${s.round}/${s.totalRounds}` : ''} · tempo ×${s.timeScale}</p>
    <table>
      <tr><th>Jogador</th><th>🪙</th><th>⭐</th><th>Itens</th><th>Casa</th></tr>
      ${s.players
        .map(
          (p) => `<tr><td>${esc(p.name)}${p.isBot ? ' <small>CPU</small>' : ''}</td><td>${p.coins ?? '—'}</td><td>${p.stars ?? '—'}</td>
          <td>${(p.items ?? []).length}</td><td>${p.spaceId ?? '—'}</td></tr>`,
        )
        .join('')}
    </table>`,
};

// ── Ações ───────────────────────────────────────────────

function scenario(): TesterScenario {
  const common = { players: Math.min(MAX_PLAYERS, Math.max(1, form.players | 0)), botLevel: form.botLevel };
  const keyboardSeat = form.keyboardSeat;
  switch (form.kind) {
    case 'lobby':
      return { kind: 'lobby', bots: Math.min(MAX_PLAYERS, Math.max(0, form.lobbyBots | 0)), botLevel: form.botLevel };
    case 'menu':
      return { kind: 'menu', ...common, keyboardSeat };
    case 'party':
      return { kind: 'party', board: form.board, rounds: Math.min(30, Math.max(1, form.rounds | 0)), ...common, keyboardSeat };
    case 'minigame': {
      const mg = state?.catalog.minigames.find((m) => m.id === form.minigame);
      const mode = (mg?.modes.includes(form.mode) ? form.mode : mg?.modes[0] ?? 'ffa') as 'ffa' | 'teams' | 'oneVsAll';
      return { kind: 'minigame', id: form.minigame, mode, ...common, keyboardSeat };
    }
    case 'sport':
      return { kind: 'sport', id: form.sport, ...common, keyboardSeat };
    case 'finale':
      return { kind: 'finale', board: form.board, ...common };
  }
}

document.getElementById('tabs')!.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab as Tab;
  render();
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const f = el.dataset.f as keyof Form | undefined;
  if (!f) return;
  if (f === 'keyboardSeat') form.keyboardSeat = Number(el.value) < 0 ? null : Number(el.value);
  else if (f === 'players' || f === 'rounds' || f === 'lobbyBots') form[f] = Number(el.value);
  else (form as unknown as Record<string, string>)[f] = el.value;
  saveForm();
  if (f === 'kind' || f === 'minigame') render(); // muda os campos visíveis
});

app.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!b || b.disabled || b.dataset.tab) return;
  const d = b.dataset;
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  if (d.time) send({ t: 'time', scale: Number(d.time) as 0 | 1 | 2 | 4 });
  else if (d.target) target = d.target;
  else if (d.die) dice = dice.length >= 3 ? [Number(d.die)] : [...dice, Number(d.die)];
  else if (d.coins) send({ t: 'give', playerId: target, coins: Number(d.coins) });
  else if (d.stars) send({ t: 'give', playerId: target, stars: Number(d.stars) });
  else if (d.take) send({ t: 'takeItem', playerId: target, index: Number(d.take) });
  else if (d.mg) {
    // Mesmo formulário do Cenário (jogadores, bots, teclado); o modo cai no primeiro válido.
    form.kind = 'minigame';
    form.minigame = d.mg;
    saveForm();
    send({ t: 'scenario', scenario: scenario() });
  } else if (d.win) {
    if (winners.has(d.win)) winners.delete(d.win);
    else winners.add(d.win);
  } else
    switch (d.cmd) {
      case 'reload':
        send({ t: 'reload' });
        break;
      case 'launch':
        saveForm();
        send({ t: 'scenario', scenario: scenario() });
        break;
      case 'dice-clear':
        dice = [];
        break;
      case 'dice-send':
        send({ t: 'nextDice', values: dice });
        dice = [];
        break;
      case 'give-item':
        send({ t: 'give', playerId: target, item: value('item') });
        break;
      case 'teleport':
        send({ t: 'teleport', playerId: target, spaceId: Number(value('space')) });
        break;
      case 'round':
        send({ t: 'round', round: Math.max(1, Number(value('round')) | 0) });
        break;
      case 'star':
        send({ t: 'moveStar' });
        break;
      case 'skip':
        send({ t: 'skipPractice' });
        break;
      case 'end':
        send({ t: 'endMinigame' });
        break;
      case 'end-win':
        send({ t: 'endMinigame', winners: [...winners] });
        winners.clear();
        break;
    }
  if (tab !== 'cenario') render();
});

render();
