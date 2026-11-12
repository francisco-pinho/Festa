/**
 * Ícones desenhados do jogo (em vez de emojis): cada ícone são camadas de caminhos SVG
 * (24×24) com cor e contorno, no estilo do resto do jogo.
 *
 * Os textos do jogo continuam a usar emojis como «atalho» (🪙, ⭐, ❤️…): ao mostrar, cada emoji
 * conhecido é trocado pelo ícone — no HTML (ecrã grande e telemóvel, automaticamente, ver
 * `installIconSwap`) e nos textos 3D (`drawRich`, usado pelo `textSprite`).
 */

type Layer = { d: string; fill?: string; stroke?: string; w?: number };

// ── Ajudas para desenhar caminhos ─────────────────────────
const C = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const E = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const R = (x: number, y: number, w: number, h: number, r = 0) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}h${w - 2 * r}${r ? `a${r} ${r} 0 0 1 ${r} ${r}` : ''}v${h - 2 * r}${r ? `a${r} ${r} 0 0 1 ${-r} ${r}` : ''}h${-(w - 2 * r)}${r ? `a${r} ${r} 0 0 1 ${-r} ${-r}` : ''}v${-(h - 2 * r)}${r ? `a${r} ${r} 0 0 1 ${r} ${-r}` : ''}Z`;
};
const P = (pts: number[][]) => `M${pts.map((p) => `${p[0]} ${p[1]}`).join('L')}Z`;
const STAR = (cx: number, cy: number, ro: number, ri: number, n = 5) => {
  const pts: number[][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push([+(cx + Math.cos(a) * r).toFixed(2), +(cy + Math.sin(a) * r).toFixed(2)]);
  }
  return P(pts);
};
const rot = (pts: number[][], turns: number) =>
  pts.map(([x, y]) => {
    let px = x! - 12;
    let py = y! - 12;
    for (let i = 0; i < turns; i++) [px, py] = [-py, px];
    return [px + 12, py + 12];
  });

const INK = '#1d1433';
const ARROW = [[12, 2.5], [21, 12], [15.5, 12], [15.5, 21.5], [8.5, 21.5], [8.5, 12], [3, 12]];
const HEART = 'M12 21C5 15.5 2 12.2 2 8.3 2 5 4.6 3 7.3 3 9.3 3 11 4.2 12 6c1-1.8 2.7-3 4.7-3C19.4 3 22 5 22 8.3 22 12.2 19 15.5 12 21Z';
const SPEAKER = P([[3, 9], [7, 9], [12, 5], [12, 19], [7, 15], [3, 15]]);
const PHONE: Layer[] = [
  { d: R(7.5, 2.5, 9, 19, 2.2), fill: '#3a3150', stroke: INK, w: 1.2 },
  { d: R(9, 5, 6, 12.5, 0.6), fill: '#6fd3ff' },
];

const ICONS: Record<string, Layer[]> = {
  coin: [
    { d: C(12, 12, 10), fill: '#e0a100', stroke: '#7a4a00', w: 1.4 },
    { d: C(12, 12, 7.6), fill: '#ffd23f' },
    { d: STAR(12, 12.3, 4.8, 2.1), fill: '#fff3a0', stroke: '#e0a100', w: 0.6 },
  ],
  star: [
    { d: STAR(12, 12.8, 11, 4.8), fill: '#ffd23f', stroke: '#9a6a00', w: 1.4 },
    { d: STAR(10.6, 11.2, 3.6, 1.6), fill: '#fff6c2' },
  ],
  heart: [
    { d: HEART, fill: '#ff4d6d', stroke: '#8a1030', w: 1.3 },
    { d: C(7.6, 7.8, 1.7), fill: '#ffb3c1' },
  ],
  heartEmpty: [{ d: HEART, fill: '#3a3150', stroke: INK, w: 1.3 }],
  dice: [
    { d: R(3, 3, 18, 18, 4), fill: '#ffffff', stroke: INK, w: 1.4 },
    { d: [C(8, 8, 1.7), C(16, 8, 1.7), C(12, 12, 1.7), C(8, 16, 1.7), C(16, 16, 1.7)].join(''), fill: INK },
  ],
  map: [
    { d: P([[2.5, 5], [8.5, 3], [15.5, 5], [21.5, 3], [21.5, 19], [15.5, 21], [8.5, 19], [2.5, 21]]), fill: '#8fe0b4', stroke: '#1d5b45', w: 1.3 },
    { d: 'M8.5 3V19M15.5 5V21', stroke: '#1d5b45', w: 1 },
    { d: 'M16.5 9.5l3 3m0-3l-3 3', stroke: '#ff3b5c', w: 1.8 },
    { d: 'M5 16c2-1 3-4 6-4', stroke: '#ffffff', w: 1.2 },
  ],
  trophy: [
    { d: 'M5 6H2.5v1.5A4.5 4.5 0 0 0 7 12M19 6h2.5v1.5A4.5 4.5 0 0 1 17 12', stroke: '#e0a100', w: 1.8 },
    { d: 'M6 3h12v5.5a6 6 0 0 1-12 0Z', fill: '#ffd23f', stroke: '#9a6a00', w: 1.3 },
    { d: R(10.5, 13.5, 3, 3.5, 0.5), fill: '#e0a100' },
    { d: R(7, 17, 10, 4, 1.2), fill: '#c98a00', stroke: '#7a4a00', w: 1 },
    { d: R(8.2, 4.5, 2, 5, 1), fill: '#fff3a0' },
  ],
  door: [
    { d: R(5.5, 2, 13, 20, 2), fill: '#b07a43', stroke: '#5b3a1e', w: 1.4 },
    { d: R(8, 4.5, 8, 6, 1), fill: '#8a5a2b' },
    { d: R(8, 12.5, 8, 7, 1), fill: '#8a5a2b' },
    { d: C(15.6, 12, 1.2), fill: '#ffd23f' },
  ],
  gamepad: [
    { d: 'M6 8h12a4.5 4.5 0 0 1 4.5 4.5v1.5a4 4 0 0 1-7.2 2.4L14 15h-4l-1.3 1.4A4 4 0 0 1 1.5 14v-1.5A4.5 4.5 0 0 1 6 8Z', fill: '#6c5ce7', stroke: '#2a1f6b', w: 1.3 },
    { d: R(4.5, 11.3, 5, 1.6, 0.4) + R(6.2, 9.6, 1.6, 5, 0.4), fill: '#ffffff' },
    { d: C(16.5, 11, 1.3), fill: '#ff6b7a' },
    { d: C(19, 13, 1.3), fill: '#ffd23f' },
  ],
  joystick: [
    { d: R(4, 16, 16, 5.5, 2), fill: '#3a3150', stroke: INK, w: 1.2 },
    { d: R(11, 7, 2, 10, 1), fill: '#9aa3ad' },
    { d: C(12, 6, 3.4), fill: '#ff3b5c', stroke: '#7a1020', w: 1 },
    { d: C(11, 5, 1), fill: '#ffb3c1' },
  ],
  tv: [
    { d: 'M8 21.5l2-3.5M16 21.5l-2-3.5', stroke: INK, w: 1.6 },
    { d: R(2, 4.5, 20, 14, 2.2), fill: '#3a3150', stroke: INK, w: 1.3 },
    { d: R(4, 6.5, 16, 10, 1), fill: '#6fd3ff' },
    { d: 'M6 9l3-1.5', stroke: '#ffffff', w: 1.2 },
  ],
  vibrate: [...PHONE, { d: 'M4.5 8v8M2 10v4M19.5 8v8M22 10v4', stroke: '#ffd23f', w: 1.6 }],
  phone: PHONE,
  noPhone: [...PHONE, { d: C(12, 12, 9.5), stroke: '#ff3b5c', w: 2 }, { d: 'M5.5 18.5l13-13', stroke: '#ff3b5c', w: 2 }],
  moneyBag: [
    { d: C(12, 15, 7), fill: '#d9a441', stroke: '#7a4a00', w: 1.3 },
    { d: P([[9, 8.5], [15, 8.5], [13.5, 5], [10.5, 5]]), fill: '#d9a441', stroke: '#7a4a00', w: 1.2 },
    { d: R(8.5, 7.5, 7, 1.8, 0.8), fill: '#7a4a00' },
    { d: C(12, 15, 3), fill: '#ffd23f', stroke: '#9a6a00', w: 0.8 },
  ],
  cart: [
    { d: 'M1.5 3.5h3l2.3 11', stroke: INK, w: 1.6 },
    { d: P([[5, 6], [21, 6], [18.8, 14.5], [6.8, 14.5]]), fill: '#1fd1c1', stroke: '#0e6b63', w: 1.3 },
    { d: 'M10 6.5v7.5M14.5 6.5v7.5', stroke: '#0e6b63', w: 0.9 },
    { d: C(9, 18.5, 1.9) + C(17, 18.5, 1.9), fill: '#3a3150' },
  ],
  bank: [
    { d: P([[2, 9], [12, 3], [22, 9]]), fill: '#e0a100', stroke: '#7a4a00', w: 1.2 },
    { d: R(4, 10, 2.5, 7.5, 0.3) + R(8.5, 10, 2.5, 7.5, 0.3) + R(13, 10, 2.5, 7.5, 0.3) + R(17.5, 10, 2.5, 7.5, 0.3), fill: '#f2e6c9', stroke: '#9a8a6a', w: 0.6 },
    { d: R(2, 18, 20, 3, 0.6), fill: '#c9b38a', stroke: '#7a6a4a', w: 1 },
    { d: C(12, 7, 1.3), fill: '#fff3a0' },
  ],
  ghost: [
    { d: 'M5 21V10a7 7 0 0 1 14 0v11l-2.3-2-2.3 2-2.4-2-2.4 2-2.3-2Z', fill: '#f4f0ff', stroke: '#6a5a9a', w: 1.3 },
    { d: E(9.5, 10, 1.3, 1.8) + E(14.5, 10, 1.3, 1.8), fill: INK },
    { d: E(12, 14.5, 1.5, 1.2), fill: '#6a5a9a' },
  ],
  lock: [
    { d: 'M8 10.5V7a4 4 0 0 1 8 0v3.5', stroke: '#9aa3ad', w: 2.4 },
    { d: R(5, 10, 14, 11.5, 2.2), fill: '#ffd23f', stroke: '#9a6a00', w: 1.3 },
    { d: C(12, 14.6, 1.6) + R(11.3, 15, 1.4, 3.3, 0.5), fill: '#7a4a00' },
  ],
  bomb: [
    { d: 'M15.5 8.5l3-3', stroke: '#c9a26b', w: 1.8 },
    { d: C(11, 14, 7.5), fill: '#2b2b38', stroke: INK, w: 1 },
    { d: C(8.4, 11.4, 1.7), fill: '#6a6a80' },
    { d: STAR(19.2, 4.3, 2.8, 1.1, 6), fill: '#ffb020' },
  ],
  burst: [
    { d: STAR(12, 12, 11, 5.2, 10), fill: '#ff8c1a', stroke: '#9a3a00', w: 1.1 },
    { d: STAR(12, 12, 6.2, 3.1, 8), fill: '#ffe14d' },
  ],
  target: [
    { d: C(12, 12, 10), fill: '#ff3b5c', stroke: '#7a1020', w: 1 },
    { d: C(12, 12, 7), fill: '#ffffff' },
    { d: C(12, 12, 4.2), fill: '#ff3b5c' },
    { d: C(12, 12, 1.7), fill: '#ffffff' },
  ],
  check: [{ d: 'M4.5 12.5l5 5L19.5 6.5', stroke: '#4cd964', w: 3.4 }],
  checkBox: [
    { d: R(2.5, 2.5, 19, 19, 5), fill: '#4cd964', stroke: '#1f7a3a', w: 1.2 },
    { d: 'M7 12.5l3.5 3.5L17 8.5', stroke: '#ffffff', w: 2.8 },
  ],
  cross: [{ d: 'M6 6l12 12M18 6L6 18', stroke: '#ff3b5c', w: 3.6 }],
  up: [{ d: P(ARROW), fill: '#4cd964', stroke: INK, w: 1.3 }],
  right: [{ d: P(rot(ARROW, 1)), fill: '#ffd23f', stroke: INK, w: 1.3 }],
  down: [{ d: P(rot(ARROW, 2)), fill: '#ff6b7a', stroke: INK, w: 1.3 }],
  left: [{ d: P(rot(ARROW, 3)), fill: '#3fa7ff', stroke: INK, w: 1.3 }],
  chart: [
    { d: R(3.5, 13, 4.5, 8, 1), fill: '#3fa7ff', stroke: '#1d4f8a', w: 0.9 },
    { d: R(9.75, 8, 4.5, 13, 1), fill: '#4cd964', stroke: '#1f7a3a', w: 0.9 },
    { d: R(16, 3.5, 4.5, 17.5, 1), fill: '#ffd23f', stroke: '#9a6a00', w: 0.9 },
  ],
  gear: [
    { d: STAR(12, 12, 10.5, 8, 8), fill: '#b8c0ca', stroke: '#3a3150', w: 1.2 },
    { d: C(12, 12, 6.2), fill: '#9aa3ad' },
    { d: C(12, 12, 2.8), fill: '#3a3150' },
  ],
  globe: [
    { d: C(12, 12, 10), fill: '#3fa7ff', stroke: '#1d4f8a', w: 1.3 },
    { d: 'M5 8c2-1 4 0 4 2s-3 2-3 4 2 3 1 5M14 4c0 2 3 2 3 4s-2 3 0 5 3 1 3 0M13 16c1 0 3 1 3 3', stroke: '#4cd964', w: 2.4 },
  ],
  eyes: [
    { d: E(8, 12, 4.2, 5.4) + E(16, 12, 4.2, 5.4), fill: '#ffffff', stroke: INK, w: 1.2 },
    { d: C(9, 13, 2) + C(17, 13, 2), fill: INK },
  ],
  confetti: [
    { d: P([[3, 21], [8.5, 8.5], [15.5, 15.5]]), fill: '#ffd23f', stroke: '#9a6a00', w: 1.2 },
    { d: C(15, 5, 1.4), fill: '#ff3b5c' },
    { d: C(19.5, 9.5, 1.4), fill: '#3fa7ff' },
    { d: C(11.5, 3.5, 1.1), fill: '#4cd964' },
    { d: C(20, 16, 1.2), fill: '#b98cff' },
    { d: 'M13 9c1-2 3-2 4-4M15 13c2-1 3 0 5-1', stroke: '#ff6fb5', w: 1.4 },
  ],
  sparkle: [
    { d: STAR(10, 12, 8.5, 2.2, 4), fill: '#ffd23f', stroke: '#9a6a00', w: 0.8 },
    { d: STAR(18.5, 5, 3.5, 1, 4), fill: '#fff3a0' },
    { d: STAR(18.5, 18.5, 2.8, 0.8, 4), fill: '#fff3a0' },
  ],
  snail: [
    { d: 'M2.5 19.5h17a2 2 0 0 0 1-1.5H6l-3.5 1.5Z', fill: '#b7e07a', stroke: '#5a7a20', w: 1 },
    { d: 'M5 18V13M7 18v-4.5', stroke: '#7a9a40', w: 1.3 },
    { d: C(13.5, 12.5, 6.3), fill: '#e0a160', stroke: '#7a4a00', w: 1.2 },
    { d: 'M13.5 12.5m-3 0a3 3 0 1 0 3-3 1.5 1.5 0 1 0 1.5 1.5', stroke: '#9a5a20', w: 1.3 },
  ],
  bolt: [{ d: P([[13.5, 1.5], [4.5, 13.5], [11, 13.5], [9, 22.5], [19.5, 9.5], [13, 9.5], [15.5, 1.5]]), fill: '#ffd23f', stroke: '#9a6a00', w: 1.3 }],
  magnet: [
    { d: 'M4.5 3.5h5v8.5a2.5 2.5 0 0 0 5 0V3.5h5V12a7.5 7.5 0 0 1-15 0Z', fill: '#ff3b5c', stroke: '#7a1020', w: 1.3 },
    { d: R(4.5, 3.5, 5, 3.2, 0.3) + R(14.5, 3.5, 5, 3.2, 0.3), fill: '#d9dde3' },
  ],
  gem: [
    { d: P([[6, 3.5], [18, 3.5], [22, 9], [12, 21], [2, 9]]), fill: '#5fd3ff', stroke: '#1d6b8a', w: 1.3 },
    { d: 'M2 9h20M8 3.5L12 21M16 3.5L12 21M8 3.5L6.5 9M16 3.5l1.5 5.5', stroke: '#bdf0ff', w: 0.8 },
  ],
  crystal: [
    { d: R(6, 17.5, 12, 4, 1.6), fill: '#8a5a2b', stroke: '#5b3a1e', w: 1 },
    { d: C(12, 10.5, 8), fill: '#b98cff', stroke: '#5a2f9a', w: 1.3 },
    { d: C(9, 7.5, 2), fill: '#e9d9ff' },
  ],
  gift: [
    { d: R(3, 9.5, 18, 11.5, 1.5), fill: '#ff6fb5', stroke: '#8a1f5a', w: 1.2 },
    { d: R(2, 7, 20, 4, 1), fill: '#ff8fc8', stroke: '#8a1f5a', w: 1.2 },
    { d: R(10.5, 7, 3, 14, 0), fill: '#ffd23f' },
    { d: E(9, 5.2, 2.6, 1.8) + E(15, 5.2, 2.6, 1.8), fill: '#ffd23f', stroke: '#9a6a00', w: 0.9 },
  ],
  chest: [
    { d: R(3, 9, 18, 11.5, 1.8), fill: '#a8743f', stroke: '#5b3a1e', w: 1.3 },
    { d: R(3, 5.5, 18, 5.5, 2.6), fill: '#c98a50', stroke: '#5b3a1e', w: 1.3 },
    { d: R(3, 10.3, 18, 1.6, 0), fill: '#5b3a1e' },
    { d: R(10.3, 9.5, 3.4, 4.4, 0.7), fill: '#ffd23f', stroke: '#9a6a00', w: 0.8 },
  ],
  drop: [
    { d: 'M12 2.5C9 8 6 11 6 15a6 6 0 0 0 12 0c0-4-3-7-6-12.5Z', fill: '#3fa7ff', stroke: '#1d4f8a', w: 1.3 },
    { d: C(9.5, 15, 1.3), fill: '#bfe6ff' },
  ],
  sheep: [
    { d: R(7.5, 16, 1.8, 5, 0.6) + R(14.5, 16, 1.8, 5, 0.6), fill: '#3a3340' },
    { d: C(7.5, 12, 4) + C(12.5, 9.5, 4.5) + C(16.5, 12.5, 4) + C(11, 14.5, 4), fill: '#ffffff', stroke: '#9aa3ad', w: 0.9 },
    { d: E(19.6, 10.8, 2.5, 2.8), fill: '#3a3340' },
  ],
  skull: [
    { d: R(8, 14, 8, 7, 2), fill: '#f4f0ff', stroke: '#3a3150', w: 1.2 },
    { d: C(12, 10, 8), fill: '#f4f0ff', stroke: '#3a3150', w: 1.2 },
    { d: C(9, 10.5, 2.2) + C(15, 10.5, 2.2), fill: INK },
    { d: 'M10 18v2.5M12 18v2.5M14 18v2.5', stroke: '#3a3150', w: 1 },
  ],
  refresh: [
    { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3', stroke: '#3fa7ff', w: 2.8 },
    { d: P([[20.5, 2.5], [20.5, 9.5], [13.5, 9.5]]), fill: '#3fa7ff' },
  ],
  speaker: [
    { d: SPEAKER, fill: '#d9dde3', stroke: '#3a3150', w: 1.2 },
    { d: 'M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11', stroke: '#3fa7ff', w: 1.9 },
  ],
  mute: [
    { d: SPEAKER, fill: '#d9dde3', stroke: '#3a3150', w: 1.2 },
    { d: 'M15 9l6 6M21 9l-6 6', stroke: '#ff3b5c', w: 2.2 },
  ],
  music: [{ d: 'M9 18a3 3 0 1 1-2-2.8V5.5l12-2.5v12a3 3 0 1 1-2-2.8V6.3l-8 1.6Z', fill: '#b98cff', stroke: '#5a2f9a', w: 1.1 }],
  mic: [
    { d: 'M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8', stroke: '#3a3150', w: 1.8 },
    { d: R(8.8, 2.5, 6.4, 12, 3.2), fill: '#9aa3ad', stroke: '#3a3150', w: 1.2 },
  ],
  bulb: [
    { d: R(9.5, 15.5, 5, 5, 1.2), fill: '#9aa3ad', stroke: '#3a3150', w: 1 },
    { d: C(12, 9.5, 6.5), fill: '#ffd23f', stroke: '#9a6a00', w: 1.3 },
    { d: C(10, 7.5, 1.6), fill: '#fff6c2' },
  ],
  fast: [{ d: P([[2.5, 6], [11, 12], [2.5, 18]]) + P([[12, 6], [20.5, 12], [12, 18]]), fill: '#3fa7ff', stroke: '#1d4f8a', w: 1.1 }],
  picture: [
    { d: R(3, 4.5, 18, 15, 1.6), fill: '#ffffff', stroke: '#3a3150', w: 1.3 },
    { d: P([[5, 17.5], [10, 10], [13.5, 14.5], [15.5, 12], [19, 17.5]]), fill: '#4cd964' },
    { d: C(16, 8.5, 1.7), fill: '#ffd23f' },
  ],
  robot: [
    { d: 'M12 7V4', stroke: '#3a3150', w: 1.4 },
    { d: C(12, 3.5, 1.4), fill: '#ff3b5c' },
    { d: R(4.5, 7, 15, 12.5, 3.2), fill: '#b8c0ca', stroke: '#3a3150', w: 1.3 },
    { d: C(9.5, 12, 1.9) + C(14.5, 12, 1.9), fill: '#6fd3ff' },
    { d: R(9, 15.5, 6, 1.5, 0.6), fill: '#3a3150' },
  ],
  lever: [
    { d: 'M12 18L17 6', stroke: '#9aa3ad', w: 2.4 },
    { d: R(4, 17, 16, 4.5, 1.6), fill: '#8a5a2b', stroke: '#5b3a1e', w: 1.1 },
    { d: C(17.5, 5, 2.7), fill: '#ff3b5c', stroke: '#7a1020', w: 1 },
  ],
  hole: [
    { d: E(12, 14, 10, 5), fill: '#5b3a1e' },
    { d: E(12, 14.5, 8, 3.8), fill: INK },
  ],
  rail: [
    { d: R(4.5, 5, 15, 2, 0.5) + R(4, 11, 16, 2, 0.5) + R(3.5, 17, 17, 2, 0.5), fill: '#a8743f' },
    { d: 'M8 2L5.5 22M16 2l2.5 20', stroke: '#9aa3ad', w: 1.9 },
  ],
  swords: [
    { d: 'M4 4l12 12M20 4L8 16', stroke: '#d9dde3', w: 2.6 },
    { d: 'M13.5 18.5l5-5M5.5 13.5l5 5', stroke: '#a8743f', w: 2.4 },
  ],
  glove: [
    { d: R(8, 15.5, 9.5, 5.5, 1.5), fill: '#ffffff', stroke: '#9aa3ad', w: 1 },
    { d: C(7.5, 12, 3), fill: '#ff3b5c', stroke: '#7a1020', w: 1 },
    { d: C(13.5, 10, 6.8), fill: '#ff3b5c', stroke: '#7a1020', w: 1.2 },
    { d: C(11.5, 7.5, 1.6), fill: '#ffb3c1' },
  ],
  trap: [
    { d: 'M5.5 15.5c2-6.5 11-6.5 13 0', stroke: '#9aa3ad', w: 2 },
    { d: R(3, 15, 18, 5.5, 1.2), fill: '#a8743f', stroke: '#5b3a1e', w: 1.2 },
    { d: P([[13.5, 10], [19.5, 13], [13.5, 14]]), fill: '#ffd23f', stroke: '#9a6a00', w: 0.8 },
  ],
  devil: [
    { d: P([[5, 9], [3.5, 2.5], [9.5, 6]]) + P([[19, 9], [20.5, 2.5], [14.5, 6]]), fill: '#7b3fd1', stroke: '#3a1a6b', w: 1 },
    { d: C(12, 13, 8.3), fill: '#7b3fd1', stroke: '#3a1a6b', w: 1.2 },
    { d: P([[7.5, 10.5], [10.8, 12], [7.8, 12.6]]) + P([[16.5, 10.5], [13.2, 12], [16.2, 12.6]]), fill: '#ffd23f' },
    { d: 'M8 16q4 3.5 8 0', stroke: '#ffd23f', w: 1.6 },
  ],
  flag: [
    { d: E(8, 21, 4, 1.3), fill: '#3a3150' },
    { d: 'M7.5 2.5V21', stroke: '#3a3150', w: 2 },
    { d: P([[8.5, 3], [19.5, 7], [8.5, 11]]), fill: '#ff3b5c', stroke: '#7a1020', w: 1 },
  ],
  baseball: [
    { d: C(12, 12, 9.5), fill: '#ffffff', stroke: '#9aa3ad', w: 1.2 },
    { d: 'M6.5 5.5c3 3 3 10 0 13M17.5 5.5c-3 3-3 10 0 13', stroke: '#ff3b5c', w: 1.3 },
  ],
  tennis: [
    { d: C(12, 12, 9.5), fill: '#d7f04a', stroke: '#7a9a10', w: 1.2 },
    { d: 'M6 4.5c3.5 3.5 3.5 11.5 0 15M18 4.5c-3.5 3.5-3.5 11.5 0 15', stroke: '#ffffff', w: 1.6 },
  ],
  pin: [
    { d: 'M12 2a3 3 0 0 1 2 5.2c-1 1.8 3 5.5 3 9.6a5 5 0 0 1-10 0c0-4.1 4-7.8 3-9.6A3 3 0 0 1 12 2Z', fill: '#ffffff', stroke: '#3a3150', w: 1.2 },
    { d: R(9.6, 8.5, 4.8, 1.5, 0.4) + R(9.4, 10.6, 5.2, 1.5, 0.4), fill: '#ff3b5c' },
  ],
  fire: [
    { d: 'M12 2c1 4 6.5 6 6.5 12a6.5 6.5 0 0 1-13 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5.5.5-8Z', fill: '#ff6a1a', stroke: '#9a2a00', w: 1.2 },
    { d: 'M12 12c1 2 3.3 3 3.3 5.2a3.3 3.3 0 0 1-6.6 0c0-2 2.3-3.2 3.3-5.2Z', fill: '#ffd23f' },
  ],
  warning: [
    { d: P([[12, 2.5], [22.5, 20.5], [1.5, 20.5]]), fill: '#ffd23f', stroke: '#9a6a00', w: 1.3 },
    { d: R(11, 8.5, 2, 6.5, 1) + C(12, 17.5, 1.2), fill: INK },
  ],
  bang: [{ d: R(9.5, 2, 5, 13, 2.5) + C(12, 19.5, 2.6), fill: '#ff3b5c', stroke: '#7a1020', w: 1 }],
  dotRed: [{ d: C(12, 12, 8), fill: '#ff3b5c', stroke: '#7a1020', w: 1.2 }],
  dotBlue: [{ d: C(12, 12, 8), fill: '#2f7dff', stroke: '#173f8a', w: 1.2 }],
  ticket: [
    { d: R(2, 6, 20, 12, 2), fill: '#ff6fb5', stroke: '#8a1f5a', w: 1.2 },
    { d: 'M15.5 7v2M15.5 11v2M15.5 15v2', stroke: '#ffffff', w: 1.2 },
    { d: STAR(9, 12, 3.2, 1.4), fill: '#ffd23f' },
  ],
  mirror: [
    { d: R(11, 17.5, 2, 4.5, 0.8), fill: '#a8743f' },
    { d: E(12, 10, 6.5, 8), fill: '#bfe9ff', stroke: '#a8743f', w: 2 },
    { d: 'M9 7l3-2M9 10l5-4', stroke: '#ffffff', w: 1.1 },
  ],
  car: [
    { d: P([[6.5, 10], [9, 5.5], [15, 5.5], [17.5, 10]]), fill: '#ffd23f', stroke: '#9a6a00', w: 1.1 },
    { d: R(2.5, 10, 19, 7, 2.2), fill: '#ffd23f', stroke: '#9a6a00', w: 1.2 },
    { d: C(7, 17.5, 2.2) + C(17, 17.5, 2.2), fill: INK },
  ],
  traffic: [
    { d: R(8, 2, 8, 20, 2.4), fill: '#3a3150', stroke: INK, w: 1 },
    { d: C(12, 6, 2), fill: '#ff3b5c' },
    { d: C(12, 12, 2), fill: '#ffd23f' },
    { d: C(12, 18, 2), fill: '#4cd964' },
  ],
  palm: [
    { d: 'M3 21.5a9 2 0 0 1 18 0Z', fill: '#f2d58b' },
    { d: 'M12 21c0-6 1-10 3-13', stroke: '#a8743f', w: 2.2 },
    { d: 'M15 8c-3-3-8-2-10.5 1C8.5 8 11.5 8 15 8Zm0 0c2-3.2 6-4 8.5-2-3 0-6 1-8.5 2Zm0 0c1 2.5 1 5-1 7 0-2.5.2-5 1-7Z', fill: '#4cd964', stroke: '#1f7a3a', w: 0.8 },
  ],
  castle: [
    { d: R(5.5, 9, 13, 12, 0.5), fill: '#c9ccd4', stroke: '#3a3150', w: 1.1 },
    { d: R(2.5, 5, 5, 16, 0.5) + R(16.5, 5, 5, 16, 0.5), fill: '#d9dde3', stroke: '#3a3150', w: 1.1 },
    { d: 'M10 21v-4a2 2 0 0 1 4 0v4Z', fill: '#5b3a1e' },
    { d: P([[19, 5], [19, 1.5], [22, 2.5]]), fill: '#ff3b5c' },
  ],
  city: [
    { d: R(2.5, 9, 6, 12.5, 0.5) + R(16.5, 11, 5, 10.5, 0.5), fill: '#3a3150' },
    { d: R(9.5, 4, 6, 17.5, 0.5), fill: '#4a3f6b' },
    { d: R(11, 6, 1.4, 1.4) + R(13, 9, 1.4, 1.4) + R(11, 12, 1.4, 1.4) + R(4, 11.5, 1.4, 1.4) + R(18, 13.5, 1.4, 1.4), fill: '#ffd23f' },
  ],
  tornado: [{ d: 'M3 4h18M5 8h14M7.5 12h9M9.5 16h5M11 20h2', stroke: '#9aa3ad', w: 2.4 }],
  cancel: [{ d: C(12, 12, 9) + 'M5.6 18.4L18.4 5.6', stroke: '#ff3b5c', w: 2.8 }],
  medal: [
    { d: P([[7.5, 2], [11, 10], [13, 10], [16.5, 2]]), fill: '#3fa7ff', stroke: '#1d4f8a', w: 0.9 },
    { d: C(12, 15.5, 6.3), fill: '#ffd23f', stroke: '#9a6a00', w: 1.2 },
    { d: STAR(12, 15.7, 3.3, 1.4), fill: '#fff3a0' },
  ],
  backpack: [
    { d: 'M9 6.5a3 3 0 0 1 6 0', stroke: '#9a4a10', w: 1.6 },
    { d: R(5, 6, 14, 15.5, 4), fill: '#ff8c3a', stroke: '#9a4a10', w: 1.2 },
    { d: R(8, 13, 8, 5, 1.5), fill: '#e06a1a' },
  ],
  dpad: [{ d: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z', fill: '#d9dde3', stroke: INK, w: 1.2 }],
  timer: [
    { d: R(10, 1.5, 4, 2.6, 0.6), fill: '#3a3150' },
    { d: C(12, 13, 8.3), fill: '#ffffff', stroke: '#3a3150', w: 1.4 },
    { d: 'M12 13V8M12 13l3 2', stroke: '#ff3b5c', w: 1.8 },
  ],
  hourglass: [{ d: P([[6, 2], [18, 2], [18, 4], [13, 12], [18, 20], [18, 22], [6, 22], [6, 20], [11, 12], [6, 4]]), fill: '#ffd23f', stroke: '#9a6a00', w: 1.2 }],
  fish: [
    { d: P([[17.5, 12], [22.5, 7.5], [22.5, 16.5]]), fill: '#3fa7ff', stroke: '#1d4f8a', w: 1 },
    { d: 'M2.5 12c4-6.5 12-6.5 15.5 0-3.5 6.5-11.5 6.5-15.5 0Z', fill: '#5fc3ff', stroke: '#1d4f8a', w: 1.2 },
    { d: C(7, 11, 1.1), fill: INK },
  ],
  boot: [{ d: 'M6.5 2.5h6.5v10l6 2.5c1.5.6 2.5 2 2.5 3.5v2H4.5V3.5Z', fill: '#8a5a2b', stroke: '#4a2a10', w: 1.2 }],
  wave: [
    { d: 'M2 15c3-3 5-3 8 0s5 3 8 0 3-2 4-2', stroke: '#3fa7ff', w: 2.2 },
    { d: 'M2 19.5c3-3 5-3 8 0s5 3 8 0 3-2 4-2', stroke: '#1d6b8a', w: 2.2 },
    { d: 'M5 10c2-4 7-5 10-2', stroke: '#bfe6ff', w: 1.8 },
  ],
};

/** Emoji (sem o seletor de variação) → ícone. */
const EMOJI: Record<string, string> = {
  '🪙': 'coin', '⭐': 'star', '🌟': 'star', '❤': 'heart', '💖': 'heart', '🖤': 'heartEmpty', '🎲': 'dice', '🗺': 'map',
  '🏆': 'trophy', '🚪': 'door', '🎮': 'gamepad', '🕹': 'joystick', '📺': 'tv', '📳': 'vibrate', '📱': 'phone',
  '📵': 'noPhone', '💰': 'moneyBag', '🛒': 'cart', '🏦': 'bank', '👻': 'ghost', '🔒': 'lock', '💣': 'bomb',
  '💥': 'burst', '🎯': 'target', '✔': 'check', '✅': 'checkBox', '❌': 'cross', '✖': 'cross', '⬆': 'up',
  '⬇': 'down', '⬅': 'left', '➡': 'right', '📊': 'chart', '⚙': 'gear', '🌍': 'globe', '👀': 'eyes',
  '🎉': 'confetti', '👋': 'sparkle', '✨': 'sparkle', '💫': 'sparkle', '🐌': 'snail', '⚡': 'bolt',
  '💪': 'bolt', '🏃': 'bolt', '🧲': 'magnet', '💎': 'gem', '🔮': 'crystal', '🎁': 'gift', '🧰': 'chest',
  '💦': 'drop', '💧': 'drop', '🌊': 'wave', '🐑': 'sheep', '💀': 'skull', '😵': 'skull', '🔁': 'refresh',
  '🔄': 'refresh', '🔊': 'speaker', '🔇': 'mute', '🎵': 'music', '🎙': 'mic', '💡': 'bulb', '⏩': 'fast',
  '🖼': 'picture', '🤖': 'robot', '🎚': 'lever', '🕳': 'hole', '🛤': 'rail', '🛗': 'rail', '🎢': 'rail',
  '🎡': 'rail', '⚔': 'swords', '🥊': 'glove', '🪤': 'trap', '😈': 'devil', '🦹': 'devil', '⛳': 'flag',
  '🏌': 'flag', '🚩': 'flag', '⚾': 'baseball', '🎾': 'tennis', '🎳': 'pin', '🔥': 'fire', '🌋': 'fire',
  '⚠': 'warning', '❗': 'bang', '❕': 'bang', '🔴': 'dotRed', '🔵': 'dotBlue', '🎟': 'ticket', '🎫': 'ticket',
  '🪞': 'mirror', '🚕': 'car', '🚦': 'traffic', '🏝': 'palm', '🏖': 'palm', '🏰': 'castle', '🌃': 'city',
  '🌪': 'tornado', '🚫': 'cancel', '🏅': 'medal', '🎒': 'backpack', '✚': 'dpad', '⏱': 'timer',
  '⏳': 'hourglass', '⌛': 'hourglass', '🐟': 'fish', '🐠': 'fish', '🥾': 'boot', '🕸': 'warning',
  '☰': 'gear', '🛶': 'wave', '🎈': 'dotRed', '🍌': 'bolt', '🔥️': 'fire', '🌀': 'tornado', '🧱': 'castle',
  '🟩': 'checkBox', '🟢': 'checkBox', '😎': 'sparkle', '🙂': 'sparkle', '🎨': 'picture', '🎊': 'confetti',
  '🥇': 'medal', '🥈': 'medal', '🥉': 'medal', '💸': 'moneyBag', '🔔': 'bulb', '👑': 'trophy',
};

const KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length);
/** Encontra emojis conhecidos (com o seletor de variação opcional a seguir). */
export const EMOJI_RE = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?`, 'gu');

