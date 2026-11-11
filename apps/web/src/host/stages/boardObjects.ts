/**
 * Objetos interativos dos tabuleiros (comuns a todos os mapas):
 * cancelas e estantes secretas dos portões com alavanca, as próprias alavancas,
 * portagens, canhões (ou géiseres) e o banco.
 *
 * As regras estão em `@festa/game`; isto só desenha e anima.
 */
import * as THREE from 'three';
import { getSpace, tollKey, type Board, type Gate, type Space } from '@festa/game';
import { canvasTexture, disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp } from '../three/tweens';
import { prop } from '../three/props';

/** Direção da casa `a` para a `b` (no plano) e a perpendicular à direita. */
function frame(a: Space, b: Space): { dir: THREE.Vector2; perp: THREE.Vector2 } {
  const dir = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
  return { dir, perp: new THREE.Vector2(-dir.y, dir.x) };
}

const stripes = (a: string, b: string) =>
  new THREE.MeshToonMaterial({
    map: canvasTexture(64, (ctx, s) => {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? b : a;
        ctx.fillRect((i * s) / 6, 0, s / 6, s);
      }
    }),
  });

interface Barrier {
  gate: Gate;
  /** Braço da cancela (roda em z) ou estante (desliza em x). */
  moving: THREE.Object3D;
  kind: 'arm' | 'bookcase';
  target: number;
}

function distToSegment(px: number, pz: number, a: Space, b: Space): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
}

export class BoardObjects {
  readonly group = new THREE.Group();
  private readonly barriers: Barrier[] = [];
  private readonly levers = new Map<number, { stick: THREE.Object3D; target: number }>();
  private readonly tolls = new Map<string, { arm: THREE.Object3D; target: number; label: THREE.Sprite; cost: number; at: THREE.Vector3 }>();
  private readonly cannons = new Map<number, { obj: THREE.Object3D; kick: number; jet: THREE.Mesh | null }>();
  private bankLabel: THREE.Sprite | null = null;
  private bankAt = new THREE.Vector3();

  constructor(private readonly board: Board) {
    for (const gate of board.gates.filter((g) => g.lever)) this.buildBarrier(gate);
    for (const lever of board.levers) this.buildLever(lever.spaceId);
    for (const toll of board.tolls) this.buildToll(toll.from, toll.to, toll.cost, tollKey(toll));
    for (const c of board.cannons) this.buildCannon(c.spaceId, c.targets);
    const bank = board.spaces.find((s) => s.type === 'bank');
    if (bank) this.buildBank(bank);
  }

  // ── Construção ──────────────────────────────────────────

  /** Distância livre de um ponto a todos os caminhos do mapa. */
  private clearance(x: number, z: number): number {
    let best = Infinity;
    for (const s of this.board.spaces)
      for (const n of s.next) {
        if (this.board.tunnels.some((t) => t.from === s.id && t.to === n)) continue;
        best = Math.min(best, distToSegment(x, z, s, getSpace(this.board, n)));
      }
    return best;
  }

  /** Ponto ao lado da casa (perpendicular ao caminho), do lado com mais espaço livre. */
  private beside(s: Space, dist: number): { pos: THREE.Vector2; out: THREE.Vector2 } {
    const n = getSpace(this.board, s.next[0] ?? s.id);
    const dir = n === s ? new THREE.Vector2(1, 0) : new THREE.Vector2(n.x - s.x, n.z - s.z).normalize();
    let best = { pos: new THREE.Vector2(), out: new THREE.Vector2(), clear: -1 };
    for (const sign of [1, -1]) {
      const out = new THREE.Vector2(-dir.y * sign, dir.x * sign);
      const pos = new THREE.Vector2(s.x + out.x * dist, s.z + out.y * dist);
      const clear = this.clearance(pos.x, pos.y);
      if (clear > best.clear) best = { pos, out, clear };
    }
    return best;
  }

