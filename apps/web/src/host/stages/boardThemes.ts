/**
 * Cenário de cada mapa: terreno, caminhos, decoração, lojas, túneis/metro e
 * portões (com o seu estado visual). O BoardStage trata das casas, personagens,
 * dados e câmara; isto trata de "onde" se joga.
 */
import * as THREE from 'three';
import { createRng, getSpace, type Board, type ShopKind, type Space } from '@festa/game';
import { canvasTexture, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp } from '../three/tweens';
import { Clouds, Water, bush, palmTree, rock, setupSky } from './environment';

export interface BoardTheme {
  readonly group: THREE.Group;
  /** Limites do mapa (para enquadrar a câmara). */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  setFlags(flags: Record<string, boolean>): void;
  update(dt: number, time: number): void;
  /** Efeito especial quando a roda gigante gira (parque). */
  spinWheel?(): void;
}

const SHOP_SIGN: Record<ShopKind, { emoji: string; color: string }> = {
  geral: { emoji: '🛒', color: '#1fd1c1' },
  barata: { emoji: '💸', color: '#4cd964' },
  luxo: { emoji: '💎', color: '#b36bff' },
  ultimo: { emoji: '🆘', color: '#ff8c1a' },
};

export function createBoardTheme(board: Board, scene: THREE.Scene): BoardTheme {
  switch (board.theme) {
    case 'city':
      return new CityTheme(board, scene);
    case 'volcano':
      return new VolcanoTheme(board, scene);
    case 'castle':
      return new CastleTheme(board, scene);
    case 'park':
      return new ParkTheme(board, scene);
    default:
      return new IslandTheme(board, scene);
  }
}

// ── Utilidades comuns ─────────────────────────────────────

function boundsOf(spaces: Space[]) {
  return {
    minX: Math.min(...spaces.map((s) => s.x)),
    maxX: Math.max(...spaces.map((s) => s.x)),
    minZ: Math.min(...spaces.map((s) => s.z)),
    maxZ: Math.max(...spaces.map((s) => s.z)),
  };
}

function segmentsOf(board: Board): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of board.spaces)
    for (const n of s.next) {
      if (board.tunnels.some((t) => t.from === s.id && t.to === n)) continue;
      const t = getSpace(board, n);
      out.push([s.x, s.z, t.x, t.z]);
    }
  return out;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Direção "para fora" de uma casa (afastada do centro do mapa). */
function outward(s: Space, cx: number, cz: number): THREE.Vector2 {
  const v = new THREE.Vector2(s.x - cx, s.z - cz);
  return v.lengthSq() < 1e-6 ? new THREE.Vector2(0, 1) : v.normalize();
}

/** Loja: casinha com toldo às riscas e letreiro. */
function shopBuilding(kind: ShopKind, name: string, neon: boolean): THREE.Group {
  const g = new THREE.Group();
  const sign = SHOP_SIGN[kind];
  const base = mesh(new THREE.BoxGeometry(2.6, 2, 2), toon(neon ? '#2b2440' : '#fff4e0'), { receive: true });
  base.position.y = 1;
  const awning = mesh(
    new THREE.BoxGeometry(2.9, 0.18, 1.1),
    new THREE.MeshToonMaterial({
      map: canvasTexture(64, (ctx, s) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#ffffff' : sign.color;
          ctx.fillRect((i * s) / 8, 0, s / 8, s);
        }
      }),
    }),
  );
  awning.position.set(0, 2.05, 0.9);
  awning.rotation.x = 0.35;
  const door = mesh(new THREE.BoxGeometry(0.8, 1.3, 0.05), toon('#6b4423'), { cast: false });
  door.position.set(0, 0.65, 1.01);
  const board = mesh(
    new THREE.BoxGeometry(2.2, 0.7, 0.12),
    toonUnique(sign.color, neon ? { emissive: sign.color, emissiveIntensity: 0.8 } : {}),
  );
  board.position.set(0, 2.7, 0.6);
  const icon = textSprite(sign.emoji, { height: 1.1 });
  icon.position.set(0, 3.8, 0.6);
  const label = textSprite(name, { height: 0.45, color: '#ffffff' });
  label.position.set(0, 2.7, 0.75);
  g.add(base, awning, door, board, icon, label);
  return g;
}

function addPathStrips(board: Board, group: THREE.Group, style: (s: Space, t: Space) => { width: number; height: number; color: string; y: number } | null): void {
  for (const s of board.spaces)
    for (const n of s.next) {
      if (board.tunnels.some((t) => t.from === s.id && t.to === n)) continue;
      const t = getSpace(board, n);
      const st = style(s, t);
      if (!st) continue;
      const dx = t.x - s.x;
      const dz = t.z - s.z;
      const dy = (t.y ?? 0) - (s.y ?? 0);
      const len = Math.hypot(dx, dz);
      const strip = mesh(new THREE.BoxGeometry(st.width, st.height, Math.hypot(len, dy)), toon(st.color), { cast: false, receive: true });
      strip.position.set(s.x + dx / 2, st.y + (s.y ?? 0) + dy / 2, s.z + dz / 2);
      strip.rotation.order = 'YXZ';
      strip.rotation.y = Math.atan2(dx, dz);
      strip.rotation.x = -Math.atan2(dy, len);
      group.add(strip);
    }
}

// ── Ilha ──────────────────────────────────────────────────

class IslandTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly water = new Water(500);
  private readonly clouds = new Clouds(createRng(7), 16, 140);
  private readonly bridge = new THREE.Group();
  private readonly caveDoors: THREE.Mesh[] = [];
  private readonly bridgeBarrier: THREE.Mesh;
  private waterTarget = -0.75;
  private bridgeTarget = 0;
  private doorTarget = 0;

  constructor(board: Board, scene: THREE.Scene) {
    setupSky(scene, { fog: [120, 320] });
    this.bounds = boundsOf(board.spaces);
    const land = board.spaces.filter((s) => s.zone !== 'bridge');
    const lb = boundsOf(land);
    const cx = (lb.minX + lb.maxX) / 2;
    const cz = (lb.minZ + lb.maxZ) / 2;
    const a = (lb.maxX - lb.minX) / 2 + 7;
    const b = (lb.maxZ - lb.minZ) / 2 + 7;
    this.group.add(this.water.mesh, this.clouds.group, this.bridge);

    const layer = (aa: number, bb: number, depth: number, top: number, color: string) => {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 120; i++) {
        const th = (i / 120) * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const wobble = 1 + Math.sin(th * 5) * 0.03 + Math.sin(th * 11) * 0.015;
        const x = cx + aa * wobble * Math.sign(c) * Math.abs(c) ** (2 / 3);
        const y = cz + bb * wobble * Math.sign(s) * Math.abs(s) ** (2 / 3);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(Math.PI / 2);
      const m = mesh(geo, toon(color), { cast: false, receive: true });
      m.position.y = top;
      this.group.add(m);
    };
    layer(a + 3, b + 3, 3, -0.25, '#f2d58b');
    layer(a, b, 3, 0, '#7ccf5b');

    // Caminhos: areia em terra, tábuas na ponte
    addPathStrips(board, this.group, (s, t) => {
      const onBridge = s.zone === 'bridge' || t.zone === 'bridge';
      if (onBridge) return null;
      return { width: 1.1, height: 0.08, color: '#e8d3a2', y: 0.05 };
    });
    // Ponte (afunda com a maré alta)
    for (const s of board.spaces)
      for (const n of s.next) {
        const t = getSpace(board, n);
        if (s.zone !== 'bridge' && t.zone !== 'bridge') continue;
        const dx = t.x - s.x;
        const dz = t.z - s.z;
        const len = Math.hypot(dx, dz);
        const plank = mesh(new THREE.BoxGeometry(1.7, 0.25, len), toon('#a8743f'), { receive: true });
        plank.position.set(s.x + dx / 2, 0.05, s.z + dz / 2);
        plank.rotation.y = Math.atan2(dx, dz);
        this.bridge.add(plank);
        for (const side of [-1, 1]) {
          const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2), toon('#7a4f28'));
          post.position.set(s.x + (dz / len) * 0.9 * side, -0.3, s.z + (-dx / len) * 0.9 * side);
          this.bridge.add(post);
        }
      }
    // Barreira da ponte (aparece na maré alta)
    const bridgeGate = board.gates.find((g) => g.name === 'Ponte');
    this.bridgeBarrier = mesh(new THREE.BoxGeometry(2.4, 1.2, 0.3), toonUnique('#ff3b5c'));
    if (bridgeGate) {
      const from = getSpace(board, bridgeGate.from);
      const to = getSpace(board, bridgeGate.to);
      this.bridgeBarrier.position.set((from.x + to.x) / 2, 0.8, (from.z + to.z) / 2);
      this.bridgeBarrier.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      const sign = textSprite('🌊 Maré alta', { height: 0.6 });
      sign.position.y = 1.2;
      this.bridgeBarrier.add(sign);
      this.group.add(this.bridgeBarrier);
    }

    // Entradas da gruta (túnel)
    for (const tunnel of board.tunnels) {
      for (const [id, otherId] of [[tunnel.from, tunnel.to], [tunnel.to, tunnel.from]] as const) {
        const s = getSpace(board, id);
        const o = getSpace(board, otherId);
        const dir = new THREE.Vector2(o.x - s.x, o.z - s.z).normalize();
        const cave = new THREE.Group();
        const rng = createRng(id * 7);
        for (let i = 0; i < 7; i++) {
          const r = rock(rng);
          r.scale.setScalar(2 + rng.next() * 1.5);
          r.position.set((rng.next() - 0.5) * 4, 0.2, -1.5 - rng.next() * 2);
          cave.add(r);
        }
        const mouth = mesh(new THREE.CircleGeometry(1.1, 20, 0, Math.PI), toon('#120a1e'), { cast: false });
        mouth.position.set(0, 0.05, -0.6);
        const door = mesh(new THREE.BoxGeometry(2.3, 1.4, 0.25), toonUnique('#6b6f78'));
        door.position.set(0, 0.7, -0.4);
        this.caveDoors.push(door);
        const label = textSprite('🕳️ Gruta', { height: 0.6 });
        label.position.set(0, 2.6, -1);
        cave.add(mouth, door, label);
        // Fica atrás da casa, na direção do túnel
        cave.position.set(s.x + dir.x * 2.2, 0, s.z + dir.y * 2.2);
        cave.rotation.y = Math.atan2(-dir.x, -dir.y);
        this.group.add(cave);
      }
    }

    // Lojas
    for (const shop of board.shops) {
      const s = getSpace(board, shop.spaceId);
      const out = outward(s, cx, cz);
      const building = shopBuilding(shop.kind, shop.name, false);
      building.position.set(s.x + out.x * 3, 0, s.z + out.y * 3);
      building.rotation.y = Math.atan2(-out.x, -out.y);
      this.group.add(building);
    }

    // Decoração
    const segs = segmentsOf(board);
    const avoid = [...board.shops.map((sh) => getSpace(board, sh.spaceId)), ...board.tunnels.flatMap((t) => [getSpace(board, t.from), getSpace(board, t.to)])];
    const rng = createRng(99);
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < 120; tries++) {
      const x = cx + (rng.next() - 0.5) * a * 2;
      const z = cz + (rng.next() - 0.5) * b * 2;
      if (Math.abs((x - cx) / (a - 2)) ** 3 + Math.abs((z - cz) / (b - 2)) ** 3 >= 1) continue;
      if (!segs.every(([ax, az, bx, bz]) => distToSegment(x, z, ax, az, bx, bz) > 2.6)) continue;
      if (avoid.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      const r = rng.next();
      const obj = r < 0.45 ? palmTree(rng, 0.8 + rng.next() * 0.6) : r < 0.8 ? bush(rng) : rock(rng);
      obj.position.set(x, 0, z);
      obj.rotation.y = rng.next() * Math.PI * 2;
      this.group.add(obj);
      placed++;
    }
    scene.add(this.group);
  }

  setFlags(flags: Record<string, boolean>): void {
    const high = !!flags.highTide;
    // A água sobe até cobrir a areia (não a relva) e a ponte afunda por baixo dela.
    this.waterTarget = high ? -0.42 : -0.75;
    this.bridgeTarget = high ? -1.4 : 0;
    this.doorTarget = high ? -2 : 0; // porta da gruta abre (desce) na maré alta
    this.bridgeBarrier.visible = high;
  }

  update(dt: number, time: number): void {
    const k = damp(1.5, dt);
    this.water.mesh.position.y += (this.waterTarget - this.water.mesh.position.y) * k;
    this.bridge.position.y += (this.bridgeTarget - this.bridge.position.y) * k;
    for (const d of this.caveDoors) d.position.y += (0.7 + this.doorTarget - d.position.y) * k;
    this.water.update(time);
    this.clouds.update(dt);
  }
}


