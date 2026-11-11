/**
 * Palco do tabuleiro: ilha, casas, estrela, personagens e dados.
 * Expõe operações animadas (async) que o Realizador encadeia.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter, getSpace, type Board, type SpaceType } from '@festa/game';
import type { Engine, Stage } from '../three/Engine';
import { CharacterModel } from '../three/CharacterModel';
import { Dice } from '../three/Dice';
import { canvasTexture, disposeObject, FONT, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp, ease, lerp } from '../three/tweens';
import { starMesh } from './environment';
import { createBoardTheme, rideCurve, type BoardTheme } from './boardThemes';
import { BoardObjects } from './boardObjects';
import { prop } from '../three/props';

const TILE_R = 1.15;
const TILE_TOP = 0.32;
const HEAD_Y = 2.3;

export const SPACE_STYLE: Record<SpaceType, { color: string; symbol: string }> = {
  start: { color: '#ffffff', symbol: '▶' },
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
    this.follow = this.tokens.get(seatId) ?? null;
    this.followDistance = close ? 0.65 : 1;
  }

  focusPoint(x: number, z: number, distance = 1): void {
    if (this.deferWhileMap(() => this.focusPoint(x, z, distance))) return;
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
  async hop(id: string, spaceId: number, duration = 0.32): Promise<void> {
    sound.play('step', { pitch: 0.9 + Math.random() * 0.3 });
    const t = this.token(id);
    const s = getSpace(this.board, spaceId);
    const from = t.root.position.clone();
    const to = new THREE.Vector3(s.x, TILE_TOP + (s.y ?? 0), s.z);
    t.faceTowards(s.x, s.z);
    t.setAnim('walk');
    await this.engine.tween(
      duration,
      (k) => {
        t.root.position.lerpVectors(from, to, k);
        t.root.position.y = lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 0.9;
      },
      ease.linear,
    );
    t.setAnim('idle');
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
    const lift = (append ? 1.35 : 0) + (numbers ? 1.1 : 0);
    for (let i = 0; i < count; i++) {
      const d = new Dice(numbers ? 1.15 : 0.95, { numbers });
      const side = (i - (count - 1) / 2) * 1.25;
      d.root.position.set(
        root.position.x + Math.cos(yaw) * side,
        root.position.y + HEAD_Y + 0.6 + lift,
        root.position.z - Math.sin(yaw) * side,
      );
      d.root.scale.setScalar(0.01);
      this.engine.tween(0.35, (k) => d.root.scale.setScalar(Math.max(0.01, k)), ease.backOut);
      this.dice.push(d);
      this.scene.add(d.root);
    }
  }

  /** A personagem salta, bate nos dados e eles param nos valores dados. */
  async hitDice(id: string, values: number[]): Promise<void> {
    sound.play('dice');
    const t = this.token(id);
    const base = t.root.position.y;
    t.setAnim('hit');
    await this.engine.tween(0.18, (k) => (t.root.position.y = base + k * 1.1), ease.out);
    const yaw = this.cameraYawTo(t.root.position.x, t.root.position.z);
    const pending = this.dice.filter((d) => d.value === null);
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
    sound.play('star');
    sound.play('cheer', { vol: 0.6 });
    const t = this.token(id);
    const icon = starMesh(0.6);
    const from = this.star.position.clone().add(new THREE.Vector3(0, 2.6, 0));
    const to = t.root.position.clone().add(new THREE.Vector3(0, HEAD_Y + 0.6, 0));
    this.scene.add(icon);
    t.setAnim('cheer');
    await this.engine.tween(0.9, (k) => {
      icon.position.lerpVectors(from, to, k);
      icon.position.y += Math.sin(k * Math.PI) * 2;
      icon.rotation.y = k * Math.PI * 4;
    });
    await this.engine.tween(0.4, (k) => icon.scale.setScalar(1 - k));
    this.scene.remove(icon);
    disposeObject(icon);
    await this.engine.wait(0.8);
    t.setAnim('idle');
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

    if (this.star.visible) {
      const s = this.star.children[0]!;
      s.rotation.y += dt * 1.6;
      s.position.y = 2.6 + Math.sin(time * 2) * 0.25;
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
      this.camTargetLook.set(p.x, p.y + 1.2, p.z);
      this.camTargetPos.set(p.x, p.y + 10.5 * d + 1.5, p.z + 13 * d);
    }
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
        .then(() => this.scene.remove(coin));
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
          ctx.fillText(style.symbol, size / 2, size / 2 + 4);
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
