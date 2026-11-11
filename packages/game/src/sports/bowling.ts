/**
 * Pontuação de bowling (regras oficiais, com nº de jogadas configurável).
 * Strike: 10 + as 2 bolas seguintes. Spare: 10 + a bola seguinte.
 * Na última jogada, strike ou spare dão direito a bolas extra (até 3 bolas).
 */
export type BowlingFrame = number[];

export const PINS = 10;

/** A jogada terminou? */
export function isFrameDone(frame: BowlingFrame, last: boolean): boolean {
  if (!last) return frame[0] === PINS || frame.length === 2;
  if (frame.length < 2) return false;
  if (frame.length === 3) return true;
  return frame[0]! + frame[1]! < PINS;
}

/** Os pinos voltam todos a ser postos para a próxima bola? */
export function shouldResetPins(frame: BowlingFrame, last: boolean, standingAfter: number): boolean {
  return standingAfter === 0 || isFrameDone(frame, last);
}

/** Pontuação acumulada por jogada (null enquanto não se pode calcular). */
export function scoreFrames(frames: BowlingFrame[], totalFrames: number): (number | null)[] {
  const rolls = frames.flat();
  const out: (number | null)[] = [];
  let i = 0;
  let total = 0;
  let unknown = false;
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f]!;
    const last = f === totalFrames - 1;
    if (unknown || !isFrameDone(fr, last)) {
      out.push(null);
      unknown = true;
      continue;
    }
    let value: number | undefined;
    if (last) value = fr.reduce((a, b) => a + b, 0);
    else if (fr[0] === PINS) {
      const b1 = rolls[i + 1];
      const b2 = rolls[i + 2];
      value = b1 !== undefined && b2 !== undefined ? PINS + b1 + b2 : undefined;
    } else if (fr[0]! + fr[1]! === PINS) {
      const b = rolls[i + 2];
      value = b !== undefined ? PINS + b : undefined;
    } else value = fr[0]! + fr[1]!;
    i += fr.length;
    if (value === undefined) {
      out.push(null);
      unknown = true;
      continue;
    }
    total += value;
    out.push(total);
  }
  return out;
}

/** Pontuação "até agora" (conta o que já se sabe, mesmo sem os bónus). */
export function runningTotal(frames: BowlingFrame[], totalFrames: number): number {
  const scored = scoreFrames(frames, totalFrames);
  let lastKnown = 0;
  let idx = -1;
  scored.forEach((s, i) => {
    if (s !== null) {
      lastKnown = s;
      idx = i;
    }
  });
  const pending = frames.slice(idx + 1).flat().reduce((a, b) => a + b, 0);
  return lastKnown + pending;
}

/** Símbolo da bola para o placar: X strike, / spare, - zero. */
export function rollSymbols(frame: BowlingFrame, last: boolean): string[] {
  const out: string[] = [];
  frame.forEach((r, i) => {
    const prev = frame[i - 1];
    const freshRack = i === 0 || (last && (prev === PINS || (i === 2 && frame[0]! + frame[1]! === PINS && frame[0] !== PINS)));
    if (r === PINS && freshRack) out.push('X');
    else if (!freshRack && prev !== undefined && prev + r === PINS) out.push('/');
    else out.push(r === 0 ? '-' : String(r));
  });
  return out;
}
