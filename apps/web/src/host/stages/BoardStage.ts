/**
 * Palco do tabuleiro: ilha, casas, estrela, personagens e dados.
 * Expõe operações animadas (async) que o Realizador encadeia.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter, getSpace, type Board, type SpaceType } from '@festa/game';
import type { Engine, Stage } from '../three/Engine';
import { CharacterModel, type CharacterAnim } from '../three/CharacterModel';
import { Dice } from '../three/Dice';
import { canvasTexture, disposeObject, FONT, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp, ease, lerp } from '../three/tweens';
import { starMesh } from './environment';
import { createBoardTheme, rideCurve, type BoardTheme } from './boardThemes';
import { BoardObjects } from './boardObjects';
import { prop } from '../three/props';
import { drawIcon, iconFor } from '../../common/icons';

const TILE_R = 1.15;
const TILE_TOP = 0.32;
const HEAD_Y = 2.3;

export const SPACE_STYLE: Record<SpaceType, { color: string; symbol: string }> = {
  start: { color: '#ecebe4', symbol: '▶' },
  blue: { color: '#2f7dff', symbol: '+' },
  red: { color: '#ff3b5c', symbol: '−' },
  lucky: { color: '#25c26b', symbol: '♣' },
  unlucky: { color: '#7b3fd1', symbol: '!' },
  event: { color: '#ffa41b', symbol: '?' },
  shop: { color: '#1fd1c1', symbol: '🛒' },
  item: { color: '#ff6fb5', symbol: '🎁' },
  vs: { color: '#ffd23f', symbol: 'VS' },
  villain: { color: '#3b2a4d', symbol: '😈' },
  bank: { color: '#e0a800', symbol: '🏦' },
  cannon: { color: '#4a4f58', symbol: '💥' },
  lever: { color: '#a0522d', symbol: '🎚️' },
};

export interface Seat3D {
  id: string;
  characterId: string;
}

interface Floater {
  sprite: THREE.Sprite;
  life: number;
  vy: number;
}

export class BoardStage implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 500);
  readonly tokens = new Map<string, CharacterModel>();

  private readonly theme: BoardTheme;
  private readonly objects: BoardObjects;
  private readonly star = new THREE.Group();
  private readonly mapLabels = new THREE.Group();
  private readonly trapSprites = new Map<number, THREE.Sprite>();
  private readonly coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16);
  private readonly coinMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#c98a00', emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.35 });
  private mapOpen = false;
  private afterMap: (() => void) | null = null;
  private followBeforeMap: CharacterModel | null = null;
  private starSpaceId = 0;
  private readonly starBeam: THREE.Mesh;
  private readonly dice: Dice[] = [];
  private readonly floaters: Floater[] = [];
  private readonly arrows = new THREE.Group();
  private stepSprite: THREE.Sprite | null = null;
  private time = 0;

  private camPos = new THREE.Vector3(0, 60, 50);
  private camLook = new THREE.Vector3(0, 0, 0);
  private camTargetPos = new THREE.Vector3(0, 60, 50);
  private camTargetLook = new THREE.Vector3();
  private follow: CharacterModel | null = null;

  constructor(
    private readonly engine: Engine,
    readonly board: Board,
    seats: Seat3D[],
  ) {
    this.theme = createBoardTheme(board, this.scene);
    this.theme.setFlags(board.initialFlags);
    this.objects = new BoardObjects(board);
    this.objects.setFlags(board.initialFlags);
    this.scene.add(this.objects.group);
    this.declutter(this.theme.group);
    this.buildSpaces();
    this.scene.add(this.mapLabels);

    this.star.add(starMesh(0.8));
    this.starBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 14, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#fff1a8',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.starBeam.position.y = 6;
    this.star.add(this.starBeam);
    this.star.visible = false;
    this.scene.add(this.star, this.arrows);

    for (const seat of seats) {
      const model = new CharacterModel(getCharacter(seat.characterId));
      // No tabuleiro: contorno mais forte e anel no chão com a cor do jogador.
      model.setHighlight(getCharacter(seat.characterId).color, 0.6, true);
      this.tokens.set(seat.id, model);
      this.scene.add(model.root);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // ── Câmara ──────────────────────────────────────────────

  overview(): void {
    if (this.deferWhileMap(() => this.overview())) return;
    const { minX, maxX, minZ, maxZ } = this.theme.bounds;
    this.frame((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ);
  }

  focus(seatId: string, close = false): void {
    if (this.deferWhileMap(() => this.focus(seatId, close))) return;
    this.endPersonalCam();
    this.closeUpOn = false;
    this.follow = this.tokens.get(seatId) ?? null;
    this.followDistance = close ? 0.65 : 1;
  }

  /** Grande plano da personagem (compras, estrelas): a câmara desce e aproxima-se. */
  closeUp(seatId: string): void {
    if (this.deferWhileMap(() => this.closeUp(seatId))) return;
    this.endPersonalCam();
    this.follow = this.tokens.get(seatId) ?? null;
    this.closeUpOn = true;
    this.faceCamera(seatId);
  }

  private closeUpOn = false;
  private camMode: 'roll' | 'walk' | null = null;
  private camYaw = 0;
  /** Personagens escondidas atrás de quem está a lançar (repostas no fim). */
  private readonly hiddenForRoll = new Set<string>();
  /** Altura do chão de quem está a lançar (o salto para bater nos dados não mexe no enquadramento). */
  private rollGroundY = 0;

  /**
   * Câmara pessoal de lançar os dados: atrás da personagem, virada para o caminho (`towards`),
   * baixa e perto. Quem estiver ali ao lado fica transparente.
   */
  rollView(seatId: string, towards?: { x: number; z: number }): void {
    if (this.deferWhileMap(() => this.rollView(seatId, towards))) return;
    const t = this.token(seatId);
    this.closeUpOn = false;
    this.follow = t;
    if (towards) {
      t.faceTowards(towards.x, towards.z);
      this.camYaw = Math.atan2(towards.x - t.root.position.x, towards.z - t.root.position.z);
    } else this.camYaw = t.root.rotation.y;
    this.camMode = 'roll';
    this.rollGroundY = t.root.position.y;
    for (const [id, o] of this.tokens) {
      if (id === seatId || this.hiddenForRoll.has(id)) continue;
      if (o.root.position.distanceTo(t.root.position) < 3.2) {
        o.setFaded(true);
        this.hiddenForRoll.add(id);
      }
    }
  }

  /** Câmara pessoal a seguir de perto enquanto anda as casas. */
  walkView(seatId: string): void {
    if (this.deferWhileMap(() => this.walkView(seatId))) return;
    const t = this.token(seatId);
    this.closeUpOn = false;
    if (this.camMode !== 'walk' && this.camMode !== 'roll') this.camYaw = t.root.rotation.y;
    this.follow = t;
    this.camMode = 'walk';
    this.unfadeOthers();
  }

  private unfadeOthers(): void {
    for (const id of this.hiddenForRoll) this.tokens.get(id)?.setFaded(false);
    this.hiddenForRoll.clear();
  }

  private endPersonalCam(): void {
    this.camMode = null;
    this.unfadeOthers();
  }

  focusPoint(x: number, z: number, distance = 1): void {
    if (this.deferWhileMap(() => this.focusPoint(x, z, distance))) return;
    this.endPersonalCam();
    this.closeUpOn = false;
    this.follow = null;
    this.camTargetLook.set(x, 0.8, z);
    this.camTargetPos.set(x, 12 * distance + 1, z + 14 * distance);
  }

  private followDistance = 1;

  /** Ângulo (yaw) da câmara, para virar dados e setas para ela. */
  cameraYawTo(x: number, z: number): number {
    return Math.atan2(this.camera.position.x - x, this.camera.position.z - z);
  }

  // ── Personagens ─────────────────────────────────────────

  token(id: string): CharacterModel {
    const t = this.tokens.get(id);
    if (!t) throw new Error(`Sem personagem para ${id}`);
    return t;
  }

  /** Coloca as personagens nas casas, espalhadas quando partilham a mesma casa. */
  arrange(positions: Map<string, number>, instant = false): Promise<void> {
    const bySpace = new Map<number, string[]>();
    for (const [id, spaceId] of positions) {
      if (!bySpace.has(spaceId)) bySpace.set(spaceId, []);
      bySpace.get(spaceId)!.push(id);
    }
    const moves: Promise<void>[] = [];
    for (const [spaceId, ids] of bySpace) {
      const s = getSpace(this.board, spaceId);
      ids.forEach((id, i) => {
        const offset = ids.length === 1 ? { x: 0, z: 0 } : this.slotOffset(i, ids.length);
        const target = new THREE.Vector3(s.x + offset.x, TILE_TOP + (s.y ?? 0), s.z + offset.z);
        const root = this.token(id).root;
        if (instant) {
          root.position.copy(target);
          this.token(id).faceYaw(0, true);
        } else if (root.position.distanceTo(target) > 0.01) {
          const from = root.position.clone();
          moves.push(this.engine.tween(0.3, (t) => root.position.lerpVectors(from, target, t)));
        }
      });
    }
    return Promise.all(moves).then(() => undefined);
  }

  /** Posições guardadas antes do destaque (para repor). */
  private readonly spotlit = new Map<string, THREE.Vector3>();

  /**
   * Destaca um jogador quando estão vários na mesma casa (ex.: a partida): ele vem para o
   * centro e os outros afastam-se para trás, em arco. `null` repõe toda a gente.
   */
  async spotlight(id: string | null, animate = true): Promise<void> {
    const dur = animate ? 0.35 : 0;
    const moves: Promise<void>[] = [];
    const moveTo = (tid: string, to: THREE.Vector3) => {
      const root = this.token(tid).root;
      const from = root.position.clone();
      if (dur) moves.push(this.engine.tween(dur, (k) => root.position.lerpVectors(from, to, k)));
      else root.position.copy(to);
    };
    // Repõe quem estava afastado.
    for (const [tid, pos] of this.spotlit) moveTo(tid, pos);
    this.spotlit.clear();
    if (!id) {
      await Promise.all(moves);
      return;
    }
    await Promise.all(moves);
    moves.length = 0;
    const me = this.token(id).root.position;
    const center = this.board.spaces.reduce((best, sp) => (Math.hypot(sp.x - me.x, sp.z - me.z) < Math.hypot(best.x - me.x, best.z - me.z) ? sp : best));
    const y = TILE_TOP + (center.y ?? 0);
    const others = [...this.tokens.keys()].filter((tid) => tid !== id && Math.hypot(this.token(tid).root.position.x - center.x, this.token(tid).root.position.z - center.z) < 1.8);
    this.spotlit.set(id, me.clone());
    moveTo(id, new THREE.Vector3(center.x, y, center.z));
    others.forEach((tid, i) => {
      this.spotlit.set(tid, this.token(tid).root.position.clone());
      // Alternados à esquerda e à direita, um pouco para trás (nunca atrás do destacado).
      const side = i % 2 === 0 ? -1 : 1;
      const rank = Math.floor(i / 2);
      moveTo(tid, new THREE.Vector3(center.x + side * (2.3 + rank * 1.5), y, center.z - 0.5 - rank * 0.9));
    });
    this.follow = this.token(id);
    this.followDistance = 0.55;
    await Promise.all(moves);
  }

  private slotOffset(i: number, n: number): { x: number; z: number } {
    const a = (i / n) * Math.PI * 2;
    const r = n <= 2 ? 0.6 : n <= 4 ? 0.85 : 1.05;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /** Salta da posição atual para o centro de uma casa. */
  async hop(id: string, spaceId: number, duration = 0.36): Promise<void> {
    sound.play('step', { pitch: 0.9 + Math.random() * 0.3 });
    const t = this.token(id);
    const s = getSpace(this.board, spaceId);
    const from = t.root.position.clone();
    const to = new THREE.Vector3(s.x, TILE_TOP + (s.y ?? 0), s.z);
    t.faceTowards(s.x, s.z);
    // A correr (sem voltar a parar entre casas): só para se não houver outro passo logo a seguir.
    const hopId = ((t.root.userData.hopId as number | undefined) ?? 0) + 1;
    t.root.userData.hopId = hopId;
    t.setAnim('run');
    const scale = t.root.scale.y;
    await this.engine.tween(
      duration,
      (k) => {
        const e = k * k * (3 - 2 * k); // arranca e trava suavemente
        t.root.position.lerpVectors(from, to, e);
        // Saltinho baixo a meio do passo (mais alto se a casa for noutro andar).
        t.root.position.y = lerp(from.y, to.y, e) + Math.sin(k * Math.PI) * (0.35 + Math.abs(to.y - from.y) * 0.4);
      },
      ease.linear,
    );
    // Aterragem: encolhe um pouco e volta, com pó nos pés.
    this.sparkle(to.clone().setY(to.y + 0.1), '#e8dcc0', 4, 1.3);
    void this.engine.tween(0.16, (k) => (t.root.scale.y = scale * (1 - Math.sin(k * Math.PI) * 0.12)));
    void this.engine.wait(0.18).then(() => {
      if (t.root.userData.hopId === hopId && t.anim === 'run') t.setAnim('idle');
    });
  }

  /** Faz a personagem virar-se para a câmara. */
  faceCamera(id: string): void {
    const t = this.token(id);
    t.faceYaw(this.cameraYawTo(t.root.position.x, t.root.position.z));
  }

  // ── Dados ───────────────────────────────────────────────

  /** Dados a girar por cima da cabeça. Com `append`, junta-os por cima dos que já lá estão. */
  spawnDice(id: string, count: number, append = false, numbers = 0): void {
    if (!append) this.clearDice();
    const root = this.token(id).root;
    const yaw = this.cameraYawTo(root.position.x, root.position.z);
    const lift = numbers ? 1.1 : 0;
    const total = this.dice.length + count;
    // Lugar de cada dado numa fila centrada por cima da cabeça.
    const slot = (i: number) => {
      const side = (i - (total - 1) / 2) * 1.25;
      return new THREE.Vector3(root.position.x + Math.cos(yaw) * side, root.position.y + HEAD_Y + 0.6 + lift, root.position.z - Math.sin(yaw) * side);
    };
    // Ao juntar um dado (dados iguais), os que já lá estavam deslizam para o lado e o novo fica
    // na mesma fila (antes ia para cima e saía do ecrã).
    if (append)
      this.dice.forEach((d, i) => {
        const from = d.root.position.clone();
        const to = slot(i);
        void this.engine.tween(0.3, (k) => d.root.position.lerpVectors(from, to, k), ease.out);
      });
    for (let i = 0; i < count; i++) {
      const d = new Dice(numbers ? 1.15 : 0.95, { numbers });
      d.root.position.copy(slot(this.dice.length));
      d.root.scale.setScalar(0.01);
      this.engine.tween(0.35, (k) => d.root.scale.setScalar(Math.max(0.01, k)), ease.backOut);
      this.dice.push(d);
      this.scene.add(d.root);
    }
  }

  /** A personagem salta, bate nos dados e os primeiros que ainda giram param nos valores dados. */
  async hitDice(id: string, values: number[]): Promise<void> {
    sound.play('dice');
    const t = this.token(id);
    const base = t.root.position.y;
    t.setAnim('hit');
    await this.engine.tween(0.18, (k) => (t.root.position.y = base + k * 1.1), ease.out);
    const yaw = this.cameraYawTo(t.root.position.x, t.root.position.z);
    // Só para os primeiros dados ainda a girar (um de cada vez, se vier só um valor).
    const pending = this.dice.filter((d) => d.value === null).slice(0, values.length);
    pending.forEach((d, i) => d.settle(values[i] ?? 1, yaw));
    for (const d of pending) {
      const y = d.root.position.y;
      this.engine.tween(0.25, (k) => (d.root.position.y = y + Math.sin(k * Math.PI) * 0.5), ease.out);
    }
    await this.engine.tween(0.25, (k) => (t.root.position.y = base + (1 - k) * 1.1), ease.in);
    t.setAnim('idle');
  }

  /** Junta os dados num número grande por cima da cabeça. */
  async collapseDice(id: string, total: number): Promise<void> {
    const root = this.token(id).root;
    const center = new THREE.Vector3(root.position.x, root.position.y + HEAD_Y + 0.6, root.position.z);
    const starts = this.dice.map((d) => d.root.position.clone());
    await this.engine.tween(0.35, (k) => {
      this.dice.forEach((d, i) => {
        d.root.position.lerpVectors(starts[i]!, center, k);
        d.root.scale.setScalar(1 - k * 0.99);
      });
    }, ease.in);
    this.clearDice();
    this.setStepCounter(id, total);
  }

  clearDice(): void {
    for (const d of this.dice) {
      this.scene.remove(d.root);
      d.dispose();
    }
    this.dice.length = 0;
  }

  setStepCounter(id: string, value: number | null): void {
    if (this.stepSprite) {
      this.stepSprite.parent?.remove(this.stepSprite);
      disposeObject(this.stepSprite);
      this.stepSprite = null;
    }
    if (value === null) return;
    this.stepSprite = textSprite(String(value), { height: 1.3, color: '#ffffff', stroke: '#2f7dff' });
    this.stepSprite.position.y = HEAD_Y + 0.7;
    this.token(id).root.add(this.stepSprite);
  }

  // ── Efeitos ─────────────────────────────────────────────

  floatText(id: string, text: string, color = '#ffffff', stroke = '#1b1033'): void {
    const root = this.token(id).root;
    const sprite = textSprite(text, { height: 0.9, color, stroke });
    sprite.position.set(root.position.x, root.position.y + HEAD_Y + 0.3, root.position.z);
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.4, vy: 1.4 });
  }

  // ── Estrela ─────────────────────────────────────────────

  async placeStar(spaceId: number, animate: boolean): Promise<void> {
    this.starSpaceId = spaceId;
    const s = getSpace(this.board, spaceId);
    const target = new THREE.Vector3(s.x, s.y ?? 0, s.z);
    if (!animate || !this.star.visible) {
      this.star.position.copy(target);
      this.star.visible = true;
      this.star.scale.setScalar(0.01);
      await this.engine.tween(0.6, (k) => this.star.scale.setScalar(Math.max(0.01, k)), ease.backOut);
      return;
    }
    const from = this.star.position.clone();
    await this.engine.tween(1.6, (k) => {
      this.star.position.lerpVectors(from, target, k);
      this.star.position.y = Math.sin(k * Math.PI) * 12;
    });
  }

  /** A estrela voa para a personagem, que festeja. */
  async collectStar(id: string): Promise<void> {
    const t = this.token(id);
    // Grande plano: a estrela sobe, gira cada vez mais depressa, desce até por cima da cabeça e explode em brilhos.
    this.closeUp(id);
    await this.engine.wait(0.5);
    sound.play('star');
    const icon = starMesh(0.9);
    const from = this.star.position.clone().add(new THREE.Vector3(0, 3.9, 0));
    // A estrela da casa «passa» para a que voa (não ficam duas, nem dentro da personagem).
    this.star.visible = false;
    const above = t.root.position.clone().add(new THREE.Vector3(0, HEAD_Y + 2.4, 0));
    const hands = t.root.position.clone().add(new THREE.Vector3(0, HEAD_Y + 1.2, 0));
    this.scene.add(icon);
    t.setAnim('cheer');
    await this.engine.tween(0.9, (k) => {
      icon.position.lerpVectors(from, above, k);
      icon.position.y += Math.sin(k * Math.PI) * 2;
      icon.rotation.y = k * Math.PI * 4;
    });
    await this.engine.tween(0.7, (k) => {
      icon.position.lerpVectors(above, hands, k * k);
      icon.rotation.y += 0.25 + k * 0.6;
      icon.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.4);
    });
    sound.play('cheer', { vol: 0.7 });
    this.sparkle(hands, '#ffd23f', 28, 5);
    this.sparkle(hands, '#ffffff', 12, 3.5);
    this.ringFlash(t.root.position.clone(), '#ffd23f', 3.2);
    this.hopUp(id, 1.1);
    await this.engine.tween(0.35, (k) => icon.scale.setScalar(1.3 * (1 - k)));
    this.scene.remove(icon);
    disposeObject(icon);
    await this.engine.wait(1);
    t.setAnim('idle');
  }

  /** Item comprado: aparece por cima da cabeça, gira e entra na personagem (com brilhos). */
  async showPurchase(id: string, emoji: string, color = '#ff6fb5'): Promise<void> {
    const t = this.token(id);
    this.closeUp(id);
    await this.engine.wait(0.45);
    const sprite = textSprite(emoji, { height: 1.4 });
    const top = t.root.position.clone().add(new THREE.Vector3(0, HEAD_Y + 1.6, 0));
    sprite.position.copy(top);
    const base = sprite.scale.clone();
    sprite.scale.copy(base).multiplyScalar(0.01);
    this.scene.add(sprite);
    sound.play('coin', { pitch: 1.4 });
    this.react(id, 'cheer', 1.6);
    this.sparkle(top, color, 14, 3);
    await this.engine.tween(0.45, (k) => sprite.scale.copy(base).multiplyScalar(Math.max(0.01, ease.backOut(k))));
    await this.engine.tween(0.6, (k) => (sprite.position.y = top.y + Math.sin(k * Math.PI * 2) * 0.15));
    const into = t.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    await this.engine.tween(0.35, (k) => {
      sprite.position.lerpVectors(top, into, k);
      sprite.scale.copy(base).multiplyScalar(1 - k * 0.9);
    });
    this.scene.remove(sprite);
    disposeObject(sprite);
    this.ringFlash(t.root.position.clone(), color);
    this.sparkle(into, color, 10, 2.5);
    this.hopUp(id, 0.5);
    await this.engine.wait(0.5);
  }

  // ── Efeitos (brilhos, anéis, saltos) ────────────────────

  private readonly fx: { obj: THREE.Object3D; vel: THREE.Vector3; life: number; max: number; ring?: number }[] = [];
  private readonly sparkGeo = new THREE.OctahedronGeometry(0.09, 0);

  /** Brilhos que saltam em todas as direções e caem. */
  sparkle(at: THREE.Vector3, color: string, count = 12, speed = 3.5): void {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const v = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.6));
      this.scene.add(m);
      this.fx.push({ obj: m, vel: v, life: 0.9 + Math.random() * 0.4, max: 1.3 });
    }
  }

  /** Anel de luz que se abre no chão. */
  ringFlash(at: THREE.Vector3, color: string, size = 2.2): void {
    const geo = new THREE.RingGeometry(0.6, 0.8, 40);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(at).setY(at.y + 0.08);
    this.scene.add(m);
    this.fx.push({ obj: m, vel: new THREE.Vector3(), life: 0.6, max: 0.6, ring: size });
  }

  /** Salto rápido no sítio (alegria). */
  hopUp(id: string, height = 0.5): void {
    // Não salta se estiver a andar (o salto estragava a posição do passo).
    if (!['idle', 'cheer', 'jump', 'hurt'].includes(this.token(id).anim)) return;
    const root = this.token(id).root;
    const base = root.position.y;
    void this.engine.tween(0.42, (k) => (root.position.y = base + Math.sin(k * Math.PI) * height));
  }

  /** Animação curta que volta ao repouso — só se a personagem estiver parada (não interrompe a andar). */
  react(id: string, anim: CharacterAnim, seconds: number): void {
    const t = this.token(id);
    if (t.anim !== 'idle' && t.anim !== 'cheer' && t.anim !== 'jump' && t.anim !== 'hurt') return;
    t.setAnim(anim);
    void this.engine.wait(seconds).then(() => {
      if (t.anim === anim) t.setAnim('idle');
    });
  }

  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      f.life -= dt;
      const mat = (f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (f.ring) {
        const k = 1 - f.life / f.max;
        f.obj.scale.setScalar(1 + k * f.ring);
        mat.opacity = 0.9 * (1 - k);
      } else {
        f.vel.y -= 9 * dt;
        f.obj.position.addScaledVector(f.vel, dt);
        f.obj.rotation.x += dt * 8;
        f.obj.rotation.y += dt * 6;
        mat.opacity = Math.min(1, f.life * 2);
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        mat.dispose();
        if (f.ring) (f.obj as THREE.Mesh).geometry.dispose();
        this.fx.splice(i, 1);
      }
    }
  }


  // ── Cruzamentos ─────────────────────────────────────────

  /** Mostra setas coloridas para cada caminho. */
  showArrows(fromId: number, options: { spaceId: number; color: string }[]): void {
    this.hideArrows();
    const from = getSpace(this.board, fromId);
    for (const o of options) {
      const to = getSpace(this.board, o.spaceId);
      const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      const arrow = new THREE.Group();
      const head = mesh(new THREE.ConeGeometry(0.45, 0.9, 12), toon(o.color));
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.5;
      const shaft = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 10), toon(o.color));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.2;
      arrow.add(head, shaft);
      arrow.position.set(from.x + dir.x * 2, 1.2 + (from.y ?? 0), from.z + dir.z * 2);
      arrow.userData.baseY = 1.2 + (from.y ?? 0);
      arrow.rotation.y = Math.atan2(dir.x, dir.z);
      this.arrows.add(arrow);
    }
  }

  hideArrows(): void {
    for (const a of [...this.arrows.children]) {
      this.arrows.remove(a);
      disposeObject(a);
    }
  }

  /** Seta (emoji) que descreve, no ecrã, a direção de uma casa para outra. */
  screenDirection(fromId: number, toId: number): string {
    const a = getSpace(this.board, fromId);
    const b = getSpace(this.board, toId);
    const pa = this.engine.project(new THREE.Vector3(a.x, 0, a.z));
    const pb = this.engine.project(new THREE.Vector3(b.x, 0, b.z));
    const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x); // y para baixo
    const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const idx = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    return arrows[idx]!;
  }

  // ── Ciclo ───────────────────────────────────────────────

  update(dt: number, time: number): void {
    this.time = time;
    this.theme.update(dt, time);
    this.objects.update(dt);
    for (const l of this.mapLabels.children) l.position.y += Math.sin(time * 3 + l.id) * 0.004;
    for (const t of this.tokens.values()) t.update(dt);
    for (const d of this.dice) d.update(dt);
    this.updateOcclusion(dt);

    if (this.star.visible) {
      const s = this.star.children[0]!;
      s.rotation.y += dt * 1.6;
      s.position.y = 3.9 + Math.sin(time * 2) * 0.25;
      (this.starBeam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(time * 3) * 0.06;
    }
    for (const a of this.arrows.children) a.position.y = ((a.userData.baseY as number | undefined) ?? 1.2) + Math.sin(time * 5) * 0.15;

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.sprite.position.y += f.vy * dt;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        disposeObject(f.sprite);
        this.floaters.splice(i, 1);
      }
    }

    if (this.follow) {
      const p = this.follow.root.position;
      const d = this.followDistance;
      if (this.camMode) {
        // Câmara pessoal: atrás da personagem, a olhar para onde ela vai (o ângulo vira suavemente).
        const yaw = this.follow.root.rotation.y;
        let dy = yaw - this.camYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.camYaw += dy * damp(this.camMode === 'walk' ? 2.2 : 4, dt);
        const fx = Math.sin(this.camYaw);
        const fz = Math.cos(this.camYaw);
        if (this.camMode === 'roll') {
          // Lançar: à frente da personagem, afastada o suficiente para caber o boneco inteiro
          // (dos pés à cabeça, também no salto) e todos os dados (até 3, lado a lado, com o ressalto).
          // Só passa para trás quando começa a andar.
          const g = this.rollGroundY;
          let top = g + HEAD_Y + 1.6;
          let half = 1.2;
          for (const die of this.dice) {
            const dp = die.root.position;
            top = Math.max(top, dp.y + 1.2);
            half = Math.max(half, Math.hypot(dp.x - p.x, dp.z - p.z) + 0.9);
          }
          const bottom = g - 0.15;
          const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
          const tanH = tanV * this.camera.aspect;
          const midY = (top + bottom) / 2;
          const dist = Math.max(5.2, (((top - bottom) / 2) / tanV) * 1.2, (half / tanH) * 1.25);
          this.camTargetPos.set(p.x + fx * dist + fz * 0.4, midY + dist * 0.12, p.z + fz * dist - fx * 0.4);
          this.camTargetLook.set(p.x, midY, p.z);
        } else {
          // Andar: segue de perto, um pouco mais alta para se ver o caminho.
          this.camTargetPos.set(p.x - fx * 6.2, p.y + 4.6, p.z - fz * 6.2);
          this.camTargetLook.set(p.x + fx * 2.5, p.y + 1, p.z + fz * 2.5);
        }
      } else if (this.closeUpOn) {
        // Grande plano: câmara baixa e perto, de frente para a personagem.
        this.camTargetLook.set(p.x, p.y + 1.5, p.z);
        this.camTargetPos.set(p.x + 0.6, p.y + 2.9, p.z + 5.4);
      } else {
        this.camTargetLook.set(p.x, p.y + 1.2, p.z);
        this.camTargetPos.set(p.x, p.y + 10.5 * d + 1.5, p.z + 13 * d);
      }
    }
    this.updateFx(dt);
    const k = damp(3.2, dt);
    this.camPos.lerp(this.camTargetPos, k);
    this.camLook.lerp(this.camTargetLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  dispose(): void {
    for (const t of this.tokens.values()) t.dispose();
    this.clearDice();
    disposeObject(this.scene);
  }

  // ── Mapa: vistas, interruptores, túneis, armadilhas ─────

  /** Enquadra a câmara para ver uma zona inteira (cx, cz, largura, profundidade). */
  private frame(cx: number, cz: number, w: number, d: number, tilt = 0.55): void {
    this.follow = null;
    // Distância para caber a largura e a profundidade, conforme o formato do ecrã.
    const aspect = this.camera.aspect || 16 / 9;
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const need = Math.max((d / 2 + 4) * 1.15, (w / 2 + 4) / aspect) / half;
    const h = need / Math.sqrt(1 + tilt * tilt);
    this.camTargetLook.set(cx, 0, cz);
    this.camTargetPos.set(cx, h, cz + h * tilt);
  }

  /** Com o mapa aberto, mudanças de câmara ficam para quando fechar. */
  private deferWhileMap(apply: () => void): boolean {
    if (!this.mapOpen) return false;
    this.afterMap = apply;
    return true;
  }

  /** Mudou a maré / o semáforo: atualiza o cenário. */
  setFlags(flags: Record<string, boolean>): void {
    this.theme.setFlags(flags);
    this.objects.setFlags(flags);
  }

  // ── Objetos interativos (alavancas, portagens, canhões, banco) ──

  /** A personagem puxa a alavanca e a câmara mostra o(s) portão(ões) a mudar. */
  async pullLever(id: string, spaceId: number, flags: Record<string, boolean>): Promise<void> {
    const t = this.token(id);
    t.setAnim('punchRight');
    sound.play('whoosh');
    await this.engine.wait(0.35);
    this.objects.setFlags(flags);
    sound.play('block');
    const levers = this.board.levers.filter((l) => l.spaceId === spaceId);
    const gates = this.board.gates.filter((g) => g.lever && levers.some((l) => l.flag === g.flag));
    await this.engine.wait(0.4);
    const pts = [getSpace(this.board, spaceId), ...gates.map((g) => getSpace(this.board, g.from))];
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    this.follow = null;
    this.frame((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...zs) - Math.min(...zs) + 8);
    this.theme.setFlags(flags);
    await this.engine.wait(1.4);
    t.setAnim('idle');
  }

  setBank(amount: number): void {
    this.objects.setBank(amount);
  }

  /** Moedas a voar da personagem para o cofre (depósito) ou do cofre para a personagem. */
  async bankCoins(id: string, amount: number, toBank: boolean): Promise<void> {
    if (!amount) return;
    sound.play(toBank ? 'coinLose' : 'coin');
    const root = this.token(id).root.position;
    const bank = this.objects.bankPosition();
    const n = Math.min(14, amount);
    const flights: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
      coin.rotation.x = Math.PI / 2;
      const a = new THREE.Vector3(root.x, root.y + 1.6, root.z);
      const [from, to] = toBank ? [a, bank] : [bank, a];
      this.scene.add(coin);
      flights.push(
        this.engine
          .tween(0.8, (k) => {
            const kk = Math.min(1, Math.max(0, k * 1.3 - (i / n) * 0.3));
            coin.position.lerpVectors(from, to, kk);
            coin.position.y += Math.sin(kk * Math.PI) * 3;
            coin.rotation.z = kk * 12;
          })
          .then(() => void this.scene.remove(coin)),
      );
    }
    await Promise.all(flights);
  }

  setTollOwner(key: string, ownerName: string | null): void {
    this.objects.setTollOwner(key, ownerName);
  }

  openToll(key: string): void {
    sound.play('coin');
    this.objects.openToll(key);
  }

  /** Canhão/géiser: dispara a personagem num arco alto até `toSpace`. */
  async launch(id: string, fromSpace: number, toSpace: number): Promise<void> {
    const t = this.token(id);
    // Primeiro salta para dentro do canhão (ou para cima do géiser).
    const mouth = this.objects.cannonPosition(fromSpace);
    if (mouth) {
      const p0 = t.root.position.clone();
      t.setAnim('jump');
      t.faceYaw(Math.atan2(mouth.x - p0.x, mouth.z - p0.z), true);
      await this.engine.tween(0.45, (k) => {
        t.root.position.lerpVectors(p0, mouth, k);
        t.root.position.y += Math.sin(k * Math.PI) * 1.6;
      });
      await this.engine.wait(0.25);
    }
    const from = t.root.position.clone();
    const to = getSpace(this.board, toSpace);
    const toPos = new THREE.Vector3(to.x, TILE_TOP + (to.y ?? 0), to.z);
    this.objects.fire(fromSpace);
    sound.play('firework');
    this.floatTextAt(this.board.theme === 'volcano' ? '💨' : '💥', from.x, from.z);
    t.setAnim('jump');
    this.follow = t;
    this.followDistance = 1.8;
    const dist = from.distanceTo(toPos);
    const h = 10 + dist * 0.25;
    await this.engine.tween(Math.min(3, 1.2 + dist / 30), (k) => {
      t.root.position.lerpVectors(from, toPos, k);
      t.root.position.y += Math.sin(k * Math.PI) * h;
      t.root.rotation.x = k * Math.PI * 4;
    }, ease.inOut);
    t.root.rotation.x = 0;
    t.root.position.copy(toPos);
    sound.play('hit');
    t.setAnim('dizzy');
    this.followDistance = 1;
    await this.engine.wait(0.8);
    t.setAnim('idle');
  }

  /** Derrocada: pedras caem em cima da personagem. */
  async rockfall(id: string): Promise<void> {
    const t = this.token(id);
    const p = t.root.position.clone();
    const rocks: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const r = mesh(new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.3), toon('#6b5a4a'));
      r.position.set(p.x + (Math.random() - 0.5) * 2, p.y + 10 + i * 1.5, p.z + (Math.random() - 0.5) * 2);
      this.scene.add(r);
      rocks.push(r);
    }
    const y0 = rocks.map((r) => r.position.y);
    sound.play('whoosh');
    await this.engine.tween(0.9, (k) => {
      rocks.forEach((r, i) => {
        r.position.y = Math.max(p.y + 0.3, y0[i]! - k * k * 18);
        r.rotation.x = k * 6 + i;
      });
    });
    sound.play('hit');
    t.setAnim('hurt');
    await this.engine.wait(0.7);
    await this.engine.tween(0.4, (k) => rocks.forEach((r) => r.scale.setScalar(Math.max(0.01, 1 - k))));
    for (const r of rocks) {
      this.scene.remove(r);
      disposeObject(r);
    }
  }

  /** Baú do tesouro que aparece à frente da personagem e se abre. */
  async openChest(id: string, result: string): Promise<void> {
    const t = this.token(id);
    const p = t.root.position.clone();
    const chest =
      prop('kenney-pirate/chest', { width: 1.4 }) ??
      (() => {
        const g = new THREE.Group();
        const box = mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), toon('#8b5a2b'));
        box.position.y = 0.4;
        const band = mesh(new THREE.BoxGeometry(1.45, 0.15, 0.95), toon('#ffd23f'));
        band.position.y = 0.6;
        g.add(box, band);
        return g;
      })();
    const yaw = this.cameraYawTo(p.x, p.z);
    chest.position.set(p.x + Math.sin(yaw) * 1.6, p.y, p.z + Math.cos(yaw) * 1.6);
    chest.rotation.y = yaw;
    this.scene.add(chest);
    chest.scale.setScalar(0.01);
    await this.engine.tween(0.4, (k) => chest.scale.setScalar(Math.max(0.01, k)), ease.backOut);
    await this.engine.wait(0.3);
    sound.play('bell');
    await this.engine.tween(0.25, (k) => (chest.position.y = p.y + Math.sin(k * Math.PI) * 0.6));
    this.floatTextAt(result, chest.position.x, chest.position.z);
    await this.engine.wait(1);
    await this.engine.tween(0.3, (k) => chest.scale.setScalar(Math.max(0.01, 1 - k)));
    this.scene.remove(chest);
  }


  /** Efeito da roda gigante a girar (só no parque). */
  spinWheel(): void {
    this.theme.spinWheel?.();
  }

  /**
   * Vista do mapa inteiro: estrela, lojas, túneis e nomes dos jogadores.
   * `on = false` volta à câmara anterior.
   */
  showMap(on: boolean, players: { id: string; name: string }[] = []): void {
    for (const l of [...this.mapLabels.children]) {
      this.mapLabels.remove(l);
      disposeObject(l);
    }
    if (!on) {
      this.mapOpen = false;
      const pending = this.afterMap;
      this.afterMap = null;
      if (pending) pending();
      else if (this.followBeforeMap) this.follow = this.followBeforeMap;
      this.followBeforeMap = null;
      return;
    }
    this.followBeforeMap = this.follow;
    const { minX, maxX, minZ, maxZ } = this.theme.bounds;
    this.frame((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, 0.35);
    this.mapOpen = true;
    const label = (text: string, x: number, z: number, y: number, h = 1.6, color = '#ffffff') => {
      const s = textSprite(text, { height: h, color });
      s.position.set(x, y, z);
      this.mapLabels.add(s);
    };
    const star = getSpace(this.board, this.starSpaceId);
    label('⭐', star.x, star.z, 7, 5, '#ffd23f');
    for (const shop of this.board.shops) {
      const s = getSpace(this.board, shop.spaceId);
      label(`🛒 ${shop.name}`, s.x, s.z, 6, 2.4, '#7dffe9');
    }
    for (const t of this.board.tunnels) {
      const s = getSpace(this.board, t.from);
      label(t.kind === 'metro' ? 'Ⓜ️' : '🕳️', s.x, s.z, 5, 2.6);
    }
    for (const l of this.board.levers) {
      const s = getSpace(this.board, l.spaceId);
      label('🎚️', s.x, s.z, 5 + (s.y ?? 0), 2.4);
    }
    for (const c of this.board.cannons) {
      const s = getSpace(this.board, c.spaceId);
      label(this.board.theme === 'volcano' ? '💨' : '💥', s.x, s.z, 5 + (s.y ?? 0), 2.4);
    }
    for (const t of this.board.tolls) {
      const s = getSpace(this.board, t.from);
      label(`💰${t.cost}`, s.x, s.z, 5 + (s.y ?? 0), 2);
    }
    for (const [i, p] of players.entries()) {
      const r = this.token(p.id).root.position;
      label(p.name, r.x, r.z, 5 + (i % 3) * 1.6, 2.3, '#ffffff');
    }
  }

  /** Num cruzamento: câmara aérea que mostra cada caminho e a distância até à estrela. */
  showJunction(fromId: number, options: { spaceId: number; label: string; color: string }[]): void {
    const pts: { x: number; z: number }[] = [getSpace(this.board, fromId)];
    for (const o of options) {
      let cur = o.spaceId;
      for (let i = 0; i < 7; i++) {
        const s = getSpace(this.board, cur);
        pts.push(s);
        cur = s.next[0]!;
      }
      const tipId = (() => {
        let c = o.spaceId;
        for (let i = 0; i < 3; i++) c = getSpace(this.board, c).next[0]!;
        return c;
      })();
      const tip = getSpace(this.board, tipId);
      const s = textSprite(o.label, { height: 1.8, color: o.color });
      s.position.set(tip.x, 3.5, tip.z);
      this.mapLabels.add(s);
    }
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    this.frame((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ);
  }

  clearJunction(): void {
    for (const l of [...this.mapLabels.children]) {
      this.mapLabels.remove(l);
      disposeObject(l);
    }
  }

  /** Viagem por túnel/metro: desce na entrada e sobe na saída. */
  async travelTunnel(id: string, toSpace: number, kind: 'cave' | 'metro' | 'cart' | 'elevator' | 'coaster'): Promise<void> {
    sound.play('whoosh');
    const t = this.token(id);
    const to = getSpace(this.board, toSpace);
    const toY = TILE_TOP + (to.y ?? 0);
    if (kind === 'cart' || kind === 'coaster' || kind === 'elevator') return this.ride(id, toSpace, kind);
    const y0 = t.root.position.y;
    t.setAnim('jump');
    await this.engine.tween(0.45, (k) => {
      t.root.position.y = y0 - k * 3;
      t.root.scale.setScalar(1 - k * 0.6);
    });
    this.floatTextAt(kind === 'metro' ? '🚇' : '🕳️', t.root.position.x, t.root.position.z);
    this.focusPoint(to.x, to.z, 1);
    await this.engine.wait(kind === 'metro' ? 1.1 : 0.8);
    t.root.position.set(to.x, toY - 3, to.z);
    await this.engine.tween(0.45, (k) => {
      t.root.position.y = toY - 3 + k * 3;
      t.root.scale.setScalar(0.4 + k * 0.6);
    }, ease.backOut);
    t.setAnim('idle');
  }

  /** Viagem visível: vagoneta (carris), elevador ou montanha-russa (ao longo de uma curva). */
  private async ride(id: string, toSpace: number, kind: 'cart' | 'elevator' | 'coaster'): Promise<void> {
    const t = this.token(id);
    const fromPos = t.root.position.clone();
    const to = getSpace(this.board, toSpace);
    const toPos = new THREE.Vector3(to.x, TILE_TOP + (to.y ?? 0), to.z);
    const curve = rideCurve(fromPos, toPos, kind);
    const vehicle = new THREE.Group();
    const color = kind === 'coaster' ? '#ff3b5c' : kind === 'cart' ? '#7a5230' : '#c0c0c0';
    const body = mesh(new THREE.BoxGeometry(1.5, 0.7, 1.8), toonUnique(color));
    body.position.y = 0.2;
    vehicle.add(body);
    if (kind === 'elevator') {
      const cage = mesh(new THREE.BoxGeometry(1.7, 2.6, 1.7), toonUnique('#9aa3ad', { transparent: true, opacity: 0.35 }), { cast: false });
      cage.position.y = 1.3;
      vehicle.add(cage);
    }
    this.scene.add(vehicle);
    t.setAnim(kind === 'coaster' ? 'cheer' : 'idle');
    this.floatTextAt(kind === 'coaster' ? '🎢' : kind === 'cart' ? '🛤️' : '🛗', fromPos.x, fromPos.z);
    this.follow = t;
    this.followDistance = kind === 'coaster' ? 1.6 : 1.2;
    const len = curve.getLength();
    const duration = kind === 'elevator' ? 2 : Math.min(4.5, 1.2 + len / 14);
    await this.engine.tween(duration, (k) => {
      const p = curve.getPointAt(k);
      const tan = curve.getTangentAt(Math.min(0.999, k + 0.001));
      vehicle.position.copy(p).add(new THREE.Vector3(0, -0.35, 0));
      vehicle.rotation.y = Math.atan2(tan.x, tan.z);
      t.root.position.copy(p);
      if (kind !== 'elevator') t.faceYaw(Math.atan2(tan.x, tan.z), true);
    }, ease.inOut);
    this.scene.remove(vehicle);
    disposeObject(vehicle);
    t.root.position.copy(toPos);
    t.setAnim('idle');
  }

  /** Armadilhas no tabuleiro (casa → dono). */
  setTraps(traps: Record<number, string>): void {
    for (const [id, sprite] of this.trapSprites) {
      if (!traps[id]) {
        this.scene.remove(sprite);
        disposeObject(sprite);
        this.trapSprites.delete(id);
      }
    }
    for (const key of Object.keys(traps)) {
      const id = Number(key);
      if (this.trapSprites.has(id)) continue;
      const s = getSpace(this.board, id);
      const sprite = textSprite('🪤', { height: 0.9 });
      sprite.position.set(s.x + 0.7, 0.9 + (s.y ?? 0), s.z + 0.7);
      this.scene.add(sprite);
      this.trapSprites.set(id, sprite);
    }
  }

  /** Moedas a saltar de (perda) ou para (ganho) uma personagem. */
  coinBurst(id: string, amount: number): void {
    if (amount) sound.play(amount > 0 ? 'coin' : 'coinLose');
    const root = this.token(id).root;
    if (amount) {
      const feet = root.position.clone();
      if (amount > 0) {
        // Ganhar: salto de alegria, anel dourado aos pés e brilhos.
        this.react(id, amount >= 5 ? 'cheer' : 'jump', 0.9);
        this.hopUp(id, amount >= 5 ? 0.7 : 0.4);
        this.ringFlash(feet, '#ffd23f');
        this.sparkle(feet.clone().setY(feet.y + 1.4), '#ffd23f', Math.min(18, 6 + amount));
      } else {
        // Perder: encolhe-se e as moedas saltam para o chão.
        this.react(id, 'hurt', 0.8);
        this.ringFlash(feet, '#ff5a5f');
      }
    }
    const n = Math.min(12, Math.abs(amount));
    const gain = amount > 0;
    for (let i = 0; i < n; i++) {
      const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
      coin.rotation.x = Math.PI / 2;
      const a = (i / n) * Math.PI * 2;
      const far = new THREE.Vector3(root.position.x + Math.cos(a) * 2.2, root.position.y + 0.5, root.position.z + Math.sin(a) * 2.2);
      const near = new THREE.Vector3(root.position.x, root.position.y + 1.6, root.position.z);
      const [from, to] = gain ? [far, near] : [near, far];
      coin.position.copy(from);
      this.scene.add(coin);
      void this.engine
        .tween(0.55 + i * 0.03, (k) => {
          coin.position.lerpVectors(from, to, k);
          coin.position.y += Math.sin(k * Math.PI) * 2;
          coin.rotation.z = k * 10;
          coin.scale.setScalar(gain ? 1 - k * 0.5 : 1);
        })
        .then(async () => {
          if (!gain) {
            // A moeda perdida ressalta no chão e desaparece.
            const y0 = coin.position.y;
            await this.engine.tween(0.45, (k) => {
              coin.position.y = Math.max(root.position.y + 0.05, y0 - k * 1.2) + Math.abs(Math.sin(k * Math.PI * 2)) * 0.5 * (1 - k);
              coin.scale.setScalar(1 - k);
            });
          }
          this.scene.remove(coin);
        });
    }
  }

  private floatTextAt(text: string, x: number, z: number): void {
    const sprite = textSprite(text, { height: 1.2 });
    sprite.position.set(x, 2.5, z);
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.2, vy: 1.2 });
  }


  // ── Construção do cenário ───────────────────────────────

  /**
   * Nada de decoração em cima das casas nem dos bonecos: cada modelo de cenário (árvores,
   * pedras, prédios, tendas…) cuja base fique a menos de 1,4 m do centro de uma casa é
   * empurrado para fora; se não couber, fica escondido. Terreno, água e caminhos não contam.
   */
  private declutter(root: THREE.Object3D): void {
    const CLEAR = 1.4;
    root.updateMatrixWorld(true);
    const all: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o !== root && (o.userData.prop || o.userData.deco)) all.push(o);
    });
    const isInside = (o: THREE.Object3D) => all.some((p) => p !== o && p.getObjectById(o.id) !== undefined);
    const targets = all.filter((o) => !isInside(o));
    const box = new THREE.Box3();
    const overlap = (): { push: THREE.Vector2; need: number } | null => {
      let best: { push: THREE.Vector2; need: number } | null = null;
      for (const s of this.board.spaces) {
        const sy = s.y ?? 0;
        if (box.max.y < sy + 0.3 || box.min.y > sy + 3) continue; // outro andar
        const dx = Math.max(box.min.x - s.x, 0, s.x - box.max.x);
        const dz = Math.max(box.min.z - s.z, 0, s.z - box.max.z);
        const d = Math.hypot(dx, dz);
        if (d >= CLEAR) continue;
        const need = CLEAR - d + 0.15;
        if (best && best.need >= need) continue;
        const cx = (box.min.x + box.max.x) / 2 - s.x;
        const cz = (box.min.z + box.max.z) / 2 - s.z;
        const push = new THREE.Vector2(cx, cz);
        if (push.lengthSq() < 1e-4) push.set(1, 0);
        best = { push: push.normalize(), need };
      }
      return best;
    };
    this.occluders = targets;
    let moved = 0;
    let hidden = 0;
    for (const o of targets) {
      box.setFromObject(o);
      if (box.isEmpty() || box.max.y - box.min.y < 0.4) continue;
      if (box.max.x - box.min.x > 14 || box.max.z - box.min.z > 14) continue; // montanhas, recintos…
      let hit = overlap();
      for (let i = 0; hit && i < 4; i++) {
        const wp = o.getWorldPosition(new THREE.Vector3());
        wp.x += hit.push.x * hit.need;
        wp.z += hit.push.y * hit.need;
        o.position.copy(o.parent!.worldToLocal(wp));
        o.updateMatrixWorld(true);
        box.setFromObject(o);
        hit = overlap();
        moved++;
      }
      if (hit) {
        o.visible = false;
        hidden++;
      }
    }
    if (import.meta.env.DEV && (moved || hidden)) console.info(`Cenário arrumado: ${moved} empurrões, ${hidden} escondidos`);
    root.updateMatrixWorld(true);
    this.occluderBoxes = this.occluders.map((o) => new THREE.Box3().setFromObject(o));
  }

  // ── Cenário à frente das personagens ───────────────────
  private occluders: THREE.Object3D[] = [];
  private occluderBoxes: THREE.Box3[] = [];
  /** Opacidade atual de cada objeto do cenário que está (ou esteve) à frente de alguém. */
  private readonly fading = new Map<THREE.Object3D, number>();
  private occlusionTimer = 0;
  private occluding = new Set<THREE.Object3D>();

  /**
   * Árvores e adereços que ficam entre a câmara e uma personagem ficam transparentes
   * (e voltam ao normal quando deixam de tapar).
   */
  private updateOcclusion(dt: number): void {
    this.occlusionTimer -= dt;
    if (this.occlusionTimer <= 0) {
      this.occlusionTimer = 0.12;
      this.occluding = new Set();
      const ray = new THREE.Ray();
      const head = new THREE.Vector3();
      const hit = new THREE.Vector3();
      for (const t of this.tokens.values()) {
        if (!t.root.visible) continue;
        for (const h of [0.6, 1.6, 2.9]) { // pés, cabeça e dados por cima da cabeça
          head.copy(t.root.position).setY(t.root.position.y + h);
          const dist = this.camera.position.distanceTo(head);
          ray.origin.copy(this.camera.position);
          ray.direction.copy(head).sub(this.camera.position).normalize();
          this.occluderBoxes.forEach((box, i) => {
            const o = this.occluders[i]!;
            if (!o.visible || this.occluding.has(o)) return;
            // Encolhe um pouco a caixa (as copas não são caixas cheias).
            const b = box.clone().expandByScalar(-0.25);
            if (ray.intersectBox(b, hit) && hit.distanceTo(this.camera.position) < dist - 0.6) this.occluding.add(o);
          });
        }
      }
      for (const o of this.occluding) if (!this.fading.has(o)) this.fading.set(o, 1);
    }
    for (const [o, op] of this.fading) {
      const target = this.occluding.has(o) ? 0.28 : 1;
      const next = op + (target - op) * Math.min(1, dt * 8);
      const done = target === 1 && next > 0.98;
      this.setOpacity(o, done ? 1 : next);
      if (done) this.fading.delete(o);
      else this.fading.set(o, next);
    }
  }

  private setOpacity(o: THREE.Object3D, opacity: number): void {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      // Material próprio (os materiais são partilhados entre adereços): guarda o original para repor.
      if (!m.userData.fadeOriginal) {
        if (opacity >= 1) return;
        m.userData.fadeOriginal = m.material;
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (opacity >= 1) {
        for (const x of mats) x.dispose();
        m.material = m.userData.fadeOriginal as THREE.Material;
        delete m.userData.fadeOriginal;
        return;
      }
      for (const x of mats) {
        x.transparent = true;
        x.opacity = opacity;
        x.depthWrite = false;
      }
    });
  }

  private buildSpaces(): void {
    const side = new Map<SpaceType, THREE.Material>();
    for (const s of this.board.spaces) {
      const style = SPACE_STYLE[s.type];
      if (!side.has(s.type)) side.set(s.type, toon(style.color));
      const top = new THREE.MeshToonMaterial({
        map: canvasTexture(128, (ctx, size) => {
          ctx.fillStyle = style.color;
          ctx.fillRect(0, 0, size, size);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = s.type === 'start' ? '#2f7dff' : '#ffffff';
          ctx.font = `bold ${s.type === 'start' ? 56 : 72}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const icon = iconFor(style.symbol);
          if (icon) drawIcon(ctx, icon, size * 0.2, size * 0.2, size * 0.6);
          else ctx.fillText(style.symbol, size / 2, size / 2 + 4);
        }),
      });
      const tile = mesh(new THREE.CylinderGeometry(TILE_R, TILE_R * 1.05, 0.3, 28), [side.get(s.type)!, top, side.get(s.type)!], {
        cast: false,
        receive: true,
      });
      tile.position.set(s.x, 0.17 + (s.y ?? 0), s.z);
      this.scene.add(tile);
    }
  }
}
