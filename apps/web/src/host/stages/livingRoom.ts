/**
 * Sala de estar do ecrã inicial, no estilo dos bonecos (formas redondas e cheias, materiais «toon»):
 * soalho de tábuas, lambrim de madeira e papel de parede, janela ao entardecer com cortinas e um
 * raio de sol com pó a flutuar, sofá e cadeirões estofados com almofadas e manta, mesa de centro,
 * almofada no chão e puff, lareira de tijolo acesa (com faúlhas), alvo de dardos, mesa dos petiscos,
 * estante, candeeiro, plantas, quadros, luzinhas de festa e balões.
 *
 * Cabem 10 jogadores, cada um no seu sítio e a fazer alguma coisa: três no sofá, dois nos cadeirões,
 * dois no chão, um a jogar aos dardos, um a aquecer as mãos à lareira e um a petiscar.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CharacterAnim } from '../three/CharacterModel';
import { canvasTexture, mesh, toon, toonUnique } from '../three/materials';
import { pickProp, prop } from '../three/props';

/** Lugares por ordem de chegada: posição, para onde olha e o que está a fazer. */
export const ROOM_SEATS: { x: number; z: number; yaw: number; y?: number; anim: CharacterAnim }[] = [
  { x: 0, z: -5.55, yaw: 0, y: 0.66, anim: 'sit' },
  { x: -2.35, z: -5.55, yaw: 0.06, y: 0.66, anim: 'sit' },
  { x: 2.35, z: -5.55, yaw: -0.06, y: 0.66, anim: 'sit' },
  { x: -5.5, z: -3.05, yaw: 0.8, y: 0.62, anim: 'sit' },
  { x: 5.5, z: -3.05, yaw: -0.8, y: 0.62, anim: 'sit' },
  { x: -2.7, z: -1.15, yaw: 0.35, y: 0.32, anim: 'sit' },
  { x: 2.7, z: -1.15, yaw: -0.35, y: 0.6, anim: 'sit' },
  // De pé: dardos (alvo na parede de trás), lareira e mesa dos petiscos.
  { x: -6.7, z: -6.6, yaw: 2.62, anim: 'aim' },
  { x: 6.8, z: -6.7, yaw: 2.36, anim: 'warm' },
  { x: -7.3, z: -3.9, yaw: 0.9, anim: 'drink' },
];

/** Modelos usados na sala (carregar antes de a montar; sem eles usa as versões feitas à mão). */
export const ROOM_PROPS: readonly string[] = [
  'kaykit-furniture/lamp_standing',
  'kaykit-furniture/pictureframe_large_A',
  'kaykit-furniture/cactus_medium_A',
  'kaykit-furniture/table_low',
  'kaykit-restaurant/table_round_A_decorated',
  'kaykit-restaurant/food_burger',
  'q-props/Mug',
  'q-props/Vase_2',
  'q-props/Pot_1',
];

/** Televisão (canto da frente, à direita, virada para o sofá): onde aparece o menu dos jogos. */
const TV = { x: 9.9, z: 1.4, y: 2.85 };
const TV_YAW = Math.atan2(0 - TV.x, -3.6 - TV.z);
/** Vista da câmara de frente para o ecrã da televisão (o ecrã enche quase todo o ecrã do jogo). */
export const TV_VIEW = {
  pos: new THREE.Vector3(TV.x + Math.sin(TV_YAW) * 3.95, TV.y + 0.05, TV.z + Math.cos(TV_YAW) * 3.95),
  look: new THREE.Vector3(TV.x, TV.y, TV.z),
};

/** Ecrã da televisão: logótipo da festa a brilhar. */
function tvScreen(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 20, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, '#4b2f8a');
    g.addColorStop(1, '#160f2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.font = 'bold 120px Trebuchet MS, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1d1433';
    ctx.strokeText('FESTA', s / 2, s / 2 - 20);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('FESTA', s / 2, s / 2 - 20);
    ctx.font = 'bold 34px Trebuchet MS, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Ⓨ para começar', s / 2, s / 2 + 80);
  });
}

export interface LivingRoom {
  group: THREE.Group;
  update(time: number): void;
}

// ── Texturas ──────────────────────────────────────────────

