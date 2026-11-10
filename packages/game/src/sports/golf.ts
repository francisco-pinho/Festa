/**
 * Golfe: buracos, tacos e pontuação (pancadas face ao par).
 * Coordenadas no plano XZ (y para cima); o tee de cada buraco está em (0, 0).
 */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface GolfHole {
  name: string;
  par: number;
  hole: { x: number; z: number };
  /** Pontos centrais do fairway, do tee até ao green. */
  fairway: { x: number; z: number }[];
  fairwayWidth: number;
  greenRadius: number;
  water: Circle[];
  bunkers: Circle[];
}

export const COURSE: GolfHole[] = [
  {
    name: 'Buraco 1 · Lago',
    par: 3,
    hole: { x: 6, z: -58 },
    fairway: [{ x: 0, z: 0 }, { x: 3, z: -30 }, { x: 6, z: -58 }],
    fairwayWidth: 14,
    greenRadius: 8,
    water: [{ x: 1, z: -33, r: 7 }],
    bunkers: [{ x: 13, z: -55, r: 3 }],
  },
  {
    name: 'Buraco 2 · Curva',
    par: 4,
    hole: { x: -30, z: -108 },
    fairway: [{ x: 0, z: 0 }, { x: 2, z: -45 }, { x: -6, z: -78 }, { x: -30, z: -108 }],
    fairwayWidth: 16,
    greenRadius: 8,
    water: [],
    bunkers: [{ x: 9, z: -62, r: 4 }, { x: -22, z: -112, r: 3 }, { x: -34, z: -100, r: 2.5 }],
  },
  {
    name: 'Buraco 3 · Ilha',
    par: 5,
    hole: { x: 12, z: -165 },
    fairway: [{ x: 0, z: 0 }, { x: -6, z: -60 }, { x: 4, z: -120 }, { x: 12, z: -165 }],
    fairwayWidth: 16,
    greenRadius: 8.5,
    water: [{ x: -2, z: -95, r: 10 }, { x: 22, z: -158, r: 6 }],
    bunkers: [{ x: -14, z: -58, r: 4 }, { x: 4, z: -172, r: 3 }],
  },
];

export const MAX_STROKES = 8;

export type Club = 'driver' | 'iron' | 'putter';

export const CLUBS: Record<Club, { name: string; maxDist: number }> = {
  driver: { name: 'Driver', maxDist: 72 },
  iron: { name: 'Ferro', maxDist: 34 },
  putter: { name: 'Putter', maxDist: 14 },
};

/** Escolhe o taco pela distância ao buraco e pelo sítio da bola. */
export function pickClub(distToHole: number, onGreen: boolean): Club {
  if (onGreen) return 'putter';
  if (distToHole > 40) return 'driver';
  return 'iron';
}

/** "-1", "Par", "+2"… */
export function relativeToPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? 'Par' : d > 0 ? `+${d}` : String(d);
}

/** Nome do resultado de um buraco. */
export function holeResultName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  const names: Record<string, string> = { '-3': 'Albatroz!', '-2': 'Eagle!', '-1': 'Birdie!', '0': 'Par', '1': 'Bogey', '2': 'Duplo bogey' };
  return names[String(d)] ?? `+${d}`;
}

export function inCircle(x: number, z: number, c: Circle): boolean {
  return Math.hypot(x - c.x, z - c.z) <= c.r;
}

/** Distância de um ponto ao fairway (0 = em cima da linha central). */
export function distToFairway(hole: GolfHole, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < hole.fairway.length - 1; i++) {
    const a = hole.fairway[i]!;
    const b = hole.fairway[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

export type Lie = 'green' | 'fairway' | 'rough' | 'bunker' | 'water' | 'out';

/** Onde está a bola. */
export function lieAt(hole: GolfHole, x: number, z: number): Lie {
  if (hole.water.some((w) => inCircle(x, z, w))) return 'water';
  if (Math.hypot(x - hole.hole.x, z - hole.hole.z) <= hole.greenRadius) return 'green';
  if (hole.bunkers.some((b) => inCircle(x, z, b))) return 'bunker';
  const d = distToFairway(hole, x, z);
  if (d <= hole.fairwayWidth / 2) return 'fairway';
  if (d <= hole.fairwayWidth / 2 + 22) return 'rough';
  return 'out';
}
