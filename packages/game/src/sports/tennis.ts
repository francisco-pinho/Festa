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
