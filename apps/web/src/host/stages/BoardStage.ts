/**
 * Palco do tabuleiro: ilha, casas, estrela, personagens e dados.
 * Expõe operações animadas (async) que o Realizador encadeia.
 */
import * as THREE from 'three';
import { createRng, getCharacter, getSpace, type Board, type SpaceType } from '@festa/game';
import type { Engine, Stage } from '../three/Engine';
import { CharacterModel } from '../three/CharacterModel';
import { Dice } from '../three/Dice';
import { canvasTexture, disposeObject, FONT, mesh, textSprite, toon } from '../three/materials';
import { damp, ease, lerp } from '../three/tweens';
import { Clouds, Water, bush, palmTree, rock, setupSky, starMesh } from './environment';

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

  private readonly water = new Water();
  private readonly clouds: Clouds;
  private readonly star = new THREE.Group();
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
    setupSky(this.scene);
    this.scene.add(this.water.mesh);
    this.clouds = new Clouds(createRng(7));
    this.scene.add(this.clouds.group);
    this.buildIsland();
    this.buildPaths();
    this.buildSpaces();
    this.buildDecorations();

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
    this.follow = null;
    this.camTargetPos.set(0, 52, 46);
    this.camTargetLook.set(0, 0, -2);
  }

  focus(seatId: string, close = false): void {
    this.follow = this.tokens.get(seatId) ?? null;
    this.followDistance = close ? 0.65 : 1;
  }

  focusPoint(x: number, z: number, distance = 1): void {
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
        const target = new THREE.Vector3(s.x + offset.x, TILE_TOP, s.z + offset.z);
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
    const to = new THREE.Vector3(s.x, TILE_TOP, s.z);
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
    const s = getSpace(this.board, spaceId);
    const target = new THREE.Vector3(s.x, 0, s.z);
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
      arrow.position.set(from.x + dir.x * 2, 1.2, from.z + dir.z * 2);
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
    this.water.update(time);
    this.clouds.update(dt);
    for (const t of this.tokens.values()) t.update(dt);
    for (const d of this.dice) d.update(dt);

    if (this.star.visible) {
      const s = this.star.children[0]!;
      s.rotation.y += dt * 1.6;
      s.position.y = 2.6 + Math.sin(time * 2) * 0.25;
      (this.starBeam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(time * 3) * 0.06;
    }
    for (const a of this.arrows.children) a.position.y = 1.2 + Math.sin(time * 5) * 0.15;

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

  // ── Construção do cenário ───────────────────────────────

  private islandShape(a: number, b: number): THREE.Shape {
    const shape = new THREE.Shape();
    const P = 3;
    for (let i = 0; i <= 96; i++) {
      const th = (i / 96) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const wobble = 1 + Math.sin(th * 5) * 0.03 + Math.sin(th * 11) * 0.015;
      const x = a * wobble * Math.sign(c) * Math.abs(c) ** (2 / P);
      const y = b * wobble * Math.sign(s) * Math.abs(s) ** (2 / P);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  }

  private buildIsland(): void {
    const layer = (a: number, b: number, depth: number, top: number, color: string) => {
      const geo = new THREE.ExtrudeGeometry(this.islandShape(a, b), { depth, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(Math.PI / 2);
      const m = mesh(geo, toon(color), { cast: false, receive: true });
      m.position.y = top;
      this.scene.add(m);
    };
    layer(34, 25, 3, -0.25, '#f2d58b'); // areia
    layer(31.5, 22.5, 3, 0, '#7ccf5b'); // relva
  }

  private buildPaths(): void {
    const ringSize = 36;
    for (const s of this.board.spaces) {
      for (const n of s.next) {
        const t = getSpace(this.board, n);
        const dx = t.x - s.x;
        const dz = t.z - s.z;
        const len = Math.hypot(dx, dz);
        const isBridge = (s.id >= ringSize + 8 || t.id >= ringSize + 8) && (s.id >= ringSize || t.id >= ringSize);
        const strip = mesh(
          new THREE.BoxGeometry(isBridge ? 1.6 : 1.1, isBridge ? 0.25 : 0.08, len),
          toon(isBridge ? '#a8743f' : '#e8d3a2'),
          { cast: isBridge, receive: true },
        );
        strip.position.set(s.x + dx / 2, isBridge ? 0.05 : 0.05, s.z + dz / 2);
        strip.rotation.y = Math.atan2(dx, dz);
        this.scene.add(strip);
        if (isBridge) {
          for (const side of [-1, 1]) {
            const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8), toon('#7a4f28'));
            const nx = (dz / len) * 0.85 * side;
            const nz = (-dx / len) * 0.85 * side;
            post.position.set(s.x + nx, -0.2, s.z + nz);
            this.scene.add(post);
          }
        }
      }
    }
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
      tile.position.set(s.x, 0.17, s.z);
      this.scene.add(tile);
    }
  }

  private buildDecorations(): void {
    const rng = createRng(99);
    const segs: [number, number, number, number][] = [];
    for (const s of this.board.spaces) for (const n of s.next) {
      const t = getSpace(this.board, n);
      segs.push([s.x, s.z, t.x, t.z]);
    }
    const clear = (x: number, z: number, margin: number) =>
      segs.every(([ax, az, bx, bz]) => distToSegment(x, z, ax, az, bx, bz) > margin);
    const inIsland = (x: number, z: number, a: number, b: number) => Math.abs(x / a) ** 3 + Math.abs(z / b) ** 3 < 1;

    let placed = 0;
    for (let tries = 0; tries < 2000 && placed < 70; tries++) {
      const x = (rng.next() - 0.5) * 64;
      const z = (rng.next() - 0.5) * 46;
      if (!inIsland(x, z, 30, 21) || !clear(x, z, 2.6)) continue;
      const r = rng.next();
      const obj = r < 0.4 ? palmTree(rng, 0.8 + rng.next() * 0.5) : r < 0.8 ? bush(rng) : rock(rng);
      obj.position.x = x;
      obj.position.z = z;
      obj.rotation.y = rng.next() * Math.PI * 2;
      this.scene.add(obj);
      placed++;
    }
  }
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
