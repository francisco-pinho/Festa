import { describe, expect, it } from 'vitest';
import { BOARDS, boardFromLayout, boardToLayout } from '../src';

describe('mapas do Blender', () => {
  it.each(BOARDS.map((b) => [b.id, b.create()] as const))('%s: tabuleiro → mapa → tabuleiro fica igual', (_id, board) => {
    // A altura 0 e a altura em falta são a mesma coisa (o jogo usa `y ?? 0`).
    const norm = (b: unknown) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'y' && !v ? undefined : v)));
    const back = boardFromLayout(JSON.parse(JSON.stringify(boardToLayout(board))));
    expect(norm(back)).toEqual(norm(board));
  });

  it('casas sem tipo ficam com um tipo; ligação a casa que não existe dá erro claro', () => {
    const layout = boardToLayout(BOARDS[0]!.create());
    delete layout.spaces[5]!.type;
    expect(boardFromLayout(layout).spaces[5]!.type).toBeTruthy();
    layout.spaces[5]!.next = ['casa_999'];
    expect(() => boardFromLayout(layout)).toThrow('casa_999');
  });
});