export function iconFor(emoji: string): string | undefined {
  return EMOJI[emoji.replace(/️/g, '')];
}

/** O ícone em SVG (string), para HTML. */
export function iconSvg(name: string, cls = 'ic'): string {
  const layers = ICONS[name];
  if (!layers) return '';
  const body = layers
    .map(
      (l) =>
        `<path d="${l.d}" fill="${l.fill ?? 'none'}"${l.stroke ? ` stroke="${l.stroke}" stroke-width="${l.w ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`,
    )
    .join('');
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

/** Só os caminhos (para pôr dentro de outro SVG, ex.: mapa do telemóvel). */
export function iconPaths(name: string): string {
  return iconSvg(name).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

const pathCache = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = pathCache.get(d);
  if (!p) pathCache.set(d, (p = new Path2D(d)));
  return p;
};

/** Desenha o ícone num canvas, com o canto superior esquerdo em (x, y) e lado `size`. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number): void {
  const layers = ICONS[name];
  if (!layers) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const l of layers) {
    const p = path2d(l.d);
    if (l.fill) {
      ctx.fillStyle = l.fill;
      ctx.fill(p);
    }
    if (l.stroke) {
      ctx.strokeStyle = l.stroke;
      ctx.lineWidth = l.w ?? 1.5;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}

/** Parte um texto em pedaços de texto e de ícones. */
export function splitRich(text: string): { text?: string; icon?: string }[] {
  const out: { text?: string; icon?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const icon = iconFor(m[1]!);
    if (!icon) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ icon });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Texto sem os emojis conhecidos (para medir/escrever onde não há ícones). */
export function hasIcons(text: string): boolean {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(text);
}

/**
 * Troca os emojis por ícones em todo o HTML dentro de `root` — agora e sempre que mudar
 * (textos novos, menus, placar…). Não mexe dentro de SVG, canvas, campos de texto nem scripts.
 */
export function installIconSwap(root: HTMLElement): void {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'svg', 'SVG', 'text', 'OPTION', 'TITLE']);
  const fix = (node: Node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        for (let p = n.parentNode; p && p !== node.parentNode; p = p.parentNode) {
          if (SKIP.has((p as Element).nodeName) || (p as Element).namespaceURI === 'http://www.w3.org/2000/svg') return NodeFilter.FILTER_REJECT;
        }
        EMOJI_RE.lastIndex = 0;
        return EMOJI_RE.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const found: Text[] = [];
    while (walker.nextNode()) found.push(walker.currentNode as Text);
    for (const t of found) {
      const parts = splitRich(t.nodeValue ?? '');
      if (!parts.some((p) => p.icon)) continue;
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (p.text) frag.append(p.text);
        else if (p.icon) {
          const span = document.createElement('span');
          span.className = 'ic-wrap';
          span.innerHTML = iconSvg(p.icon);
          frag.append(span);
        }
      }
      t.replaceWith(frag);
    }
  };
  fix(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') {
        if (m.target.parentNode) fix(m.target.parentNode);
      } else for (const n of m.addedNodes) if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) fix(n.nodeType === Node.TEXT_NODE ? (n.parentNode ?? n) : n);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
  if (!document.getElementById('ic-style')) {
    const st = document.createElement('style');
    st.id = 'ic-style';
    st.textContent = `.ic-wrap{display:inline-flex;vertical-align:-0.18em;line-height:1}.ic-wrap .ic{width:1.15em;height:1.15em;overflow:visible;filter:drop-shadow(0 1px 0 rgba(0,0,0,.25))}`;
    document.head.append(st);
  }
}
