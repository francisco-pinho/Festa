/**
 * Pontuação de ténis: 0, 15, 30, 40, jogo; iguais (deuce) e vantagem.
 * O encontro ganha-se com N jogos (ex.: melhor de 3 = primeiro a 2).
 */
export type Team = 0 | 1;

export interface TennisScore {
  /** Pontos no jogo atual (0,1,2,3… — 3 = 40). */
  points: [number, number];
  games: [number, number];
  gamesToWin: number;
}

export function newScore(gamesToWin: number): TennisScore {
  return { points: [0, 0], games: [0, 0], gamesToWin };
}

export interface PointResult {
  gameWon: Team | null;
  matchWon: Team | null;
}

/** Regista um ponto (altera o resultado). */
export function scorePoint(s: TennisScore, team: Team): PointResult {
  const other: Team = team === 0 ? 1 : 0;
  s.points[team]++;
  const a = s.points[team];
  const b = s.points[other];
  if (a >= 4 && a - b >= 2) {
    s.games[team]++;
    s.points = [0, 0];
    return { gameWon: team, matchWon: s.games[team] >= s.gamesToWin ? team : null };
  }
  return { gameWon: null, matchWon: null };
}

const CALL = ['0', '15', '30', '40'];

/** Texto do resultado do jogo atual. `names` = nome de cada equipa. */
export function pointLabel(s: TennisScore, names: [string, string]): string {
  const [a, b] = s.points;
  if (a >= 3 && b >= 3) {
    if (a === b) return 'Iguais';
    return `Vantagem ${names[a > b ? 0 : 1]}`;
  }
  return `${CALL[a]}–${CALL[b]}`;
}

// ── Física da bola ───────────────────────────────────────

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const TENNIS = {
  g: 9.81,
  /** Resistência do ar: a = -drag·|v|·v. */
  drag: 0.011,
  /** Magnus: aceleração vertical = -magnus·spin·|v horizontal| (topspin puxa para baixo). */
  magnus: 0.22,
  ballR: 0.09,
  restitution: 0.74,
  halfW: 5.5,
  halfL: 12,
  netH: 0.95,
  service: 6.4,
  singlesW: 5.5 - 1.37,
};

export interface BallState {
  p: V3;
  v: V3;
  /** Efeito: +1 topspin … -1 slice. */
  spin: number;
}

/** Avança a bola `dt` segundos. Devolve true se ressaltou neste passo. */
export function stepBall(b: BallState, dt: number): boolean {
  const { v } = b;
  const sp = Math.hypot(v.x, v.y, v.z);
  const hs = Math.hypot(v.x, v.z);
  v.x -= TENNIS.drag * sp * v.x * dt;
  v.z -= TENNIS.drag * sp * v.z * dt;
  v.y -= (TENNIS.g + TENNIS.drag * sp * v.y + TENNIS.magnus * b.spin * hs) * dt;
  b.p.x += v.x * dt;
  b.p.y += v.y * dt;
  b.p.z += v.z * dt;
  if (b.p.y < TENNIS.ballR && v.y < 0) {
    bounceBall(b);
    return true;
  }
  return false;
}

/** Ressalto: o topspin salta mais e para a frente; o slice fica baixo e trava. */
export function bounceBall(b: BallState): void {
  const s = b.spin;
  b.p.y = TENNIS.ballR;
  b.v.y = -b.v.y * TENNIS.restitution * (s >= 0 ? 1 + 0.18 * s : 1 + 0.35 * s);
  const keep = s >= 0 ? 0.78 + 0.1 * s : 0.78 + 0.08 * s;
  b.v.x *= keep;
  b.v.z *= keep;
  b.spin *= 0.4;
}

/** Onde e quando a bola toca no chão pela primeira vez (sem jogadores). */
export function firstBounce(b: BallState, dt = 1 / 120): { p: V3; t: number; netY: number | null } {
  const s: BallState = { p: { ...b.p }, v: { ...b.v }, spin: b.spin };
  let netY: number | null = null;
  for (let t = dt; t < 6; t += dt) {
    const z0 = s.p.z;
    const bounced = stepBall(s, dt);
    if (netY === null && Math.sign(z0) !== Math.sign(s.p.z) && z0 !== 0) netY = s.p.y;
    if (bounced) return { p: { ...s.p }, t, netY };
  }
  return { p: { ...s.p }, t: 6, netY };
}

/**
 * Velocidade para a bola sair de `from` e tocar no chão em `target`,
 * com a velocidade horizontal pedida e o efeito dado (procura a velocidade vertical).
 */
export function planShot(from: V3, target: { x: number; z: number }, hSpeed: number, spin: number): V3 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const want = Math.hypot(dx, dz);
  const ux = dx / (want || 1);
  const uz = dz / (want || 1);
  const reach = (vy: number) => {
    const r = firstBounce({ p: { ...from }, v: { x: ux * hSpeed, y: vy, z: uz * hSpeed }, spin });
    return Math.hypot(r.p.x - from.x, r.p.z - from.z);
  };
  let lo = -12;
  let hi = 18;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) < want) lo = mid;
    else hi = mid;
  }
  return { x: ux * hSpeed, y: (lo + hi) / 2, z: uz * hSpeed };
}

/** A bola passa a rede com esta folga (negativo = bate na rede; null = não cruza). */
export function netClearance(from: V3, v: V3, spin: number): number | null {
  const r = firstBounce({ p: { ...from }, v: { ...v }, spin });
  return r.netY === null ? null : r.netY - TENNIS.netH;
}

/** O ponto (x, z) cai dentro do campo de pares do lado `sideSign` (1 = z>0)? */
export function inCourt(x: number, z: number, sideSign: number): boolean {
  return Math.abs(x) <= TENNIS.halfW && Math.sign(z) === sideSign && Math.abs(z) <= TENNIS.halfL;
}

/** Serviço bom: cai no quadrado de serviço na diagonal. `serverX` = x de quem serve. */
export function inServiceBox(x: number, z: number, sideSign: number, serverX: number): boolean {
  const wantX = -Math.sign(serverX || 1);
  return Math.sign(z) === sideSign && Math.abs(z) <= TENNIS.service && Math.sign(x) === wantX && Math.abs(x) <= TENNIS.singlesW;
}
