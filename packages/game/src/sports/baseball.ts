/**
 * Basebol: contagem (bolas/strikes), eliminações, bases e corridas,
 * e o resultado de uma tacada a partir do momento e da força.
 */
export type Team = 0 | 1;

export interface HalfInning {
  balls: number;
  strikes: number;
  outs: number;
  /** Corredores na 1.ª, 2.ª e 3.ª base. */
  bases: [boolean, boolean, boolean];
}

export interface BaseballGame {
  innings: number;
  inning: number;
  /** 0 = parte de cima (equipa 0 a bater), 1 = parte de baixo (equipa 1 a bater). */
  half: 0 | 1;
  runs: [number, number];
  state: HalfInning;
}

export type PitchOutcome =
  | { kind: 'ball' }
  | { kind: 'strike'; swung: boolean }
  | { kind: 'foul' }
  | { kind: 'out'; how: 'fly' | 'ground' }
  | { kind: 'hit'; bases: 1 | 2 | 3 | 4 };

export interface PitchResult {
  /** O que aconteceu ao batedor nesta jogada. */
  event: 'continue' | 'walk' | 'strikeout' | 'out' | 'hit';
  runsScored: number;
  halfOver: boolean;
  gameOver: boolean;
}

export function newHalf(): HalfInning {
  return { balls: 0, strikes: 0, outs: 0, bases: [false, false, false] };
}

export function newGame(innings = 3): BaseballGame {
  return { innings, inning: 1, half: 0, runs: [0, 0], state: newHalf() };
}

export function battingTeam(g: BaseballGame): Team {
  return g.half;
}

/** Avança os corredores `n` bases (o batedor também, se `batter`). Devolve corridas. */
export function advance(bases: [boolean, boolean, boolean], n: number, batter: boolean): { bases: [boolean, boolean, boolean]; runs: number } {
  let runs = 0;
  const next: [boolean, boolean, boolean] = [false, false, false];
  for (let b = 2; b >= 0; b--) {
    if (!bases[b]) continue;
    const to = b + n;
    if (to >= 3) runs++;
    else next[to] = true;
  }
  if (batter) {
    if (n >= 4) runs++;
    else next[n - 1] = true;
  }
  return { bases: next, runs };
}

/** Passeio: só avançam os corredores forçados. */
export function walk(bases: [boolean, boolean, boolean]): { bases: [boolean, boolean, boolean]; runs: number } {
  const [b1, b2, b3] = bases;
  if (!b1) return { bases: [true, b2, b3], runs: 0 };
  if (!b2) return { bases: [true, true, b3], runs: 0 };
  if (!b3) return { bases: [true, true, true], runs: 0 };
  return { bases: [true, true, true], runs: 1 };
}

/** Aplica o resultado de um lançamento ao jogo. */
export function applyPitch(g: BaseballGame, o: PitchOutcome): PitchResult {
  const s = g.state;
  const team = battingTeam(g);
  let event: PitchResult['event'] = 'continue';
  let runs = 0;
  switch (o.kind) {
    case 'ball':
      s.balls++;
      if (s.balls >= 4) {
        const w = walk(s.bases);
        s.bases = w.bases;
        runs = w.runs;
        event = 'walk';
      }
      break;
    case 'strike':
      s.strikes++;
      if (s.strikes >= 3) {
        s.outs++;
        event = 'strikeout';
      }
      break;
    case 'foul':
      if (s.strikes < 2) s.strikes++;
      break;
    case 'out':
      s.outs++;
      event = 'out';
      break;
    case 'hit': {
      const a = advance(s.bases, o.bases, true);
      s.bases = a.bases;
      runs = a.runs;
      event = 'hit';
      break;
    }
  }
  g.runs[team] += runs;
  if (event !== 'continue') {
    s.balls = 0;
    s.strikes = 0;
  }
  let halfOver = s.outs >= 3;
  let gameOver = false;
  // Última parte: se a equipa da casa (1) já vai à frente, acaba logo.
  if (g.inning === g.innings && g.half === 1 && g.runs[1] > g.runs[0]) {
    halfOver = true;
    gameOver = true;
  }
  if (halfOver && !gameOver) {
    if (g.half === 0) {
      // Se na última entrada a equipa da casa já ganha, não precisa de bater.
      if (g.inning === g.innings && g.runs[1] > g.runs[0]) gameOver = true;
      else g.half = 1;
    } else if (g.inning >= g.innings && g.runs[0] !== g.runs[1]) {
      gameOver = true;
    } else {
      g.half = 0;
      g.inning++;
    }
    g.state = newHalf();
  }
  return { event, runsScored: runs, halfOver, gameOver };
}

