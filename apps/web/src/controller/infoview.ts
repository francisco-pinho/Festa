/**
 * Ecrã de informação do comando (quando não está a ser usado para jogar):
 * estatísticas pessoais em cartões, classificação ao vivo e, às vezes, uma aposta.
 */
import type { ControllerInput, ControllerLayout } from '@festa/shared';
import { haptic } from './haptics';

type InfoLayout = Extract<ControllerLayout, { kind: 'info' }>;
export type Stats = NonNullable<InfoLayout['stats']>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function statsHtml(stats: Stats | undefined): string {
  if (!stats?.length) return '';
  return `<div class="iv-stats">${stats
    .map((s) => `<div class="iv-stat"><span class="iv-icon">${esc(s.icon ?? '')}</span><b>${esc(s.value)}</b><small>${esc(s.label)}</small></div>`)
    .join('')}</div>`;
}

export function renderInfo(view: HTMLElement, l: InfoLayout, send: (input: ControllerInput) => void): void {
  const table = l.table
    ? `<div class="iv-table">${l.table.title ? `<h3>${esc(l.table.title)}</h3>` : ''}${l.table.rows
        .map(
          (r, i) => `<div class="iv-row ${r.me ? 'me' : ''}">
            <span class="iv-pos">${i + 1}</span><span class="iv-dot" style="background:${r.color}"></span>
            <span class="iv-name">${esc(r.name)}${r.mark ? ` ${esc(r.mark)}` : ''}</span><span class="iv-val">${esc(r.value)}</span>
          </div>`,
        )
        .join('')}</div>`
    : '';
  const ask = l.ask
    ? `<div class="iv-ask"><p>${esc(l.ask.prompt)}</p><div class="iv-opts">${l.ask.options
        .map(
          (o) =>
            `<button class="iv-opt ${l.ask!.chosen === o.id ? 'on' : ''}" data-id="${esc(o.id)}" style="${o.color ? `--c:${o.color}` : ''}" ${l.ask!.chosen ? 'disabled' : ''}>${esc(o.label)}</button>`,
        )
        .join('')}</div></div>`
    : '';
  view.innerHTML = `
    <div class="infoview" style="${l.color ? `--accent:${l.color}` : ''}">
      <div class="iv-head"><b>${esc(l.title)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div>
      <div class="iv-body">
        <div class="iv-side">${statsHtml(l.stats)}${ask}</div>
        ${table}
      </div>
    </div>`;
  view.querySelectorAll<HTMLButtonElement>('.iv-opt').forEach((b) =>
    b.addEventListener('click', () => {
      send({ t: 'choice', id: b.dataset.id! });
      view.querySelectorAll<HTMLButtonElement>('.iv-opt').forEach((o) => {
        o.disabled = true;
        o.classList.toggle('on', o === b);
      });
      haptic(30);
    }),
  );
}
