/**
 * Ecrã de carregamento (ao abrir o jogo): tapa tudo enquanto carregam as personagens, a sala
 * de estar e a televisão, e enquanto a placa gráfica prepara texturas e shaders (para o jogo
 * não engasgar no primeiro segundo).
 */
let el: HTMLElement | null = null;

function ensure(): HTMLElement {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'boot';
  el.innerHTML = `
    <div class="boot-logo">FESTA</div>
    <div class="boot-bar"><i></i></div>
    <div class="boot-text"></div>`;
  document.body.appendChild(el);
  return el;
}

export const loading = {
  /** Mostra (ou atualiza) o ecrã de carregamento. `progress` de 0 a 1. */
  show(text: string, progress?: number): void {
    const e = ensure();
    e.classList.remove('done');
    e.querySelector('.boot-text')!.textContent = text;
    if (progress !== undefined) (e.querySelector('.boot-bar i') as HTMLElement).style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
  },
  /** Esconde com um fade. */
  hide(): void {
    if (!el) return;
    const e = el;
    el = null;
    e.classList.add('done');
    setTimeout(() => e.remove(), 500);
  },
};
