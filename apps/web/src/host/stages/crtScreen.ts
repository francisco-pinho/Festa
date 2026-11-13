/**
 * Ecrã de televisão de tubo (sala de estar): o menu dos jogos é desenhado num canvas que passa
 * no vidro da própria TV, com o efeito das televisões antigas:
 *
 *   ligar:    ponto branco → linha horizontal → abre na vertical → chuvisco → imagem
 *   ligada:   linhas horizontais, cantos escuros, brilho a tremer de leve e uma faixa a rolar
 *   desligar: a imagem fecha numa linha → a linha encolhe até um ponto → o ponto apaga-se
 *
 * Desligada, o vidro volta ao material original do modelo (preto, com reflexos).
 */
import * as THREE from 'three';
import { sound } from '../audio/Sound';
import { FONT } from '../three/materials';
import type { MenuRequest } from '../ui/ScreenMenu';

export interface TvMenuView {
  req: MenuRequest;
  sel: number;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvRect;
uniform float time;
uniform vec2 size;
uniform float white;
uniform float bright;
uniform float halo;
uniform float noise;
uniform float lines;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // Posição no vidro: s em 0..1 (y para cima), p em -1..1.
  vec2 s = clamp((vUv - uvRect.xy) / (uvRect.zw - uvRect.xy), 0.0, 1.0);
  vec2 p = s * 2.0 - 1.0;
  // Feixe: retângulo de cantos suaves com o tamanho \`size\` (ponto → linha → ecrã cheio).
  vec2 sz = max(size, vec2(0.001));
  float e = mix(2.0, 16.0, clamp(max(sz.x, sz.y) * 4.0, 0.0, 1.0));
  vec2 a = abs(p) / sz;
  float beam = exp(-(pow(a.x, e) + pow(a.y, e)));
  // A imagem vem espremida dentro do feixe enquanto abre.
  vec2 q = p / min(sz, vec2(1.0));
  vec3 img = texture2D(map, q * 0.5 + 0.5).rgb;
  float inside = step(abs(q.x), 1.0) * step(abs(q.y), 1.0);
  vec3 col = mix(img * inside, vec3(1.0), white);
  // Chuvisco (neve) em grão grosso, a mudar a cada fotograma.
  float n = hash(floor(s * vec2(260.0, 200.0)) + floor(time * 40.0) * vec2(1.7, 9.2));
  col = mix(col, vec3(n * 0.9 + 0.05), noise);
  col *= beam * bright;
  // Brilho à volta do ponto/linha enquanto liga e desliga.
  vec2 hs = sz * 3.0 + 0.04;
  col += vec3(0.85, 0.9, 1.0) * halo * exp(-dot(p / hs, p / hs));
  // Linhas horizontais do tubo e uma faixa clara que rola devagar de baixo para cima.
  float sl = 0.5 + 0.5 * cos(s.y * 230.0 * 6.2831853);
  col *= mix(1.0, 0.7 + 0.3 * sl, lines);
  float band = fract(time * 0.11);
  col *= 1.0 + 0.07 * lines * exp(-pow((s.y - band) * 9.0, 2.0));
  // Cantos escurecidos (vidro curvo).
  float vig = pow(clamp(16.0 * s.x * s.y * (1.0 - s.x) * (1.0 - s.y), 0.0, 1.0), 0.28);
  col *= mix(0.3, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

type Phase = 'off' | 'on' | 'powering-on' | 'powering-off';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export class CrtScreen {
  /** 0 = desligada, 1 = ligada (para a luz que a TV deita na sala). */
  level = 0;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.ShaderMaterial;
  private phase: Phase = 'off';
  private phaseStart = -1;
  private now = 0;
  private view: TvMenuView | null = null;
  private flick = 1;

  constructor(
    private readonly screen: THREE.Mesh,
    private readonly offMaterial: THREE.Material | THREE.Material[],
    opts: { aspect: number; uvRect: [number, number, number, number] },
  ) {
    this.canvas.width = 1024;
    this.canvas.height = Math.round(1024 / opts.aspect);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      toneMapped: false,
      uniforms: {
        map: { value: this.texture },
        uvRect: { value: new THREE.Vector4(...opts.uvRect) },
        time: { value: 0 },
        size: { value: new THREE.Vector2(0, 0) },
        white: { value: 0 },
        bright: { value: 0 },
        halo: { value: 0 },
        noise: { value: 0 },
        lines: { value: 0 },
      },
    });
    this.draw();
  }

