/**
 * Página /ver: o ecrã do jogo para quem joga fora de casa (no PC ou na TV de cada um).
 * O comando continua a ser o telemóvel (/play); aqui só se vê (e ouve) o ecrã grande.
 */
import { ROOM_CODE_LENGTH } from '@festa/shared';
import { ScreenViewer, type ViewerStatus } from '../common/screenViewer';

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: #0b0618; color: #fff; font-family: system-ui, sans-serif; }
  #app { position: fixed; inset: 0; display: grid; place-items: center; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
  .card { position: relative; z-index: 2; background: #1d1433ee; border: 2px solid #ffffff33; border-radius: 18px; padding: 24px 28px; text-align: center; max-width: 90vw; }
  .card h1 { margin: 0 0 6px; font-size: 28px; }
  .card p { margin: 6px 0; color: #cbbcf0; }
  .card input { font-size: 32px; width: 6.5ch; text-align: center; letter-spacing: 6px; text-transform: uppercase; border-radius: 10px; border: 0; padding: 6px; }
  .card button, #sound { font-size: 18px; border: 0; border-radius: 10px; padding: 10px 18px; background: #ffd23f; color: #1b1033; font-weight: 800; cursor: pointer; margin: 10px 4px 0; }
  #sound { position: absolute; z-index: 3; bottom: 16px; right: 16px; }
  #status { position: absolute; z-index: 3; top: 12px; left: 12px; font-size: 14px; background: #0008; padding: 4px 10px; border-radius: 8px; }
  .hidden { display: none !important; }
`;
document.head.appendChild(style);

const app = document.getElementById('app')!;
app.innerHTML = `
  <video id="video" playsinline autoplay muted></video>
  <div id="status" class="hidden"></div>
  <form class="card" id="form">
    <h1>📺 Ver o ecrã da Festa</h1>
    <p>Escreve o código da sala (está no ecrã grande).</p>
    <input id="code" maxlength="${ROOM_CODE_LENGTH}" autocomplete="off" autocapitalize="characters" />
    <div><button type="submit">Ver</button></div>
    <p><small>O comando é o telemóvel: abre o mesmo endereço com <b>/play</b>.</small></p>
  </form>
  <div class="card hidden" id="msg"></div>
  <button id="sound" class="hidden">🔊 Ligar som</button>
`;
const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const video = $<HTMLVideoElement>('#video');

const STATUS_TEXT: Record<ViewerStatus, string> = {
  connecting: 'A ligar…',
  waiting: 'À espera que o ecrã grande comece a partilhar (tecla V no PC).',
  live: '',
  error: '',
};

const viewer = new ScreenViewer(video, (status, detail) => {
  const msg = $('#msg');
  $('#status').classList.toggle('hidden', status !== 'live');
  $('#status').textContent = '🔴 Ao vivo';
  $('#sound').classList.toggle('hidden', status !== 'live' || !video.muted);
  if (status === 'live') {
    msg.classList.add('hidden');
    return;
  }
  msg.classList.remove('hidden');
  msg.innerHTML = status === 'error' ? `<h1>😕</h1><p>${detail ?? 'Erro'}</p><button id="retry">Tentar outra vez</button>` : `<h1>📺</h1><p>${STATUS_TEXT[status]}</p>`;
  msg.querySelector('#retry')?.addEventListener('click', () => {
    viewer.stop();
    msg.classList.add('hidden');
    $('#form').classList.remove('hidden');
  });
});

$('#sound').addEventListener('click', () => {
  video.muted = false;
  void video.play();
  $('#sound').classList.add('hidden');
});

function start(code: string): void {
  $('#form').classList.add('hidden');
  history.replaceState(null, '', `?room=${code}`);
  viewer.start(code);
}

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $<HTMLInputElement>('#code').value.trim().toUpperCase();
  if (code.length === ROOM_CODE_LENGTH) start(code);
});

const urlRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
if (urlRoom?.length === ROOM_CODE_LENGTH) start(urlRoom);
else $<HTMLInputElement>('#code').focus();