// ── Curvas das viagens (vagoneta, elevador, montanha-russa) ─

/** Curva de uma viagem entre dois pontos do tabuleiro. */
export function rideCurve(from: THREE.Vector3, to: THREE.Vector3, kind: 'cart' | 'elevator' | 'coaster'): THREE.CatmullRomCurve3 {
  const mid = from.clone().lerp(to, 0.5);
  if (kind === 'elevator') {
    const top = Math.max(from.y, to.y) + 3;
    return new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x, top, from.z), new THREE.Vector3(to.x, top, to.z), to]);
  }
  if (kind === 'cart') {
    return new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.25).setY(1.4), mid.clone().setY(2.2), from.clone().lerp(to, 0.75).setY(1.4), to]);
  }
  // Montanha-russa: sobe muito, desce a pique e dá uma volta.
  const dir = to.clone().sub(from);
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(8);
  return new THREE.CatmullRomCurve3([
    from,
    from.clone().lerp(to, 0.15).setY(14),
    from.clone().lerp(to, 0.35).add(side).setY(4),
    mid.clone().setY(16),
    from.clone().lerp(to, 0.65).sub(side).setY(5),
    from.clone().lerp(to, 0.85).setY(10),
    to,
  ]);
}

/** Carris ao longo de uma curva (dois trilhos + travessas). */
function rails(curve: THREE.Curve<THREE.Vector3>, color: string, supports: boolean, group: THREE.Group): void {
  const steps = Math.ceil(curve.getLength() / 1.2);
  for (const off of [-0.45, 0.45]) {
    const pts = curve.getSpacedPoints(steps).map((p, i, arr) => {
      const next = arr[Math.min(arr.length - 1, i + 1)]!;
      const prev = arr[Math.max(0, i - 1)]!;
      const dir = next.clone().sub(prev).setY(0).normalize();
      return p.clone().add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(off)).add(new THREE.Vector3(0, -0.3, 0));
    });
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, 0.07, 6), toon(color));
    group.add(tube);
  }
  curve.getSpacedPoints(steps).forEach((p, i, arr) => {
    const next = arr[Math.min(arr.length - 1, i + 1)]!;
    const sleeper = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.25), toon('#5a3a1e'), { cast: false });
    sleeper.position.copy(p).add(new THREE.Vector3(0, -0.35, 0));
    sleeper.rotation.y = Math.atan2(next.x - p.x, next.z - p.z);
    group.add(sleeper);
    if (supports && i % 3 === 0 && p.y > 1.5) {
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, p.y), toon('#8a8f99'));
      post.position.set(p.x, p.y / 2 - 0.3, p.z);
      group.add(post);
    }
  });
}

function tunnelCurve(board: Board, t: Board['tunnels'][number]): THREE.CatmullRomCurve3 {
  const a = getSpace(board, t.from);
  const b = getSpace(board, t.to);
  const kind = t.kind === 'coaster' ? 'coaster' : t.kind === 'elevator' ? 'elevator' : 'cart';
  return rideCurve(new THREE.Vector3(a.x, 0.32 + (a.y ?? 0), a.z), new THREE.Vector3(b.x, 0.32 + (b.y ?? 0), b.z), kind);
}

