// Mede se a bola salta ao rolar pela pista: npx tsx apps/web/tools/bump-bowling.ts
import R from '@dimforge/rapier3d-compat';
import { BALL_R, LanePhysics, OIL_END, PIN_Z } from '../src/host/sports/bowling/lanePhysics';

await R.init();
for (const t of [
  { x: 0, speed: 10, angle: 0, spin: 0 },
  { x: 0, speed: 16, angle: 0, spin: 0.6 },
  { x: 0.3, speed: 22, angle: -0.02, spin: 1 },
]) {
  const sim = new LanePhysics(R, { pins: false });
  sim.launch(t);
  let maxLift = 0;
  let liftZ = 0;
  for (let i = 0; i < 600; i++) {
    sim.advance(1 / 60);
    const p = sim.ball.translation();
    if (p.z < PIN_Z + 0.5) break;
    const lift = p.y - BALL_R;
    if (p.z < 3 && lift > maxLift) {
      maxLift = lift;
      liftZ = p.z;
    }
  }
  console.log(JSON.stringify({ ...t, maxLiftCm: (maxLift * 100).toFixed(1), aZ: liftZ.toFixed(2), oilEnd: OIL_END }));
  sim.dispose();
}
