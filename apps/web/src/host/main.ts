import { connection, hub } from './services';
import { Engine } from './three/Engine';
import { Hud } from './ui/Hud';
import { Director } from './game/Director';
import { GameMenu } from './ui/GameMenu';
import { ScreenMenus } from './ui/ScreenMenu';
import { getAsset, loadCharacterAssets } from './three/characterAssets';
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
// Os modelos 3D das personagens carregam-se antes de tudo (são precisos em todos os ecrãs).
hud.panel('<h1>FESTA 🎉</h1><p id="loading">A carregar personagens…</p>');
const ready = loadCharacterAssets((done, total) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = `A carregar personagens… ${done}/${total}`;
}).then(() => hud.panel(null));

const testParty = import.meta.env.DEV ? params.get('party') : null;
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
  hud.panel(`<h1>Ups!</h1><p>Algo correu mal. Recarrega a página (F5).</p>`);
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
