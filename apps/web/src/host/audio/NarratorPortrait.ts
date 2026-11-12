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
  /** Energia da fala (sobe e desce suavemente), impulso das palavras e entusiasmo. */
  private energy = 0;
  private beat = 0;
  private excited = 0;
  private t = 0;
  /** Próximo gesto com os braços enquanto fala. */
  private gestureIn = 0;
  private gestureFlip = false;
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
    this.talking = false;
    // Deixa a pose voltar ao repouso suavemente antes de parar de desenhar.
    setTimeout(() => {
      if (this.talking) return;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }, 600);
  }

  /** Nova frase: frases com «!» ganham mais energia (um pequeno saltinho). */
  line(text: string): void {
    this.talking = true;
    this.excited = /!\s*$/.test(text) ? 1 : 0;
    // Frase com «!»: festeja; senão começa com um gesto de explicar.
    if (this.excited && Math.random() < 0.6) {
      this.model.setAnim('cheer');
      this.gestureIn = 1.1;
    } else this.gesture();
  }

  /** Gesto com os braços (dois tipos, alternados). */
  private gesture(): void {
    this.gestureFlip = !this.gestureFlip;
    this.model.setAnim(this.gestureFlip ? 'talk' : 'talk2');
    this.gestureIn = 2.2 + Math.random() * 1.3;
  }

  /** Cada palavra: dá um impulso suave ao movimento da cabeça (sem safanões). */
  word(): void {
    this.beat = Math.min(1, this.beat + 0.45);
  }

  private tick(dt: number): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    // Movimento contínuo e suave enquanto fala (sem trocar de animação).
    this.t += dt;
    const k = 1 - Math.exp(-dt * 4);
    this.energy += ((this.talking ? 1 : 0) - this.energy) * k;
    this.beat *= Math.exp(-dt * 5);
    this.excited *= Math.exp(-dt * 0.8);
    const e = this.energy;
    const t = this.t;
    // Enquanto fala vai gesticulando; quando acaba volta ao repouso.
    this.gestureIn -= dt;
    if (this.talking && this.gestureIn <= 0) this.gesture();
    if (!this.talking && this.model.anim !== 'idle' && this.gestureIn <= 0) this.model.setAnim('idle');
    const pose = this.model.pose;
    pose.headX = e * (0.05 * Math.sin(t * 5.2) + 0.07 * this.beat) - 0.04 * e;
    pose.headY = e * 0.1 * Math.sin(t * 1.3);
    pose.headZ = e * 0.05 * Math.sin(t * 1.9 + 1);
    pose.chestY = e * 0.08 * Math.sin(t * 1.1 + 0.5);
    pose.chestZ = e * 0.03 * Math.sin(t * 2.1);
    this.model.root.position.y = Math.abs(Math.sin(t * 6)) * 0.06 * this.excited * e;
    this.model.faceYaw(0.25 + e * 0.12 * Math.sin(t * 0.7));
    this.model.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
