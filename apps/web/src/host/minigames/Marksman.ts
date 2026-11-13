/**
 * "Pontaria" (duelo): cada tiro faz-se em dois toques. A mira anda no alvo: 1.º de um lado para o
 * outro (carrega quando estiver no centro), 2.º para cima e para baixo (carrega outra vez no
 * centro). 5 tiros, cada vez mais rápidos. Mais pontos ganha.
 * Cenário: carreira de tiro no meio de uma floresta (não se vê o horizonte), bandeirinhas a sério.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { PROPS, pickProp } from '../three/props';
import { getCharacter } from '@festa/game';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { bunting, swayBunting } from './scenery';

const SHOTS = 5;
/** Raio do alvo (onde a mira pode ir parar). */
const TARGET_R = 1.2;
const TARGET_Y = 1.6;
/** Arqueiros à esquerda, alvos à direita, uma pista por jogador; a câmara fica atrás dos arqueiros. */
const SHOOT_X = -6;
const TARGET_X = 6;
const laneZ = (d: Duelist) => (d.side < 0 ? -1.8 : 1.8);

function fallbackTree(r: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.25, 0.3, 2), toon('#7a5230'));
  trunk.position.y = 1;
  const top = mesh(new THREE.ConeGeometry(1.6, 3.5, 8), toon(r < 0.5 ? '#3f9d4a' : '#2f8a5a'));
  top.position.y = 3.6;
  g.add(trunk, top);
  return g;
}

function barrel(): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 14), toon('#8b5a2b'));
  b.position.y = 0.5;
  g.add(b);
  return g;
}

interface Shooter {
  d: Duelist;
  phase: number;
  /** 0 = a apontar na horizontal, 1 = na vertical. */
  stage: 0 | 1;
  /** Horizontal escolhida no 1.º toque (-1…1). */
  h: number;
  vphase: number;
  /** Mira no alvo. */
  sight: THREE.Group;
  shots: number;
  total: number;
  freeze: number;
  /** Onde o bot vai tentar parar (-1…1) e há quanto tempo espera. */
  aim: number;
  waited: number;
}

interface Arrow {
  obj: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
}

/** Seta: haste, ponta e penas, a apontar para -z. */
function makeArrow(color: string): THREE.Group {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), toon('#7a5230'), { cast: false });
  shaft.rotation.x = Math.PI / 2;
  const tip = mesh(new THREE.ConeGeometry(0.09, 0.25, 8), toon('#c9ccd4'), { cast: false });
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.65;
  g.add(shaft, tip);
  for (const r of [0, Math.PI / 2]) {
    const fin = mesh(new THREE.BoxGeometry(0.22, 0.01, 0.25), toonUnique(color), { cast: false });
    fin.rotation.z = r;
    fin.position.z = 0.48;
    g.add(fin);
  }
  return g;
}

