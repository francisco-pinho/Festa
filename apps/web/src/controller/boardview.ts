/**
 * Mapa do tabuleiro em miniatura no telemóvel, enquanto não é a nossa vez:
 * casas com a cor do tipo, a estrela e toda a gente (eu a pulsar).
 */
import type { ControllerLayout } from '@festa/shared';

type BoardLayout = Extract<ControllerLayout, { kind: 'board' }>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderBoard(view: HTMLElement, l: BoardLayout): void {
  const xs = l.spaces.map((s) => s[0]);
  const zs = l.spaces.map((s) => s[1]);
  const pad = 3;
  const minX = Math.min(...xs) - pad;
  const minZ = Math.min(...zs) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...zs) - minZ + pad;
  const lines = l.links
    .map(([a, b]) => {
      const p = l.spaces[a];
      const q = l.spaces[b];
      return p && q ? `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>` : '';
    })
    .join('');
  const dots = l.spaces.map(([x, z, c]) => `<circle cx="${x}" cy="${z}" r="1.05" fill="${l.palette[c] ?? '#2f7dff'}"/>`).join('');
  const star = l.star ? `<text class="bv-star" x="${l.star[0]}" y="${l.star[1] - 1.2}">⭐</text>` : '';
  const me = l.players.find((p) => p.me);
  const players = [...l.players]
    .sort((a, b) => Number(!!a.me) - Number(!!b.me)) // eu por cima
    .map(
      (p) => `<g class="bv-p ${p.me ? 'me' : ''}" transform="translate(${p.x} ${p.z})">
        ${p.me ? '<circle class="bv-ring" r="3.4"/>' : ''}
        <circle r="2.4" fill="${p.color}"/>
        <text y="0.85">${esc(p.label)}</text>
      </g>`,
    )
    .join('');
  view.innerHTML = `
    <div class="boardview">
      <p class="bv-msg">${esc(l.message)}</p>
      <svg viewBox="${minX} ${minZ} ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <g class="bv-links">${lines}</g>${dots}${star}${players}
      </svg>
      ${me ? '<p class="bv-hint">Tu estás no círculo a pulsar</p>' : ''}
    </div>`;
}