  private buildBarrier(gate: Gate): void {
    const a = getSpace(this.board, gate.from);
    const b = getSpace(this.board, gate.to);
    const y = a.y ?? 0;
    const isTunnel = this.board.tunnels.some((t) => t.from === gate.from && t.to === gate.to);
    if (isTunnel) {
      // Estante que desliza e mostra uma porta escura (passagem secreta).
      const { dir } = frame(a, b);
      const g = new THREE.Group();
      const hole = mesh(new THREE.BoxGeometry(1.8, 2.6, 0.1), toon('#0d0718'), { cast: false });
      hole.position.set(0, 1.3, -0.1);
      const shelf = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(2.3, 3, 0.6), toon('#5a3a22'));
      body.position.y = 1.5;
      shelf.add(body);
      const colors = ['#c0392b', '#2f7dff', '#25c26b', '#ffd23f', '#7b3fd1'];
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 7; i++) {
          const book = mesh(new THREE.BoxGeometry(0.22, 0.6 + ((i * 7 + row) % 3) * 0.08, 0.4), toon(colors[(i + row) % colors.length]!), { cast: false });
          book.position.set(-0.85 + i * 0.28, 0.55 + row * 0.9, 0.12);
          shelf.add(book);
        }
      g.add(hole, shelf);
      // Atrás da casa, de costas para o caminho de onde se vem.
      g.position.set(a.x - dir.x * 0.1 + dir.y * 2, y, a.z - dir.y * 0.1 - dir.x * 2);
      g.rotation.y = Math.atan2(-dir.y, dir.x);
      this.group.add(g);
      this.barriers.push({ gate, moving: shelf, kind: 'bookcase', target: 0 });
      return;
    }
    const { dir } = frame(a, b);
    const g = new THREE.Group();
    g.position.set(a.x + dir.x * 1.8, y, a.z + dir.y * 1.8);
    g.rotation.y = Math.atan2(dir.x, dir.y); // x local atravessa o caminho
    // Postes de cada lado e braço às riscas que sobe quando abre.
    for (const side of [-1, 1]) {
      const post = mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), toon('#3b3b48'));
      post.position.set(side * 1.25, 0.7, 0);
      g.add(post);
    }
    const pivot = new THREE.Group();
    pivot.position.set(-1.25, 1.2, 0);
    const arm = mesh(new THREE.BoxGeometry(2.6, 0.22, 0.14), stripes('#ff3b5c', '#ffffff'));
    arm.position.x = 1.3;
    pivot.add(arm);
    const sign = textSprite('🚧', { height: 0.7 });
    sign.position.set(1.3, 0.6, 0);
    pivot.add(sign);
    g.add(pivot);
    this.group.add(g);
    this.barriers.push({ gate, moving: pivot, kind: 'arm', target: 0 });
  }

  private buildLever(spaceId: number): void {
    const s = getSpace(this.board, spaceId);
    const { pos, out } = this.beside(s, 1.8);
    const g = new THREE.Group();
    g.position.set(pos.x, s.y ?? 0, pos.y);
    g.rotation.y = Math.atan2(out.x, out.y);
    const base = mesh(new THREE.BoxGeometry(0.9, 0.45, 0.6), toon('#5b5f6b'));
    base.position.y = 0.22;
    const pivot = new THREE.Group();
    pivot.position.y = 0.45;
    const stick = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), toon('#c9ccd4'));
    stick.position.y = 0.65;
    const knob = mesh(new THREE.SphereGeometry(0.2, 12, 8), toonUnique('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.3 }));
    knob.position.y = 1.35;
    pivot.add(stick, knob);
    pivot.rotation.x = -0.6;
    g.add(base, pivot);
    this.group.add(g);
    this.levers.set(spaceId, { stick: pivot, target: -0.6 });
  }

  private buildToll(from: number, to: number, cost: number, key: string): void {
    const a = getSpace(this.board, from);
    const b = getSpace(this.board, to);
    const { dir, perp } = frame(a, b);
    const y = a.y ?? 0;
    const at = new THREE.Vector3(a.x + dir.x * 1.9, y, a.z + dir.y * 1.9);
    const booth = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(1.1, 1.7, 1.1), toon('#ffd23f'));
    body.position.y = 0.85;
    const roof = mesh(new THREE.BoxGeometry(1.4, 0.18, 1.4), toon('#ff3b5c'));
    roof.position.y = 1.8;
    const glass = mesh(new THREE.BoxGeometry(1.12, 0.6, 0.8), toonUnique('#bfe9ff', { transparent: true, opacity: 0.7 }), { cast: false });
    glass.position.y = 1.2;
    booth.add(body, roof, glass);
    const side = this.clearance(at.x + perp.x * 1.9, at.z + perp.y * 1.9) >= this.clearance(at.x - perp.x * 1.9, at.z - perp.y * 1.9) ? 1 : -1;
    booth.position.set(at.x + perp.x * 1.9 * side, y, at.z + perp.y * 1.9 * side);
    this.group.add(booth);
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = Math.atan2(dir.x, dir.y);
    const pivot = new THREE.Group();
    pivot.position.set(1.2, 1, 0);
    const arm = mesh(new THREE.BoxGeometry(2.4, 0.16, 0.12), stripes('#ffd23f', '#1b1b24'));
    arm.position.x = -1.2;
    pivot.add(arm);
    g.add(pivot);
    this.group.add(g);
    const label = textSprite(`💰 ${cost} 🪙`, { height: 0.75 });
    label.position.set(booth.position.x, y + 2.7, booth.position.z);
    this.group.add(label);
    this.tolls.set(key, { arm: pivot, target: 0, label, cost, at: booth.position.clone().setY(y + 2.7) });
  }

  private buildCannon(spaceId: number, targets: number[]): void {
    const s = getSpace(this.board, spaceId);
    const tx = targets.reduce((a, t) => a + getSpace(this.board, t).x, 0) / targets.length;
    const tz = targets.reduce((a, t) => a + getSpace(this.board, t).z, 0) / targets.length;
    const aim = Math.atan2(tx - s.x, tz - s.z);
    const { pos } = this.beside(s, 2.6);
    const g = new THREE.Group();
    g.position.set(pos.x, s.y ?? 0, pos.y);
    let jet: THREE.Mesh | null = null;
    if (this.board.theme === 'volcano') {
      // Géiser: boca de rocha com brilho e um jato que sobe quando dispara.
      const rim = mesh(new THREE.TorusGeometry(0.8, 0.35, 8, 16), toon('#3a2f2a'));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.3;
      const glow = mesh(new THREE.CircleGeometry(0.7, 16), toonUnique('#ff7a1a', { emissive: '#ff5a1f', emissiveIntensity: 1.2 }), { cast: false });
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.35;
      jet = mesh(new THREE.CylinderGeometry(0.45, 0.7, 1, 12, 1, true), toonUnique('#e8f4ff', { transparent: true, opacity: 0.75 }), { cast: false });
      jet.position.y = 0.5;
      jet.scale.y = 0.01;
      g.add(rim, glow, jet);
    } else {
      const model = this.board.theme === 'park' ? null : prop('kenney-pirate/cannon', { width: 2.2 });
      if (model) {
        model.rotation.y = aim;
        g.add(model);
      } else {
        // Canhão feito à mão (às riscas no parque).
        const barrel = mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 14), this.board.theme === 'park' ? stripes('#ff3b5c', '#ffd23f') : toon('#2b2b33'));
        barrel.rotation.x = Math.PI / 2 - 0.6;
        barrel.position.y = 1;
        const carriage = mesh(new THREE.BoxGeometry(1, 0.5, 1.4), toon('#7a4f28'));
        carriage.position.y = 0.4;
        const holder = new THREE.Group();
        holder.add(carriage, barrel);
        for (const sx of [-0.6, 0.6]) {
          const wheel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 14), toon('#4a2f18'));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sx, 0.4, 0);
          holder.add(wheel);
        }
        holder.rotation.y = aim;
        g.add(holder);
      }
    }
    this.group.add(g);
    this.cannons.set(spaceId, { obj: g, kick: 0, jet });
  }

  private buildBank(s: Space): void {
    const { pos, out } = this.beside(s, 3.3);
    const g = new THREE.Group();
    g.position.set(pos.x, s.y ?? 0, pos.y);
    g.rotation.y = Math.atan2(-out.x, -out.y);
    g.scale.setScalar(0.85);
    const base = mesh(new THREE.BoxGeometry(3, 0.3, 2.2), toon('#e9e2d0'), { receive: true });
    base.position.y = 0.15;
    const body = mesh(new THREE.BoxGeometry(2.6, 1.9, 1.8), toon('#f4efe2'));
    body.position.y = 1.25;
    const roof = mesh(new THREE.ConeGeometry(2.1, 0.9, 4), toon('#c9a227'));
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.7;
    roof.position.y = 2.65;
    g.add(base, body, roof);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) {
      const col = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.9, 10), toon('#ffffff'));
      col.position.set(x, 1.25, 0.95);
      g.add(col);
    }
    const coin = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 20), toonUnique('#ffd23f', { emissive: '#c98a00', emissiveIntensity: 0.4 }));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, 2.45, 0.75);
    g.add(coin);
    this.group.add(g);
    this.bankAt.set(g.position.x, (s.y ?? 0) + 4, g.position.z);
    this.setBank(0);
  }

  // ── Estado ──────────────────────────────────────────────

  setFlags(flags: Record<string, boolean>): void {
    for (const b of this.barriers) {
      const open = (flags[b.gate.flag] ?? false) === b.gate.openWhen;
      b.target = b.kind === 'arm' ? (open ? 1.35 : 0) : open ? 2.3 : 0;
    }
    for (const lever of this.board.levers) {
      const l = this.levers.get(lever.spaceId);
      if (l) l.target = flags[lever.flag] ? 0.6 : -0.6;
    }
  }

  /** Mostra quanto está no cofre. */
  setBank(amount: number): void {
    if (!this.board.spaces.some((sp) => sp.type === 'bank')) return;
    if (this.bankLabel) {
      this.group.remove(this.bankLabel);
      disposeObject(this.bankLabel);
    }
    this.bankLabel = textSprite(`🏦 ${amount} 🪙`, { height: 0.9, color: '#ffe680' });
    this.bankLabel.position.copy(this.bankAt);
    this.group.add(this.bankLabel);
  }

  bankPosition(): THREE.Vector3 {
    return this.bankAt.clone();
  }

  /** Quem é o dono da portagem (recebe a próxima). */
  setTollOwner(key: string, owner: string | null): void {
    const t = this.tolls.get(key);
    if (!t) return;
    this.group.remove(t.label);
    disposeObject(t.label);
    t.label = textSprite(owner ? `💰 ${t.cost} 🪙 → ${owner}` : `💰 ${t.cost} 🪙`, { height: 0.75 });
    t.label.position.copy(t.at);
    this.group.add(t.label);
  }

  /** Levanta a cancela da portagem por uns segundos. */
  openToll(key: string): void {
    const t = this.tolls.get(key);
    if (!t) return;
    t.target = 1.35;
    window.setTimeout(() => (t.target = 0), 2500);
  }

  /** Onde entra quem vai ser disparado (boca do canhão / do géiser). */
  cannonPosition(spaceId: number): THREE.Vector3 | null {
    const c = this.cannons.get(spaceId);
    return c ? c.obj.position.clone().setY(c.obj.position.y + (c.jet ? 0.3 : 0.9)) : null;
  }

  /** Coice do canhão / jato do géiser. */
  fire(spaceId: number): void {
    const c = this.cannons.get(spaceId);
    if (c) c.kick = 1;
  }

  update(dt: number): void {
    for (const b of this.barriers) {
      if (b.kind === 'arm') b.moving.rotation.z += (b.target - b.moving.rotation.z) * damp(4, dt);
      else b.moving.position.x += (b.target - b.moving.position.x) * damp(2.5, dt);
    }
    for (const l of this.levers.values()) l.stick.rotation.x += (l.target - l.stick.rotation.x) * damp(8, dt);
    for (const t of this.tolls.values()) t.arm.rotation.z += (-t.target - t.arm.rotation.z) * damp(5, dt);
    for (const c of this.cannons.values()) {
      if (c.kick <= 0) continue;
      c.kick = Math.max(0, c.kick - dt * 1.2);
      if (c.jet) {
        const h = Math.sin(c.kick * Math.PI) * 14;
        c.jet.scale.y = Math.max(0.01, h);
        c.jet.position.y = 0.3 + h / 2;
      } else {
        c.obj.scale.setScalar(1 + Math.sin(c.kick * Math.PI) * 0.18);
      }
    }
  }
}
