/**
 * Motor 3D: um renderizador Three.js, um ciclo de jogo e um "palco" ativo
 * (tabuleiro, minijogo, pódio…). Cada palco tem a sua cena e câmara.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings, type GraphicsLevel } from '../game/Settings';
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
  /** Em pausa: nada avança (tweens, esperas, palco), só se desenha. */
  paused = false;
  /** Velocidade do jogo (definição "velocidade das animações"). */
  timeScale = 1;

  /**
   * Imagem melhorada (definição «Gráficos»): sombras suaves, luz ambiente de estúdio,
   * oclusão ambiente (cantos e contactos mais escuros) e brilho suave nas luzes.
   */
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private envMap: THREE.Texture | null = null;
  private graphics: GraphicsLevel = 'alto';

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    // Luz de ambiente de estúdio (reflexos e volume nos materiais dos modelos).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.applyGraphics(settings.value.graphics);
    settings.events.on('changed', (s) => s.graphics !== this.graphics && this.applyGraphics(s.graphics));

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
      this.step(dt);
    }
  }

  /** Avança o jogo `dt` segundos reais (respeita pausa e velocidade). */
  private step(realDt: number): void {
    if (this.paused) return;
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.tweens.update(dt);
    this.stage?.update(dt, this.time);
  }

  /** Muda de palco. O anterior só é destruído se `disposePrevious`. */
  setStage(stage: Stage, disposePrevious = true): void {
    if (this.stage && this.stage !== stage && disposePrevious) this.stage.dispose?.();
    this.stage = stage;
    this.prepareScene(stage.scene);
    this.resize();
  }

  /** Luz de ambiente e sombras da qualidade escolhida em cada cena nova. */
  private prepareScene(scene: THREE.Scene): void {
    if (!scene.environment && this.envMap && this.graphics !== 'baixo') {
      scene.environment = this.envMap;
      scene.environmentIntensity = 0.45;
    }
    const size = this.graphics === 'alto' ? 4096 : 2048;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow && l.shadow.mapSize.x < size) {
        l.shadow.mapSize.set(size, size);
        l.shadow.radius = 3;
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
    });
  }

  /** Liga/desliga os efeitos conforme a qualidade. */
  private applyGraphics(level: GraphicsLevel): void {
    this.graphics = level;
    this.composer?.dispose();
    this.composer = null;
    this.gtao = null;
    this.bloom = null;
    this.renderPass = null;
    this.renderer.shadowMap.type = level === 'baixo' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (level === 'baixo') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    const dummyScene = new THREE.Scene();
    const dummyCam = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(dummyScene, dummyCam);
    composer.addPass(this.renderPass);
    if (level === 'alto') {
      this.gtao = new GTAOPass(dummyScene, dummyCam, w, h);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1 });
      composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.4, 0.96);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
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
    this.step(dt);
    if (!this.stage) return;
    if (this.composer && this.renderPass) {
      const { scene, camera } = this.stage;
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.gtao) {
        this.gtao.scene = scene;
        this.gtao.camera = camera;
      }
      this.composer.render();
    } else this.renderer.render(this.stage.scene, this.stage.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    if (this.stage) {
      this.stage.camera.aspect = w / h;
      this.stage.camera.updateProjectionMatrix();
    }
  }
}
