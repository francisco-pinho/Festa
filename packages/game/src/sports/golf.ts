/**
 * Golfe: buracos com relevo, tacos, tacada (força do medidor, efeito, curva e altura),
 * simulação do voo e do rolar, e pontuação (pancadas face ao par).
 * Coordenadas no plano XZ (y para cima); o tee de cada buraco está em (0, 0).
 */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Hill extends Circle {
  /** Altura no centro (negativa = cova). */
  h: number;
}

export interface GolfHole {
  name: string;
  par: number;
  hole: { x: number; z: number };
  /** Pontos centrais do fairway, do tee até ao green. */
  fairway: { x: number; z: number }[];
  fairwayWidth: number;
  greenRadius: number;
  /** Inclinação do green (subida por unidade em x e em z). */
  slope: { x: number; z: number };
  hills: Hill[];
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
    slope: { x: 0.035, z: 0 },
    hills: [{ x: -22, z: -40, r: 12, h: 3 }, { x: 24, z: -20, r: 10, h: 2 }],
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
    slope: { x: 0, z: -0.03 },
    hills: [{ x: 4, z: -62, r: 14, h: 1.2 }, { x: -24, z: -70, r: 12, h: 4 }, { x: 22, z: -95, r: 14, h: 3 }],
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
    slope: { x: -0.025, z: 0.02 },
    hills: [{ x: -26, z: -30, r: 14, h: 3 }, { x: 22, z: -70, r: 16, h: 4 }, { x: -12, z: -135, r: 10, h: 1.5 }],
    water: [{ x: -2, z: -95, r: 10 }, { x: 22, z: -158, r: 6 }],
    bunkers: [{ x: -14, z: -58, r: 4 }, { x: 4, z: -172, r: 3 }],
  },
  {
    name: 'Buraco 4 · Bunkers',
    par: 4,
    hole: { x: 22, z: -118 },
    fairway: [{ x: 0, z: 0 }, { x: 5, z: -55 }, { x: 22, z: -118 }],
    fairwayWidth: 15,
    greenRadius: 8,
    slope: { x: 0.02, z: 0.03 },
    hills: [{ x: -20, z: -60, r: 14, h: 3.5 }, { x: 35, z: -60, r: 12, h: 2.5 }],
    water: [],
    bunkers: [{ x: -4, z: -60, r: 4 }, { x: 13, z: -62, r: 3.5 }, { x: 13, z: -112, r: 3 }, { x: 31, z: -122, r: 3 }, { x: 22, z: -129, r: 2.5 }],
  },
  {
    name: 'Buraco 5 · Colina',
    par: 3,
    hole: { x: -10, z: -66 },
    fairway: [{ x: 0, z: 0 }, { x: -4, z: -32 }, { x: -10, z: -66 }],
    fairwayWidth: 13,
    greenRadius: 8,
    slope: { x: -0.03, z: -0.02 },
    hills: [{ x: -3, z: -34, r: 9, h: 2.2 }, { x: 18, z: -50, r: 12, h: 3 }],
    water: [{ x: -24, z: -60, r: 7 }],
    bunkers: [{ x: -1, z: -72, r: 2.5 }],
  },
];

export const MAX_STROKES = 8;

// ── Tacos ────────────────────────────────────────────────

export type Club = 'driver' | 'wood3' | 'iron5' | 'iron7' | 'iron9' | 'wedge' | 'putter';

export interface ClubSpec {
  name: string;
  /** Distância no ar com força 100 %, sem vento. */
  carry: number;
  /** Ângulo de saída (graus). */
  loft: number;
}

export const CLUBS: Record<Club, ClubSpec> = {
  driver: { name: 'Driver', carry: 72, loft: 22 },
  wood3: { name: 'Madeira 3', carry: 62, loft: 26 },
  iron5: { name: 'Ferro 5', carry: 50, loft: 31 },
  iron7: { name: 'Ferro 7', carry: 40, loft: 37 },
  iron9: { name: 'Ferro 9', carry: 30, loft: 44 },
  wedge: { name: 'Wedge', carry: 20, loft: 55 },
  putter: { name: 'Putter', carry: 14, loft: 0 },
};

export const CLUB_ORDER: Club[] = ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'wedge', 'putter'];

export type Lie = 'green' | 'fairway' | 'rough' | 'bunker' | 'water' | 'out';

/** Quanto do alcance se perde em cada sítio. */
export const LIE_POWER: Record<Lie, number> = { green: 1, fairway: 1, rough: 0.82, bunker: 0.6, water: 1, out: 1 };

/** Taco recomendado: o mais pequeno que lá chega (no green, o putter). */
export function pickClub(distToTarget: number, onGreen: boolean, lie: Lie = 'fairway'): Club {
  if (onGreen) return 'putter';
  if (lie === 'bunker' && distToTarget < 25) return 'wedge';
  const reach = LIE_POWER[lie];
  for (let i = CLUB_ORDER.length - 2; i >= 0; i--) {
    const c = CLUB_ORDER[i]!;
    if (CLUBS[c].carry * reach >= distToTarget * 0.95) return c;
  }
  return 'driver';
}