function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Soalho: tábuas compridas desencontradas, com veios e nós. */
function planks(): THREE.CanvasTexture {
  const r = rand(7);
  const t = canvasTexture(512, (ctx, s) => {
    const rows = 8;
    const h = s / rows;
    for (let row = 0; row < rows; row++) {
      let x = -r() * s * 0.5;
      while (x < s) {
        const w = s * (0.35 + r() * 0.4);
        const tone = 0.85 + r() * 0.25;
        ctx.fillStyle = `rgb(${Math.round(196 * tone)},${Math.round(138 * tone)},${Math.round(84 * tone)})`;
        ctx.fillRect(x, row * h, w, h);
        // Veios
        ctx.strokeStyle = `rgba(110,62,28,${0.18 + r() * 0.15})`;
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) {
          const y0 = row * h + 6 + r() * (h - 12);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.bezierCurveTo(x + w * 0.3, y0 + (r() - 0.5) * 8, x + w * 0.7, y0 + (r() - 0.5) * 8, x + w, y0 + (r() - 0.5) * 4);
          ctx.stroke();
        }
        if (r() < 0.35) {
          ctx.fillStyle = 'rgba(90,50,20,0.45)';
          ctx.beginPath();
          ctx.ellipse(x + w * r(), row * h + h / 2, 5, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(70,40,18,0.7)';
        ctx.fillRect(x, row * h, 2, h);
        x += w;
      }
      ctx.fillStyle = 'rgba(70,40,18,0.7)';
      ctx.fillRect(0, row * h + h - 2, s, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.5, 2.5);
  return t;
}

/** Papel de parede às riscas com florinhas. */
function wallpaper(): THREE.CanvasTexture {
  const t = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#f3e3c3';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ead3a4';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 12, s);
    for (let x = 16; x < s; x += 32)
      for (let y = 16; y < s; y += 32) {
        ctx.fillStyle = 'rgba(205,110,90,0.45)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + 6 + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(230,180,70,0.8)';
        ctx.beginPath();
        ctx.arc(x + 6, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 2);
  return t;
}

/** Lambrim: painéis de madeira com moldura. */
function wainscot(): THREE.CanvasTexture {
  const t = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#9c6a40';
    ctx.fillRect(10, 14, s - 20, s - 28);
    ctx.strokeStyle = 'rgba(60,34,16,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 14, s - 20, s - 28);
    ctx.strokeStyle = 'rgba(255,220,170,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 18, s - 28, s - 36);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 1);
  return t;
}

/** Tecido (trama fina), para o sofá, cadeirões e almofadas. */
function fabric(color: string): THREE.MeshToonMaterial {
  const base = new THREE.Color(color);
  const t = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = base.getStyle();
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      ctx.fillStyle = `rgba(0,0,0,${i % 4 ? 0.05 : 0.09})`;
      ctx.fillRect(i, 0, 1, s);
      ctx.fillStyle = `rgba(255,255,255,${i % 4 ? 0.03 : 0.06})`;
      ctx.fillRect(0, i, s, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return toonUnique('#ffffff', { map: t });
}

/** Tijolo da lareira. */
function bricks(): THREE.CanvasTexture {
  const r = rand(21);
  const t = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#d8cbb8';
    ctx.fillRect(0, 0, s, s);
    const rows = 10;
    const h = s / rows;
    const w = s / 4;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? w / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const k = 0.8 + r() * 0.3;
        ctx.fillStyle = `rgb(${Math.round(176 * k)},${Math.round(92 * k)},${Math.round(66 * k)})`;
        ctx.fillRect(c * w + off + 2, row * h + 2, w - 4, h - 4);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 1.5);
  return t;
}

/** Tapete retangular com barra e losangos. */
function rugTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#a8343f';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(22, 22, s - 44, s - 44);
    ctx.fillStyle = '#2f5d8a';
    ctx.fillRect(40, 40, s - 80, s - 80);
    ctx.fillStyle = '#f6e7c8';
    for (let x = 80; x < s - 60; x += 70)
      for (let y = 80; y < s - 60; y += 70) {
        ctx.beginPath();
        ctx.moveTo(x, y - 22);
        ctx.lineTo(x + 22, y);
        ctx.lineTo(x, y + 22);
        ctx.lineTo(x - 22, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a8343f';
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = '#f6e7c8';
      }
  });
}

/** Lá fora, ao fim da tarde: céu laranja, sol, montes e árvores. */
function outside(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#6c8fe0');
    g.addColorStop(0.55, '#ffb37a');
    g.addColorStop(1, '#ffd9a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(s * 0.68, s * 0.62, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [cx, cy] of [[50, 50], [160, 36]] as const) {
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(cx + k * 14, cy + (k % 2) * 4, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#7a8fb8';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.78);
    for (let x = 0; x <= s; x += 16) ctx.lineTo(x, s * 0.72 + Math.sin(x * 0.03) * 14);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.fill();
    ctx.fillStyle = '#4f7a4a';
    ctx.fillRect(0, s * 0.86, s, s * 0.14);
    for (let x = 6; x < s; x += 26) {
      ctx.fillStyle = '#3c6a3e';
      ctx.beginPath();
      ctx.arc(x, s * 0.84, 12 + (x % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Alvo dos dardos. */
function dartboard(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2;
      const a1 = ((i + 1) / 20) * Math.PI * 2;
      for (const [r0, r1, col] of [
        [c * 0.95, c * 0.85, i % 2 ? '#2e8b47' : '#c8323a'],
        [c * 0.85, c * 0.55, i % 2 ? '#f3e6c8' : '#1d1d1d'],
        [c * 0.55, c * 0.48, i % 2 ? '#2e8b47' : '#c8323a'],
        [c * 0.48, c * 0.12, i % 2 ? '#f3e6c8' : '#1d1d1d'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(c, c, r0, a0, a1);
        ctx.arc(c, c, r1, a1, a0, true);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#2e8b47';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8323a';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.05, 0, Math.PI * 2);
    ctx.fill();
  });
}

function soft(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Planta num vaso: folhas compridas em leque, a sair do meio (como uma costela-de-adão). */
function pottedPlant(x: number, z: number, seed: number): THREE.Group {
  const r = rand(seed);
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.85, 16), toon('#c96a45'));
  pot.position.y = 0.42;
  const rim = mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 18), toon('#b35a38'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.85;
  const soil = mesh(new THREE.CircleGeometry(0.46, 16), toon('#4a3020'), { cast: false });
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.8;
  g.add(pot, rim, soil);
  const leafGeo = new THREE.SphereGeometry(0.3, 10, 6);
  leafGeo.scale(0.55, 0.06, 1);
  leafGeo.translate(0, 0, 0.28);
  const greens = ['#3f9d4a', '#4cad55', '#2f8a40'];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const len = 0.9 + r() * 0.7;
    const stem = mesh(new THREE.CylinderGeometry(0.02, 0.03, len, 5), toon('#2f7a3a'), { cast: false });
    const tilt = 0.35 + r() * 0.45;
    const pivot = new THREE.Group();
    pivot.position.y = 0.82;
    pivot.rotation.set(0, a, 0);
    stem.position.set(0, (len / 2) * Math.cos(tilt), (len / 2) * Math.sin(tilt));
    stem.rotation.x = tilt;
    const leaf = mesh(leafGeo, toon(greens[i % 3]!));
    leaf.position.set(0, len * Math.cos(tilt), len * Math.sin(tilt));
    leaf.rotation.x = tilt - 0.9;
    leaf.scale.setScalar(1.6 + r() * 0.8);
    pivot.add(stem, leaf);
    g.add(pivot);
  }
  g.position.set(x, 0, z);
  return g;
}

/** Estante de madeira com prateleiras, livros (de pé e deitados), uma caixa e uma jarra. */
function bookshelf(x: number, z: number): THREE.Group {
  const r = rand(5);
  const g = new THREE.Group();
  const woodM = toon('#7a4f2a');
  const W = 2.6;
  const H = 4.6;
  const D = 0.85;
  const back = mesh(new THREE.BoxGeometry(W, H, 0.08), toon('#5e3a1e'), { receive: true });
  back.position.set(0, H / 2, -D / 2 + 0.04);
  g.add(back);
  for (const sx of [-1, 1]) {
    const side = mesh(new THREE.BoxGeometry(0.12, H, D), woodM);
    side.position.set(sx * (W / 2 - 0.06), H / 2, 0);
    g.add(side);
  }
  const shelves = [0.12, 1.25, 2.35, 3.45, H - 0.06];
  for (const y of shelves) {
    const sh = mesh(new THREE.BoxGeometry(W, 0.1, D), woodM, { receive: true });
    sh.position.set(0, y, 0);
    g.add(sh);
  }
  const bookColors = ['#c8323a', '#2f5d8a', '#f2c14e', '#3f8f5a', '#8a4fb0', '#e86a5a', '#f6e7c8', '#1f6f7a'];
  for (let s = 0; s < 4; s++) {
    const y0 = shelves[s]! + 0.05;
    let bx = -W / 2 + 0.18;
    const end = W / 2 - 0.18;
    while (bx < end - 0.2) {
      if (r() < 0.12) {
        // Pilha de livros deitados.
        for (let k = 0; k < 3; k++) {
          const bk = mesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), toon(bookColors[Math.floor(r() * bookColors.length)]!));
          bk.position.set(bx + 0.28, y0 + 0.06 + k * 0.12, 0.05);
          bk.rotation.y = (r() - 0.5) * 0.3;
          g.add(bk);
        }
        bx += 0.65;
        continue;
      }
      if (r() < 0.08 && s > 0) {
        const vase = mesh(new THREE.SphereGeometry(0.2, 12, 10), toon('#5fa8c8'));
        vase.scale.y = 1.3;
        vase.position.set(bx + 0.22, y0 + 0.26, 0.05);
        g.add(vase);
        bx += 0.5;
        continue;
      }
      const w = 0.1 + r() * 0.08;
      const h = 0.62 + r() * 0.3;
      const bk = mesh(new THREE.BoxGeometry(w, h, 0.5 + r() * 0.1), toon(bookColors[Math.floor(r() * bookColors.length)]!));
      const lean = r() < 0.1 ? 0.25 : 0;
      bk.position.set(bx + w / 2, y0 + h / 2, 0.05);
      bk.rotation.z = -lean;
      g.add(bk);
      bx += w + 0.015 + lean * 0.3;
    }
  }
  const box = mesh(new THREE.BoxGeometry(0.8, 0.45, 0.6), toon('#d9a441'));
  box.position.set(-0.5, H + 0.22, 0);
  const globe = mesh(new THREE.SphereGeometry(0.3, 14, 10), toon('#3fa7ff'));
  globe.position.set(0.6, H + 0.42, 0);
  const gstand = mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.2, 10), toon('#3a2a1a'));
  gstand.position.set(0.6, H + 0.1, 0);
  g.add(box, globe, gstand);
  g.position.set(x, 0, z);
  return g;
}

const rbox = (w: number, h: number, d: number, r = 0.18) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.98);

function place(g: THREE.Object3D, o: THREE.Object3D | null, x: number, y: number, z: number, ry = 0): THREE.Object3D | null {
  if (!o) return null;
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

// ── Sala ──────────────────────────────────────────────────

export function buildLivingRoom(scene: THREE.Scene): LivingRoom {
  const g = new THREE.Group();
  scene.background = new THREE.Color('#2a1f3d');
  scene.fog = null;
  const updaters: ((dt: number, time: number) => void)[] = [];

  // Luz de interior: ambiente quente, sol baixo a entrar pela janela, lareira e candeeiro.
  g.add(new THREE.HemisphereLight('#ffeedd', '#5a3a2a', 1.25));
  const sun = new THREE.DirectionalLight('#ffd9a8', 1.9);
  sun.position.set(-3, 11, -2);
  sun.target.position.set(1, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -16;
  sc.right = sc.top = 16;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#c9d4ff', 0.5);
  fill.position.set(6, 8, 12);
  g.add(fill);

  // ── Chão e paredes ──
  const floor = mesh(new THREE.BoxGeometry(28, 0.3, 20), toonUnique('#ffffff', { map: planks() }), { cast: false, receive: true });
  floor.position.set(0, -0.15, -1);
  const paper = toonUnique('#ffffff', { map: wallpaper() });
  const wood = toonUnique('#ffffff', { map: wainscot() });
  const trim = toon('#5e3a1e');
  const back = mesh(new THREE.BoxGeometry(28, 7.4, 0.4), paper, { cast: false, receive: true });
  back.position.set(0, 1.8 + 3.7, -9.2);
  const backLow = mesh(new THREE.BoxGeometry(28, 1.8, 0.45), wood, { cast: false, receive: true });
  backLow.position.set(0, 0.9, -9.18);
  g.add(floor, back, backLow);
  for (const sx of [-1, 1]) {
    const side = mesh(new THREE.BoxGeometry(0.4, 7.4, 20), paper, { cast: false, receive: true });
    side.position.set(sx * 13.8, 5.5, -1);
    const sideLow = mesh(new THREE.BoxGeometry(0.45, 1.8, 20), wood, { cast: false, receive: true });
    sideLow.position.set(sx * 13.78, 0.9, -1);
    const rail = mesh(new THREE.BoxGeometry(0.2, 0.14, 20), trim, { cast: false });
    rail.position.set(sx * 13.55, 1.85, -1);
    g.add(side, sideLow, rail);
  }
  const chairRail = mesh(new THREE.BoxGeometry(28, 0.14, 0.2), trim, { cast: false });
  chairRail.position.set(0, 1.85, -8.95);
  const skirt = mesh(new THREE.BoxGeometry(28, 0.3, 0.12), trim, { cast: false });
  skirt.position.set(0, 0.15, -8.92);
  const crown = mesh(new THREE.BoxGeometry(28, 0.3, 0.3), toon('#f6ead2'), { cast: false });
  crown.position.set(0, 9.05, -8.9);
  g.add(chairRail, skirt, crown);

  // ── Tapete ──
  const rug = mesh(new THREE.BoxGeometry(12, 0.05, 6.8), toonUnique('#ffffff', { map: rugTexture() }), { cast: false, receive: true });
  rug.position.set(0, 0.025, -2.7);
  g.add(rug);
  for (const sz of [-1, 1])
    for (let i = 0; i < 30; i++) {
      const fr = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.25), toon('#f6e7c8'), { cast: false });
      fr.position.set(-5.8 + i * 0.4, 0.02, -2.7 + sz * 3.52);
      g.add(fr);
    }

  // ── Janela (por cima do sofá): céu do fim da tarde, cortinas com pregas e raio de sol ──
  const win = new THREE.Group();
  const frameMat = toon('#fbf6ec');
  const frameO = mesh(rbox(5.8, 3.8, 0.3, 0.08), frameMat, { cast: false });
  const pane = mesh(new THREE.PlaneGeometry(5.2, 3.2), new THREE.MeshBasicMaterial({ map: outside() }), { cast: false });
  pane.position.z = 0.16;
  const crossV = mesh(new THREE.BoxGeometry(0.14, 3.2, 0.12), frameMat, { cast: false });
  crossV.position.z = 0.2;
  const crossH = mesh(new THREE.BoxGeometry(5.2, 0.14, 0.12), frameMat, { cast: false });
  crossH.position.z = 0.2;
  const sill = mesh(rbox(6.4, 0.18, 0.7, 0.06), frameMat);
  sill.position.set(0, -2, 0.35);
  win.add(frameO, pane, crossV, crossH, sill);
  const rod = mesh(new THREE.CylinderGeometry(0.06, 0.06, 8.4, 8), toon('#3a2a1a'));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 2.35, 0.5);
  win.add(rod);
  const curtainMat = fabric('#b8404d');
  for (const sx of [-1, 1]) {
    // Pano com pregas (onda) e apanhado a meio.
    const geo = new THREE.PlaneGeometry(1.6, 4.9, 16, 10);
    const p = geo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const pinch = 1 - 0.35 * Math.exp(-(((y + 0.6) / 0.6) ** 2));
      p.setXYZ(i, x * pinch, y, Math.sin(x * 9) * 0.12);
    }
    geo.computeVertexNormals();
    const c = mesh(geo, curtainMat, { cast: false });
    (c.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
    c.position.set(sx * 3.45, -0.1, 0.45);
    const tie = mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16), toon('#f2c14e'), { cast: false });
    tie.rotation.x = Math.PI / 2;
    tie.position.set(sx * 3.45, -0.7, 0.45);
    win.add(c, tie);
  }
  win.position.set(0, 5.4, -8.95);
  g.add(win);
  // Pó a flutuar à frente da janela.
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 4, 3), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.8 }), 60);
  const moteP = Array.from({ length: 60 }, () => new THREE.Vector3(-1.5 + Math.random() * 4.5, 0.6 + Math.random() * 5.5, -7.5 + Math.random() * 4));
  motes.frustumCulled = false;
  g.add(motes);
  const mm = new THREE.Matrix4();
  updaters.push((dt, time) => {
    moteP.forEach((p, i) => {
      p.y += Math.sin(time * 0.3 + i) * dt * 0.08;
      p.x += Math.cos(time * 0.2 + i * 1.7) * dt * 0.05;
      motes.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z));
    });
    motes.instanceMatrix.needsUpdate = true;
  });

  // ── Sofá de 3 lugares, estofado ──
  const sofaMat = fabric('#3f6fb0');
  const sofaDark = fabric('#2f5690');
  const sofa = new THREE.Group();
  const sbase = mesh(rbox(7.6, 0.55, 2.2, 0.2), sofaDark, { receive: true });
  sbase.position.y = 0.42;
  const sback = mesh(rbox(7.6, 1.7, 0.75, 0.32), sofaMat, { receive: true });
  sback.position.set(0, 1.35, -0.78);
  sofa.add(sbase, sback);
  for (const sx of [-1, 1]) {
    const arm = mesh(rbox(0.75, 1.05, 2.2, 0.32), sofaMat);
    arm.position.set(sx * 3.75, 0.85, 0);
    sofa.add(arm);
  }
  for (let i = -1; i <= 1; i++) {
    const cushion = mesh(rbox(2.25, 0.32, 1.6, 0.14), sofaMat, { receive: true });
    cushion.position.set(i * 2.32, 0.82, 0.2);
    const backCush = mesh(rbox(2.2, 1, 0.45, 0.2), sofaMat);
    backCush.position.set(i * 2.32, 1.45, -0.32);
    backCush.rotation.x = -0.12;
    sofa.add(cushion, backCush);
  }
  for (const [x, c, rz] of [[-3.1, '#f2c14e', 0.3], [3.1, '#e86a5a', -0.3]] as const) {
    const pil = mesh(rbox(0.9, 0.85, 0.3, 0.14), fabric(c));
    pil.position.set(x, 1.35, 0.05);
    pil.rotation.set(-0.2, 0, rz);
    sofa.add(pil);
  }
  // Manta às riscas pendurada no braço.
  const throwTex = canvasTexture(64, (ctx, s) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f6e7c8' : '#4a8f6a';
      ctx.fillRect(0, (i * s) / 8, s, s / 8);
    }
  });
  const blanket = mesh(new THREE.BoxGeometry(0.85, 1.3, 0.06), toonUnique('#ffffff', { map: throwTex }), { cast: false });
  blanket.position.set(-3.75, 1.05, 0.75);
  blanket.rotation.x = -0.2;
  sofa.add(blanket);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.2, 8), toon('#3a2a1a'));
      leg.position.set(sx * 3.6, 0.1, sz * 0.9);
      sofa.add(leg);
    }
  sofa.position.set(0, 0, -6.35);
  g.add(sofa);

  // ── Cadeirões ──
  for (const sx of [-1, 1]) {
    const chair = new THREE.Group();
    const cm = fabric('#d9774b');
    const cd = fabric('#b95d36');
    const seat = mesh(rbox(2.1, 0.55, 2, 0.2), cd, { receive: true });
    seat.position.y = 0.42;
    const cush = mesh(rbox(1.5, 0.3, 1.6, 0.12), cm);
    cush.position.set(0, 0.8, 0.1);
    const cback = mesh(rbox(2.1, 1.9, 0.6, 0.3), cm);
    cback.position.set(0, 1.3, -0.75);
    chair.add(seat, cush, cback);
    for (const ax of [-1, 1]) {
      const arm = mesh(rbox(0.45, 1, 2, 0.2), cm);
      arm.position.set(ax * 0.95, 0.8, 0);
      chair.add(arm);
    }
    chair.position.set(sx * 5.75, 0, -3.3);
    chair.rotation.y = -sx * 0.8;
    g.add(chair);
  }

  // ── Mesa de centro (com petiscos e caneca) ──
  const table = prop('kaykit-furniture/table_low', { width: 3.2 });
  if (table) place(g, table, 0, 0, -3.3);
  else {
    const top = mesh(rbox(3.2, 0.18, 1.5, 0.06), toon('#8a5a34'));
    top.position.set(0, 0.7, -3.3);
    g.add(top);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.65, 8), toon('#5e3a1e'));
        leg.position.set(sx * 1.4, 0.32, -3.3 + sz * 0.6);
        g.add(leg);
      }
  }
  const tableTop = table ? new THREE.Box3().setFromObject(table).max.y : 0.79;
  place(g, prop('q-props/Mug', { height: 0.32 }), -0.8, tableTop, -3.2, 0.4);
  // Taça de pipocas.
  const bowl = mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toonUnique('#e8413c', { side: THREE.DoubleSide }));
  bowl.position.set(0.5, tableTop + 0.4, -3.35);
  g.add(bowl);
  for (let i = 0; i < 26; i++) {
    const pc = mesh(new THREE.DodecahedronGeometry(0.09, 0), toon(i % 5 ? '#fff6d8' : '#f2c14e'), { cast: false });
    const a = Math.random() * 6.3;
    const d = Math.random() * 0.32;
    pc.position.set(0.5 + Math.cos(a) * d, tableTop + 0.36 + Math.random() * 0.12, -3.35 + Math.sin(a) * d);
    g.add(pc);
  }
  // Comando de consola em cima da mesa.
  const pad = mesh(rbox(0.5, 0.1, 0.3, 0.05), toon('#2b2b38'));
  pad.position.set(1.2, tableTop + 0.05, -3.0);
  pad.rotation.y = 0.5;
  g.add(pad);

  // ── Almofada grande no chão e puff ──
  const floorCush = mesh(rbox(1.7, 0.32, 1.7, 0.15), fabric('#f2c14e'), { receive: true });
  floorCush.position.set(-2.7, 0.16, -1.15);
  floorCush.rotation.y = 0.35;
  const bean = mesh(new THREE.SphereGeometry(0.95, 20, 14), fabric('#4cad7a'));
  bean.scale.set(1, 0.48, 1);
  bean.position.set(2.7, 0.4, -1.15);
  g.add(floorCush, bean);

  // ── Lareira de tijolo, acesa, com faúlhas ──
  const fire = new THREE.Group();
  const brick = toonUnique('#ffffff', { map: bricks() });
  const body = mesh(new THREE.BoxGeometry(4.2, 4.6, 1.2), brick, { receive: true });
  body.position.y = 2.3;
  const chimney = mesh(new THREE.BoxGeometry(2.6, 4.4, 0.9), brick);
  chimney.position.set(0, 6.8, -0.15);
  const mantel = mesh(rbox(4.9, 0.3, 1.6, 0.08), toon('#6b4524'));
  mantel.position.set(0, 3.3, 0.15);
  const hearth = mesh(new THREE.BoxGeometry(4.6, 0.18, 1.2), toon('#8f8a80'), { receive: true });
  hearth.position.set(0, 0.09, 1.1);
  const hole = mesh(new THREE.BoxGeometry(2.4, 2, 0.7), toon('#1a1210'), { cast: false });
  hole.position.set(0, 1.1, 0.3);
  const arch = mesh(new THREE.TorusGeometry(1.2, 0.18, 6, 16, Math.PI), brick);
  arch.position.set(0, 2.05, 0.62);
  fire.add(body, chimney, mantel, hearth, hole, arch);
  for (const [lx, rz] of [[-0.2, 0.25], [0.25, -0.2]] as const) {
    const log = mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8), toon('#5b3a1e'), { cast: false });
    log.rotation.set(0, 0.3, Math.PI / 2 + rz);
    log.position.set(lx, 0.32, 0.45);
    fire.add(log);
  }
  const flames: THREE.Mesh[] = [];
  const flameColors = ['#ff6a1a', '#ffa41b', '#ffd23f'];
  for (let i = 0; i < 7; i++) {
    const f = mesh(new THREE.ConeGeometry(0.3 - (i % 3) * 0.06, 1.05 - (i % 3) * 0.25, 8), toonUnique(flameColors[i % 3]!, { emissive: flameColors[i % 3]!, emissiveIntensity: 1.5 }), { cast: false });
    f.position.set(-0.75 + i * 0.25, 0.85, 0.45 + (i % 2) * 0.1);
    fire.add(f);
    flames.push(f);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: '#ff9a3c', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.2, 2.4, 1);
  glow.position.set(0, 1, 0.9);
  fire.add(glow);
  const fireLight = new THREE.PointLight('#ff9a3c', 16, 13);
  fireLight.position.set(0, 1.2, 1.6);
  fire.add(fireLight);
  // Em cima da lareira: velas, um relógio e um quadro.
  for (const vx of [-1.8, -1.45]) {
    const candle = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4 + (vx + 2) * 0.3, 10), toon('#fff6e0'));
    candle.position.set(vx, 3.65, 0.3);
    const fl = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), toonUnique('#ffd23f', { emissive: '#ffb020', emissiveIntensity: 2 }), { cast: false });
    fl.position.set(vx, 3.95 + (vx + 2) * 0.15, 0.3);
    fire.add(candle, fl);
  }
  const clock = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 20), toon('#f6ead2'));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(1.2, 3.9, 0.25);
  fire.add(clock);
  const hand = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), toon('#2b2b38'), { cast: false });
  hand.geometry.translate(0, 0.13, 0);
  hand.position.set(1.2, 3.9, 0.34);
  fire.add(hand);
  // Utensílios da lareira.
  const tools = new THREE.Group();
  const stand = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), toon('#2b2b38'));
  stand.position.y = 0.7;
  const tbase = mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.08, 10), toon('#2b2b38'));
  tbase.position.y = 0.04;
  tools.add(stand, tbase);
  for (let i = 0; i < 3; i++) {
    const t2 = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), toon('#4a4a58'));
    t2.position.set(Math.cos(i * 2.1) * 0.12, 0.75, Math.sin(i * 2.1) * 0.12);
    tools.add(t2);
  }
  tools.position.set(2.5, 0, 0.9);
  fire.add(tools);
  fire.position.set(8.6, 0, -8.4);
  g.add(fire);
  // Faúlhas a subir.
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 4, 3), new THREE.MeshBasicMaterial({ color: '#ffcf5a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 24);
  const sparkP = Array.from({ length: 24 }, () => ({ p: new THREE.Vector3(8.6, 0.6 + Math.random() * 1.4, -7.9), v: 0.6 + Math.random() }));
  sparks.frustumCulled = false;
  g.add(sparks);
  updaters.push((dt, time) => {
    sparkP.forEach((s, i) => {
      s.p.y += s.v * dt;
      s.p.x = 8.6 + Math.sin(time * 3 + i) * 0.35;
      if (s.p.y > 2) s.p.set(8.6 + (Math.random() - 0.5) * 1.2, 0.6, -7.9 + Math.random() * 0.2);
      sparks.setMatrixAt(i, mm.makeTranslation(s.p.x, s.p.y, s.p.z));
    });
    sparks.instanceMatrix.needsUpdate = true;
    hand.rotation.z = -time * 0.5;
  });

  // ── Alvo de dardos na parede de trás (à esquerda) com dardos espetados ──
  const board = new THREE.Group();
  const cork = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 32), [toon('#2b2b2b'), new THREE.MeshToonMaterial({ map: dartboard() }), toon('#2b2b2b')]);
  cork.rotation.x = Math.PI / 2;
  board.add(cork);
  for (const [dx, dy] of [[0.15, 0.1], [-0.3, -0.25], [0.4, -0.35]] as const) {
    const dart = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), toon('#c0c0c8'), { cast: false });
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.25;
    const flight = mesh(new THREE.BoxGeometry(0.16, 0.01, 0.14), toon('#ff3b5c'), { cast: false });
    flight.position.z = 0.45;
    const flight2 = flight.clone();
    flight2.rotation.z = Math.PI / 2;
    dart.add(shaft, flight, flight2);
    dart.position.set(dx, dy, 0.05);
    dart.rotation.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0);
    board.add(dart);
  }
  board.position.set(-5.3, 3.4, -8.85);
  g.add(board);
  // Quadro de ardósia com os pontos.
  const slate = mesh(rbox(1.1, 1.4, 0.08, 0.04), toon('#2f3a3a'), { cast: false });
  slate.position.set(-3.6, 3.3, -8.92);
  const chalk = mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#e8e8e8';
    for (let y = 8; y < s - 4; y += 10) ctx.fillRect(6, y, 10 + ((y * 7) % 30), 2);
  }) }), { cast: false });
  chalk.position.set(-3.6, 3.3, -8.87);
  g.add(slate, chalk);

  // ── Mesa dos petiscos (à esquerda): hambúrgueres, refrigerantes, pizza ──
  const snack = prop('kaykit-restaurant/table_round_A_decorated', { width: 2.2 });
  const snackTop = snack ? (place(g, snack, -8.7, 0, -4.9), new THREE.Box3().setFromObject(snack).max.y) : 1.0;
  if (!snack) {
    const top = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 24), toon('#f6ead2'));
    top.position.set(-8.7, 0.95, -4.9);
    const leg = mesh(new THREE.CylinderGeometry(0.1, 0.25, 0.95, 10), toon('#5e3a1e'));
    leg.position.set(-8.7, 0.47, -4.9);
    g.add(top, leg);
  }
  place(g, prop('kaykit-restaurant/food_burger', { width: 0.55 }), -8.4, snackTop, -4.5, 0.6);
  const sodaColors = ['#e8413c', '#3fa7ff', '#4cd964'];
  sodaColors.forEach((c, i) => {
    const can = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 12), toon(c));
    can.position.set(-9.2 + i * 0.3, snackTop + 0.18, -5.2);
    g.add(can);
  });
  const pizzaBox = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), toon('#d8b07a'));
  pizzaBox.position.set(-8.8, snackTop + 0.05, -5.1);
  pizzaBox.rotation.y = 0.3;
  g.add(pizzaBox);

  // ── Estante, candeeiro, plantas e quadros ──
  g.add(bookshelf(-10.9, -8.45));
  const lamp = place(g, prop('kaykit-furniture/lamp_standing', { height: 4.2 }), -4.6, 0, -7.6);
  if (!lamp) {
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4), toon('#3a3150'));
    pole.position.set(-4.6, 2, -7.6);
    const shade = mesh(new THREE.ConeGeometry(0.7, 0.8, 16, 1, true), toonUnique('#fff1c2', { emissive: '#ffd27a', emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    shade.position.set(-4.6, 4, -7.6);
    g.add(pole, shade);
  }
  const bulb = new THREE.PointLight('#ffd9a0', 9, 9);
  bulb.position.set(-4.6, 3.7, -7.4);
  g.add(bulb);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: '#ffe2a8', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  lampGlow.scale.setScalar(2.2);
  lampGlow.position.set(-4.6, 3.8, -7.5);
  g.add(lampGlow);
  // Plantas em vasos, nos cantos (feitas à mão, à escala da sala).
  for (const [px, pz, seed] of [[4.6, -8.3, 3], [12.2, -3.2, 7], [-12.3, -1.6, 11]] as const) g.add(pottedPlant(px, pz, seed));
  place(g, prop('kaykit-furniture/cactus_medium_A', { height: 0.7 }), -1.6, 3.42, -8.6);
  place(g, prop('q-props/Vase_2', { height: 0.6 }), 1.8, 3.42, -8.6);
  // Quadros (a moldura do pack, ou uma feita à mão) com paisagens.
  const art = (w: number, h: number, colors: [string, string, string]) =>
    canvasTexture(128, (ctx, s) => {
      const gr = ctx.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, colors[0]);
      gr.addColorStop(1, colors[1]);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = colors[2];
      ctx.beginPath();
      ctx.moveTo(0, s * 0.75);
      ctx.quadraticCurveTo(s * 0.3, s * 0.45, s * 0.6, s * 0.7);
      ctx.quadraticCurveTo(s * 0.8, s * 0.55, s, s * 0.7);
      ctx.lineTo(s, s);
      ctx.lineTo(0, s);
      ctx.fill();
      void w;
      void h;
    });
  for (const [x, y, w, h, cols] of [
    [8.6, 6.6, 2.2, 1.6, ['#8fd3ff', '#fff1c2', '#4caf50']],
    [-8.4, 5.6, 1.6, 2.1, ['#ffb37a', '#ffd9a0', '#9b5de5']],
    [5.1, 5.9, 1.3, 1.3, ['#c9d0ff', '#ffffff', '#5468ff']],
  ] as const) {
    const fr = mesh(rbox(w + 0.25, h + 0.25, 0.1, 0.05), toon('#d9a441'), { cast: false });
    // O da lareira fica pendurado na chaminé (mais à frente).
    fr.position.set(x, y, x === 8.6 ? -7.98 : -8.93);
    const pic = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: art(w, h, cols as unknown as [string, string, string]) }), { cast: false });
    pic.position.set(x, y, fr.position.z + 0.06);
    g.add(fr, pic);
  }

  // ── Luzinhas de festa ao longo da parede de trás ──
  const bulbs: THREE.MeshToonMaterial[] = [];
  const lightColors = ['#ff5a5f', '#ffd23f', '#4cd964', '#3fa7ff', '#ff8fc8'];
  const wire: THREE.Vector3[] = [];
  for (let i = 0; i <= 3; i++) {
    const x0 = -12.5 + i * 6.25;
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      wire.push(new THREE.Vector3(x0 + t * 6.25, 8.5 - Math.sin(t * Math.PI) * 0.7, -8.85));
    }
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire), 120, 0.015, 4), toon('#2b2b38'), { cast: false }));
  wire.forEach((p, i) => {
    if (i % 2) return;
    const m = toonUnique(lightColors[i % lightColors.length]!, { emissive: lightColors[i % lightColors.length]!, emissiveIntensity: 1.2 });
    bulbs.push(m);
    const b = mesh(new THREE.SphereGeometry(0.09, 8, 6), m, { cast: false });
    b.position.copy(p).add(new THREE.Vector3(0, -0.12, 0.05));
    b.scale.y = 1.4;
    g.add(b);
  });
  updaters.push((_dt, time) => bulbs.forEach((m, i) => (m.emissiveIntensity = 0.7 + Math.max(0, Math.sin(time * 2 + i * 1.3)) * 1.2)));

  // ── Televisão num móvel baixo, no canto da frente (virada para o sofá) ──
  {
    const tvg = new THREE.Group();
    const cab = mesh(rbox(4.6, 1.05, 1.2, 0.08), toon('#6b4524'), { receive: true });
    cab.position.y = 0.55;
    for (const dx of [-1.15, 1.15]) {
      const door = mesh(rbox(2.1, 0.8, 0.05, 0.03), toon('#7a5230'), { cast: false });
      door.position.set(dx, 0.55, 0.6);
      const knob = mesh(new THREE.SphereGeometry(0.05, 8, 6), toon('#d9a441'), { cast: false });
      knob.position.set(dx + (dx < 0 ? 0.85 : -0.85), 0.55, 0.65);
      tvg.add(door, knob);
    }
    const stand = mesh(rbox(1.2, 0.12, 0.6, 0.05), toon('#1d1d24'));
    stand.position.y = 1.14;
    const neck = mesh(new THREE.BoxGeometry(0.2, 0.5, 0.12), toon('#1d1d24'));
    neck.position.y = 1.4;
    const bezel = mesh(rbox(4.1, 2.45, 0.22, 0.08), toon('#15151c'));
    bezel.position.y = TV.y;
    const screen = mesh(new THREE.PlaneGeometry(3.8, 2.14), new THREE.MeshBasicMaterial({ map: tvScreen() }), { cast: false });
    screen.position.set(0, TV.y, 0.12);
    const led = mesh(new THREE.SphereGeometry(0.03, 6, 4), toonUnique('#4cd964', { emissive: '#4cd964', emissiveIntensity: 2 }), { cast: false });
    led.position.set(1.9, TV.y - 1.13, 0.12);
    const console = mesh(rbox(1.1, 0.22, 0.75, 0.06), toon('#f2f2f7'));
    console.position.set(-1.4, 1.19, 0.1);
    tvg.add(cab, stand, neck, bezel, screen, led, console);
    tvg.position.set(TV.x, 0, TV.z);
    tvg.rotation.y = TV_YAW;
    g.add(tvg);
    const tvGlow = new THREE.PointLight('#8f7bff', 4, 6);
    tvGlow.position.set(TV.x + Math.sin(TV_YAW) * 1.2, TV.y, TV.z + Math.cos(TV_YAW) * 1.2);
    g.add(tvGlow);
  }

  // ── Balões presos ao braço do sofá ──
  const balloons: THREE.Object3D[] = [];
  [['#ff5a5f', -0.3], ['#ffd23f', 0.1], ['#3fa7ff', 0.45]].forEach(([c, off], i) => {
    const bg = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(0.42, 16, 12), toonUnique(c as string, { emissive: c as string, emissiveIntensity: 0.12 }));
    b.scale.y = 1.2;
    b.position.y = 3.2 + i * 0.35;
    const knot = mesh(new THREE.ConeGeometry(0.07, 0.12, 6), toon(c as string), { cast: false });
    knot.position.y = b.position.y - 0.52;
    const str = mesh(new THREE.CylinderGeometry(0.01, 0.01, b.position.y - 1.1), toon('#ffffff'), { cast: false });
    str.position.y = (b.position.y + 1.1) / 2 - 0.5;
    bg.add(b, knot, str);
    bg.position.set(4.3 + (off as number), 0.6, -6.2 + i * 0.2);
    g.add(bg);
    balloons.push(bg);
  });
  updaters.push((_dt, time) => balloons.forEach((b, i) => (b.rotation.z = Math.sin(time * 0.8 + i) * 0.06)));

  scene.add(g);
  let last = -1;
  return {
    group: g,
    update(time: number) {
      const dt = last < 0 ? 0 : Math.min(0.1, time - last);
      last = time;
      // A lareira tremeluz.
      fireLight.intensity = 14 + Math.sin(time * 9) * 2.4 + Math.sin(time * 23) * 1.4;
      (glow.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(time * 11) * 0.08;
      flames.forEach((f, i) => {
        f.scale.y = 1 + Math.sin(time * (7 + i) + i) * 0.2;
        f.position.x = -0.75 + i * 0.25 + Math.sin(time * 5 + i * 2) * 0.04;
      });
      for (const u of updaters) u(dt, time);
    },
  };
}
