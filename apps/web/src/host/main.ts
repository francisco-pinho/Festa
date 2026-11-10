import { connection, hub } from './services';
import { Engine } from './three/Engine';
import { Hud } from './ui/Hud';
import { Director } from './game/Director';

const engine = new Engine(document.getElementById('game')!);
const hud = new Hud(engine);
const director = new Director(engine, hud, hub, connection);

const params = new URLSearchParams(location.search);
const testMinigame = import.meta.env.DEV ? params.get('minigame') : null;
const main = testMinigame
  ? director.testMinigame(
      testMinigame,
      (params.get('mode') as 'ffa' | 'teams' | 'oneVsAll' | null) ?? 'ffa',
      Number(params.get('players') ?? 4),
    )
  : director.run();
main.catch((err: unknown) => {
  console.error(err);
  hud.panel(`<h1>Ups!</h1><p>Algo correu mal. Recarrega a página (F5).</p>`);
});

// Em desenvolvimento: acesso pela consola do browser para depurar (window.festa).
if (import.meta.env.DEV) Object.assign(window, { festa: { engine, hud, hub, connection, director } });