class MarksmanRun extends DuelMinigame {
  protected readonly duration = 45;
  private readonly shooters: Shooter[] = [];
  private readonly arrows: Arrow[] = [];
  private pennants: THREE.Mesh[] = [];
  private clock = 0;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#9be07a', spacing: 3 });
    // Vista de lado: duas pistas, arqueiros à esquerda virados para os alvos à direita.
    for (const d of this.duelists) {
      const z = laneZ(d);
      d.model.root.position.set(SHOOT_X, 0, z);
      d.model.faceYaw(Math.PI / 2, true);
      const target = new THREE.Group();
      ['#ffffff', '#ff3b5c', '#ffffff', '#ff3b5c'].forEach((c, i) => {
        const ring = mesh(new THREE.CylinderGeometry(1.2 - i * 0.3, 1.2 - i * 0.3, 0.1 + i * 0.02, 24), toon(c));
        ring.rotation.z = Math.PI / 2;
        target.add(ring);
      });
      target.position.set(TARGET_X, TARGET_Y, z);
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6), toon('#7a5230'));
      post.position.set(TARGET_X + 0.1, 0.8, z);
      // Pista de terra entre o arqueiro e o alvo
      const lane = mesh(new THREE.BoxGeometry(TARGET_X - SHOOT_X + 2, 0.04, 2.2), toon('#c9a26b'), { cast: false, receive: true });
      lane.position.set((TARGET_X + SHOOT_X) / 2, 0.02, z);
      this.scene.add(target, post, lane);
    }
    this.buildRange();
    for (const d of this.duelists) {
      // Mira (anel e cruz) que anda no alvo enquanto se aponta.
      const sight = new THREE.Group();
      const sightMat = new THREE.MeshBasicMaterial({ color: getCharacter(d.seat.characterId).color, depthTest: false, transparent: true });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 28), sightMat);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.01), sightMat);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.01), sightMat);
      sight.add(ring, crossH, crossV);
      for (const o of sight.children) o.renderOrder = 5;
      sight.rotation.y = -Math.PI / 2;
      this.scene.add(sight);
      this.shooters.push({
        d,
        phase: ctx.rng.next() * 6,
        stage: 0,
        h: 0,
        vphase: 0,
        sight,
        shots: 0,
        total: 0,
        freeze: 0,
        aim: 0,
        waited: 0,
      });
    }
    for (const s of this.shooters) this.newAim(s);
    // Câmara atrás dos arqueiros, um pouco acima, a ver os alvos ao fundo.
    this.camera.position.set(SHOOT_X - 6.5, 4.6, 0);
    this.camera.lookAt(TARGET_X, 1.4, 0);
  }

  /** Carreira de tiro: linha de tiro, fardos de palha, vedação, bandeirolas, árvores, barris e tendas. */
  private buildRange(): void {
    const rng = this.ctx.rng;
    const line = mesh(new THREE.BoxGeometry(0.15, 0.05, 7), toon('#ffffff'), { cast: false });
    line.position.set(SHOOT_X + 0.9, 0.05, 0);
    this.scene.add(line);
    // Fardos de palha atrás dos alvos
    for (let i = 0; i < 6; i++) {
      const bale = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 16), toon(i % 2 ? '#e8c45a' : '#d9b24c'));
      bale.rotation.z = Math.PI / 2;
      bale.rotation.y = Math.PI / 2;
      bale.position.set(TARGET_X + 2.2, 0.7 + (i >= 4 ? 1.3 : 0), -3 + (i % 4) * 2);
      this.scene.add(bale);
    }
    // Vedação ao fundo
    for (let x = -12; x <= 12; x += 2) {
      const postF = mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), toon('#8b5a2b'));
      postF.position.set(x, 0.6, -5.5);
      this.scene.add(postF);
    }
    for (const y of [0.45, 0.95]) {
      const rail = mesh(new THREE.BoxGeometry(24.4, 0.12, 0.1), toon('#a8743f'));
      rail.position.set(0, y, -5.5);
      this.scene.add(rail);
    }
    // Bandeirinhas: uma ao longo da vedação e outra por cima das pistas.
    const masts: [number, number, number][] = [[-9, -5, 5], [9, -5, 5], [1, -4.2, 5.4], [1, 4.2, 5.4]];
    for (const [x, z, h] of masts) {
      const mast = mesh(new THREE.CylinderGeometry(0.08, 0.1, h), toon('#ffffff'));
      mast.position.set(x, h / 2, z);
      this.scene.add(mast);
    }
    this.pennants = [
      ...bunting(this.scene, new THREE.Vector3(-9, 4.85, -5), new THREE.Vector3(9, 4.85, -5), { sag: 1.1 }),
      ...bunting(this.scene, new THREE.Vector3(1, 5.25, -4.2), new THREE.Vector3(1, 5.25, 4.2), { sag: 0.7 }),
    ];
    // Árvores, barris, caixotes e tendas (modelos dos packs, se estiverem carregados)
    const place = (obj: THREE.Object3D | null, x: number, z: number, rotY = 0) => {
      if (!obj) return;
      obj.position.set(x, 0, z);
      obj.rotation.y = rotY;
      this.scene.add(obj);
    };
    // Floresta à volta: atrás dos alvos e dos dois lados, cerrada, para não se ver o infinito.
    const tree = (x: number, z: number, h: number) =>
      place(pickProp(PROPS.trees, rng.next(), { height: h }) ?? fallbackTree(rng.next()), x + rng.next() * 1.2, z + rng.next() * 1.2, rng.next() * 6);
    for (let x = 12; x <= 22; x += 3.2) for (let z = -24; z <= 24; z += 3) tree(x, z, 6.5 + rng.next() * 4 + (x - 12) * 0.3);
    for (const sz of [-1, 1]) {
      for (let x = -26; x < 12; x += 3) {
        for (let row = 0; row < 3; row++) tree(x, sz * (8.5 + row * 2.6 + (sz > 0 ? 0 : 1.5)), 5.5 + rng.next() * 4 + row);
      }
    }
    // Arbustos e pedras à frente das árvores.
    for (let i = 0; i < 26; i++) {
      const sz = i % 2 ? 1 : -1;
      place(pickProp([...PROPS.plants, ...PROPS.rocks], rng.next(), { height: 0.6 + rng.next() * 0.8 }), -18 + rng.next() * 30, sz * (6.4 + rng.next() * 1.4), rng.next() * 6);
    }
    place(pickProp(['kaykit-medieval/tent', 'kenney-nature/tent_detailedOpen'], rng.next(), { height: 2.6 }), -11, -5, 0.6); // afastada para não tapar a câmara (atrás dos arqueiros)
    place(pickProp(['kaykit-medieval/barrel', 'kenney-pirate/barrel'], 0, { height: 1 }) ?? barrel(), -8.2, 2.6);
    place(pickProp(['kaykit-medieval/barrel', 'kenney-pirate/barrel'], 0.5, { height: 1 }) ?? barrel(), -8.9, 3.3);
    place(pickProp(['kaykit-medieval/crate_A_big', 'kenney-pirate/crate'], 0, { height: 0.9 }), 9.5, 3, 0.4);
    place(pickProp(['kaykit-medieval/flag_red'], 0, { height: 3 }), -8, -3.5);
  }

  private newAim(s: Shooter): void {
    const err = (1 - this.ctx.botSkill) * 0.55;
    s.aim = (this.ctx.rng.next() * 2 - 1) * err;
    s.waited = 0;
  }

  scores(): MinigameScore[] {
    return this.shooters.map((s) => ({ id: s.d.seat.id, value: `${s.total} (${s.shots}/${SHOTS})` }));
  }

  winners(): string[] {
    const [a, b] = this.shooters as [Shooter, Shooter];
    return a.total === b.total ? [] : [a.total > b.total ? a.d.seat.id : b.d.seat.id];
  }

  /** 1.º toque: fixa a horizontal e passa para a barra vertical. */
  private lockH(s: Shooter): void {
    s.h = Math.sin(s.phase);
    s.stage = 1;
    s.vphase = this.ctx.rng.next() * 6;
    sound.play('click', { pitch: 1.2 });
    this.ctx.vibrate(s.d.seat.id, 25);
    this.newAim(s);
  }

  private shoot(s: Shooter): void {
    sound.play('ball', { pitch: 1.4 });
    const h = s.h;
    const v = Math.sin(s.vphase);
    s.stage = 0;
    const dist = Math.min(1.3, Math.hypot(h, v));
    const points = Math.max(0, Math.round(100 * (1 - dist * 1.1)));
    s.total += points;
    s.shots++;
    s.freeze = 0.8;
    s.d.model.setAnim('throw');
    // A seta voa até ao alvo e crava-se onde estava a mira.
    const arrow = makeArrow(getCharacter(s.d.seat.characterId).color);
    const z = laneZ(s.d);
    const from = new THREE.Vector3(SHOOT_X + 0.5, 1.5, z);
    const to = new THREE.Vector3(TARGET_X - 0.15, TARGET_Y + v * TARGET_R, z + h * TARGET_R);
    arrow.position.copy(from);
    arrow.rotation.y = -Math.PI / 2; // a seta aponta para +x (para o alvo)
    this.scene.add(arrow);
    this.arrows.push({ obj: arrow, from, to, t: 0 });
    const label = points >= 90 ? `🎯 ${points}` : `${points}`;
    this.float(label, TARGET_X, 3.4, points >= 90 ? '#4cd964' : points >= 50 ? '#ffd23f' : '#ff6b7a', 0.9);
    this.ctx.vibrate(s.d.seat.id, points >= 90 ? 120 : 40);
    this.newAim(s);
  }

  protected step(dt: number): void {
    for (const s of this.shooters) {
      if (s.shots >= SHOTS) {
        // Acabou os tiros: só falta acabar a animação do último.
        s.freeze = Math.max(0, s.freeze - dt);
        if (s.freeze <= 0) s.d.model.setAnim('idle');
        this.pressed(s.d, 'a');
        continue;
      }
      if (s.freeze > 0) {
        s.freeze -= dt;
        this.pressed(s.d, 'a');
        if (s.freeze <= 0) s.d.model.setAnim('idle');
        continue;
      }
      const speed = 2.4 + s.shots * 0.6;
      let m: number;
      if (s.stage === 0) {
        s.phase += dt * speed;
        m = Math.sin(s.phase);
      } else {
        s.vphase += dt * speed * 1.1;
        m = Math.sin(s.vphase);
      }
      if (this.isBot(s.d)) {
        s.waited += dt;
        if (Math.abs(m - s.aim) < 0.06 || s.waited > 4) this.botPress(s.d, 'a');
      }
      if (this.pressed(s.d, 'a')) {
        if (s.stage === 0) this.lockH(s);
        else this.shoot(s);
      }
    }
    if (this.shooters.every((s) => s.shots >= SHOTS && s.freeze <= 0)) this.endGame();
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.clock += dt;
    swayBunting(this.pennants, this.clock);
    for (const s of this.shooters) {
      const h = s.stage === 0 ? Math.sin(s.phase) : s.h;
      const v = s.stage === 1 ? Math.sin(s.vphase) : 0;
      // Mira no alvo: só enquanto se aponta (some a seguir ao tiro).
      s.sight.visible = s.freeze <= 0 && s.shots < SHOTS;
      s.sight.position.set(TARGET_X - 0.2, TARGET_Y + v * TARGET_R, laneZ(s.d) + h * TARGET_R);
    }
    for (const a of this.arrows) {
      if (a.t >= 1) continue;
      a.t = Math.min(1, a.t + dt / 0.35);
      a.obj.position.lerpVectors(a.from, a.to, a.t);
      a.obj.position.y += Math.sin(a.t * Math.PI) * 0.6;
      if (a.t >= 1) {
        sound.play('hit', { pitch: 1.6 });
        a.obj.position.copy(a.to);
      }
    }
  }
}

export const Marksman: MinigameDef = {
  id: 'pontaria',
  rounds: 2,
  name: 'Pontaria',
  modes: ['ffa'],
  duel: true,
  description: () =>
    `Cada tiro são dois toques: a mira anda no alvo de um lado para o outro (carrega quando estiver no centro) e depois para cima e para baixo (carrega outra vez)! ${SHOTS} tiros, cada vez mais rápidos. Quem somar mais pontos ganha.`,
  controls: 'Ⓐ Apontar (horizontal) · Ⓐ Disparar (vertical)',
  stick: false,
  buttons: [{ id: 'a', label: 'Apontar / Disparar' }],
  create: (ctx) => new MarksmanRun(ctx),
};
