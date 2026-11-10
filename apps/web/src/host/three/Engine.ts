/**
 * Motor 3D: um renderizador Three.js, um ciclo de jogo e um "palco" ativo
 * (tabuleiro, minijogo, pódio…). Cada palco tem a sua cena e câmara.
 */
import * as THREE from 'three';
import { Tweens } from './tweens';

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(dt: number, time: number): void;
  dispose?(): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly tweens = new Tweens();
  private stage: Stage | null = null;
  private time = 0;
  private last = performance.now();
  private lastFrameAt = performance.now();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    // Com o separador escondido/minimizado o browser pára o requestAnimationFrame. A festa
    // não pode congelar (os telemóveis estão à espera), por isso a lógica
    // continua a correr com temporizadores — só não se desenha.
    setInterval(() => {
      if (performance.now() - this.lastFrameAt > 250) this.backgroundTick();
    }, 100);
  }

  private backgroundTick(): void {
    const now = performance.now();
    let remaining = Math.min(2, (now - this.last) / 1000);
    this.last = now;
    while (remaining > 0) {
      const dt = Math.min(0.05, remaining);
      remaining -= dt;
      this.time += dt;
      this.tweens.update(dt);
      this.stage?.update(dt, this.time);
    }
  }

  /** Muda de palco. O anterior só é destruído se `disposePrevious`. */
  setStage(stage: Stage, disposePrevious = true): void {
    if (this.stage && this.stage !== stage && disposePrevious) this.stage.dispose?.();
    this.stage = stage;
    this.resize();
  }

  get current(): Stage | null {
    return this.stage;
  }

  wait(seconds: number): Promise<void> {
    return this.tweens.wait(seconds);
  }

  tween(duration: number, update: (t: number) => void, easing?: (t: number) => number): Promise<void> {
    return this.tweens.tween(duration, update, easing);
  }

  /** Converte um ponto 3D para coordenadas do ecrã (px), para colocar HTML por cima. */
  project(point: THREE.Vector3): { x: number; y: number; visible: boolean } {
    if (!this.stage) return { x: 0, y: 0, visible: false };
    const v = point.clone().project(this.stage.camera);
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 };
  }

  private frame(): void {
    const now = performance.now();
    this.lastFrameAt = now;
    // Limita o dt para não "teletransportar" coisas depois de uma pausa.
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.tweens.update(dt);
    if (!this.stage) return;
    this.stage.update(dt, this.time);
    this.renderer.render(this.stage.scene, this.stage.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.stage) {
      this.stage.camera.aspect = w / h;
      this.stage.camera.updateProjectionMatrix();
    }
  }
}
