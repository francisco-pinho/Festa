/**
 * Palco do tabuleiro: ilha, casas, estrela, personagens e dados.
 * Expõe operações animadas (async) que o Realizador encadeia.
 */
import * as THREE from 'three';
import { getCharacter, getSpace, type Board, type SpaceType } from '@festa/game';
import type { Engine, Stage } from '../three/Engine';
import { CharacterModel } from '../three/CharacterModel';
import { Dice } from '../three/Dice';
import { canvasTexture, disposeObject, FONT, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp, ease, lerp } from '../three/tweens';
import { starMesh } from './environment';
import { createBoardTheme, rideCurve, type BoardTheme } from './boardThemes';

const TILE_R = 1.15;
const TILE_TOP = 0.32;
const HEAD_Y = 2.3;

const SPACE_STYLE: Record<SpaceType, { color: string; symbol: string }> = {
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

  private slotOffset(i: number, n: number): { x: number; z: number } {
    const a = (i / n) * Math.PI * 2;
    const r = n <= 2 ? 0.55 : 0.75;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /** Salta da posição atual para o centro de uma casa. */
  async hop(id: string, spaceId: number, duration = 0.32): Promise<void> {
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
  spawnDice(id: string, count: number, append = false): void {
    if (!append) this.clearDice();
    const root = this.token(id).root;
    const yaw = this.cameraYawTo(root.position.x, root.position.z);
    const lift = append ? 1.35 : 0;
    for (let i = 0; i < count; i++) {
      const d = new Dice(0.95);
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
