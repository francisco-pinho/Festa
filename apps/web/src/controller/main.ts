/**
 * Comando no telemóvel. Página web simples (sem instalar nada):
 * entra na sala com código + nome e depois mostra o que o ecrã principal pedir
 * (o comando, sempre igual, ou um ecrã de espera).
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
import { renderPad } from './pad';
import { renderBoard } from './boardview';
import { sensors } from './sensors';
import { ScreenViewer } from '../common/screenViewer';

const SESSION_KEY = 'festa.session';
const NAME_KEY = 'festa.name';
const SENSOR_ASKED_KEY = 'festa.sensorAsked';
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
  <video id="tv-video" playsinline autoplay muted hidden></video>
  <header id="bar" hidden>
    <span id="dot"></span><span id="me"></span><span id="room"></span>
    <button id="tv" class="bar-btn" aria-label="Ver o ecrã">📺</button>
    <button id="sensor" class="bar-btn" aria-label="Sensores">📵</button>
    <button id="menu" class="bar-btn" aria-label="Menu" hidden>☰</button>
  </header>
  <main id="view"></main>
  <div id="overlay" hidden></div>
  <div id="sheet" hidden></div>
  <div id="rotate"><div class="rotate-icon">📱</div><p>Roda o telemóvel para a horizontal</p><small>Toca aqui para ecrã inteiro</small></div>
  <div id="toast" hidden></div>
`;
const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const view = $('#view');
$('#sensor').addEventListener('click', openSensorSheet);

// ── Ver o ecrã grande no telemóvel (para quem joga fora de casa) ──
const tvVideo = $<HTMLVideoElement>('#tv-video');
let tvTimer = 0;
const tv = new ScreenViewer(tvVideo, (status, detail) => {
  if (status === 'waiting') showToast('📺 À espera que o ecrã grande partilhe (tecla V no PC)');
  if (status === 'error') showToast(`📺 ${detail ?? 'Não deu para ver o ecrã'}`);
});
function setWatching(on: boolean): void {
  document.body.classList.toggle('watching', on);
  $('#tv').classList.toggle('on', on);
  tvVideo.hidden = !on;
  window.clearInterval(tvTimer);
  if (on && session) {
    tv.start(session.roomCode);
    // Diz ao ecrã grande quanto atraso tem o vídeo (para compensar nos desportos de tempo).
    tvTimer = window.setInterval(async () => {
      const d = await tv.delay();
      if (d !== null) send({ t: 'lag', video: Math.round(d * 1000) / 1000 });
    }, 3000);
  } else {
    tv.stop();
    send({ t: 'lag', video: 0 });
  }
}
$('#tv').addEventListener('click', () => setWatching(!document.body.classList.contains('watching')));
$('#menu').addEventListener('click', () => {
  send({ t: 'button', button: 'plus', pressed: true });
  send({ t: 'button', button: 'plus', pressed: false });
});
$('#rotate').addEventListener('click', goLandscape);
// Qualquer toque durante o jogo tenta voltar a ecrã inteiro/horizontal (após recarregar a página).
document.addEventListener('pointerdown', () => {
  if (document.body.classList.contains('in-game') && !document.fullscreenElement) goLandscape();
});

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
    case 'ping':
      send({ t: 'pong', id: msg.id });
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
    setInGame(true);
    if (shownLayout === undefined || shownLayout !== layout) renderLayout();
    updateOverlay();
    keepAwake();
    maybeOfferSensors();
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
  setInGame(false);
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
    goLandscape();
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
  setInGame(false);
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
  $('#menu').hidden = !me.isVip;
  renderSensorBadge();
  document.documentElement.style.setProperty('--player', me.color);
}

function renderLayout(): void {
  if (!me) return;
  const l = layout ?? { kind: 'wait', message: 'Estás dentro! Olha para o ecrã 👀' };
  switch (l.kind) {
    case 'wait':
      setView(`<div class="wait"><div class="pulse"></div><p>${escapeHtml(l.message)}</p></div>`);
      break;
    case 'pad':
      setView('');
      cleanupView = renderPad(view, l, send, stickSender);
      break;
    case 'board':
      setView('');
      renderBoard(view, l);
      break;
  }
  shownLayout = layout;
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

// ── Sensores (painel 📳) ──────────────────────────────────
function renderSensorBadge(): void {
  const badge = $('#sensor');
  badge.textContent = sensors.active ? '📳' : '📵';
  badge.classList.toggle('on', sensors.active);
  badge.title = sensors.active ? 'Sensores ativos' : 'Sensores desligados';
}
sensors.onChange(renderSensorBadge);

function openSensorSheet(): void {
  const sheet = $('#sheet');
  const status = () =>
    !sensors.supported
      ? 'Este telemóvel/browser não dá acesso aos sensores aqui (é preciso abrir o jogo por <b>https://</b>). Podes jogar com toques e gestos no ecrã.'
      : sensors.active
        ? `✅ Sensores ativos. Sensibilidade do abanão: <b>${sensors.threshold.toFixed(1)}</b>`
        : sensors.denied
          ? '🚫 Autorização recusada. No iPhone: Definições → Safari → Movimento e orientação.'
          : 'Os sensores ainda não estão ativos.';
  const render = () => {
    sheet.innerHTML = `
      <div class="card sheet-card">
        <h2>📳 Sensores de movimento</h2>
        <p class="sheet-status">${status()}</p>
        ${sensors.supported && !sensors.active ? '<button class="primary" id="s-enable">Ativar sensores</button>' : ''}
        ${sensors.active ? '<button class="primary" id="s-cal">Calibrar abanão (3 s)</button>' : ''}
        <p class="sheet-meter" ${sensors.active ? '' : 'hidden'}><span id="s-bar"></span></p>
        <button id="s-close">Fechar</button>
      </div>`;
    sheet.querySelector('#s-enable')?.addEventListener('click', async () => {
      await sensors.enable();
      render();
    });
    sheet.querySelector('#s-cal')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '📳 Abana o telemóvel agora!';
      await sensors.calibrate(3);
      navigator.vibrate?.(80);
      render();
    });
    sheet.querySelector('#s-close')?.addEventListener('click', closeSheet);
  };
  // Medidor ao vivo do movimento
  const offMeter = sensors.onSample((s) => {
    const bar = sheet.querySelector<HTMLElement>('#s-bar');
    if (bar) bar.style.width = `${Math.min(100, (s.mag / (sensors.threshold * 1.5)) * 100)}%`;
  });
  const closeSheet = () => {
    offMeter();
    sheet.hidden = true;
    sheet.innerHTML = '';
  };
  sheet.hidden = false;
  render();
}

/** Na primeira vez que entra numa sala, oferece-se para ativar os sensores. */
function maybeOfferSensors(): void {
  if (!sensors.supported || localStorage.getItem(SENSOR_ASKED_KEY)) return;
  localStorage.setItem(SENSOR_ASKED_KEY, '1');
  // No Android começam sozinhos; só mostramos o painel se ao fim de 2 s ainda não houver dados.
  setTimeout(() => {
    if (!sensors.active) openSensorSheet();
  }, 2000);
}

// ── Horizontal ────────────────────────────────────────────
/** Ecrã inteiro + bloquear em paisagem (Android). No iPhone mostra-se o aviso para rodar. */
function goLandscape(): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  const lock = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => {});
  };
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
  else lock();
}

function setInGame(inGame: boolean): void {
  document.body.classList.toggle('in-game', inGame);
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
