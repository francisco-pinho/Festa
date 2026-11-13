/**
 * Escolha da personagem no telemóvel: carrossel horizontal com as caras de todas as personagens.
 * Setas grandes (◀ ▶) ou deslizar o dedo para navegar, tocar numa cara para saltar para ela,
 * «Pronto!» para confirmar. As já escolhidas por outros aparecem apagadas.
 *
 * As caras (imagens) só vêm na primeira mensagem: ficam guardadas aqui para as seguintes.
 */
import type { ButtonId, ControllerInput, ControllerLayout } from '@festa/shared';
import { haptic } from './haptics';

type PickLayout = Extract<ControllerLayout, { kind: 'pick' }>;

const imgs = new Map<string, string>();

/** Chega a cara de uma personagem: guarda-a e, se o carrossel estiver no ecrã, mostra-a logo. */
export function setFace(id: string, img: string): void {
  imgs.set(id, img);
  const card = document.querySelector<HTMLElement>(`.pk-card[data-id="${CSS.escape(id)}"] .pk-face`);
  if (card && card.dataset.src !== img) {
    card.dataset.src = img;
    card.innerHTML = `<img src="${img}" alt="">`;
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderPick(view: HTMLElement, l: PickLayout, send: (input: ControllerInput) => void): () => void {
  const press = (button: ButtonId) => {
    send({ t: 'button', button, pressed: true });
    send({ t: 'button', button, pressed: false });
    haptic(12);
  };

  let root = view.querySelector<HTMLElement>('.pickview');
  const fresh = !root || root.dataset.count !== String(l.items.length);
  if (fresh) {
    view.innerHTML = `
      <div class="pickview">
        <div class="pk-head"><b class="pk-title"></b><small class="pk-sub"></small></div>
        <div class="pk-strip">
          <button class="pk-arrow left" aria-label="Anterior">◀</button>
          <div class="pk-window"><div class="pk-track">${l.items
            .map(
              (it) => `<button class="pk-card" data-id="${esc(it.id)}" style="--c:${it.color}">
                <span class="pk-face"></span><span class="pk-name">${esc(it.name)}</span><span class="pk-taken">Escolhida</span>
              </button>`,
            )
            .join('')}</div></div>
          <button class="pk-arrow right" aria-label="Seguinte">▶</button>
        </div>
        <div class="pk-actions">
          <button class="pk-btn y" hidden></button>
          <button class="pk-btn x" hidden></button>
          <button class="pk-btn b" hidden></button>
          <button class="pk-btn a"></button>
          <button class="pk-btn plus" hidden></button>
        </div>
      </div>`;
    root = view.querySelector<HTMLElement>('.pickview')!;
    root.dataset.count = String(l.items.length);
    root.querySelector('.pk-arrow.left')!.addEventListener('click', () => press('left'));
    root.querySelector('.pk-arrow.right')!.addEventListener('click', () => press('right'));
    root.querySelectorAll<HTMLButtonElement>('.pk-card').forEach((c) =>
      c.addEventListener('click', () => {
        if (root!.classList.contains('ready')) return;
        send({ t: 'choice', id: c.dataset.id! });
        haptic(15);
      }),
    );
    root.querySelector('.pk-btn.a')!.addEventListener('click', () => press('a'));
    root.querySelector('.pk-btn.b')!.addEventListener('click', () => press('b'));
    root.querySelector('.pk-btn.x')!.addEventListener('click', () => press('x'));
    root.querySelector('.pk-btn.y')!.addEventListener('click', () => press('y'));
    root.querySelector('.pk-btn.plus')!.addEventListener('click', () => press('plus'));
    // Deslizar o dedo no carrossel também muda de personagem.
    const win = root.querySelector<HTMLElement>('.pk-window')!;
    let x0: number | null = null;
    win.addEventListener('touchstart', (e) => (x0 = e.touches[0]?.clientX ?? null), { passive: true });
    win.addEventListener('touchend', (e) => {
      const x1 = e.changedTouches[0]?.clientX;
      if (x0 === null || x1 === undefined) return;
      const dx = x1 - x0;
      x0 = null;
      if (Math.abs(dx) > 40) press(dx < 0 ? 'right' : 'left');
    });
  }

  const box = root!;
  box.classList.toggle('ready', l.ready);
  box.style.setProperty('--accent', l.color ?? '#ffcc00');
  box.querySelector('.pk-title')!.textContent = l.title;
  box.querySelector('.pk-sub')!.textContent = l.sub ?? '';
  const cards = [...box.querySelectorAll<HTMLButtonElement>('.pk-card')];
  l.items.forEach((it, i) => {
    const card = cards[i];
    if (!card) return;
    card.classList.toggle('on', i === l.index);
    card.classList.toggle('taken', !!it.taken && i !== l.index);
    const face = card.querySelector<HTMLElement>('.pk-face')!;
    const src = imgs.get(it.id);
    if (src && face.dataset.src !== src) {
      face.dataset.src = src;
      face.innerHTML = `<img src="${src}" alt="">`;
    } else if (!src && !face.textContent) face.textContent = it.name.slice(0, 1);
  });
  // Centra a personagem escolhida (as outras ficam dos lados, a encolher).
  const track = box.querySelector<HTMLElement>('.pk-track')!;
  track.style.setProperty('--i', String(l.index));
  const btn = (sel: string, label: string | undefined) => {
    const b = box.querySelector<HTMLButtonElement>(sel)!;
    b.hidden = !label;
    if (label) b.textContent = label;
  };
  btn('.pk-btn.a', l.buttons.a);
  btn('.pk-btn.b', l.buttons.b);
  btn('.pk-btn.x', l.buttons.x ? `Ⓧ ${l.buttons.x}` : undefined);
  btn('.pk-btn.y', l.buttons.y ? `Ⓨ ${l.buttons.y}` : undefined);
  btn('.pk-btn.a', l.buttons.a ? `Ⓐ ${l.buttons.a}` : undefined);
  btn('.pk-btn.b', l.buttons.b ? `Ⓑ ${l.buttons.b}` : undefined);
  btn('.pk-btn.plus', l.buttons.plus ? `⚙️ ${l.buttons.plus}` : undefined);
  box.querySelectorAll<HTMLButtonElement>('.pk-arrow').forEach((a) => (a.disabled = l.ready));
  return () => undefined;
}
