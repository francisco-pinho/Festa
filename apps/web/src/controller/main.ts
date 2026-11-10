/**
 * Comando no telemóvel. Página web simples (sem instalar nada):
 * entra na sala com código + nome e depois mostra o que o ecrã principal pedir
 * (gamepad, escolhas ou espera).
 */
import './controller.css';
import { ROOM_CODE_LENGTH } from '@festa/shared';
import type {
  AckResult,
  CloseReason,
  ControllerInput,
  ControllerLayout,
  ErrorCode,
  PlayerInfo,
} from '@festa/shared';
import { ACK_TIMEOUT_MS, connectSocket } from '../common/socket';
import { capture, createJoystick } from './joystick';
import { renderMotion } from './motion';

const SESSION_KEY = 'festa.session';
const NAME_KEY = 'festa.name';
const STICK_INTERVAL_MS = 33; // ~30 envios/s

interface Session {
  roomCode: string;
  sessionToken: string;
}

const ERRORS: Record<ErrorCode, string> = {
  INVALID_REQUEST: 'Pedido inválido.',
  ROOM_NOT_FOUND: 'Não existe nenhuma sala com esse código.',
  ROOM_FULL: 'A sala está cheia.',
  ROOM_LOCKED: 'O jogo já começou. Espera pelo próximo!',
  INVALID_NAME: 'Escolhe um nome.',
  HOST_TOKEN_INVALID: 'Pedido inválido.',
  SERVER_FULL: 'O servidor está cheio. Tenta mais tarde.',
};

const CLOSE_REASONS: Record<CloseReason, string> = {
  HOST_LEFT: 'A festa acabou: o ecrã principal fechou a sala.',
  KICKED: 'Foste removido da sala.',
  REPLACED: 'Abriste o comando noutro separador ou dispositivo.',
  SERVER_SHUTDOWN: 'O servidor foi desligado.',
};

// ── Estado ────────────────────────────────────────────────
const socket = connectSocket();
let session = loadSession();
let me: PlayerInfo | null = null;
let layout: ControllerLayout | null = null;
let hostConnected = true;
let joining = false;
let cleanupView: (() => void) | null = null;
/** Layout atualmente desenhado (undefined = nenhum ecrã de jogo visível). */
let shownLayout: ControllerLayout | null | undefined;

const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
if (session && urlRoom && urlRoom !== session.roomCode) session = null;

// ── DOM base ──────────────────────────────────────────────
const app = document.getElementById('app')!;
app.innerHTML = `
  <header id="bar" hidden><span id="dot"></span><span id="me"></span><span id="room"></span></header>
  <main id="view"></main>
  <div id="overlay" hidden></div>
  <div id="toast" hidden></div>
`;
const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const view = $('#view');

// ── Socket ────────────────────────────────────────────────
socket.on('connect', () => {
  if (session) void join(session.roomCode, '', session.sessionToken);
  updateOverlay();
});
socket.on('disconnect', updateOverlay);
socket.on('room:players', (players) => {
  if (!me) return;
  me = players.find((p) => p.id === me!.id) ?? me;
  renderBar();
});
socket.on('room:hostStatus', (connected) => {
  hostConnected = connected;
  updateOverlay();
});
socket.on('room:closed', (reason) => {
  clearSession();
  renderClosed(CLOSE_REASONS[reason]);
});
socket.on('controller:message', (msg) => {
  switch (msg.t) {
    case 'layout':
      layout = msg.layout;
      renderLayout();
      break;
    case 'vibrate':
      navigator.vibrate?.(msg.pattern);
      break;
    case 'toast':
      showToast(msg.text);
      break;
  }
});

async function join(roomCode: string, name: string, sessionToken?: string): Promise<string | null> {
  if (joining) return null;
  joining = true;
  try {
    const res: AckResult<'player:join'> = await socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('player:join', { roomCode, name, sessionToken });
    if (!res.ok) {
      if (sessionToken) {
        // A sessão antiga já não é válida: volta ao ecrã de entrada.
        clearSession();
        renderJoin(res.error === 'ROOM_NOT_FOUND' ? 'A sala já não existe.' : ERRORS[res.error]);
      }
      return ERRORS[res.error];
    }
    session = { roomCode: res.roomCode, sessionToken: res.sessionToken };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    history.replaceState(null, '', `?room=${res.roomCode}`);
    me = res.player;
    hostConnected = true;
    renderBar();
    if (shownLayout === undefined || shownLayout !== layout) renderLayout();
    updateOverlay();
    keepAwake();
    return null;
  } catch {
    return 'Sem resposta do servidor. Tenta outra vez.';
  } finally {
    joining = false;
  }
}

function send(input: ControllerInput, volatile = false): void {
  if (!socket.connected) return;
  if (volatile) socket.volatile.emit('player:input', input);
  else socket.emit('player:input', input);
}