  /** Põe o ecrã ligado só para a placa gráfica o preparar (ver Engine.warmUp); `false` volta atrás. */
  preview(on: boolean): void {
    if (this.phase === 'off') this.screen.material = on ? this.material : this.offMaterial;
  }

  get isOn(): boolean {
    return this.phase === 'on' || this.phase === 'powering-on';
  }

  /** Liga a TV (estalo, ponto, linha, chuvisco e imagem). */
  powerOn(): void {
    if (this.isOn) return;
    this.phase = 'powering-on';
    this.phaseStart = this.now;
    this.screen.material = this.material;
    sound.play('tvOn');
  }

  /** Desliga (a imagem fecha numa linha e num ponto). Devolve quanto tempo demora. */
  powerOff(): number {
    if (!this.isOn) return 0;
    this.phase = 'powering-off';
    this.phaseStart = this.now;
    sound.play('tvOff');
    return 0.75;
  }

  /** O que passa na TV: um menu (ou null para o logótipo). */
  show(view: TvMenuView | null): void {
    this.view = view;
    this.draw();
  }

  update(time: number): void {
    this.now = time;
    const u = this.material.uniforms;
    u.time!.value = time;
    const t = this.phaseStart < 0 ? 0 : time - this.phaseStart;
    const size = u.size!.value as THREE.Vector2;
    // Tremor leve: o brilho oscila um nadinha e, de vez em quando, baixa por um instante.
    this.flick = 0.97 + Math.random() * 0.03 - (Math.random() < 0.004 ? 0.08 : 0);
    switch (this.phase) {
      case 'off':
        this.level = 0;
        return;
      case 'powering-on': {
        if (t < 0.1) {
          // Ponto branco ao centro.
          size.set(0.015, 0.015);
          u.white!.value = 1;
          u.bright!.value = lerp(0, 2, t / 0.1);
          u.halo!.value = lerp(0, 0.6, t / 0.1);
          u.noise!.value = 0;
        } else if (t < 0.3) {
          // Estica numa linha horizontal.
          size.set(lerp(0.015, 1, easeOut((t - 0.1) / 0.2)), 0.012);
          u.white!.value = 1;
          u.bright!.value = 2;
          u.halo!.value = 0.5;
        } else if (t < 0.55) {
          // Abre na vertical, já com chuvisco.
          const k = easeOut((t - 0.3) / 0.25);
          size.set(1, lerp(0.012, 1, k));
          u.white!.value = lerp(1, 0, k);
          u.noise!.value = 1;
          u.bright!.value = lerp(2, 1.4, k);
          u.halo!.value = lerp(0.5, 0, k);
        } else {
          // Chuvisco um instante e depois a imagem, com as linhas do tubo.
          const k = clamp01((t - 0.75) / 0.3);
          size.set(1, 1);
          u.white!.value = 0;
          u.halo!.value = 0;
          u.noise!.value = 1 - k;
          u.bright!.value = lerp(1.4, 1, (t - 0.55) / 0.5);
          if (t >= 1.05) this.phase = 'on';
        }
        u.lines!.value = clamp01((t - 0.3) / 0.4);
        this.level = clamp01(t / 0.5);
        break;
      }
      case 'on':
        size.set(1, 1);
        u.white!.value = 0;
        u.noise!.value = 0;
        u.halo!.value = 0;
        u.lines!.value = 1;
        u.bright!.value = this.flick;
        this.level = this.flick;
        break;
      case 'powering-off': {
        if (t < 0.12) {
          // A imagem fecha numa linha, a ficar branca.
          const k = easeOut(t / 0.12);
          size.set(1, lerp(1, 0.01, k));
          u.white!.value = k;
          u.bright!.value = lerp(1, 2.2, k);
          u.halo!.value = lerp(0, 0.5, k);
        } else if (t < 0.3) {
          // A linha encolhe até um ponto.
          size.set(lerp(1, 0.015, easeOut((t - 0.12) / 0.18)), 0.01);
          u.white!.value = 1;
          u.bright!.value = 2.2;
          u.halo!.value = 0.5;
        } else {
          // O ponto apaga-se devagar.
          const k = (t - 0.3) / 0.45;
          size.set(0.015, 0.01);
          u.white!.value = 1;
          u.bright!.value = lerp(2.2, 0, k);
          u.halo!.value = lerp(0.5, 0, k);
          if (t >= 0.75) {
            this.phase = 'off';
            this.screen.material = this.offMaterial;
          }
        }
        u.noise!.value = 0;
        u.lines!.value = clamp01(1 - t / 0.2);
        this.level = clamp01(1 - t / 0.3);
        break;
      }
    }
  }