function decorate(board: Board, group: THREE.Group, area: { cx: number; cz: number; w: number; d: number }, count: number, seed: number, make: (rng: ReturnType<typeof createRng>) => THREE.Object3D, clearance = 2.8, skip?: (x: number, z: number) => boolean): void {
  const segs = segmentsOf(board);
  const avoid = [...board.shops.map((sh) => getSpace(board, sh.spaceId)), ...board.tunnels.flatMap((t) => [getSpace(board, t.from), getSpace(board, t.to)])];
  const rng = createRng(seed);
  let placed = 0;
  for (let tries = 0; tries < count * 40 && placed < count; tries++) {
    const x = area.cx + (rng.next() - 0.5) * area.w;
    const z = area.cz + (rng.next() - 0.5) * area.d;
    if (!segs.every(([ax, az, bx, bz]) => distToSegment(x, z, ax, az, bx, bz) > clearance)) continue;
    if (avoid.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
    if (skip?.(x, z)) continue;
    const obj = make(rng);
    obj.position.x = x;
    obj.position.z = z;
    group.add(obj);
    placed++;
  }
}

function shopsFor(board: Board, group: THREE.Group, cx: number, cz: number, neon: boolean): void {
  for (const shop of board.shops) {
    const s = getSpace(board, shop.spaceId);
    const out = outward(s, cx, cz);
    const building = shopBuilding(shop.kind, shop.name, neon);
    building.position.set(s.x + out.x * 3.2, s.y ?? 0, s.z + out.y * 3.2);
    building.rotation.y = Math.atan2(-out.x, -out.y);
    group.add(building);
  }
}

// ── Vulcão ────────────────────────────────────────────────

class VolcanoTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly glow: THREE.MeshToonMaterial;
  private readonly light: THREE.PointLight;
  private readonly barrier: THREE.Mesh;
  private readonly rocks: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
  private erupting = false;

  constructor(board: Board, scene: THREE.Scene) {
    this.bounds = boundsOf(board.spaces);
    scene.background = new THREE.Color('#4a2a3a');
    scene.fog = new THREE.Fog('#4a2a3a', 100, 260);
    scene.add(new THREE.HemisphereLight('#ffc9a3', '#3a2a2a', 1.6));
    const sun = new THREE.DirectionalLight('#ffd0a0', 2.2);
    sun.position.set(30, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 220 });
    scene.add(sun);

    const ground = mesh(new THREE.CircleGeometry(110, 64), toon('#6b4a3a'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);
    addPathStrips(board, this.group, (s, t) => ({ width: 1.3, height: 0.08, color: s.zone === 'crater' || t.zone === 'crater' ? '#2b1d1d' : '#a88a6a', y: 0.04 }));

    // Vulcão ao centro
    const cone = mesh(new THREE.CylinderGeometry(4, 14, 14, 24, 1, true), toon('#4a2f28'), { receive: true });
    cone.position.y = 7;
    const rim = mesh(new THREE.TorusGeometry(4.2, 0.8, 8, 24), toon('#3a221e'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 14;
    this.glow = toonUnique('#ff5a1f', { emissive: '#ff5a1f', emissiveIntensity: 1.2 });
    const lava = mesh(new THREE.CircleGeometry(3.8, 24), this.glow, { cast: false });
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = 13.6;
    this.light = new THREE.PointLight('#ff6a2a', 80, 60);
    this.light.position.set(0, 18, 0);
    this.group.add(cone, rim, lava, this.light);
    // Rios de lava a descer a encosta
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const river = mesh(new THREE.BoxGeometry(0.8, 0.1, 10), this.glow, { cast: false });
      river.position.set(Math.cos(a) * 9, 6, Math.sin(a) * 9);
      river.rotation.y = -a + Math.PI / 2;
      river.rotation.x = -0.75;
      this.group.add(river);
    }

    // Barreira da cratera (durante a erupção)
    const gate = board.gates[0];
    this.barrier = mesh(new THREE.BoxGeometry(2.4, 1.2, 0.3), toonUnique('#ff3b5c'));
    if (gate) {
      const a = getSpace(board, gate.from);
      const b = getSpace(board, gate.to);
      this.barrier.position.set((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2);
      this.barrier.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const sign = textSprite('🌋 Erupção!', { height: 0.6 });
      sign.position.y = 1.2;
      this.barrier.add(sign);
      this.group.add(this.barrier);
    }

    // Vagonetas: carris em arco
    for (const t of board.tunnels) {
      rails(tunnelCurve(board, t), '#9aa3ad', true, this.group);
      for (const id of [t.from, t.to]) {
        const s = getSpace(board, id);
        const sign = textSprite('🛤️', { height: 1.1 });
        sign.position.set(s.x, 3, s.z);
        this.group.add(sign);
      }
    }
    // Entradas da galeria da mina
    for (const id of board.spaces.filter((s) => s.zone === 'mine').map((s) => s.id).filter((_, i, arr) => i === 0 || i === arr.length - 1)) {
      const s = getSpace(board, id);
      const arch = mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 12, Math.PI), toon('#5a3a1e'));
      arch.position.set(s.x, 0.1, s.z);
      arch.rotation.y = Math.atan2(s.x, s.z);
      this.group.add(arch);
    }
    shopsFor(board, this.group, 0, 0, false);
    // Rochas, cristais e árvores secas
    decorate(board, this.group, { cx: 0, cz: 0, w: 140, d: 140 }, 110, 77, (rng) => {
      const r = rng.next();
      if (r < 0.55) {
        const o = rock(rng);
        o.scale.setScalar(1 + rng.next() * 1.4);
        (o.material as THREE.Material) = toon(rng.next() < 0.5 ? '#5b4a44' : '#7a665a');
        return o;
      }
      if (r < 0.8) {
        const g = new THREE.Group();
        const color = rng.pick(['#3fd0ff', '#b36bff', '#ff6fb5']);
        for (let i = 0; i < 3; i++) {
          const c = mesh(new THREE.ConeGeometry(0.3, 1.4 + rng.next(), 5), toonUnique(color, { emissive: color, emissiveIntensity: 0.5 }));
          c.position.set((i - 1) * 0.4, 0.6, rng.next() * 0.3);
          c.rotation.z = (i - 1) * 0.3;
          g.add(c);
        }
        return g;
      }
      const tree = new THREE.Group();
      const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 6), toon('#3a2a22'));
      trunk.position.y = 1.3;
      const branch = mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), toon('#3a2a22'));
      branch.position.set(0.35, 2, 0);
      branch.rotation.z = -0.8;
      tree.add(trunk, branch);
      return tree;
    }, 2.6, (x, z) => Math.hypot(x, z) < 16);
    scene.add(this.group);
  }

  setFlags(flags: Record<string, boolean>): void {
    this.erupting = !!flags.erupting;
    this.barrier.visible = this.erupting;
  }

  update(dt: number, time: number): void {
    this.glow.emissiveIntensity = (this.erupting ? 2.2 : 1.1) + Math.sin(time * 4) * 0.25;
    this.light.intensity = this.erupting ? 200 + Math.sin(time * 20) * 60 : 80;
    if (this.erupting && Math.random() < dt * 14) {
      const m = mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.4, 0), this.glow);
      m.position.set(0, 14, 0);
      this.group.add(m);
      const a = Math.random() * Math.PI * 2;
      this.rocks.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 6), 14 + Math.random() * 8, Math.sin(a) * (4 + Math.random() * 6)) });
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i]!;
      r.vel.y -= 25 * dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotation.x += dt * 4;
      if (r.mesh.position.y < 0) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.rocks.splice(i, 1);
      }
    }
  }
}

