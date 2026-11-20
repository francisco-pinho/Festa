/**
 * «Corta a Árvore» (duelo, inspirado no Timber Topple do Wii Party): cada um tem uma árvore ao lado
 * e um machado. Carrega em Ⓐ (ou abana o telemóvel) o mais depressa que conseguires: cada machadada
 * abre mais o corte no tronco. Quem derrubar a sua árvore primeiro ganha. Se o tempo acabar, ganha
 * quem tiver dado mais machadadas.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

/** Machadadas para derrubar a árvore. */
const CHOPS = 30;
/** Intervalo mínimo entre machadadas (o machado tem de subir outra vez). */
const SWING = 0.09;
const TREE_GAP = 1.4;

interface Lumberjack {
  d: Duelist;
  tree: THREE.Group;
  /** Corte no tronco (fica mais fundo a cada machadada). */
  notch: THREE.Mesh;
  chops: number;
  cooldown: number;
  /** Abanão da árvore a cada machadada (1 → 0). */
  shake: number;
  /** Queda da árvore (0 → 1) depois do último corte. */
  fall: number;
  botNext: number;
}

/** Árvore de desenho animado: tronco castanho e copa de três cones, com o pé na origem. */
function cartoonTree(rng: () => number): { tree: THREE.Group; notch: THREE.Mesh } {
  const tree = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.32, 0.42, 3, 12), toon('#8a5a2b'));
  trunk.position.y = 1.5;
  tree.add(trunk);
  const greens = ['#3f9a3a', '#4fb548', '#2f7d2c'];
  for (let i = 0; i < 3; i++) {
    const cone = mesh(new THREE.ConeGeometry(1.5 - i * 0.35, 1.7, 12), toonUnique(greens[i]!));
    cone.position.y = 3.1 + i * 0.9;
    cone.rotation.y = rng() * Math.PI;
    tree.add(cone);
  }
  // Corte: cunha clara virada para o lenhador, a crescer com as machadadas.
  const notch = mesh(new THREE.BoxGeometry(0.05, 0.32, 0.7), toon('#f2d7a8'), { cast: false });
  notch.position.y = 0.55;
  tree.add(notch);
  return { tree, notch };
}

/** Machado pequeno para a mão. */
function axe(): THREE.Group {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.75, 8), toon('#7a4a22'), { cast: false });
  handle.position.y = 0.3;
  const head = mesh(new THREE.BoxGeometry(0.28, 0.2, 0.05), toon('#b8c0c8'), { cast: false });
  head.position.set(0.12, 0.6, 0);
  g.add(handle, head);
  return g;
}

class TimberChopRun extends DuelMinigame {
  protected readonly duration = 30;
  private readonly jacks: Lumberjack[] = [];
  private readonly chips: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private readonly chipGeo = new THREE.BoxGeometry(0.1, 0.06, 0.1);
  private readonly chipMat = toon('#e8c48a');
  private winner: Duelist | null = null;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#8fd16a', spacing: 2.4, scenery: { radius: 9, count: 28 } });
    for (const d of this.duelists) {
      // Cada um vira-se para a sua árvore, do lado de fora.
      d.model.faceYaw(d.side === -1 ? -Math.PI / 2 : Math.PI / 2, true);
      d.model.attach(axe(), 'right');
      d.model.setAnim('fightIdle');
      const { tree, notch } = cartoonTree(() => ctx.rng.next());
      tree.position.set(d.model.root.position.x + d.side * TREE_GAP, 0, 0);
      notch.position.x = -d.side * 0.36;
      this.scene.add(tree);
      this.jacks.push({ d, tree, notch, chops: 0, cooldown: 0, shake: 0, fall: 0, botNext: 0.4 });
    }
    this.camera.position.set(0, 4.4, 11);
    this.camera.lookAt(0, 1.8, 0);
  }

  scores(): MinigameScore[] {
    return this.jacks.map((j) => ({ id: j.d.seat.id, value: `🪓 ${j.chops}/${CHOPS}` }));
  }

  winners(): string[] {
    if (this.winner) return [this.winner.seat.id];
    const [a, b] = this.jacks as [Lumberjack, Lumberjack];
    if (a.chops === b.chops) return [];
    return [(a.chops > b.chops ? a : b).d.seat.id];
  }

  private chop(j: Lumberjack): void {
    j.chops++;
    j.cooldown = SWING;
    j.shake = 1;
    j.d.model.setAnim('hook');
    // O corte fica mais fundo e mais alto.
    const k = j.chops / CHOPS;
    j.notch.scale.set(1 + k * 12, 1 + k * 0.6, 1);
    sound.play('punch', { vol: 0.35, pitch: 1.4 + Math.random() * 0.3 });
    this.ctx.vibrate(j.d.seat.id, 25);
    // Lascas de madeira.
    const at = new THREE.Vector3(j.tree.position.x - j.d.side * 0.4, 0.6, 0.2);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.chipGeo, this.chipMat);
      m.position.copy(at);
      this.scene.add(m);
      this.chips.push({ m, v: new THREE.Vector3(-j.d.side * (1 + Math.random() * 2), 2 + Math.random() * 2, (Math.random() - 0.5) * 2), life: 0.7 });
    }
    if (j.chops >= CHOPS && !this.winner) {
      this.winner = j.d;
      sound.play('cheer');
      this.float('TIMBER!', j.tree.position.x, 4.5, '#ffd23f', 1);
      this.endGame();
    }
  }

  protected step(dt: number): void {
    const skill = this.ctx.botSkill;
    for (const j of this.jacks) {
      j.cooldown -= dt;
      let press = this.pressed(j.d, 'a') || this.pressed(j.d, 'b');
      if (this.isBot(j.d)) {
        j.botNext -= dt;
        if (j.botNext <= 0) {
          // Bots: entre 5 e 10 machadadas por segundo, conforme a dificuldade.
          j.botNext = 1 / (5 + skill * 5) + this.ctx.rng.next() * 0.05;
          press = true;
        }
      }
      if (press && j.cooldown <= 0) this.chop(j);
    }
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    for (const j of this.jacks) {
      j.shake = Math.max(0, j.shake - dt * 6);
      if (this.winner === j.d) j.fall = Math.min(1, j.fall + dt * 0.9);
      // A árvore abana a cada machadada e, no fim, cai para fora (longe do lenhador).
      const fallAngle = j.fall * j.fall * (Math.PI / 2) * 0.97;
      j.tree.rotation.z = -j.d.side * fallAngle + Math.sin(time * 40) * 0.03 * j.shake;
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i]!;
      c.life -= dt;
      c.v.y -= 12 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += dt * 12;
      if (c.life <= 0 || c.m.position.y < 0) {
        this.scene.remove(c.m);
        this.chips.splice(i, 1);
      }
    }
  }

  override dispose(): void {
    this.chipGeo.dispose();
    super.dispose();
  }
}

export const TimberChop: MinigameDef = {
  id: 'corta-arvore',
  name: 'Corta a Árvore',
  modes: ['ffa'],
  duel: true,
  description: () => 'Carrega em A (ou abana o telemóvel) o mais depressa que conseguires para cortar a tua árvore. Quem a derrubar primeiro ganha!',
  controls: 'Ⓐ Machadada (ou abanar)',
  stick: false,
  shake: true,
  buttons: [{ id: 'a', label: 'Machadada' }],
  create: (ctx) => new TimberChopRun(ctx),
};