/** Envia o joystick no máximo a cada STICK_INTERVAL_MS; o "largar" vai sempre. */
const stickSender = (() => {
  let latest = { x: 0, y: 0 };
  let sent = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (latest.x === sent.x && latest.y === sent.y) return;
    sent = { ...latest };
    send({ t: 'stick', ...sent }, true);
    timer = setTimeout(flush, STICK_INTERVAL_MS);
  };
  return (x: number, y: number) => {
    latest = { x, y };
    if (x === 0 && y === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      sent = { x: 0, y: 0 };
      send({ t: 'stick', x: 0, y: 0 });
      return;
    }
    if (!timer) flush();
  };
})();

// ── Ecrãs ─────────────────────────────────────────────────
function setView(html: string): void {
  shownLayout = undefined;
  cleanupView?.();
  cleanupView = null;
  view.innerHTML = html;
}

function renderJoin(error = ''): void {
  me = null;
  layout = null;
  $('#bar').hidden = true;
  setView(`
    <form id="join" class="card" autocomplete="off">
      <h1>FESTA 🎉</h1>
      <label>Código da sala
        <input id="code" maxlength="${ROOM_CODE_LENGTH}" autocapitalize="characters" spellcheck="false"
               inputmode="text" placeholder="ABCD" required />
      </label>
      <label>O teu nome
        <input id="name" maxlength="16" placeholder="Nome" required />
      </label>
      <p id="error" class="error">${escapeHtml(error)}</p>
      <button type="submit" class="primary">Entrar</button>
    </form>
  `);
  const form = $<HTMLFormElement>('#join');
  const code = $<HTMLInputElement>('#code');
  const name = $<HTMLInputElement>('#name');
  code.value = urlRoom;
  name.value = localStorage.getItem(NAME_KEY) ?? '';
  (code.value ? name : code).focus();
  code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    goFullscreen();
    const button = form.querySelector('button')!;
    button.disabled = true;
    localStorage.setItem(NAME_KEY, name.value.trim());
    const err = await join(code.value, name.value);
    button.disabled = false;
    if (err) $('#error').textContent = err;
  });
}

function renderClosed(message: string): void {
  me = null;
  layout = null;
  $('#bar').hidden = true;
  setView(`
    <div class="card center">
      <h1>👋</h1>
      <p>${escapeHtml(message)}</p>
      <button class="primary" id="again">Entrar noutra sala</button>
    </div>
  `);
  $('#again').addEventListener('click', () => renderJoin());
}

function renderBar(): void {
  if (!me || !session) return;
  $('#bar').hidden = false;
  $('#dot').style.background = me.color;
  $('#me').textContent = `${me.isVip ? '⭐ ' : ''}${me.name}`;
  $('#room').textContent = session.roomCode;
  document.documentElement.style.setProperty('--player', me.color);
}

function renderLayout(): void {
  if (!me) return;
  const l = layout ?? { kind: 'wait', message: 'Estás dentro! Olha para o ecrã 👀' };
  switch (l.kind) {
    case 'wait':
      setView(`<div class="wait"><div class="pulse"></div><p>${escapeHtml(l.message)}</p></div>`);
      break;
    case 'choices':
      renderChoices(l);
      break;
    case 'gamepad':
      renderGamepad(l);
      break;
    case 'dice':
      renderDice(l);
      break;
    case 'motion':
      setView('');
      cleanupView = renderMotion(view, l, send);
      break;
  }
  shownLayout = layout;
}

function renderChoices(l: Extract<ControllerLayout, { kind: 'choices' }>): void {
  const cols = l.columns ?? 1;
  setView(`
    <div class="choices ${cols > 1 ? 'grid' : ''}" style="--cols:${cols}">
      <p class="prompt">${escapeHtml(l.prompt)}</p>
      <div class="options">
        ${l.options
          .map(
            (o) => `<button class="choice" data-id="${escapeHtml(o.id)}" ${o.disabled ? 'disabled data-locked' : ''}
              ${o.color ? `style="--opt:${o.color}"` : ''}>${o.color ? '<span class="swatch"></span>' : ''}${escapeHtml(o.label)}</button>`,
          )
          .join('')}
      </div>
    </div>
  `);
  const buttons = [...view.querySelectorAll<HTMLButtonElement>('.choice')];
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.vibrate?.(15);
      send({ t: 'choice', id: btn.dataset.id! });
      btn.classList.add('chosen');
      buttons.forEach((b) => (b.disabled = true));
      setTimeout(() => buttons.forEach((b) => (b.disabled = b.hasAttribute('data-locked'))), 800);
    });
  });
}