// ── Castelo ───────────────────────────────────────────────

class CastleTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly doors: { gate: Board['gates'][number]; door: THREE.Object3D }[] = [];
  private readonly ghost: THREE.Sprite;
  private readonly flames: THREE.MeshToonMaterial[] = [];

  constructor(board: Board, scene: THREE.Scene) {
    this.bounds = boundsOf(board.spaces);
    scene.background = new THREE.Color('#1d1433');
    scene.fog = new THREE.Fog('#1d1433', 80, 200);
    scene.add(new THREE.HemisphereLight('#b9a9ff', '#2a2440', 1.5));
    const moon = new THREE.DirectionalLight('#dfe6ff', 2);
    moon.position.set(-30, 60, 40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    scene.add(moon);
    const moonDisc = mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), { cast: false });
    moonDisc.position.set(-40, 50, -120);
    this.group.add(moonDisc);

    const ground = mesh(new THREE.PlaneGeometry(220, 220), toon('#2f3a2a'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);

    // Plataformas dos andares (pedra)
    for (const zone of ['floor0', 'floor1', 'floor2']) {
      const sp = board.spaces.filter((s) => s.zone === zone);
      if (!sp.length) continue;
      const b = boundsOf(sp);
      const y = sp[0]!.y ?? 0;
      const w = b.maxX - b.minX + 7;
      const d = b.maxZ - b.minZ + 7;
      const h = Math.max(0.3, y);
      const slab = mesh(new THREE.BoxGeometry(w, h, d), toon(zone === 'floor0' ? '#6b6f78' : '#7d7466'), { receive: true });
      slab.position.set((b.minX + b.maxX) / 2, h / 2 - (y ? 0 : 0.28), (b.minZ + b.maxZ) / 2);
      this.group.add(slab);
      // Ameias à volta dos andares altos
      if (y > 0) {
        for (let x = b.minX - 3; x <= b.maxX + 3; x += 2.4) {
          for (const z of [b.minZ - 3.2, b.maxZ + 3.2]) {
            const m = mesh(new THREE.BoxGeometry(1, 1, 0.6), toon('#8a8072'));
            m.position.set(x, y + 0.5, z);
            this.group.add(m);
          }
        }
      }
      // Torres nos cantos
      for (const [cx, cz] of [[b.minX - 3.5, b.minZ - 3.5], [b.maxX + 3.5, b.minZ - 3.5], [b.minX - 3.5, b.maxZ + 3.5], [b.maxX + 3.5, b.maxZ + 3.5]] as const) {
        const tower = mesh(new THREE.CylinderGeometry(1.6, 1.8, y + 6, 12), toon('#8a8072'));
        tower.position.set(cx, (y + 6) / 2, cz);
        const roof = mesh(new THREE.ConeGeometry(2.1, 3, 12), toon('#5b3a8a'));
        roof.position.set(cx, y + 7.5, cz);
        const flameMat = toonUnique('#ffb020', { emissive: '#ff8a1a', emissiveIntensity: 1.5 });
        this.flames.push(flameMat);
        const flame = mesh(new THREE.SphereGeometry(0.3, 8, 6), flameMat, { cast: false });
        flame.position.set(cx, y + 2, cz + 1.9);
        this.group.add(tower, roof, flame);
      }
    }
    addPathStrips(board, this.group, () => ({ width: 1.3, height: 0.1, color: '#a39a8a', y: 0.05 }));

    // Elevadores: poços com cabos
    for (const t of board.tunnels) {
      for (const id of [t.from, t.to]) {
        const s = getSpace(board, id);
        const top = 10;
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const post = mesh(new THREE.BoxGeometry(0.15, top, 0.15), toon('#4a4f58'));
          const out = outward(s, 0, 0);
          post.position.set(s.x + out.x * 2.2 + ox * 0.9, top / 2, s.z + out.y * 2.2 + oz * 0.9);
          this.group.add(post);
        }
        const sign = textSprite('🛗', { height: 1 });
        sign.position.set(s.x, (s.y ?? 0) + 3, s.z);
        this.group.add(sign);
      }
    }
    // Portas nas escadarias
    for (const gate of board.gates) {
      const a = getSpace(board, gate.from);
      const b = getSpace(board, gate.to);
      const pivot = new THREE.Group();
      const door = mesh(new THREE.BoxGeometry(2.2, 2.6, 0.2), toon('#6b4423'));
      door.position.set(1.1, 1.3, 0);
      const knob = mesh(new THREE.SphereGeometry(0.12, 8, 6), toon('#ffd23f'), { cast: false });
      knob.position.set(1.9, 1.3, 0.15);
      pivot.add(door, knob);
      pivot.position.set((a.x + b.x) / 2 - 1.1, ((a.y ?? 0) + (b.y ?? 0)) / 2, (a.z + b.z) / 2);
      this.group.add(pivot);
      this.doors.push({ gate, door: pivot });
    }
    shopsFor(board, this.group, 0, -6, false);
    // Fantasma
    this.ghost = textSprite('👻', { height: 2.4 });
    this.group.add(this.ghost);
    // Árvores secas e lápides à volta
    decorate(board, this.group, { cx: 0, cz: -4, w: 120, d: 110 }, 60, 13, (rng) => {
      if (rng.next() < 0.5) {
        const g = new THREE.Group();
        const stone = mesh(new THREE.BoxGeometry(0.9, 1.2, 0.25), toon('#8a8f99'));
        stone.position.y = 0.6;
        g.add(stone);
        g.rotation.y = rng.next();
        return g;
      }
      const tree = new THREE.Group();
      const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.25, 3, 6), toon('#2b2224'));
      trunk.position.y = 1.5;
      const top = mesh(new THREE.SphereGeometry(1.2, 6, 5), toon('#3a2a4d'));
      top.position.y = 3.4;
      tree.add(trunk, top);
      return tree;
    }, 4);
    scene.add(this.group);
  }

  setFlags(flags: Record<string, boolean>): void {
    for (const d of this.doors) {
      const open = (flags[d.gate.flag] ?? false) === d.gate.openWhen;
      d.door.userData.target = open ? -1.6 : 0;
    }
  }

  update(dt: number, time: number): void {
    for (const d of this.doors) d.door.rotation.y += (((d.door.userData.target as number) ?? 0) - d.door.rotation.y) * damp(3, dt);
    this.ghost.position.set(Math.sin(time * 0.3) * 24, 9 + Math.sin(time * 1.3) * 1.2, -6 + Math.cos(time * 0.23) * 22);
    (this.ghost.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(time * 2) * 0.25;
    this.flames.forEach((f, i) => (f.emissiveIntensity = 1.2 + Math.sin(time * 9 + i) * 0.4));
  }
}