// ── Pontuação ────────────────────────────────────────────

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

// ── Terreno ──────────────────────────────────────────────

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

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Altura do terreno: colinas, inclinação do green, covas dos bunkers e lagos. */
export function heightAt(hole: GolfHole, x: number, z: number): number {
  let h = 0;
  for (const c of hole.hills) h += c.h * Math.exp(-(((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r)));
  const dg = Math.hypot(x - hole.hole.x, z - hole.hole.z);
  const g = 1 - smooth(hole.greenRadius, hole.greenRadius + 4, dg);
  h += g * (hole.slope.x * (x - hole.hole.x) + hole.slope.z * (z - hole.hole.z));
  for (const b of hole.bunkers) h -= 0.3 * (1 - smooth(b.r * 0.6, b.r + 0.5, Math.hypot(x - b.x, z - b.z)));
  for (const w of hole.water) h -= 0.5 * (1 - smooth(w.r * 0.8, w.r + 1, Math.hypot(x - w.x, z - w.z)));
  return h;
}

/** Inclinação do terreno (derivadas em x e z). */
export function gradientAt(hole: GolfHole, x: number, z: number): { x: number; z: number } {
  const e = 0.25;
  return {
    x: (heightAt(hole, x + e, z) - heightAt(hole, x - e, z)) / (2 * e),
    z: (heightAt(hole, x, z + e) - heightAt(hole, x, z - e)) / (2 * e),
  };
}

// ── Tacada e simulação ───────────────────────────────────

export interface Shot {
  club: Club;
  /** Ângulo no plano (0 = -Z… como atan2(dx, dz)). */
  angle: number;
  /** Força do medidor: 0–1, até 1.1 na zona vermelha. */
  power: number;
  /** Curva: -1 (para a esquerda) … 1 (para a direita). */
  curve: number;
  /** Altura: -1 (rasteira) … 1 (alta). */
  loft: number;
  /** Efeito: 1 topspin (rola mais), -1 backspin (trava/recua), 0 normal. */
  spin: number;
}

export interface ShotSample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface ShotResult {
  samples: ShotSample[];
  final: { x: number; z: number };
  lie: Lie;
  holed: boolean;
  /** Tempo em que tocou no chão a primeira vez. */
  landT: number;
}

export const GOLF_PHYS = { gravity: 9.81, holeR: 0.3, holeMaxSpeed: 4.5 };
/** Desaceleração ao rolar em cada superfície. */
export const DECEL: Record<Lie, number> = { green: 2.6, fairway: 5.5, rough: 13, bunker: 30, water: 30, out: 30 };
const BOUNCE: Record<Lie, number> = { green: 0.22, fairway: 0.3, rough: 0.14, bunker: 0, water: 0, out: 0.2 };
const KEEP: Record<Lie, number> = { green: 0.55, fairway: 0.6, rough: 0.35, bunker: 0, water: 0, out: 0.5 };

/** Velocidade inicial do putt para rolar `dist` unidades num green plano. */
export function puttSpeed(dist: number): number {
  return Math.sqrt(2 * DECEL.green * Math.max(0, dist));
}

/**
 * Simula a tacada: voo (gravidade, vento, curva), ressaltos com efeito e rolar com
 * inclinação. Determinista: os erros (zona vermelha, bots) aplicam-se antes.
 */
export function simulateShot(hole: GolfHole, from: { x: number; z: number }, shot: Shot, wind: { x: number; z: number }, dt = 1 / 60): ShotResult {
  const startLie = lieAt(hole, from.x, from.z);
  const reach = LIE_POWER[startLie];
  const dir = { x: Math.sin(shot.angle), z: Math.cos(shot.angle) };
  const side = { x: dir.z, z: -dir.x }; // para a direita de quem bate (visto de trás)
  let x = from.x;
  let z = from.z;
  let y = heightAt(hole, x, z);
  const samples: ShotSample[] = [{ t: 0, x, y, z }];
  let vx: number;
  let vy: number;
  let vz: number;
  let flying: boolean;
  const power = Math.max(0, Math.min(1.1, shot.power));
  if (shot.club === 'putter') {
    const v = puttSpeed(CLUBS.putter.carry * Math.pow(power, 1.3) * 1.05);
    vx = dir.x * v;
    vz = dir.z * v;
    vy = 0;
    flying = false;
  } else {
    const spec = CLUBS[shot.club];
    const angle = ((spec.loft + shot.loft * 9) * Math.PI) / 180;
    const carry = spec.carry * power * reach;
    const v = Math.sqrt((carry * GOLF_PHYS.gravity) / Math.sin(2 * angle));
    vx = dir.x * Math.cos(angle) * v;
    vz = dir.z * Math.cos(angle) * v;
    vy = Math.sin(angle) * v;
    flying = true;
  }
  const curveAcc = shot.club === 'putter' ? 0 : shot.curve * 3.2;
  let landT = -1;
  let bounced = false;
  let lie: Lie = startLie;
  let holed = false;
  const hx = hole.hole.x;
  const hz = hole.hole.z;
  for (let t = dt; t < 16; t += dt) {
    if (flying) {
      vx += (wind.x * 0.4 + side.x * curveAcc) * dt;
      vz += (wind.z * 0.4 + side.z * curveAcc) * dt;
      vy -= GOLF_PHYS.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      const ground = heightAt(hole, x, z);
      // Bola direta para o buraco.
      if (Math.hypot(x - hx, z - hz) < GOLF_PHYS.holeR && y - ground < 0.25 && vy < 0) {
        holed = true;
        samples.push({ t, x: hx, y: ground, z: hz });
        landT = landT < 0 ? t : landT;
        break;
      }
      if (y <= ground) {
        y = ground;
        lie = lieAt(hole, x, z);
        if (landT < 0) landT = t;
        if (lie === 'water' || lie === 'bunker') {
          samples.push({ t, x, y, z });
          break;
        }
        vy = -vy * BOUNCE[lie];
        let keep = KEEP[lie];
        if (!bounced && shot.club !== 'putter') {
          // Efeito no 1.º ressalto: topspin ganha, backspin trava e pode recuar.
          if (shot.spin > 0) keep *= 1 + 0.6 * shot.spin;
          else if (shot.spin < 0) keep = keep * (1 + shot.spin) + shot.spin * (lie === 'green' ? 0.22 : 0.06);
        }
        bounced = true;
        vx *= keep;
        vz *= keep;
        if (Math.abs(vy) < 1) {
          vy = 0;
          flying = false;
        }
      }
    } else {
      lie = lieAt(hole, x, z);
      const g = gradientAt(hole, x, z);
      const sp = Math.hypot(vx, vz);
      // Inclinação puxa para baixo; atrito trava.
      vx -= g.x * GOLF_PHYS.gravity * 0.55 * dt;
      vz -= g.z * GOLF_PHYS.gravity * 0.55 * dt;
      const sp2 = Math.hypot(vx, vz);
      const dec = DECEL[lie] * dt;
      if (sp2 <= dec) {
        vx = 0;
        vz = 0;
      } else {
        vx -= (vx / sp2) * dec;
        vz -= (vz / sp2) * dec;
      }
      x += vx * dt;
      z += vz * dt;
      y = heightAt(hole, x, z);
      if (Math.hypot(x - hx, z - hz) < GOLF_PHYS.holeR && sp < GOLF_PHYS.holeMaxSpeed) {
        holed = true;
        samples.push({ t, x: hx, y: y - 0.2, z: hz });
        break;
      }
      const nl = lieAt(hole, x, z);
      if (nl === 'water' || nl === 'bunker' || nl === 'out') {
        lie = nl;
        samples.push({ t, x, y, z });
        break;
      }
      if (Math.hypot(vx, vz) < 0.03) {
        samples.push({ t, x, y, z });
        break;
      }
    }
    samples.push({ t, x, y, z });
  }
  if (landT < 0) landT = 0;
  return { samples, final: { x, z }, lie: holed ? 'green' : lieAt(hole, x, z), holed, landT };
}

/** Pancada "ideal" para um ponto: ajusta ângulo e força com a simulação (para bots e caddie). */
export function planShot(hole: GolfHole, from: { x: number; z: number }, target: { x: number; z: number }, club: Club, wind: { x: number; z: number }, spin = 0): Shot {
  let angle = Math.atan2(target.x - from.x, target.z - from.z);
  const want = Math.hypot(target.x - from.x, target.z - from.z);
  const reach = club === 'putter' ? 1 : CLUBS[club].carry * LIE_POWER[lieAt(hole, from.x, from.z)];
  let power = club === 'putter' ? Math.pow(Math.min(1, want / CLUBS.putter.carry), 1 / 1.3) : Math.min(1, want / reach);
  for (let i = 0; i < 6; i++) {
    const r = simulateShot(hole, from, { club, angle, power, curve: 0, loft: 0, spin }, wind);
    const end = club === 'putter' || r.holed ? r.final : r.samples.find((s) => s.t >= r.landT) ?? r.final;
    const ex = end.x - from.x;
    const ez = end.z - from.z;
    const got = Math.hypot(ex, ez);
    if (got < 0.5) {
      power = Math.min(1, power * 1.3 + 0.05);
      continue;
    }
    // Corrige o ângulo pelo desvio lateral e a força pela distância.
    let da = Math.atan2(target.x - from.x, target.z - from.z) - Math.atan2(ex, ez);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    angle += da * 0.9;
    const ratio = club === 'putter' ? Math.pow(want / got, 0.6) : want / got;
    power = Math.max(0.05, Math.min(1, power * (1 + (ratio - 1) * 0.85)));
  }
  return { club, angle, power, curve: 0, loft: 0, spin };
}

/** Força extra (zona vermelha) dá distância mas tira precisão: desvio em ângulo e curva. */
export function redZoneError(power: number, r1: number, r2: number): { angle: number; curve: number } {
  const over = Math.max(0, power - 1) / 0.1; // 0…1
  return { angle: (r1 - 0.5) * 0.16 * over, curve: (r2 - 0.5) * 1.6 * over };
}