/** Lançar dados: botão grande ou abanar o telemóvel. */
function renderDice(l: Extract<ControllerLayout, { kind: 'dice' }>): void {
  setView(`
    <div class="dice">
      <p class="prompt">${escapeHtml(l.prompt)}</p>
      <button class="roll"><span class="die">🎲</span>${escapeHtml(l.label)}</button>
      <p class="shake-hint" hidden>…ou abana o telemóvel!</p>
      <button class="shake-enable" hidden>Ativar abanar 📳</button>
    </div>
  `);
  const button = view.querySelector<HTMLButtonElement>('.roll')!;
  let rolled = false;
  const roll = () => {
    if (rolled) return;
    rolled = true;
    navigator.vibrate?.([30, 30, 60]);
    send({ t: 'choice', id: 'roll' });
    button.disabled = true;
    button.classList.add('rolled');
  };
  button.addEventListener('click', roll);

  // Abanar: precisa de sensor de movimento (em iPhone só funciona com HTTPS e autorização).
  let last = 0;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration ?? e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const g = e.acceleration ? 0 : 9.8;
    const mag = Math.abs(Math.hypot(a.x, a.y, a.z) - g);
    const now = performance.now();
    if (mag > 16 && now - last > 300) {
      last = now;
      roll();
    }
  };
  const listen = () => {
    window.addEventListener('devicemotion', onMotion);
    view.querySelector<HTMLElement>('.shake-hint')!.hidden = false;
  };
  const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (DME && typeof DME.requestPermission === 'function') {
    const enable = view.querySelector<HTMLButtonElement>('.shake-enable')!;
    enable.hidden = false;
    enable.addEventListener('click', () => {
      DME.requestPermission!()
        .then((state) => {
          if (state === 'granted') listen();
          enable.hidden = true;
        })
        .catch(() => (enable.hidden = true));
    });
  } else if (DME && window.isSecureContext) {
    listen();
  }
  cleanupView = () => window.removeEventListener('devicemotion', onMotion);
}

function renderGamepad(l: Extract<ControllerLayout, { kind: 'gamepad' }>): void {
  setView(`
    <div class="gamepad">
      ${l.stick ? '<div class="stick-zone"></div>' : '<div class="spacer"></div>'}
      <div class="buttons">
        ${l.hint ? `<p class="hint">${escapeHtml(l.hint)}</p>` : ''}
        ${l.buttons.map((b) => `<button class="pad-btn btn-${b.id}" data-id="${b.id}">${escapeHtml(b.label || b.id.toUpperCase())}</button>`).join('')}
      </div>
    </div>
  `);
  const cleanups: (() => void)[] = [];
  const zone = view.querySelector<HTMLElement>('.stick-zone');
  if (zone) cleanups.push(createJoystick(zone, { onChange: stickSender }));

  view.querySelectorAll<HTMLButtonElement>('.pad-btn').forEach((btn) => {
    const button = btn.dataset.id as 'a' | 'b';
    let down = false;
    const set = (pressed: boolean) => {
      if (pressed === down) return;
      down = pressed;
      btn.classList.toggle('down', pressed);
      if (pressed) navigator.vibrate?.(10);
      send({ t: 'button', button, pressed });
    };
    btn.addEventListener('pointerdown', (e) => {
      set(true);
      capture(btn, e.pointerId);
      e.preventDefault();
    });
    btn.addEventListener('pointerup', () => set(false));
    btn.addEventListener('pointercancel', () => set(false));
    cleanups.push(() => set(false));
  });
  cleanupView = () => cleanups.forEach((fn) => fn());
}

// ── Avisos ────────────────────────────────────────────────
function updateOverlay(): void {
  const overlay = $('#overlay');
  let msg = '';
  if (!socket.connected && session) msg = 'Ligação perdida. A religar…';
  else if (me && !hostConnected) msg = 'O ecrã principal desligou-se. À espera que volte…';
  overlay.hidden = !msg;
  overlay.innerHTML = msg ? `<div class="spinner"></div><p>${escapeHtml(msg)}</p>` : '';
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(text: string): void {
  const toast = $('#toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2_500);
}

// ── Utilidades ────────────────────────────────────────────
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function clearSession(): void {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

function goFullscreen(): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

let wakeLock: WakeLockSentinel | null = null;
function keepAwake(): void {
  // Só funciona em HTTPS (modo online); em LAN por HTTP é ignorado.
  if (!('wakeLock' in navigator) || wakeLock) return;
  navigator.wakeLock
    .request('screen')
    .then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => (wakeLock = null));
    })
    .catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && me) keepAwake();
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Impede zoom/menus acidentais durante o jogo.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ── Arranque ──────────────────────────────────────────────
if (session) setView('<div class="wait"><div class="pulse"></div><p>A entrar…</p></div>');
else renderJoin();