// ── Parque de diversões ───────────────────────────────────

class ParkTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly wheel = new THREE.Group();
  private wheelSpeed = 0.15;
  private readonly balloons: THREE.Object3D[] = [];
  private readonly carousel = new THREE.Group();

  constructor(board: Board, scene: THREE.Scene) {
    setupSky(scene, { fog: [140, 320] });
    this.bounds = boundsOf(board.spaces);
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const ground = mesh(new THREE.PlaneGeometry(260, 220), toon('#7ccf5b'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);
    const pathColor = (s: Space, t: Space) => (s.zone === 'midway' || t.zone === 'midway' ? '#ffd1e8' : s.zone === 'wheel' || t.zone === 'wheel' ? '#cfe8ff' : '#f2d58b');
    addPathStrips(board, this.group, (s, t) => ({ width: 1.5, height: 0.08, color: pathColor(s, t), y: 0.04 }));

    // Roda gigante (atrás das casas da roda)
    const wheelSpaces = board.wheel?.map((id) => getSpace(board, id)) ?? [];
    if (wheelSpaces.length) {
      const cx = wheelSpaces.reduce((a, s) => a + s.x, 0) / wheelSpaces.length;
      const cz = wheelSpaces.reduce((a, s) => a + s.z, 0) / wheelSpaces.length;
      const R = 7;
      const base = new THREE.Group();
      base.position.set(cx, R + 3.5, cz);
      const ring = mesh(new THREE.TorusGeometry(R, 0.25, 8, 48), toon('#ff6fb5'));
      this.wheel.add(ring);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = mesh(new THREE.CylinderGeometry(0.08, 0.08, R * 2), toon('#ffffff'));
        spoke.rotation.z = a;
        this.wheel.add(spoke);
        const cabin = mesh(new THREE.BoxGeometry(1.2, 1, 1.2), toon(['#ffd23f', '#3fd0ff', '#4cd964', '#ff5a5f'][i % 4]!));
        cabin.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        this.wheel.add(cabin);
      }
      base.add(this.wheel);
      for (const side of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.25, 0.35, R + 4.5), toon('#9aa3ad'));
        leg.position.set(side * 2.5, -(R + 3.5) / 2, 0);
        leg.rotation.z = side * 0.25;
        base.add(leg);
      }
      this.group.add(base);
    }

    // Montanha-russa
    for (const t of board.tunnels) {
      rails(tunnelCurve(board, t), '#ff3b5c', true, this.group);
      for (const id of [t.from, t.to]) {
        const s = getSpace(board, id);
        const sign = textSprite('🎢', { height: 1.2 });
        sign.position.set(s.x, 3.2, s.z);
        this.group.add(sign);
      }
    }

    // Carrossel ao centro
    const base = mesh(new THREE.CylinderGeometry(4, 4, 0.5, 24), toon('#ffd23f'));
    base.position.y = 0.25;
    const roof = mesh(new THREE.ConeGeometry(4.6, 2.4, 24), toon('#ff5a5f'));
    roof.position.y = 4.5;
    const pole = mesh(new THREE.CylinderGeometry(0.3, 0.3, 4), toon('#ffffff'));
    pole.position.y = 2.3;
    this.carousel.add(base, roof, pole);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const horse = mesh(new THREE.BoxGeometry(0.4, 0.7, 1.1), toon(['#ffffff', '#ffd1e8', '#cfe8ff'][i % 3]!));
      horse.position.set(Math.cos(a) * 2.8, 1.4, Math.sin(a) * 2.8);
      const rod = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3), toon('#ffd23f'));
      rod.position.set(Math.cos(a) * 2.8, 2.2, Math.sin(a) * 2.8);
      this.carousel.add(horse, rod);
    }
    const midway = board.spaces.filter((s) => s.zone === 'midway');
    const far = (x: number, z: number) => midway.every((s) => Math.hypot(s.x - x, s.z - z) > 6);
    let placedCarousel = false;
    for (const [x, z] of [[0, -10], [0, 10], [-12, 0], [12, 0]] as const) {
      if (!placedCarousel && far(x, z)) {
        this.carousel.position.set(x, 0, z);
        placedCarousel = true;
      }
    }
    this.group.add(this.carousel);

    shopsFor(board, this.group, (minX + maxX) / 2, (minZ + maxZ) / 2, false);
    // Tendas, balões e bancas
    decorate(board, this.group, { cx: 0, cz: 0, w: (maxX - minX) + 40, d: (maxZ - minZ) + 40 }, 70, 21, (rng) => {
      const r = rng.next();
      if (r < 0.35) {
        const g = new THREE.Group();
        const color = rng.pick(['#ff5a5f', '#3fa7ff', '#b36bff', '#4cd964']);
        const tent = mesh(new THREE.ConeGeometry(2, 2.6, 8), toonUnique(color));
        tent.position.y = 1.3;
        const flag = mesh(new THREE.ConeGeometry(0.25, 0.6, 4), toon('#ffd23f'));
        flag.position.y = 2.9;
        g.add(tent, flag);
        return g;
      }
      if (r < 0.65) {
        const g = new THREE.Group();
        const balloon = mesh(new THREE.SphereGeometry(0.6, 12, 10), toonUnique(rng.pick(['#ff5a5f', '#ffd23f', '#3fd0ff', '#ff6fb5', '#4cd964'])));
        balloon.position.y = 4 + rng.next() * 2;
        balloon.scale.y = 1.2;
        const string = mesh(new THREE.CylinderGeometry(0.02, 0.02, balloon.position.y), toon('#ffffff'), { cast: false });
        string.position.y = balloon.position.y / 2;
        g.add(balloon, string);
        this.balloons.push(balloon);
        return g;
      }
      return palmTree(rng, 0.8 + rng.next() * 0.4);
    }, 3);
    scene.add(this.group);
  }

  /** A roda gira mais depressa quando muda as pessoas de sítio. */
  spinWheel(): void {
    this.wheelSpeed = 2.5;
  }

  setFlags(): void {}

  update(dt: number, time: number): void {
    this.wheel.rotation.z += this.wheelSpeed * dt;
    this.wheelSpeed += (0.15 - this.wheelSpeed) * damp(0.8, dt);
    this.carousel.rotation.y += dt * 0.6;
    this.balloons.forEach((b, i) => (b.position.x = Math.sin(time * 1.2 + i) * 0.2));
  }
}

