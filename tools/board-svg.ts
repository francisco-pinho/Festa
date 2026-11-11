/**
 * Desenha todos os tabuleiros em SVG (para planear caminhos novos sem abrir o jogo).
 *
 *   npx tsx tools/board-svg.ts            → apps/web/public/dev-boards.html (abrir em /dev-boards.html)
 */
import { writeFileSync } from 'node:fs';
import { BOARDS, type Board } from '../packages/game/src';

const COLORS: Record<string, string> = {
  start: '#ffffff', blue: '#2f7dff', red: '#ff3b5c', lucky: '#25c26b', unlucky: '#7b3fd1', event: '#ffa41b',
  shop: '#1fd1c1', item: '#ff6fb5', vs: '#ffd23f', villain: '#3b2a4d', bank: '#e0b000', cannon: '#555555', lever: '#a0522d',
};

function svg(board: Board): string {
  const xs = board.spaces.map((s) => s.x);
  const zs = board.spaces.map((s) => s.z);
  const minX = Math.min(...xs) - 6;
  const minZ = Math.min(...zs) - 6;
  const w = Math.max(...xs) - minX + 6;
  const h = Math.max(...zs) - minZ + 6;
  const S = 9;
  const out: string[] = [];
  const special = new Set([...board.tunnels.map((t) => `${t.from}>${t.to}`)]);
  for (const s of board.spaces)
    for (const n of s.next) {
      const t = board.spaces[n]!;
      const gate = board.gates.find((g) => g.from === s.id && g.to === n);
      const toll = (board.tolls ?? []).find((g) => g.from === s.id && g.to === n);
      const color = special.has(`${s.id}>${n}`) ? '#bbb' : gate ? (gate.lever ? '#a0522d' : '#ff3b5c') : toll ? '#e0b000' : '#333';
      out.push(`<line x1="${(s.x - minX) * S}" y1="${(s.z - minZ) * S}" x2="${(t.x - minX) * S}" y2="${(t.z - minZ) * S}" stroke="${color}" stroke-width="${gate || toll ? 5 : 2}" ${special.has(`${s.id}>${n}`) ? 'stroke-dasharray="6 6"' : ''}/>`);
    }
  for (const s of board.spaces) {
    out.push(`<circle cx="${(s.x - minX) * S}" cy="${(s.z - minZ) * S}" r="${1.15 * S}" fill="${COLORS[s.type] ?? '#999'}" stroke="${s.starCandidate ? 'gold' : '#000'}" stroke-width="${s.starCandidate ? 3 : 1}"/>`);
    out.push(`<text x="${(s.x - minX) * S}" y="${(s.z - minZ) * S + 4}" font-size="10" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="0.3">${s.id}</text>`);
  }
  return `<h2>${board.name} (${board.spaces.length} casas)</h2><svg width="${w * S}" height="${h * S}" style="background:#eef">${out.join('')}</svg>`;
}

const html = `<!doctype html><meta charset="utf-8"><title>Tabuleiros</title><body style="font-family:sans-serif">${BOARDS.map((b) => svg(b.create())).join('')}</body>`;
writeFileSync(new URL('../apps/web/public/dev-boards.html', import.meta.url), html);
console.log('ok');