/**
 * Resultado da tacada. `timing`: segundos entre a pancada e a chegada da bola
 * (negativo = cedo). `power` 0–1. `luck` 0–1 aleatório.
 */
export function swingOutcome(timing: number, power: number, luck: number, window = 0.13): PitchOutcome {
  const err = Math.abs(timing);
  if (err > window) return { kind: 'strike', swung: true };
  const quality = 1 - err / window; // 1 = perfeito
  // Muito cedo/tarde → bola para fora (foul)
  if (quality < 0.25) return { kind: 'foul' };
  const strength = quality * (0.45 + power * 0.55);
  if (strength > 0.85 && luck < 0.55) return { kind: 'hit', bases: 4 };
  if (strength > 0.7) return luck < 0.25 ? { kind: 'out', how: 'fly' } : { kind: 'hit', bases: luck < 0.6 ? 2 : 3 };
  if (strength > 0.45) return luck < 0.45 ? { kind: 'out', how: 'fly' } : { kind: 'hit', bases: 1 };
  return luck < 0.6 ? { kind: 'out', how: 'ground' } : { kind: 'hit', bases: 1 };
}

// ── Lançamentos ──────────────────────────────────────────

export type PitchType = 'fastball' | 'curve' | 'screwball' | 'splitter';

export interface PitchSpec {
  label: string;
  emoji: string;
  /** Multiplicador da velocidade. */
  speed: number;
  /** Desvio lateral no fim (unidades; + = para a direita, visto do apanhador). */
  breakX: number;
  /** Queda extra no fim (unidades). */
  drop: number;
}

