import { connection, hub } from './services';
import { Engine } from './three/Engine';
import { Hud } from './ui/Hud';
import { Director } from './game/Director';
import { GameMenu } from './ui/GameMenu';
import { getAsset, loadCharacterAssets } from './three/characterAssets';

const engine = new Engine(document.getElementById('game')!);
const hud = new Hud(engine);
const menu = new GameMenu(engine, hub);
const director = new Director(engine, hud, hub, connection, menu);

const params = new URLSearchParams(location.search);
const testMinigame = import.meta.env.DEV ? params.get('minigame') : null;
const testSport = import.meta.env.DEV ? params.get('sport') : null;
// Os modelos 3D das personagens carregam-se antes de tudo (são precisos em todos os ecrãs).
hud.panel('<h1>FESTA 🎉</h1><p id="loading">A carregar personagens…</p>');
const ready = loadCharacterAssets((done, total) => {
  const el = document.getElementById('loading');
  if (el) el.textContent = `A carregar personagens… ${done}/${total}`;
}).then(() => hud.panel(null));

const main = ready.then(() => testSport
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
  Object.assign(window, { festa: { engine, hud, hub, connection, director, menu, getAsset } });
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
