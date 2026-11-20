/**
 * Modo tester: o cenário a lançar fica no sessionStorage deste separador, para voltar
 * a ele depois de cada recarregamento (código gravado, F5, comando do painel).
 */
import type { TesterScenario } from '@festa/shared';
import { testerScenarioSchema } from '@festa/shared/schemas';

const KEY = 'festa.tester';

export interface StoredTester {
  scenario: TesterScenario;
  /** Velocidade do tempo (a pausa não se guarda). */
  timeScale: number;
}

export function loadScenario(): StoredTester | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<StoredTester> | null;
    const parsed = testerScenarioSchema.safeParse(raw?.scenario);
    if (!parsed.success) return null;
    const scale = raw?.timeScale ?? 1;
    return { scenario: parsed.data, timeScale: [1, 2, 4].includes(scale) ? scale : 1 };
  } catch {
    return null;
  }
}

export function saveScenario(s: StoredTester): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...s, timeScale: s.timeScale || 1 }));
  } catch {
    /* sem armazenamento: o cenário só dura até recarregar */
  }
}

export function clearScenario(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada a limpar */
  }
}
