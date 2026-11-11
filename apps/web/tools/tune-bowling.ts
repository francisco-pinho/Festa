// Afinação da física do bowling fora do browser: npx tsx apps/web/tools/tune-bowling.ts [basic|pocket]
// (D=densidade dos pinos, RE=ressalto) — imprime pinos derrubados por lançamento.
import R from '@dimforge/rapier3d-compat';
import { LanePhysics, PIN_Z } from '../src/host/sports/bowling/lanePhysics';

await R.init();
import { tune } from '../src/host/sports/bowling/lanePhysics';
tune({ density: Number(process.env.D ?? 40), rest: Number(process.env.RE ?? 0.6) });

function run(t: { x: number; speed: number; angle: number; spin: number }) {
  const sim = new LanePhysics(R);
  sim.resetPins();
  sim.launch(t);
  let time = 0;
  let atPins: number | null = null;
  let vAt = 0;
  while (time < 8) {
    sim.advance(1 / 60);
    time += 1 / 60;
    const p = sim.ball.translation();
    if (atPins === null && p.z <= PIN_Z + 0.5) {
      atPins = p.x;
      const v = sim.ball.linvel();
      vAt = Math.hypot(v.x, v.z);
    }
    if (sim.ballDone() && sim.settled() && time > 2) break;
  }
  const down = 10 - sim.standing();
  const res = { ...t, atPins: atPins?.toFixed(2), vAt: vAt.toFixed(1), down, gutter: sim.gutter, time: time.toFixed(1) };
  sim.dispose();
  return res;
}

const arg = process.argv[2] ?? 'basic';
if (arg === 'basic') {
  for (const spin of [0, 0.5, 1]) console.log(JSON.stringify(run({ x: 0, speed: 15, angle: 0, spin })));
  for (const speed of [10, 20]) console.log(JSON.stringify(run({ x: 0.15, speed, angle: 0, spin: 0 })));
  console.log('predict spin1', LanePhysics.predictX(R, { x: 0, speed: 15, angle: 0, spin: 1 }).toFixed(2));
}
if (arg === 'pocket') {
  // Taxa de strikes a apontar ao "bolso" com várias velocidades/efeitos
  let strikes = 0;
  let n = 0;
  const totals: number[] = [];
  for (const speed of [12, 15, 18]) {
    for (const off of [0.05, 0.12, 0.2, 0.3]) {
      for (const spin of [0, 0.6]) {
        const r = run({ x: off, speed, angle: 0, spin });
        n++;
        totals.push(r.down);
        if (r.down === 10) strikes++;
      }
    }
  }
  console.log('strikes', strikes, '/', n, 'downs', totals.join(','));
}
