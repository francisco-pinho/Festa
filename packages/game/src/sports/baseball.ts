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
