/** Ajudas para os lugares (1.º, 2.º…) dos minijogos. */

/**
 * Agrupa por pontuação, do melhor para o pior (empates no mesmo grupo).
 * `higherIsBetter` = true: mais pontos é melhor (ex.: moedas); false: menos é melhor (ex.: distância ao alvo).
 */
export function rankBy(ids: string[], score: (id: string) => number, higherIsBetter = true): string[][] {
  const sorted = [...ids].sort((a, b) => (higherIsBetter ? score(b) - score(a) : score(a) - score(b)));
  const groups: string[][] = [];
  let last: number | null = null;
  for (const id of sorted) {
    const v = score(id);
    if (last !== null && Math.abs(v - last) < 1e-6) groups[groups.length - 1]!.push(id);
    else groups.push([id]);
    last = v;
  }
  return groups;
}

/** Sobrevivência: quem está vivo primeiro; depois quem saiu mais tarde. */
export function rankSurvival(ids: string[], alive: (id: string) => boolean, outAt: (id: string) => number | undefined): string[][] {
  return rankBy(ids, (id) => (alive(id) ? 1e9 : (outAt(id) ?? -1)));
}

/** Equipas / 1 contra todos: quem ganhou (empatados) e depois os outros (empatados). */
export function rankWinners(ids: string[], winners: string[]): string[][] {
  const win = ids.filter((id) => winners.includes(id));
  const rest = ids.filter((id) => !winners.includes(id));
  return [win, rest].filter((g) => g.length);
}