export const PITCHES: Record<PitchType, PitchSpec> = {
  fastball: { label: 'Rápida', emoji: '🔥', speed: 1, breakX: 0, drop: -0.12 },
  curve: { label: 'Curva', emoji: '🌀', speed: 0.78, breakX: -0.9, drop: 0.35 },
  screwball: { label: 'Screwball', emoji: '↪️', speed: 0.8, breakX: 0.9, drop: 0.25 },
  splitter: { label: 'Splitter', emoji: '⬇️', speed: 0.88, breakX: 0, drop: 0.75 },
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Zona de strike (no plano da base): x em ±halfWidth, y entre bottom e top. */
export const STRIKE_ZONE = { halfWidth: 0.36, bottom: 0.7, top: 1.6 };

export function inStrikeZone(x: number, y: number, ballRadius = 0.11): boolean {
  return Math.abs(x) <= STRIKE_ZONE.halfWidth + ballRadius && y >= STRIKE_ZONE.bottom - ballRadius && y <= STRIKE_ZONE.top + ballRadius;
}

/** Velocidade do lançamento (unidades/s) pelo gesto (0–1) e o tipo. */
export function pitchSpeed(type: PitchType, power: number): number {
  return (22 + Math.max(0, Math.min(1, power)) * 12) * PITCHES[type].speed;
}

/**
 * Posição da bola no caminho do lançamento, `k` de 0 (mão) a 1 (base).
 * O efeito só aparece no fim (quadrático/cúbico), para enganar o batedor.
 */
export function pitchPath(type: PitchType, from: Vec3, target: Vec3, k: number): Vec3 {
  const s = PITCHES[type];
  const aimX = target.x - s.breakX;
  const aimY = target.y + s.drop;
  return {
    x: from.x + (aimX - from.x) * k + s.breakX * k * k,
    y: from.y + (aimY - from.y) * k - s.drop * k * k * k + Math.sin(k * Math.PI) * 0.35,
    z: from.z + (target.z - from.z) * k,
  };
}

// ── Batida ───────────────────────────────────────────────

export interface Contact {
  /** Velocidade de saída (unidades/s). */
  speed: number;
  /** Ângulo de saída em graus (negativo = para o chão). */
  launch: number;
  /** Direção em graus: 0 = centro, negativo = esquerda (cedo), positivo = direita (tarde). */
  spray: number;
  /** Fora das linhas. */
  foul: boolean;
}

/**
 * Contacto do bastão com a bola. `timing` em s (negativo = cedo), `batY` e `ballY` em unidades,
 * `power` 0–1. Devolve null se falhou a bola.
 */
export function contact(timing: number, batY: number, ballY: number, power: number, window = 0.13): Contact | null {
  const dy = ballY - batY; // > 0: bastão por baixo da bola → bola sobe
  if (Math.abs(timing) > window || Math.abs(dy) > 0.38) return null;
  const q = 1 - Math.abs(timing) / window;
  const spray = (timing / window) * 52;
  const launch = 12 + dy * 120;
  const speed = (26 + 30 * Math.max(0, Math.min(1, power))) * (0.45 + 0.55 * q) * (1 - Math.abs(dy) * 0.9);
  return { speed, launch, spray, foul: Math.abs(spray) > 45 };
}

export type BattedType = 'ground' | 'line' | 'fly' | 'popup';

export function battedType(launch: number): BattedType {
  if (launch < 8) return 'ground';
  if (launch < 24) return 'line';
  if (launch < 52) return 'fly';
  return 'popup';
}

// ── Voo da bola ──────────────────────────────────────────

export interface FlightSample extends Vec3 {
  t: number;
}

export interface Flight {
  samples: FlightSample[];
  /** Passou a vedação no ar. */
  homeRun: boolean;
  /** Tempo do 1.º toque no chão (null se home run). */
  landT: number | null;
  /** Saiu do campo depois de ressaltar (ground-rule double). */
  bouncedOut: boolean;
}

export const FIELD = { gravity: 9.81, fence: 95, fenceHeight: 3.2 };

/** Simula o voo da bola (gravidade, resistência do ar, ressaltos, rolar e vedação). */
export function simulateFlight(from: Vec3, c: Contact, dt = 1 / 60, maxT = 9): Flight {
  const la = (c.launch * Math.PI) / 180;
  const sp = (c.spray * Math.PI) / 180;
  let vx = Math.cos(la) * Math.sin(sp) * c.speed;
  let vy = Math.sin(la) * c.speed;
  let vz = -Math.cos(la) * Math.cos(sp) * c.speed;
  let { x, y, z } = from;
  const samples: FlightSample[] = [{ t: 0, x, y, z }];
  let landT: number | null = null;
  let homeRun = false;
  let bouncedOut = false;
  for (let t = dt; t <= maxT; t += dt) {
    const v = Math.hypot(vx, vy, vz);
    const drag = 0.0045 * v;
    vx -= vx * drag * dt;
    vy -= (FIELD.gravity + vy * drag) * dt;
    vz -= vz * drag * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    const r = Math.hypot(x, z);
    if (r >= FIELD.fence && !c.foul) {
      if (y > FIELD.fenceHeight) {
        homeRun = landT === null;
        bouncedOut = landT !== null;
        samples.push({ t, x, y, z });
        // Continua um pouco para lá da vedação, para a câmara.
        for (let k = 1; k < 40 && y > 0; k++) {
          vy -= FIELD.gravity * dt;
          x += vx * dt;
          y += vy * dt;
          z += vz * dt;
          samples.push({ t: t + k * dt, x, y, z });
        }
        break;
      }
      // Bate na vedação e volta para trás.
      const nx = x / r;
      const nz = z / r;
      const dot = vx * nx + vz * nz;
      vx = (vx - 2 * dot * nx) * 0.35;
      vz = (vz - 2 * dot * nz) * 0.35;
      x = nx * (FIELD.fence - 0.2);
      z = nz * (FIELD.fence - 0.2);
    }
    if (y <= 0.11) {
      y = 0.11;
      if (landT === null) landT = t;
      if (Math.abs(vy) > 1.2) {
        vy = -vy * 0.42;
        vx *= 0.75;
        vz *= 0.75;
      } else {
        vy = 0;
        const f = Math.max(0, 1 - 1.4 * dt); // a rolar: atrito
        vx *= f;
        vz *= f;
      }
    }
    samples.push({ t, x, y, z });
    if (landT !== null && Math.hypot(vx, vz) < 0.4 && vy === 0) break;
  }
  return { samples, homeRun, landT, bouncedOut };
}

/** Posição da bola no instante t (interpolada). */
export function flightAt(f: Flight, t: number): Vec3 {
  const s = f.samples;
  if (t <= 0) return s[0]!;
  const last = s[s.length - 1]!;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t < t) lo = mid;
    else hi = mid;
  }
  const a = s[lo]!;
  const b = s[hi]!;
  const k = (t - a.t) / (b.t - a.t || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

// ── Defesa e corredores ──────────────────────────────────

export const PLAY = {
  fielderSpeed: 8.5,
  /** Alcance para apanhar (unidades) e altura máxima apanhável. */
  reach: 1.4,
  catchHeight: 2.6,
  /** Reação dos defesas antes de correr (s). */
  reaction: 0.35,
  runnerSpeed: 7,
  /** O batedor larga o bastão e arranca. */
  runnerStart: 0.55,
  throwSpeed: 32,
  /** Apanhar e lançar. */
  throwDelay: 0.35,
  baseDistance: 19.4,
};

export interface Intercept {
  /** Índice do defesa. */
  fielder: number;
  t: number;
  at: Vec3;
  /** Apanhada no ar (eliminação direta). */
  inAir: boolean;
}

/** Que defesa chega primeiro à bola, quando e onde (apanhada no ar se possível). */
export function bestIntercept(f: Flight, fielders: Vec3[]): Intercept | null {
  let best: Intercept | null = null;
  for (let i = 0; i < fielders.length; i++) {
    const p = fielders[i]!;
    for (const s of f.samples) {
      if (s.y > PLAY.catchHeight) continue;
      if (Math.hypot(s.x, s.z) > FIELD.fence) continue;
      const run = Math.max(0, Math.hypot(s.x - p.x, s.z - p.z) - PLAY.reach);
      const need = PLAY.reaction + run / PLAY.fielderSpeed;
      if (need <= s.t) {
        const inAir = f.landT === null || s.t < f.landT;
        if (!best || s.t < best.t || (inAir && !best.inAir && s.t < best.t + 1.2)) best = { fielder: i, t: s.t, at: { x: s.x, y: s.y, z: s.z }, inAir };
        break;
      }
    }
  }
  return best;
}

/** Coordenadas das bases (0 = casa, 1–3). */
export function basePos(i: number): Vec3 {
  const d = PLAY.baseDistance;
  return [
    { x: 0, y: 0, z: 0 },
    { x: d, y: 0, z: -d },
    { x: 0, y: 0, z: -2 * d },
    { x: -d, y: 0, z: -d },
    // Sempre 0–3 (negativos ou valores inválidos não podem dar «sem base»).
  ][Number.isFinite(i) ? (((Math.floor(i) % 4) + 4) % 4) : 0]!;
}

/**
 * Quantas bases o batedor consegue com segurança (0 = eliminado na 1.ª base),
 * dado quando e onde o defesa fica com a bola.
 */
export function batterBases(fieldT: number, fieldAt: Vec3): number {
  const baseLen = PLAY.baseDistance / PLAY.runnerSpeed;
  let bases = 0;
  for (let n = 1; n <= 3; n++) {
    const runner = PLAY.runnerStart + n * baseLen + 0.25 * (n - 1);
    const b = basePos(n);
    const ball = fieldT + PLAY.throwDelay + Math.hypot(b.x - fieldAt.x, b.z - fieldAt.z) / PLAY.throwSpeed;
    // Só tenta a base seguinte se chegar com folga.
    const margin = n === 1 ? 0 : 0.6;
    if (runner + margin < ball) bases = n;
    else break;
  }
  return bases;
}
