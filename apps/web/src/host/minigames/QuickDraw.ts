/**
 * "Saque Rápido" (duelo de bananas): os dois estão frente a frente com uma pistola-banana.
 * O árbitro ao meio levanta uma bandeira: quando for a VERMELHA, Ⓐ dispara! O primeiro a
 * disparar acerta no outro, que perde uma vida (❤️). Disparar antes da vermelha é falso arranque:
 * a banana escorrega-te e perdes tu a vida. A partir da 2.ª vez o árbitro às vezes engana com a
 * bandeira AMARELA (não se dispara!). Cada um tem 3 vidas; perde quem ficar sem nenhuma.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { CharacterModel } from '../three/CharacterModel';
import { NARRATOR } from '../three/characterAssets';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const LIVES = 3;

interface Shot {
  ball: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  target: Duelist;
}

/** Banana em arco (pistola ou projétil). */
function banana(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16, Math.PI * 0.9), toonUnique('#ffd93b', { emissive: '#ffcc00', emissiveIntensity: 0.15 }));
  body.rotation.z = Math.PI * 0.55;
  const tip = mesh(new THREE.SphereGeometry(0.06, 8, 6), toon('#5b3a1e'), { cast: false });
  tip.position.set(-0.28, -0.12, 0);
  g.add(body, tip);
  g.scale.setScalar(scale);
  return g;
}

