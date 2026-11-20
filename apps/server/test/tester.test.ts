/**
 * Painel de tester: validação dos comandos e reencaminhamento no servidor (só em dev).
 */
import { describe, expect, it } from 'vitest';
import { testerCmdSchema } from '@festa/shared/schemas';

describe('testerCmdSchema', () => {
  it('aceita velocidades conhecidas e recusa outras', () => {
    expect(testerCmdSchema.safeParse({ t: 'time', scale: 4 }).success).toBe(true);
    expect(testerCmdSchema.safeParse({ t: 'time', scale: 3 }).success).toBe(false);
  });

  it('recusa dados fora de 1–6', () => {
    expect(testerCmdSchema.safeParse({ t: 'nextDice', values: [7] }).success).toBe(false);
  });

  it('limita os jogadores do cenário a 8', () => {
    const party = { kind: 'party', board: 'ilha', rounds: 2, players: 9, botLevel: 'normal', keyboardSeat: null };
    expect(testerCmdSchema.safeParse({ t: 'scenario', scenario: party }).success).toBe(false);
  });

  it('aceita um cenário de minijogo com teclado', () => {
    const mg = { kind: 'minigame', id: 'Tag', mode: 'teams', players: 4, botLevel: 'normal', keyboardSeat: 0 };
    expect(testerCmdSchema.safeParse({ t: 'scenario', scenario: mg }).success).toBe(true);
  });
});
