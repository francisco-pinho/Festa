import { connection, hub } from './services';
import { installIconSwap } from '../common/icons';

// Emojis dos textos passam a ícones desenhados (em todo o ecrã grande).
installIconSwap(document.body);
import { Engine } from './three/Engine';
import { Hud } from './ui/Hud';
import { Director } from './game/Director';
import { GameMenu } from './ui/GameMenu';
import { ScreenMenus } from './ui/ScreenMenu';
import { getAsset, loadCharacterAssets } from './three/characterAssets';
import { loadProps } from './three/props';
import { ROOM_PROPS } from './stages/livingRoom';
import { loading } from './ui/loading';
import { sound } from './audio/Sound';
import { narrator } from './audio/Narrator';
import { ScreenShare } from './ScreenShare';

const engine = new Engine(document.getElementById('game')!);
const hud = new Hud(engine);
const menu = new GameMenu(engine, hub);
const menus = new ScreenMenus(engine, hub, () => menu.isOpen);
menu.keyboardBusy = () => menus.keyboardOpen;
narrator.init(hub);
const director = new Director(engine, hud, hub, connection, menu, menus);

// Som: os browsers só deixam tocar depois de um clique ou tecla no ecrã principal.
const soundBtn = document.createElement('button');
soundBtn.className = 'sound-unlock';
soundBtn.textContent = '🔇 Clica aqui (ou carrega numa tecla) para ligar o som';
document.getElementById('ui')!.appendChild(soundBtn);
const unlockSound = () => sound.unlock();
window.addEventListener('pointerdown', unlockSound);
window.addEventListener('keydown', unlockSound);
sound.onUnlockChange(() => (soundBtn.hidden = sound.unlocked));

// Vídeo do ecrã para quem joga fora de casa: tecla V partilha este separador (página /ver).
const screenShare = new ScreenShare(connection);
const shareBadge = document.createElement('div');
shareBadge.className = 'share-badge';
shareBadge.hidden = true;
document.getElementById('ui')!.appendChild(shareBadge);
screenShare.events.on('changed', ({ sharing, viewers }) => {
  shareBadge.hidden = !sharing && viewers === 0;
  shareBadge.classList.toggle('live', sharing);
  shareBadge.textContent = sharing
    ? `📺 A partilhar o ecrã · ${viewers} a ver`
    : `📺 ${viewers} à espera do vídeo · carrega V para partilhar`;
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyV' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest('input, textarea')) return;
  void screenShare.toggle();
});

const params = new URLSearchParams(location.search);
const testMinigame = import.meta.env.DEV ? params.get('minigame') : null;
const testSport = import.meta.env.DEV ? params.get('sport') : null;
// Ecrã de carregamento: as personagens (precisas em todos os ecrãs) e a sala de estar com a
// televisão carregam antes de tudo. O lobby esconde-o depois de a placa gráfica preparar a sala.
const testParty = import.meta.env.DEV ? params.get('party') : null;
const toLobby = !testParty && !testSport && !testMinigame;
let chars = 0;
let charsTotal = 1;
let room = 0;
const progress = () => {
  const p = (chars + room) / (charsTotal + ROOM_PROPS.length);
  loading.show(chars < charsTotal ? 'A carregar personagens…' : 'A carregar a sala…', p * 0.9);
};
progress();
const ready = Promise.all([
  loadCharacterAssets((done, total) => {
    chars = done;
    charsTotal = total;
    progress();
  }),
  ...ROOM_PROPS.map((k) =>
    loadProps([k]).then(() => {
      room++;
      progress();
    }),
  ),
]).then(() => {
  if (!toLobby) loading.hide();
});

const main = ready.then(() => testParty
  ? director.testParty(testParty, Number(params.get('players') ?? 4), Number(params.get('rounds') ?? 2))
  : testSport
  ? director.testSport(testSport, Number(params.get('players') ?? 2))
  : testMinigame
  ? director.testMinigame(
      testMinigame,
      (params.get('mode') as 'ffa' | 'teams' | 'oneVsAll' | null) ?? 'ffa',
      Number(params.get('players') ?? 4),
    )
  : director.run());
main.catch((err: unknown) => {
  console.error(err);
  loading.hide();
  const msg = err instanceof Error ? `${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(err);
  const safe = msg.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  hud.panel(`<h1>Ups!</h1><p>Algo correu mal. Carrega em <b>Recomeçar</b> (ou F5) para voltar ao início.</p>
    <p><button class="err-restart">Recomeçar</button></p>
    <pre class="err-detail">${safe}</pre>
    <p class="err-hint">Tira uma fotografia a isto e envia-a, para se corrigir.</p>`);
  hud.panelElement().querySelector('.err-restart')?.addEventListener('click', () => location.reload());
});

// Em desenvolvimento: acesso pela consola do browser para depurar (window.festa).
if (import.meta.env.DEV) {
  Object.assign(window, { festa: { engine, hud, hub, connection, director, menu, menus, getAsset, sound, narrator, screenShare } });
  // Teste rápido do motor de física: na consola, `await festa.physicsSmokeTest()`.
  Object.assign((window as unknown as { festa: object }).festa, {
    physicsSmokeTest: async () => {
      const { Physics } = await import('./three/physics');
      const p = await Physics.create();
      const ground = p.world.createRigidBody(p.R.RigidBodyDesc.fixed());
      p.world.createCollider(p.R.ColliderDesc.cuboid(10, 0.1, 10), ground);
      const ball = p.world.createRigidBody(p.R.RigidBodyDesc.dynamic().setTranslation(0, 3, 0));
      p.world.createCollider(p.R.ColliderDesc.ball(0.2).setRestitution(0.5), ball);
      for (let i = 0; i < 240; i++) p.step(1 / 60);
      const y = ball.translation().y;
      p.dispose();
      return { versao: p.R.version(), alturaFinalDaBola: Number(y.toFixed(3)) };
    },
  });
}