  // ── Desenho do que passa na TV ──────────────────────────

  private draw(): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const bg = c.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.7);
    bg.addColorStop(0, '#3a2672');
    bg.addColorStop(1, '#120c26');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.textBaseline = 'middle';
    // Margem de segurança: a moldura da TV tapa um pouco das bordas do vidro.
    const mx = W * 0.09;
    const my = H * 0.1;
    const v = this.view;
    if (!v) {
      c.textAlign = 'center';
      c.font = `bold ${H * 0.2}px ${FONT}`;
      c.lineWidth = H * 0.02;
      c.strokeStyle = '#1d1433';
      c.strokeText('FESTA', W / 2, H * 0.45);
      c.fillStyle = '#ffd23f';
      c.fillText('FESTA', W / 2, H * 0.45);
      this.texture.needsUpdate = true;
      return;
    }
    const r = v.req;
    // Cabeçalho: quem escolhe e o título.
    c.textAlign = 'left';
    let x = mx;
    const hy = my + H * 0.05;
    if (r.name) {
      c.fillStyle = r.color ?? '#ffffff';
      c.beginPath();
      c.arc(x + H * 0.018, hy, H * 0.018, 0, Math.PI * 2);
      c.fill();
      x += H * 0.05;
      c.font = `bold ${H * 0.045}px ${FONT}`;
      c.fillStyle = '#ffffff';
      const name = `${r.name} · `;
      c.fillText(name, x, hy);
      x += c.measureText(name).width;
    }
    c.font = `bold ${H * 0.065}px ${FONT}`;
    c.fillStyle = '#ffd23f';
    c.fillText(r.title, x, hy);
    // Opções em grelha.
    const cols = Math.max(1, r.columns ?? 1);
    const rows = Math.ceil(r.options.length / cols);
    const top = my + H * 0.13;
    const bottom = H - my - H * 0.07;
    const gap = H * 0.012;
    const rowH = Math.min(H * 0.12, (bottom - top - gap * (rows - 1)) / rows);
    const colW = (W - mx * 2 - gap * (cols - 1)) / cols;
    const hasSub = r.options.some((o) => o.sub);
    r.options.forEach((o, i) => {
      const cx = mx + (i % cols) * (colW + gap);
      const cy = top + Math.floor(i / cols) * (rowH + gap);
      const sel = i === v.sel;
      c.globalAlpha = o.disabled ? 0.4 : 1;
      if (sel) {
        c.fillStyle = r.color ?? '#ffd23f';
        roundRect(c, cx, cy, colW, rowH, rowH * 0.18);
        c.fill();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(c, cx, cy, colW, rowH, rowH * 0.18);
        c.fill();
      }
      const pad = rowH * 0.3;
      let label = o.label;
      if (o.values) label += `   ◀ ${o.values[o.value ?? 0] ?? ''} ▶`;
      const labelSize = Math.min(rowH * (o.sub ? 0.38 : 0.46), H * 0.052);
      c.font = `bold ${labelSize}px ${FONT}`;
      c.fillStyle = sel ? '#1d1433' : '#ffffff';
      const ly = o.sub && hasSub ? cy + rowH * 0.36 : cy + rowH / 2;
      fitText(c, label, cx + pad, ly, colW - pad * 2);
      if (o.sub) {
        c.font = `${Math.min(rowH * 0.24, H * 0.03)}px ${FONT}`;
        c.fillStyle = sel ? 'rgba(29,20,51,0.85)' : 'rgba(255,255,255,0.65)';
        fitText(c, o.sub, cx + pad, cy + rowH * 0.72, colW - pad * 2);
      }
      c.globalAlpha = 1;
    });
    // Teclas por baixo.
    c.textAlign = 'center';
    c.font = `${H * 0.034}px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    const cur = r.options[v.sel];
    c.fillText(`Ⓐ ${cur?.values ? 'mudar' : 'escolher'} · ✚ mover${r.cancel !== undefined ? ' · Ⓑ voltar' : ''}`, W / 2, H - my - H * 0.015);
    this.texture.needsUpdate = true;
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Escreve o texto e, se não couber, encolhe-o na horizontal. */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, max: number): void {
  const w = c.measureText(text).width;
  if (w <= max) c.fillText(text, x, y);
  else c.fillText(text, x, y, max);
}
