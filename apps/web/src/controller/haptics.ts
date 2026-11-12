/**
 * Vibração ao carregar nos botões, em Android e iPhone.
 *
 * - Android: `navigator.vibrate` (com um mínimo de ~25 ms: abaixo disso muitos telemóveis não sentem nada).
 * - iPhone: o Safari não tem `navigator.vibrate`. A partir do iOS 18, ligar/desligar um interruptor
 *   (`<input type="checkbox" switch>`) dá um toque háptico do sistema — usamos um escondido.
 *   Só funciona dentro de um toque do jogador (não para vibrações mandadas pelo jogo).
 */
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let iosLabel: HTMLLabelElement | null = null;
function iosSwitch(): HTMLLabelElement {
  if (iosLabel) return iosLabel;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'haptic-switch';
  const label = document.createElement('label');
  label.htmlFor = input.id;
  for (const el of [input, label]) {
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
  }
  document.body.append(input, label);
  iosLabel = label;
  return label;
}

/** Toque curto (botões). `ms` só conta no Android. */
export function haptic(ms = 25): void {
  if (canVibrate) {
    navigator.vibrate(Math.max(25, ms));
    return;
  }
  try {
    iosSwitch().click();
  } catch {
    /* sem háptica neste telemóvel */
  }
}

/** Padrão de vibração (Android); no iPhone dá um toque só. */
export function hapticPattern(pattern: number | number[]): void {
  if (canVibrate) {
    navigator.vibrate(pattern);
    return;
  }
  haptic();
}
