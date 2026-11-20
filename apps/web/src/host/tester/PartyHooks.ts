/**
 * Modo tester: fila de comandos do painel que a festa consome nos momentos seguros
 * (início de cada vez, antes do minijogo, dentro do ciclo do minijogo). Não mexe no estado:
 * o PartyFlow é que aplica as alterações e redesenha.
 */
import type { TesterCmd, TesterState } from '@festa/shared';

export type BoardEdit = Extract<TesterCmd, { t: 'teleport' | 'give' | 'takeItem' | 'round' | 'moveStar' }>;

export class PartyHooks {
  private current: TesterState['phase'] = 'other';
  private dice: number[] = [];
  private edits: BoardEdit[] = [];
  private end: { winners: string[] | null } | null = null;
  private skip = false;

  get phase(): TesterState['phase'] {
    return this.current;
  }

  /** Ao sair do minijogo/treino, um pedido que chegou tarde não passa para o seguinte. */
  set phase(next: TesterState['phase']) {
    if (next !== this.current) {
      if (next !== 'minigame' && next !== 'practice') this.end = null;
      this.skip = false;
    }
    this.current = next;
  }

  /** Guarda o comando, se fizer sentido na fase atual; os outros são ignorados. */
  apply(cmd: TesterCmd): void {
    const inParty = this.phase === 'board' || this.phase === 'minigame' || this.phase === 'practice';
    const inMinigame = this.phase === 'minigame' || this.phase === 'practice';
    switch (cmd.t) {
      case 'nextDice':
        if (inParty) this.dice = [...cmd.values];
        break;
      case 'teleport':
      case 'give':
      case 'takeItem':
      case 'round':
      case 'moveStar':
        if (inParty) this.edits.push(cmd);
        break;
      case 'endMinigame':
        if (inMinigame) this.end = { winners: cmd.winners?.length ? cmd.winners : null };
        break;
      case 'skipPractice':
        if (this.phase === 'practice') this.skip = true;
        break;
    }
  }

  /** Próximo valor de dado forçado (ou null para lançar ao calhas). */
  takeDie(): number | null {
    return this.dice.shift() ?? null;
  }

  takeEdits(): BoardEdit[] {
    return this.edits.splice(0);
  }

  /** O painel mandou terminar o minijogo? (fica ativo até `takeEnd`) */
  get ending(): boolean {
    return this.end !== null;
  }

  /** Consome o fim forçado: vencedores escolhidos, ou null para usar os do minijogo. */
  takeEnd(): string[] | null {
    const w = this.end?.winners ?? null;
    this.end = null;
    return w;
  }

  takeSkipPractice(): boolean {
    const s = this.skip;
    this.skip = false;
    return s;
  }
}
