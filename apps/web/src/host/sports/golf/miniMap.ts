/**
 * Mini-mapa do buraco (como no Mario Golf): o buraco todo visto de cima, com o tee em baixo e a
 * bandeira em cima, as bolas de toda a gente, a linha de pontaria e onde cai a tacada com o taco
 * que se tem na mão (força máxima, sem vento nem efeito).
 */
import type { GolfHole } from '@festa/game/sports/golf';

interface P {
  x: number;
  z: number;
}

export interface MiniMapState {
  ball: P | null;
  others: { pos: P; color: string }[];
  /** Ângulo de pontaria (o mesmo do jogo: 0 = +z). */
  aim: number | null;
  /** Trajetória prevista (no chão) e sítio de queda. */
  path: P[];
  landing: P | null;
  landingR: number;
  label: string;
}

export class GolfMiniMap {
  readonly el = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly base = document.createElement('canvas');
  private hole: GolfHole | null = null;
  private rot = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private readonly W = 260;
  private readonly H = 560;

  constructor() {
    this.el.className = 'golf-minimap';
    this.el.hidden = true;
    this.canvas.width = this.base.width = this.W;
    this.canvas.height = this.base.height = this.H;
    this.el.appendChild(this.canvas);
    document.getElementById('ui')!.appendChild(this.el);
  }

  /** Coordenadas do jogo → píxeis do mapa (rodado: tee em baixo, buraco em cima). */
  private toMap(p: P): [number, number] {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const x = p.x * c - p.z * s;
    const y = p.x * s + p.z * c;
    return [this.ox + x * this.scale, this.oy + y * this.scale];
  }

  setHole(hole: GolfHole): void {
    this.hole = hole;
    // Roda para o vetor tee→buraco ficar a apontar para cima.
    this.rot = -Math.PI / 2 - Math.atan2(hole.hole.z, hole.hole.x);
    const margin = hole.fairwayWidth / 2 + 14;
    const pts = [...hole.fairway, hole.hole];
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const xs = pts.map((p) => p.x * c - p.z * s);
    const ys = pts.map((p) => p.x * s + p.z * c);
    const minX = Math.min(...xs) - margin;
    const maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin;
    const maxY = Math.max(...ys) + margin;
    this.scale = Math.min((this.W - 16) / (maxX - minX), (this.H - 16) / (maxY - minY));
    this.ox = this.W / 2 - ((minX + maxX) / 2) * this.scale;
    this.oy = this.H / 2 - ((minY + maxY) / 2) * this.scale;
    this.drawBase();
  }

  private drawBase(): void {
    const h = this.hole!;
    const g = this.base.getContext('2d')!;
    g.clearRect(0, 0, this.W, this.H);
    const line = (width: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = width * this.scale;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      h.fairway.forEach((p, i) => {
        const [x, y] = this.toMap(p);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
    };
    const circle = (c: P & { r: number }, color: string, stroke?: string) => {
      const [x, y] = this.toMap(c);
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, c.r * this.scale, 0, Math.PI * 2);
      g.fill();
      if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    line(h.fairwayWidth + 22, '#3f7d32'); // relva alta
    line(h.fairwayWidth, '#7ccf5b'); // fairway
    circle({ ...h.hole, r: h.greenRadius + 1.5 }, '#7ccf5b');
    circle({ ...h.hole, r: h.greenRadius }, '#a8ec7c', '#ffffff66');
    for (const w of h.water) circle(w, '#3a8fd9', '#bfe9ff88');
    for (const b of h.bunkers) circle(b, '#f2d58b', '#c9a75a');
    // Tee e bandeira
    const [tx, ty] = this.toMap({ x: 0, z: 0 });
    g.fillStyle = '#ffffff';
    g.fillRect(tx - 6, ty - 3, 12, 6);
    const [hx, hy] = this.toMap(h.hole);
    g.fillStyle = '#1b1033';
    g.beginPath();
    g.arc(hx, hy, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(hx, hy - 22);
    g.stroke();
    g.fillStyle = '#ff3b5c';
    g.beginPath();
    g.moveTo(hx, hy - 22);
    g.lineTo(hx + 13, hy - 17);
    g.lineTo(hx, hy - 12);
    g.fill();
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }

  update(st: MiniMapState): void {
    if (!this.hole) return;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.base, 0, 0);
    // Linha de pontaria (da bola para a frente, até ao ponto de queda).
    if (st.ball && st.aim !== null) {
      const [bx, by] = this.toMap(st.ball);
      const far = st.landing ?? { x: st.ball.x + Math.sin(st.aim) * 40, z: st.ball.z + Math.cos(st.aim) * 40 };
      const [fx, fy] = this.toMap(far);
      g.setLineDash([5, 5]);
      g.strokeStyle = '#ffffffcc';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(fx, fy);
      g.stroke();
      g.setLineDash([]);
    }
    // Trajetória prevista
    g.fillStyle = '#ffd23f';
    for (const p of st.path) {
      const [x, y] = this.toMap(p);
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    // Zona de queda
    if (st.landing) {
      const [lx, ly] = this.toMap(st.landing);
      const r = Math.max(5, st.landingR * this.scale);
      g.fillStyle = '#ffd23f44';
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(lx, ly, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = 'bold 15px "Trebuchet MS", sans-serif';
      g.textAlign = lx > this.W - 70 ? 'right' : 'left';
      g.lineWidth = 4;
      g.strokeStyle = '#1b1033';
      const tx = lx + (g.textAlign === 'right' ? -r - 4 : r + 4);
      g.strokeText(st.label, tx, ly + 5);
      g.fillStyle = '#ffd23f';
      g.fillText(st.label, tx, ly + 5);
    }
    // Bolas
    for (const o of st.others) {
      const [x, y] = this.toMap(o.pos);
      g.fillStyle = o.color;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (st.ball) {
      const [x, y] = this.toMap(st.ball);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#1b1033';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
