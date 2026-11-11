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
}

const SHOP_SIGN: Record<ShopKind, { emoji: string; color: string }> = {
  geral: { emoji: '🛒', color: '#1fd1c1' },
  barata: { emoji: '💸', color: '#4cd964' },
  luxo: { emoji: '💎', color: '#b36bff' },
  ultimo: { emoji: '🆘', color: '#ff8c1a' },
};

export function createBoardTheme(board: Board, scene: THREE.Scene): BoardTheme {
  return board.theme === 'city' ? new CityTheme(board, scene) : new IslandTheme(board, scene);
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
      const len = Math.hypot(dx, dz);
      const strip = mesh(new THREE.BoxGeometry(st.width, st.height, len), toon(st.color), { cast: false, receive: true });
      strip.position.set(s.x + dx / 2, st.y, s.z + dz / 2);
      strip.rotation.y = Math.atan2(dx, dz);
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
