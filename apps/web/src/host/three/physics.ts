/**
 * Motor de física Rapier (WASM), carregado só quando um jogo precisa.
 *
 * Uso típico num palco:
 *   const physics = await Physics.create();          // gravidade por omissão (0, -9,81, 0)
 *   const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
 *   physics.world.createCollider(RAPIER.ColliderDesc.ball(0.1), body);
 *   // no update(dt): physics.step(dt); depois copiar body.translation()/rotation() para o mesh
 *
 * O passo é fixo (1/120 s) e acumulado, para a simulação não depender dos FPS.
 */
import type * as RAPIER_NS from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER_NS;

let loading: Promise<Rapier> | null = null;

/** Carrega e inicializa o Rapier (uma vez). */
export function loadRapier(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (mod) => {
    const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
    await R.init();
    return R;
  });
  return loading;
}

export class Physics {
  private accumulator = 0;
  readonly fixedStep = 1 / 120;

  private constructor(
    readonly R: Rapier,
    readonly world: RAPIER_NS.World,
  ) {
    world.timestep = this.fixedStep;
  }

  static async create(gravity = { x: 0, y: -9.81, z: 0 }): Promise<Physics> {
    const R = await loadRapier();
    return new Physics(R, new R.World(gravity));
  }

  /** Avança a simulação `dt` segundos (em passos fixos, máx. 8 por frame). */
  step(dt: number): void {
    this.accumulator = Math.min(this.accumulator + dt, this.fixedStep * 8);
    while (this.accumulator >= this.fixedStep) {
      this.world.step();
      this.accumulator -= this.fixedStep;
    }
  }

  dispose(): void {
    this.world.free();
  }
}
