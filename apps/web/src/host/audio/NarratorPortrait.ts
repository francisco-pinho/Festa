/**
 * Retrato 3D do narrador: uma personagem com microfone, num pequeno ecrã próprio ao lado do
 * balão. Enquanto fala faz gestos com os braços, acena com a cabeça a cada palavra e festeja
 * nas frases com «!».
 */
import * as THREE from 'three';
import { CharacterModel } from '../three/CharacterModel';
import { NARRATOR } from '../three/characterAssets';
import { mesh, toon } from '../three/materials';

export class NarratorPortrait {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly model: CharacterModel;
  private raf = 0;
  private last = 0;
  private gestureT = 0;
  private gesture = 0;
  talking = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a4fa0', 2.2));
    const key = new THREE.DirectionalLight('#fff3dc', 2.4);
    key.position.set(2, 4, 5);
    this.scene.add(key);

    this.model = new CharacterModel(NARRATOR);
    this.model.faceYaw(0.25, true);
    // Microfone na mão direita e laço ao pescoço.
    const mic = new THREE.Group();
    const handle = mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.32, 10), toon('#2b2b38'));
    handle.position.y = 0.12;
    const head = mesh(new THREE.SphereGeometry(0.08, 14, 10), toon('#c0c6d0'));
    head.position.y = 0.32;
    mic.add(handle, head);
    this.model.attach(mic, 'right');
    const bow = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.09, 0.16, 4), toon('#ffd23f'));
      wing.rotation.z = (s * Math.PI) / 2;
      wing.position.x = s * 0.08;
      bow.add(wing);
    }
    bow.position.set(0, 1.48, 0.3);
    this.model.root.add(bow);
    this.scene.add(this.model.root);
    // Enquadra da cintura para cima.
    this.camera.position.set(0.3, 1.85, 3.5);
    this.camera.lookAt(0, 1.55, 0);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.talking = false;
    this.model.setAnim('idle');
  }

  /** Nova frase: gesto conforme o tom (exclamação = festejar). */
  line(text: string): void {
    this.talking = true;
    if (/!\s*$/.test(text)) {
      this.model.restAnim = 'idle';
      this.model.setAnim('cheer');
      this.gestureT = 1.3;
    } else {
      this.nextGesture();
    }
  }

  /** Cada palavra: um pequeno aceno com a cabeça. */
  word(): void {
    this.model.kickHead(0.1 + Math.random() * 0.08, (Math.random() - 0.5) * 0.12);
  }

  private nextGesture(): void {
    this.gesture = (this.gesture + 1) % 3;
    this.model.setAnim(this.gesture === 2 ? 'talk2' : 'talk');
    this.gestureT = 1.6 + Math.random() * 1.2;
  }

  private tick(dt: number): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.talking) {
      this.gestureT -= dt;
      if (this.gestureT <= 0) this.nextGesture();
    }
    this.model.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