class QuickDrawRun extends DuelMinigame {
  protected readonly duration = 70;
  private phase: 'ready' | 'fake' | 'go' | 'result' = 'ready';
  private t = 0;
  private goAt = 0;
  private fakeAt = -1;
  private turn = 0;
  private readonly lives = new Map<string, number>();
  private readonly hearts = new Map<string, THREE.Sprite>();
  private readonly botAt = new Map<string, number>();
  private readonly referee: CharacterModel;
  private readonly flagPivot = new THREE.Group();
  private readonly flagCloth: THREE.Mesh;
  private flagUp = 0;
  private flagTarget = 0;
  private sign: THREE.Sprite;
  private readonly shots: Shot[] = [];

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#e3c18b', spacing: 3.6 });
    this.scene.background = new THREE.Color('#ffb36b');
    // Catos ao fundo
    for (let i = 0; i < 9; i++) {
      const cactus = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.4 + (i % 3) * 0.6, 8), toon('#3f9b4a'));
      body.position.y = 1.2;
      const arm = mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 6), toon('#3f9b4a'));
      arm.position.set(0.5, 1.5, 0);
      arm.rotation.z = -0.6;
      cactus.add(body, arm);
      cactus.position.set(-16 + i * 4 + (i % 2) * 1.3, 0, -8 - (i % 3) * 3);
      this.scene.add(cactus);
    }
    // Árbitro ao meio, atrás, com a bandeira em baixo.
    this.referee = new CharacterModel(NARRATOR);
    this.referee.root.position.set(0, 0, -2.6);
    this.referee.faceYaw(0, true);
    this.scene.add(this.referee.root);
    const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), toon('#5b3a1e'));
    pole.position.y = 0.9;
    this.flagCloth = mesh(new THREE.BoxGeometry(0.9, 0.6, 0.03), toonUnique('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.3 }));
    this.flagCloth.position.set(0.45, 1.5, 0);
    this.flagPivot.add(pole, this.flagCloth);
    this.flagPivot.position.set(0.55, 1.1, -2.4);
    this.flagPivot.rotation.z = -2.6; // em baixo
    this.scene.add(this.flagPivot);
    this.sign = textSprite('Atenção à bandeira…', { height: 0.8, color: '#ffffff', stroke: '#1d1433' });
    this.sign.position.set(0, 4.6, -2);
    this.scene.add(this.sign);
    for (const d of this.duelists) {
      this.lives.set(d.seat.id, LIVES);
      d.model.attach(banana(1.2), 'right');
      this.showHearts(d);
    }
    this.camera.position.set(0, 4.2, 10.5);
    this.camera.lookAt(0, 1.6, -0.5);
  }

  private showHearts(d: Duelist, hit = false): void {
    const old = this.hearts.get(d.seat.id);
    if (old) {
      d.model.root.remove(old);
      disposeObject(old);
    }
    const n = this.lives.get(d.seat.id) ?? 0;
    const s = textSprite('❤️'.repeat(n) + '🖤'.repeat(LIVES - n), { height: 0.6, color: '#ffffff', stroke: '#1d1433' });
    s.position.y = 3.3;
    d.model.root.add(s);
    this.hearts.set(d.seat.id, s);
    if (hit) {
      // Corações a tremer quando se perde um.
      const base = s.scale.clone();
      let k = 0;
      const id = setInterval(() => {
        k++;
        s.scale.copy(base).multiplyScalar(1 + Math.sin(k) * 0.12 * Math.max(0, 1 - k / 12));
        if (k > 12) {
          s.scale.copy(base);
          clearInterval(id);
        }
      }, 30);
    }
  }

  override start(): void {
    super.start();
    this.newTurn();
  }

  private setSign(text: string, color = '#ffffff'): void {
    this.scene.remove(this.sign);
    disposeObject(this.sign);
    const s = textSprite(text, { height: 0.8, color, stroke: '#1d1433' });
    s.position.copy(this.sign.position);
    this.sign = s;
    this.scene.add(s);
  }

  private newTurn(): void {
    this.turn++;
    this.phase = 'ready';
    this.t = 0;
    this.goAt = 2 + this.ctx.rng.next() * 3;
    // Bandeira amarela a enganar (a partir da 2.ª vez, às vezes).
    this.fakeAt = this.turn >= 2 && this.ctx.rng.next() < 0.45 ? 0.8 + this.ctx.rng.next() * (this.goAt - 1.3) : -1;
    this.flagTarget = 0;
    this.setFlagColor('#ff2a2a');
    this.setSign('Atenção à bandeira…');
    this.botAt.clear();
    for (const d of this.duelists) {
      d.model.setAnim('block');
      if (this.isBot(d) && this.ctx.rng.next() < (1 - this.ctx.botSkill) * 0.12) this.botAt.set(d.seat.id, this.ctx.rng.next() * this.goAt);
    }
  }

  private setFlagColor(color: string): void {
    const m = this.flagCloth.material as THREE.MeshToonMaterial;
    m.color.set(color);
    m.emissive.set(color);
  }

  scores(): MinigameScore[] {
    return this.duelists.map((d) => ({ id: d.seat.id, value: '❤️'.repeat(this.lives.get(d.seat.id) ?? 0) || '💀' }));
  }

  winners(): string[] {
    const [a, b] = this.duelists as [Duelist, Duelist];
    const la = this.lives.get(a.seat.id)!;
    const lb = this.lives.get(b.seat.id)!;
    return la === lb ? [] : [la > lb ? a.seat.id : b.seat.id];
  }

  /** O atirador dispara: a banana voa e acerta no outro. */
  private fire(shooter: Duelist, ms: number): void {
    this.phase = 'result';
    this.t = 0;
    const target = this.other(shooter);
    shooter.model.setAnim('punchRight');
    sound.play('whoosh', { pitch: 1.4 });
    const from = shooter.model.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const to = target.model.root.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const ball = banana(0.9);
    ball.position.copy(from);
    this.scene.add(ball);
    this.shots.push({ ball, from, to, t: 0, target });
    this.setSign(`${shooter.seat.name}: ${ms} ms!`, '#ffd23f');
    this.ctx.vibrate(shooter.seat.id, 60);
  }

  /** Falso arranque: a banana escorrega e quem disparou perde a vida. */
  private falseStart(d: Duelist): void {
    this.phase = 'result';
    this.t = 0;
    this.setSign(`${d.seat.name}: falso arranque!`, '#ff6b7a');
    sound.play('aww');
    d.model.setAnim('dizzy');
    this.hurt(d);
  }

  private hurt(d: Duelist): void {
    const n = Math.max(0, (this.lives.get(d.seat.id) ?? 0) - 1);
    this.lives.set(d.seat.id, n);
    this.showHearts(d, true);
    d.model.flash('#ff2a2a', 0.35);
    d.model.setAnim('hurt');
    this.float('−1 ❤️', d.side * 3.6, 3.9, '#ff5a5f', 0.8);
    sound.play('hit');
    this.ctx.vibrate(d.seat.id, 300);
    // Recuo do impacto
    const root = d.model.root;
    const x0 = root.position.x;
    let k = 0;
    const id = setInterval(() => {
      k++;
      root.position.x = x0 + d.side * Math.sin((k / 10) * Math.PI) * 0.4;
      if (k >= 10) {
        root.position.x = x0;
        clearInterval(id);
      }
    }, 25);
  }

  protected step(dt: number): void {
    this.t += dt;
    const skill = this.ctx.botSkill;
    // Bandeira a subir/descer
    this.flagUp += (this.flagTarget - this.flagUp) * Math.min(1, dt * 18);
    this.flagPivot.rotation.z = -2.6 + this.flagUp * 2.6;
    for (const s of [...this.shots]) {
      s.t += dt / 0.28;
      const k = Math.min(1, s.t);
      s.ball.position.lerpVectors(s.from, s.to, k);
      s.ball.position.y += Math.sin(k * Math.PI) * 0.6;
      s.ball.rotation.z += dt * 25;
      if (k >= 1) {
        this.scene.remove(s.ball);
        disposeObject(s.ball);
        this.shots.splice(this.shots.indexOf(s), 1);
        this.hurt(s.target);
      }
    }
    for (const d of this.duelists) {
      const at = this.botAt.get(d.seat.id);
      if (at !== undefined && this.phase !== 'result' && this.t >= at) {
        this.botPress(d, 'a');
        this.botAt.delete(d.seat.id);
      }
    }
    if (this.phase === 'ready' || this.phase === 'fake') {
      // Bandeira amarela: sobe e desce (não se dispara!).
      if (this.fakeAt > 0 && this.t >= this.fakeAt && this.phase === 'ready') {
        this.phase = 'fake';
        this.setFlagColor('#ffd23f');
        this.flagTarget = 1;
        sound.play('tick');
        this.setSign('Amarela! Não dispares!', '#ffd23f');
      }
      if (this.phase === 'fake' && this.t >= this.fakeAt + 0.7) {
        this.phase = 'ready';
        this.flagTarget = 0;
        this.fakeAt = -1;
        this.setSign('Atenção à bandeira…');
      }
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.falseStart(d);
          return;
        }
      }
      if (this.t >= this.goAt && this.phase === 'ready' && this.flagUp < 0.1) {
        this.phase = 'go';
        this.t = 0;
        this.setFlagColor('#ff2a2a');
        this.flagTarget = 1;
        this.referee.setAnim('cheer');
        this.setSign('🚩 VERMELHA! Dispara!', '#ff3b5c');
        sound.play('go');
        for (const d of this.duelists) {
          this.ctx.vibrate(d.seat.id, 40);
          if (this.isBot(d)) this.botAt.set(d.seat.id, 0.2 + (1 - skill) * 0.4 + this.ctx.rng.next() * 0.15);
        }
      }
    } else if (this.phase === 'go') {
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.fire(d, Math.round(this.t * 1000));
          return;
        }
      }
    } else if (this.t > 1.8 && !this.shots.length) {
      this.referee.setAnim('idle');
      if ([...this.lives.values()].some((l) => l <= 0)) this.endGame();
      else this.newTurn();
    }
  }

  override dispose(): void {
    this.referee.dispose();
    super.dispose();
  }
}

export const QuickDraw: MinigameDef = {
  id: 'saque',
  rounds: 1,
  name: 'Saque Rápido',
  modes: ['ffa'],
  duel: true,
  noCountdown: true,
  description: () =>
    'Duelo de bananas! Quando o árbitro levantar a bandeira VERMELHA, dispara com Ⓐ. Quem disparar primeiro tira uma vida ao outro. Se disparares antes (ou na bandeira AMARELA), perdes tu a vida! 3 vidas cada.',
  controls: 'Ⓐ Disparar (só na bandeira vermelha!)',
  stick: false,
  buttons: [{ id: 'a', label: 'Disparar' }],
  create: (ctx) => new QuickDrawRun(ctx),
};
