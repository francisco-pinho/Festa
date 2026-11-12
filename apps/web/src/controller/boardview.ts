/**
 * Mapa do tabuleiro em miniatura no telemóvel, enquanto não é a nossa vez:
 * casas com a cor e o símbolo do tipo, túneis a tracejado, a estrela e toda a gente
 * (eu a pulsar, quem está a jogar com um halo). Atualiza-se a cada casa que alguém anda:
 * o mapa fica desenhado e só os bonecos se mexem (com transição suave).
 */
import type { ControllerLayout } from '@festa/shared';
import type { ButtonId, ControllerInput } from '@festa/shared';
import { statsHtml } from './infoview';
import { haptic } from './haptics';
import { iconFor, iconPaths } from '../common/icons';

type Send = (input: ControllerInput) => void;

type BoardLayout = Extract<ControllerLayout, { kind: 'board' }>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Mapa desenhado da última vez (para só mexer nos bonecos quando o tabuleiro é o mesmo). */
let drawnKey = '';

function boardKey(l: BoardLayout): string {
  const a = l.spaces[0];
  const b = l.spaces[l.spaces.length - 1];
  return `${l.spaces.length}:${a?.join(',')}:${b?.join(',')}`;
}

function playersHtml(l: BoardLayout): string {
  return [...l.players]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(!!a.p.me) - Number(!!b.p.me)) // eu por cima
    .map(
      ({ p, i }) => `<g class="bv-p ${p.me ? 'me' : ''} ${p.active ? 'active' : ''}" data-i="${i}" style="transform: translate(${p.x}px, ${p.z}px)">
        ${p.active ? '<circle class="bv-halo" r="3.6"/>' : ''}
        ${p.me ? '<circle class="bv-ring" r="3.4"/>' : ''}
        <circle r="2.4" fill="${p.color}"/>
        <text y="0.85">${esc(p.label)}</text>
      </g>`,
    )
    .join('');
}

/** Botões por baixo do mapa (redesenhados a cada atualização). */
function renderActions(view: HTMLElement, l: BoardLayout, send?: Send): void {
  const bar = view.querySelector<HTMLElement>('.bv-actions');
  if (!bar) return;
  const actions = l.actions ?? [];
  bar.hidden = !actions.length;
  bar.innerHTML = actions
    .map((a) => `<button class="bv-act ${a.primary ? 'primary' : ''}" data-b="${a.id}">${esc(a.label)}</button>`)
    .join('') + (l.shake && actions.length ? '<small class="bv-shake">…ou abana o telemóvel!</small>' : '');
  if (!send) return;
  bar.querySelectorAll<HTMLButtonElement>('.bv-act').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      haptic(30);
      send({ t: 'button', button: b.dataset.b as ButtonId, pressed: true });
    });
    b.addEventListener('pointerup', () => send({ t: 'button', button: b.dataset.b as ButtonId, pressed: false }));
  });
}

export function renderBoard(view: HTMLElement, l: BoardLayout, send?: Send): void {
  renderBoardInner(view, l);
  renderActions(view, l, send);
}

function renderBoardInner(view: HTMLElement, l: BoardLayout): void {
  const key = boardKey(l);
  const existing = view.querySelector<SVGGElement>('.bv-players');
  if (existing && key === drawnKey) {
    // Mesmo tabuleiro: atualiza mensagem, estatísticas, estrela e bonecos.
    view.querySelector('.bv-msg')!.textContent = l.message;
    const stats = view.querySelector('.bv-stats-slot');
    if (stats) stats.innerHTML = statsHtml(l.stats);
    const star = view.querySelector<SVGTextElement>('.bv-star');
    if (star && l.star) star.setAttribute('transform', `translate(${l.star[0]} ${l.star[1] - 1.2})`);
    const groups = view.querySelectorAll<SVGGElement>('.bv-p');
    if (groups.length === l.players.length) {
      groups.forEach((g) => {
        const p = l.players[Number(g.dataset.i)];
        if (!p) return;
        g.style.transform = `translate(${p.x}px, ${p.z}px)`;
        g.classList.toggle('active', !!p.active);
        const halo = g.querySelector('.bv-halo');
        if (p.active && !halo) g.insertAdjacentHTML('afterbegin', '<circle class="bv-halo" r="3.6"/>');
        if (!p.active && halo) halo.remove();
      });
      return;
    }
    existing.innerHTML = playersHtml(l);
    return;
  }
  drawnKey = key;
  const xs = l.spaces.map((s) => s[0]);
  const zs = l.spaces.map((s) => s[1]);
  const pad = 4;
  const minX = Math.min(...xs) - pad;
  const minZ = Math.min(...zs) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...zs) - minZ + pad;
  const seg = (a: number, b: number) => {
    const p = l.spaces[a];
    const q = l.spaces[b];
    return p && q ? `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>` : '';
  };
  const lines = l.links.map(([a, b]) => seg(a, b)).join('');
  const tunnels = (l.tunnels ?? []).map(([a, b]) => seg(a, b)).join('');
  const dots = l.spaces
    .map(([x, z, c]) => {
      const sym = l.symbols?.[c];
      // Símbolo da casa: ícone desenhado (se houver) ou o texto.
      const icon = sym ? iconFor(sym) : undefined;
      const symHtml = icon
        ? `<svg x="${x - 0.8}" y="${z - 0.8}" width="1.6" height="1.6" viewBox="0 0 24 24">${iconPaths(icon)}</svg>`
        : sym
          ? `<text class="bv-sym" x="${x}" y="${z + 0.55}">${esc(sym)}</text>`
          : '';
      return `<circle cx="${x}" cy="${z}" r="1.15" fill="${l.palette[c] ?? '#2f7dff'}"/>${symHtml}`;
    })
    .join('');
  const star = l.star ? `<text class="bv-star" transform="translate(${l.star[0]} ${l.star[1] - 1.2})">⭐</text>` : '';
  const me = l.players.find((p) => p.me);
  view.innerHTML = `
    <div class="boardview">
      <p class="bv-msg">${esc(l.message)}</p>
      <div class="bv-stats-slot">${statsHtml(l.stats)}</div>
      <svg viewBox="${minX} ${minZ} ${w} ${h}" preserveAspectRatio="xMidYMid meet">
        <g class="bv-links">${lines}</g><g class="bv-tunnels">${tunnels}</g>${dots}${star}<g class="bv-players">${playersHtml(l)}</g>
      </svg>
      ${me ? '<p class="bv-hint">Tu estás no círculo a pulsar · o halo é quem está a jogar</p>' : ''}
      <div class="bv-actions" hidden></div>
    </div>`;
}