// ── Cidade ────────────────────────────────────────────────

class CityTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly lights: { gate: Board['gates'][number]; red: THREE.MeshToonMaterial; green: THREE.MeshToonMaterial }[] = [];
  private readonly neon: THREE.MeshToonMaterial[] = [];

  constructor(board: Board, scene: THREE.Scene) {
    this.bounds = boundsOf(board.spaces);
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // Céu ao entardecer e luz de cidade
    scene.background = new THREE.Color('#231a4d');
    scene.fog = new THREE.Fog('#231a4d', 90, 220);
    scene.add(new THREE.HemisphereLight('#a99bff', '#2a2440', 1.4));
    const moon = new THREE.DirectionalLight('#ffe6c4', 1.9);
    moon.position.set(-30, 60, 30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    scene.add(moon);

    const ground = mesh(new THREE.PlaneGeometry(260, 220), toon('#3a3550'), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);
    // Passeios por baixo das ruas e estradas
    addPathStrips(board, this.group, () => ({ width: 4.2, height: 0.06, color: '#8d8aa0', y: 0.0 }));
    addPathStrips(board, this.group, () => ({ width: 2.8, height: 0.08, color: '#26232f', y: 0.02 }));
    // Riscas no meio das estradas
    for (const [ax, az, bx, bz] of segmentsOf(board)) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0.6; d < len - 0.6; d += 1.6) {
        const f = d / len;
        const dash = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.7), toon('#ffd23f'), { cast: false });
        dash.position.set(ax + (bx - ax) * f, 0.07, az + (bz - az) * f);
        dash.rotation.y = Math.atan2(bx - ax, bz - az);
        this.group.add(dash);
      }
    }

    // Prédios: grelha à volta e dentro dos quarteirões, longe das ruas
    const segs = segmentsOf(board);
    const avoid = [...board.shops.map((sh) => getSpace(board, sh.spaceId)), ...board.spaces.filter((s) => s.zone === 'metro')];
    const rng = createRng(4242);
    const windowTex = (hue: number) =>
      canvasTexture(64, (ctx, s) => {
        ctx.fillStyle = '#1a1626';
        ctx.fillRect(0, 0, s, s);
        for (let y = 4; y < s; y += 10)
          for (let x = 4; x < s; x += 10) {
            const lit = Math.random() < 0.55;
            ctx.fillStyle = lit ? `hsl(${hue}, 90%, ${60 + Math.random() * 20}%)` : '#2c2840';
            ctx.fillRect(x, y, 6, 6);
          }
      });
    const texes = [45, 190, 300, 30].map(windowTex);
    for (let x = minX - 18; x <= maxX + 18; x += 6) {
      for (let z = minZ - 18; z <= maxZ + 18; z += 6) {
        const px = x + (rng.next() - 0.5) * 1.5;
        const pz = z + (rng.next() - 0.5) * 1.5;
        if (!segs.every(([ax, az, bx, bz]) => distToSegment(px, pz, ax, az, bx, bz) > 4.6)) continue;
        if (avoid.some((s) => Math.hypot(s.x - px, s.z - pz) < 6)) continue;
        const inside = px > minX && px < maxX && pz > minZ && pz < maxZ;
        const h = inside ? 3 + rng.next() * 7 : 6 + rng.next() * 16;
        const tex = texes[Math.floor(rng.next() * texes.length)]!.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, Math.max(1, Math.round(h / 4)));
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const mat = toonUnique('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55 });
        const bld = mesh(new THREE.BoxGeometry(4.2, h, 4.2), mat, { receive: true });
        bld.position.set(px, h / 2, pz);
        this.group.add(bld);
        if (rng.next() < 0.3) {
          const color = ['#ff3bd4', '#3fd0ff', '#ffd23f', '#4cd964'][Math.floor(rng.next() * 4)]!;
          const nm = toonUnique(color, { emissive: color, emissiveIntensity: 1.2 });
          this.neon.push(nm);
          const sign = mesh(new THREE.BoxGeometry(3, 0.5, 0.15), nm, { cast: false });
          sign.position.set(px, h + 0.5, pz + 2.1);
          this.group.add(sign);
        }
      }
    }

    // Semáforos nos portões
    for (const gate of board.gates) {
      const from = getSpace(board, gate.from);
      const to = getSpace(board, gate.to);
      const dir = new THREE.Vector2(to.x - from.x, to.z - from.z).normalize();
      const pole = new THREE.Group();
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2), toon('#2b2b38'));
      post.position.y = 1.6;
      const box = mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), toon('#1b1b24'));
      box.position.y = 3.3;
      const red = toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 1 });
      const green = toonUnique('#4cd964', { emissive: '#4cd964', emissiveIntensity: 1 });
      const r = mesh(new THREE.SphereGeometry(0.16, 10, 8), red, { cast: false });
      r.position.set(0, 3.55, 0.22);
      const gr = mesh(new THREE.SphereGeometry(0.16, 10, 8), green, { cast: false });
      gr.position.set(0, 3.05, 0.22);
      pole.add(post, box, r, gr);
      pole.position.set(from.x + dir.x * 1.6 + dir.y * 1.6, 0, from.z + dir.y * 1.6 - dir.x * 1.6);
      pole.rotation.y = Math.atan2(-dir.x, -dir.y);
      this.group.add(pole);
      this.lights.push({ gate, red, green });
    }

    // Estações de metro
    for (const s of board.spaces.filter((sp) => sp.zone === 'metro')) {
      const out = outward(s, cx, cz);
      const st = new THREE.Group();
      const stairs = mesh(new THREE.BoxGeometry(2.6, 0.6, 2.2), toon('#2b2440'), { receive: true });
      stairs.position.y = 0.3;
      const hole = mesh(new THREE.BoxGeometry(2, 0.05, 1.6), toon('#0d0a14'), { cast: false });
      hole.position.y = 0.62;
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6), toon('#c0c0c0'));
      post.position.set(1.3, 1.3, 0);
      const sign = textSprite('Ⓜ️', { height: 1 });
      sign.position.set(1.3, 3, 0);
      st.add(stairs, hole, post, sign);
      st.position.set(s.x + out.x * 3.2, 0, s.z + out.y * 3.2);
      this.group.add(st);
    }

    // Lojas com letreiro néon
    for (const shop of board.shops) {
      const s = getSpace(board, shop.spaceId);
      const out = outward(s, cx, cz);
      const building = shopBuilding(shop.kind, shop.name, true);
      building.position.set(s.x + out.x * 3.4, 0, s.z + out.y * 3.4);
      building.rotation.y = Math.atan2(-out.x, -out.y);
      this.group.add(building);
    }

    // Candeeiros
    for (let i = 0; i < 6; i++) {
      const s = board.spaces[Math.floor((i / 6) * board.spaces.length)]!;
      const lamp = new THREE.PointLight('#ffd9a0', 30, 18);
      lamp.position.set(s.x, 5, s.z);
      this.group.add(lamp);
    }
    scene.add(this.group);
  }

  setFlags(flags: Record<string, boolean>): void {
    for (const l of this.lights) {
      const open = (flags[l.gate.flag] ?? false) === l.gate.openWhen;
      l.green.emissiveIntensity = open ? 1.6 : 0.05;
      l.red.emissiveIntensity = open ? 0.05 : 1.6;
    }
  }

  update(_dt: number, time: number): void {
    this.neon.forEach((m, i) => (m.emissiveIntensity = 1 + Math.sin(time * 3 + i) * 0.3 + (Math.sin(time * 17 + i * 5) > 0.97 ? -0.8 : 0)));
  }
}
