/**
 * Sala de estar do ecrã inicial: parquet, lambril com painéis e parede branca. Na parede de trás, o
 * sofá cinzento com três quadros em fila por cima, uma estante alta e a lareira de pedra
 * acesa (com faúlhas); à frente, a mesa de centro, duas cadeiras-ovo, um monte de almofadas e um
 * puff, plantas e a televisão de tubo onde passa o menu dos jogos. Os modelos vêm do Sketchfab
 * (ver docs/ASSETS.md); sem eles, a sala usa versões feitas à mão.
 *
 * Cabem 10 jogadores, cada um no seu sítio e a fazer alguma coisa: três no sofá, dois nas
 * cadeiras-ovo, dois no chão, um à estante, um a aquecer as mãos à lareira e um a beber.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CharacterAnim } from '../three/CharacterModel';
import { canvasTexture, mesh, toon, toonUnique } from '../three/materials';
import { prop } from '../three/props';
import { CrtScreen } from './crtScreen';

/** Lugares por ordem de chegada: posição, para onde olha e o que está a fazer. */
export const ROOM_SEATS: { x: number; z: number; yaw: number; y?: number; anim: CharacterAnim }[] = [
  { x: 0, z: -5.55, yaw: 0, y: 0.66, anim: 'sit' },
  { x: -2.35, z: -5.55, yaw: 0.06, y: 0.66, anim: 'sit' },
  { x: 2.35, z: -5.55, yaw: -0.06, y: 0.66, anim: 'sit' },
  { x: -5.5, z: -3.05, yaw: 0.8, y: 0.62, anim: 'sit' },
  { x: 5.5, z: -3.05, yaw: -0.8, y: 0.62, anim: 'sit' },
  { x: -2.7, z: -1.15, yaw: 0.35, y: 0.32, anim: 'sit' },
  { x: 2.7, z: -1.15, yaw: -0.35, y: 0.6, anim: 'sit' },
  // De pé: à estante, à lareira e a beber (acertados quando a sala é montada).
  { x: -6.7, z: -6.6, yaw: 2.62, anim: 'aim' },
  { x: 6.8, z: -6.7, yaw: 2.36, anim: 'warm' },
  { x: -7.3, z: -3.9, yaw: 0.9, anim: 'drink' },
];

/** Modelos usados na sala (carregar antes de a montar; sem eles usa as versões feitas à mão). */
export const ROOM_PROPS: readonly string[] = [
  // Única peça que não é da KayKit: a TV de tubo (o menu dos jogos passa no vidro dela).
  'crt-tv/crt-tv',
  // KayKit (CC0): mobília, quadros, plantas, tapetes, estantes, caneca e pufes.
  'kaykit-furniture/couch_pillows',
  'kaykit-furniture/armchair_pillows',
  'kaykit-furniture/table_low',
  'kaykit-furniture/lamp_standing',
  'kaykit-furniture/cactus_medium_A',
  'kaykit-furniture/cactus_medium_B',
  'kaykit-furniture/shelf_B_large_decorated',
  'kaykit-furniture/book_set',
  'kaykit-mixed2/frame_A_large',
  'kaykit-mixed2/frame_B_large',
  'kaykit-mixed2/ornate_mirror',
  'kaykit-furniture/cabinet_medium_decorated',
  'kaykit-holiday/hot_chocolate_decorated',
  'kaykit-holiday/footstool_red',
  'kaykit-holiday/footstool_green',
  'kaykit-mixed1/guitar_A',
  'kaykit-mixed2/gamer_chair_A',
];

/** Parede de trás (face da frente do lambrim): onde se encostam estantes, quadros e a lareira. */
const WALL_Z = -8.96;

/**
 * Moldura da KayKit (Mixed Bag 2) com uma pintura nossa no lugar da imagem de exemplo
 * (o material «placeholder» do modelo).
 */
function framed(key: string, height: number, painting: THREE.Texture): THREE.Group | null {
  const f = prop(key, { height });
  if (!f) return null;
  painting.flipY = false; // UVs do glTF
  const mat = toonUnique('#ffffff', { map: painting });
  f.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material = m.material.map((x) => (x.name === 'placeholder' ? mat : x));
    else if (m.material.name === 'placeholder') m.material = mat;
  });
  return f;
}

/** Pintura: campo com colinas, casinha, árvore e sol. */
function landscapePainting(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    const sky = ctx.createLinearGradient(0, 0, 0, s * 0.6);
    sky.addColorStop(0, '#7cc6ff');
    sky.addColorStop(1, '#ffe2b0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(s * 0.78, s * 0.22, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[0.2, 0.18, 0.06], [0.28, 0.16, 0.07], [0.36, 0.19, 0.05]] as const) {
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2);
      ctx.fill();
    }
    const hill = (color: string, y: number, amp: number, ph: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, s);
      for (let x = 0; x <= s; x += 8) ctx.lineTo(x, s * y + Math.sin(x / s * Math.PI * 2 + ph) * s * amp);
      ctx.lineTo(s, s);
      ctx.fill();
    };
    hill('#6cc06a', 0.6, 0.05, 0.5);
    hill('#4fa356', 0.72, 0.04, 2.2);
    // Casinha
    ctx.fillStyle = '#fff4e0';
    ctx.fillRect(s * 0.2, s * 0.52, s * 0.18, s * 0.14);
    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.53);
    ctx.lineTo(s * 0.29, s * 0.43);
    ctx.lineTo(s * 0.4, s * 0.53);
    ctx.fill();
    ctx.fillStyle = '#7a4f28';
    ctx.fillRect(s * 0.27, s * 0.59, s * 0.04, s * 0.07);
    // Árvore
    ctx.fillStyle = '#7a4f28';
    ctx.fillRect(s * 0.66, s * 0.5, s * 0.03, s * 0.14);
    ctx.fillStyle = '#3f8f45';
    ctx.beginPath();
    ctx.arc(s * 0.675, s * 0.47, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Pintura: jarra com flores, fundo azul. */
function flowersPainting(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#3f6fb5';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5a86c9';
    ctx.fillRect(0, s * 0.7, s, s * 0.3);
    ctx.strokeStyle = '#3f8f45';
    ctx.lineWidth = s * 0.015;
    const heads: [number, number, string][] = [[0.35, 0.3, '#ff6fb5'], [0.5, 0.22, '#ffd23f'], [0.65, 0.32, '#ff7a3c'], [0.42, 0.42, '#ffffff'], [0.58, 0.44, '#b36bff']];
    for (const [x, y] of heads) {
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.62);
      ctx.quadraticCurveTo(s * (0.5 + (x - 0.5) * 0.3), s * 0.5, s * x, s * y);
      ctx.stroke();
    }
    for (const [x, y, c] of heads) {
      ctx.fillStyle = c;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(s * x + Math.cos(a) * s * 0.035, s * y + Math.sin(a) * s * 0.035, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(s * x, s * y, s * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.6);
    ctx.lineTo(s * 0.6, s * 0.6);
    ctx.lineTo(s * 0.57, s * 0.8);
    ctx.lineTo(s * 0.43, s * 0.8);
    ctx.fill();
  });
}

/** Põe `o` em (x, y) com as costas encostadas à parede de trás. */
function againstWall(g: THREE.Object3D, o: THREE.Object3D | null, x: number, y: number): THREE.Object3D | null {
  if (!o) return null;
  o.position.set(x, y, 0);
  o.updateMatrixWorld(true);
  o.position.z = WALL_Z - new THREE.Box3().setFromObject(o).min.z;
  g.add(o);
  return o;
}

/** Televisão (canto da frente, à direita, virada para o sofá): onde aparece o menu dos jogos. */
const TV = { x: 6.6, z: -1.2, y: 2.0 };
const TV_YAW = Math.atan2(0 - TV.x, -6.5 - TV.z);
/**
 * Vista da câmara de frente para o ecrã da televisão (o ecrã enche quase toda a altura do jogo).
 * Acertada quando a sala é montada, conforme o tamanho do ecrã da TV.
 */
export const TV_VIEW = {
  pos: new THREE.Vector3(TV.x + Math.sin(TV_YAW) * 3.95, TV.y + 0.05, TV.z + Math.cos(TV_YAW) * 3.95),
  look: new THREE.Vector3(TV.x, TV.y, TV.z),
};
/** Abertura vertical da câmara da sala (ShowcaseStage) e quanto da altura o ecrã da TV ocupa. */
const ROOM_FOV = 40;
const TV_FILL = 0.86;

export interface LivingRoom {
  group: THREE.Group;
  /** Ecrã da televisão (desligado até se ir para o menu dos jogos). */
  tv: CrtScreen;
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

const rbox = (w: number, h: number, d: number, r = 0.18) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.98);

function place(g: THREE.Object3D, o: THREE.Object3D | null, x: number, y: number, z: number, ry = 0): THREE.Object3D | null {
  if (!o) return null;
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
  return o;
}

/**
 * Pose sentada das personagens (animação «Sit_Floor_Idle», medida nos modelos KayKit): o rabo fica à
 * altura da raiz, as costas ≈ 0.45 atrás e os ombros ≈ 0.6 para cada lado.
 */
const SIT = { back: 0.47, half: 0.62, chest: 0.45 };

/**
 * Acerta um lugar sentado em cima de `model`, com raios: o rabo assenta na superfície, as costas
 * encostam ao encosto (sem entrar nele) e, entre dois braços, fica ao meio. `sink` afunda um
 * bocadinho (almofadas moles). O modelo já tem de estar no sítio (com a matriz atualizada).
 */
function fitSeat(seat: (typeof ROOM_SEATS)[number], model: THREE.Object3D, sink = 0, ceil = 0.7): void {
  const ray = new THREE.Raycaster();
  const fwd = new THREE.Vector3(Math.sin(seat.yaw), 0, Math.cos(seat.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  // Os raios para baixo partem de `ceil` da altura do modelo (para não baterem no topo do encosto ou na cúpula da cadeira-ovo).
  const mb = new THREE.Box3().setFromObject(model);
  const top = mb.min.y + (mb.max.y - mb.min.y) * ceil + 0.01;
  const hit = (from: THREE.Vector3, dir: THREE.Vector3, far: number) => {
    ray.set(from, dir);
    ray.far = far;
    return ray.intersectObject(model, true)[0] ?? null;
  };
  const surface = () => hit(new THREE.Vector3(seat.x - fwd.x * 0.15, top, seat.z - fwd.z * 0.15), new THREE.Vector3(0, -1, 0), top + 1)?.point.y ?? 0;
  let y = surface();
  for (let i = 0; i < 3; i++) {
    const chest = new THREE.Vector3(seat.x, y + SIT.chest, seat.z);
    // Costas: encosta ao que estiver atrás (até 1.2), sem entrar.
    const b = hit(chest, fwd.clone().negate(), SIT.back + 1.2);
    if (b) {
      const shift = SIT.back + 0.03 - b.distance;
      seat.x += fwd.x * shift;
      seat.z += fwd.z * shift;
    }
    // Lados: entre dois braços fica ao meio; se só um estiver perto de mais, afasta-se dele.
    const l = hit(chest, side.clone().negate(), SIT.half + 0.6);
    const r = hit(chest, side, SIT.half + 0.6);
    let dx = 0;
    if (l && r) dx = (r.distance - l.distance) / 2;
    else if (l && l.distance < SIT.half) dx = SIT.half - l.distance;
    else if (r && r.distance < SIT.half) dx = r.distance - SIT.half;
    seat.x += side.x * dx;
    seat.z += side.z * dx;
    y = surface();
  }
  seat.y = y - sink;
}

/** Sofá azul feito à mão (quando o modelo do sofá não carrega). */
function buildSofa(g: THREE.Group): void {
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
  // Soalho, papel de parede e lambril desenhados à mão (a KayKit não traz texturas de chão/parede
  // que se repitam: as cores dela vêm de uma paleta). Os tapetes da KayKit vão por cima.
  const floor = mesh(new THREE.BoxGeometry(28, 0.3, 20), toonUnique('#ffffff', { map: planks() }), { cast: false, receive: true });
  floor.position.set(0, -0.15, -1);
  const paper = toonUnique('#ffffff', { map: wallpaper() });
  const wood = toonUnique('#ffffff', { map: wainscot() });
  const woodSide = wood;
  const back = mesh(new THREE.BoxGeometry(28, 7.4, 0.4), paper, { cast: false, receive: true });
  back.position.set(0, 1.8 + 3.7, -9.2);
  const backLow = mesh(new THREE.BoxGeometry(28, 1.8, 0.45), wood, { cast: false, receive: true });
  backLow.position.set(0, 0.9, -9.18);
  g.add(floor, back, backLow);
  for (const sx of [-1, 1]) {
    const side = mesh(new THREE.BoxGeometry(0.4, 7.4, 20), paper, { cast: false, receive: true });
    side.position.set(sx * 13.8, 5.5, -1);
    const sideLow = mesh(new THREE.BoxGeometry(0.45, 1.8, 20), woodSide, { cast: false, receive: true });
    sideLow.position.set(sx * 13.78, 0.9, -1);
    g.add(side, sideLow);
  }

  // ── Disposição ──
  // Tudo à escala das personagens (2.3 de altura, ≈ 1.5 unidades por metro real): sofá encostado à
  // parede de trás com a mesa de centro à frente; cadeirões dos lados, virados para a mesa e para a
  // sala; estante e alvo de dardos à esquerda, estante baixa e lareira à direita; mesa dos petiscos
  // à esquerda, à frente; a TV no canto da frente, à direita, virada para o sofá.
  // Os lugares sentados acertam-se depois com `fitSeat` (rabo no assento, costas no encosto).

  // ── Sofá de 3 lugares (KayKit «couch_pillows») ──
  // Esticado na largura para caberem três personagens (são largas).
  const graySofa = prop('kaykit-furniture/couch_pillows', { height: 1.75 });
  const sofaSeats: THREE.Object3D[] = [];
  if (graySofa) {
    graySofa.scale.x *= 4.8 / Math.max(0.01, new THREE.Box3().setFromObject(graySofa).getSize(new THREE.Vector3()).x);
    graySofa.updateMatrixWorld(true);
    const sb = new THREE.Box3().setFromObject(graySofa);
    graySofa.position.set(0, 0, WALL_Z + 0.15 - sb.min.z);
    g.add(graySofa);
    const front = graySofa.position.z + sb.max.z;
    [0, -1.25, 1.25].forEach((x, i) => Object.assign(ROOM_SEATS[i]!, { x, z: front - 0.45, yaw: 0 }));
    sofaSeats.push(graySofa, graySofa, graySofa);
  } else buildSofa(g);
  const sofaFront = graySofa ? ROOM_SEATS[0]!.z + 0.45 : -5.6;

  // ── Por cima do sofá, em fila e ao centro: dois quadros e um espelho (KayKit Mixed Bag 2) ──
  // A base fica acima das cabeças de quem está sentado (≈ 2.7).
  const PIC_Y = 2.95;
  againstWall(g, framed('kaykit-mixed2/frame_A_large', 1.3, landscapePainting()), -1.75, PIC_Y);
  againstWall(g, prop('kaykit-mixed2/ornate_mirror', { height: 1.5 }), 0, PIC_Y - 0.1);
  againstWall(g, framed('kaykit-mixed2/frame_B_large', 1.3, flowersPainting()), 1.75, PIC_Y);
  // Prateleira com livros e coisas por cima dos quadros.
  againstWall(g, prop('kaykit-furniture/shelf_B_large_decorated', { width: 2.4 }), 0, PIC_Y + 1.75);

  // ── Mesa de centro (KayKit «table_low») em cima de um tapete às riscas, com chocolate quente e livros ──
  const TABLE_Z = sofaFront + 2.0;
  const table = prop('kaykit-furniture/table_low', { width: 3.0 });
  if (table) place(g, table, 0, 0, TABLE_Z);
  else {
    const top = mesh(rbox(3.0, 0.18, 1.5, 0.06), toon('#8a5a34'));
    top.position.set(0, 0.6, TABLE_Z);
    g.add(top);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), toon('#5e3a1e'));
        leg.position.set(sx * 1.3, 0.27, TABLE_Z + sz * 0.6);
        g.add(leg);
      }
  }
  const tableTop = table ? new THREE.Box3().setFromObject(table).max.y : 0.69;
  place(g, prop('kaykit-holiday/hot_chocolate_decorated', { height: 0.3 }), -0.7, tableTop, TABLE_Z + 0.1, 0.4);
  place(g, prop('kaykit-furniture/book_set', { height: 0.35 }), 0.8, tableTop, TABLE_Z - 0.1, -0.3);

  // ── Cadeirões (KayKit «armchair_pillows»), um de cada lado ──
  // Virados para a mesa e um pouco para a sala; largos q.b. para uma personagem (≈ 1.7).
  const chairSeats: (THREE.Object3D | null)[] = [];
  for (const sx of [-1, 1]) {
    const seat = ROOM_SEATS[sx < 0 ? 3 : 4]!;
    Object.assign(seat, { x: sx * 3.5, z: TABLE_Z + 0.2, yaw: -sx * 1.05 });
    const model = prop('kaykit-furniture/armchair_pillows', { height: 1.75 });
    if (model) {
      // Alarga para ≈ 1.7 de largura (as personagens têm a cabeça e os braços largos).
      const cb = new THREE.Box3().setFromObject(model);
      const k = 1.7 / Math.max(0.01, cb.max.x - cb.min.x);
      model.scale.set(k, 1, k);
      model.position.set(seat.x, 0, seat.z);
      model.rotation.y = seat.yaw;
      g.add(model);
      chairSeats.push(model);
      continue;
    }
    chairSeats.push(null);
    const chair = new THREE.Group();
    const cm = fabric('#d9774b');
    const cd = fabric('#b95d36');
    const cseat = mesh(rbox(1.7, 0.45, 1.6, 0.2), cd, { receive: true });
    cseat.position.y = 0.32;
    const cush = mesh(rbox(1.2, 0.2, 1.3, 0.1), cm);
    cush.position.set(0, 0.62, 0.1);
    const cback = mesh(rbox(1.7, 1.5, 0.45, 0.2), cm);
    cback.position.set(0, 1.0, -0.6);
    chair.add(cseat, cush, cback);
    for (const ax of [-1, 1]) {
      const arm = mesh(rbox(0.3, 0.8, 1.6, 0.15), cm);
      arm.position.set(ax * 0.75, 0.6, 0);
      chair.add(arm);
    }
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.yaw;
    g.add(chair);
    chairSeats[chairSeats.length - 1] = chair;
  }

  // ── No chão, à frente da mesa: dois pufes (KayKit Holiday «footstool»), em cima de um tapete oval ──
  // Sem os modelos, uma almofada amarela e um puff verde feitos à mão.
  const seat5 = Object.assign(ROOM_SEATS[5]!, { x: -2.1, z: TABLE_Z + 2.6, yaw: 0.3 });
  const seat6 = Object.assign(ROOM_SEATS[6]!, { x: 2.1, z: TABLE_Z + 2.6, yaw: -0.3 });
  let pile: THREE.Object3D | null = prop('kaykit-holiday/footstool_red', { width: 1.5 });
  if (pile) place(g, pile, seat5.x, 0, seat5.z, seat5.yaw);
  else {
    pile = mesh(rbox(1.5, 0.3, 1.5, 0.14), fabric('#f2c14e'), { receive: true });
    pile.position.set(seat5.x, 0.15, seat5.z);
    pile.rotation.y = seat5.yaw;
    g.add(pile);
  }
  let bean: THREE.Object3D | null = prop('kaykit-holiday/footstool_green', { width: 1.5 });
  if (bean) place(g, bean, seat6.x, 0, seat6.z, seat6.yaw);
  else {
    bean = mesh(new THREE.SphereGeometry(0.85, 20, 14), fabric('#4cad7a'));
    bean.scale.set(1, 0.5, 1);
    bean.position.set(seat6.x, 0.36, seat6.z);
    g.add(bean);
  }

  // ── Lareira acesa, com faúlhas (à direita, na parede de trás) ──
  // A KayKit não tem lareira: é a de tijolo feita à mão.
  const FIRE_X = 7.3;
  const fire = new THREE.Group();
  const stone = null as THREE.Group | null;
  /** Boca do lume (centro, tamanho e face da frente) e tampo, no referencial da lareira. */
  const mouth = { y: 1.1, w: 2.4, h: 2, z: 0.3 };
  let fireZ = -8.4;
  let fireFront = 0.6;
  if (stone) {
    fire.add(stone);
    const box = new THREE.Box3().setFromObject(stone);
    const W = box.max.x - box.min.x;
    const H = box.max.y;
    const D = box.max.z - box.min.z;
    // No modelo: a boca vai de 18% a 54% da altura e ocupa 34% da largura; a face fica 22% atrás da frente.
    Object.assign(mouth, { y: 0.36 * H, w: 0.34 * W, h: 0.36 * H, z: box.max.z - 0.22 * D });
    fireZ = WALL_Z - box.min.z;
    fireFront = box.max.z;
  } else {
    const brick = toonUnique('#ffffff', { map: bricks() });
    const body = mesh(new THREE.BoxGeometry(4.2, 4.6, 1.2), brick, { receive: true });
    body.position.y = 2.3;
    const chimney = mesh(new THREE.BoxGeometry(2.6, 4.4, 0.9), brick);
    chimney.position.set(0, 6.8, -0.15);
    const mantel = mesh(rbox(4.9, 0.3, 1.6, 0.08), toon('#6b4524'));
    mantel.position.set(0, 3.3, 0.15);
    const hearth = mesh(new THREE.BoxGeometry(4.6, 0.18, 1.2), toon('#8f8a80'), { receive: true });
    hearth.position.set(0, 0.09, 1.1);
    const arch = mesh(new THREE.TorusGeometry(1.2, 0.18, 6, 16, Math.PI), brick);
    arch.position.set(0, 2.05, 0.62);
    fire.add(body, chimney, mantel, hearth, arch);
    fireFront = 1.7;
  }
  const hole = mesh(new THREE.BoxGeometry(mouth.w, mouth.h, stone ? 0.06 : 0.7), toon('#1a1210'), { cast: false });
  hole.position.set(0, mouth.y, stone ? mouth.z + 0.03 : mouth.z);
  fire.add(hole);
  // Chamas (encolhem com a boca do lume).
  const k = mouth.w / 2.4;
  const floorY = mouth.y - mouth.h / 2;
  const flameZ = stone ? mouth.z + 0.22 : 0.45;
  const flames: THREE.Mesh[] = [];
  const flameColors = ['#ff6a1a', '#ffa41b', '#ffd23f'];
  for (let i = 0; i < 7; i++) {
    const fh = (1.05 - (i % 3) * 0.25) * k;
    const f = mesh(new THREE.ConeGeometry((0.3 - (i % 3) * 0.06) * k, fh, 8), toonUnique(flameColors[i % 3]!, { emissive: flameColors[i % 3]!, emissiveIntensity: 1.5 }), { cast: false });
    f.geometry.translate(0, fh / 2, 0);
    f.position.set((-0.75 + i * 0.25) * k, floorY + 0.05 * k, flameZ + (i % 2) * 0.1 * k);
    f.userData.x = f.position.x;
    fire.add(f);
    flames.push(f);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: '#ff9a3c', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.2 * k, 2.4 * k, 1);
  glow.position.set(0, mouth.y - 0.1, flameZ + 0.45);
  fire.add(glow);
  const fireLight = new THREE.PointLight('#ff9a3c', 16, 13);
  fireLight.position.set(0, mouth.y + 0.1, flameZ + 1.15);
  fire.add(fireLight);
  fire.position.set(FIRE_X, 0, fireZ);
  g.add(fire);
  // Quem aquece as mãos fica de pé à frente da lareira, um pouco de lado, virado para o lume.
  {
    const s = ROOM_SEATS[8]!;
    s.x = FIRE_X - 0.9;
    s.z = fireZ + fireFront + 1.0;
    s.yaw = Math.atan2(FIRE_X - s.x, fireZ - s.z);
    s.y = 0;
  }
  // Faúlhas a subir da boca do lume.
  const mm = new THREE.Matrix4();
  const sparkY = floorY + 0.3;
  const sparkZ = fireZ + flameZ + 0.1;
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 4, 3), new THREE.MeshBasicMaterial({ color: '#ffcf5a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 24);
  const sparkP = Array.from({ length: 24 }, () => ({ p: new THREE.Vector3(FIRE_X, sparkY + Math.random() * 1.4, sparkZ), v: 0.6 + Math.random() }));
  sparks.frustumCulled = false;
  g.add(sparks);
  updaters.push((dt, time) => {
    sparkP.forEach((s, i) => {
      s.p.y += s.v * dt;
      s.p.x = FIRE_X + Math.sin(time * 3 + i) * 0.35 * k;
      if (s.p.y > sparkY + 1.4) s.p.set(FIRE_X + (Math.random() - 0.5) * 1.2 * k, sparkY, sparkZ + Math.random() * 0.2);
      sparks.setMatrixAt(i, mm.makeTranslation(s.p.x, s.p.y, s.p.z));
    });
    sparks.instanceMatrix.needsUpdate = true;
  });

  // ── Cómoda baixa à direita do sofá (KayKit «cabinet_medium_decorated») ──
  againstWall(g, prop('kaykit-furniture/cabinet_medium_decorated', { width: 2.0 }), 3.95, 0);
  // Candeeiro entre o sofá principal e o cadeirão esquerdo, atrás do tapete.
  place(g, prop('kaykit-furniture/lamp_standing', { height: 2.6 }), -2.65, 0, TABLE_Z - 2.0, 0);

  // Guitarra encostada à parede e cadeira de gamer ao canto (KayKit Mixed Bag).
  againstWall(g, prop('kaykit-mixed1/guitar_A', { height: 1.5 }), -5.6, 0);
  place(g, prop('kaykit-mixed2/gamer_chair_A', { height: 1.9 }), -9.5, 0, -6.5, 0.6);
  // O lugar junto à parede esquerda fica livre da estante baixa removida.
  Object.assign(ROOM_SEATS[7]!, { x: -5.8, z: -7.25, yaw: 0.25, y: 0, anim: 'fiddle' });
  // Do outro lado da lareira, alguém de pé a beber, virado para a sala.
  Object.assign(ROOM_SEATS[9]!, { x: FIRE_X + 2.1, z: fireZ + fireFront + 1.3, yaw: -0.5, y: 0, anim: 'drink' });

  // ── Plantas nos cantos (catos em vaso da KayKit; sem eles, feitas à mão) ──
  for (const [px, pz, seed] of [[-6.0, -8.0, 3], [10.0, -8.0, 7], [-5.6, -3.0, 11]] as const)
    place(g, prop(seed === 7 ? 'kaykit-furniture/cactus_medium_B' : 'kaykit-furniture/cactus_medium_A', { height: 1.2 }), px, 0, pz, seed) ?? g.add(pottedPlant(px, pz, seed));

  // ── Lugares sentados: rabo no assento e costas no encosto, sem entrar nos modelos ──
  g.updateMatrixWorld(true);
  sofaSeats.forEach((m, i) => fitSeat(ROOM_SEATS[i]!, m));
  chairSeats.forEach((m, i) => m && fitSeat(ROOM_SEATS[3 + i]!, m));
  fitSeat(seat5, pile, 0, 1);
  fitSeat(seat6, bean, 0.06, 1);

  // ── Televisão de tubo num móvel baixo, no canto da frente (virada para o sofá) ──
  // Desligada até o VIP carregar em Ⓨ; aí liga e o menu dos jogos passa no vidro dela.
  let tv: CrtScreen;
  {
    const tvg = new THREE.Group();
    const CAB_TOP = 0.8;
    const CAB_FRONT = 0.6;
    /** Centro e tamanho do vidro (no referencial do móvel). */
    const glass = { center: new THREE.Vector3(0, TV.y, 0.12), w: 2.0, h: 1.13 };
    /** Largura do móvel (um pouco mais larga do que a TV). */
    const CAB_W = 2.6;
    let depth = 1.2;
    // Modelo «CRT TV» (Timothy Ahene, Sketchfab, Free Standard). Vem virado para trás.
    const crt = prop('crt-tv/crt-tv', { height: 1.7 });
    let screenMesh = null as THREE.Mesh | null;
    if (crt) {
      crt.rotation.y = Math.PI;
      crt.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(crt);
      depth = Math.max(1.0, box.max.z - box.min.z + 0.3);
      crt.position.set(0, CAB_TOP, CAB_FRONT - 0.15 - box.max.z);
      crt.updateMatrixWorld(true);
      crt.getObjectByName('Screen')?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) screenMesh = o as THREE.Mesh;
      });
      tvg.add(crt);
    }
    const cab = mesh(rbox(CAB_W, CAB_TOP, depth, 0.06), toon('#6b4524'), { receive: true });
    cab.position.set(0, CAB_TOP / 2, CAB_FRONT - depth / 2);
    for (const dx of [-CAB_W / 4, CAB_W / 4]) {
      const door = mesh(rbox(CAB_W / 2 - 0.15, CAB_TOP - 0.25, 0.05, 0.03), toon('#7a5230'), { cast: false });
      door.position.set(dx, CAB_TOP / 2, CAB_FRONT);
      const knob = mesh(new THREE.SphereGeometry(0.05, 8, 6), toon('#d9a441'), { cast: false });
      knob.position.set(dx * 0.35, CAB_TOP / 2, CAB_FRONT + 0.05);
      tvg.add(door, knob);
    }
    tvg.add(cab);
    if (screenMesh) {
      const sm = screenMesh;
      const box = new THREE.Box3().setFromObject(sm);
      box.getCenter(glass.center);
      glass.w = box.max.x - box.min.x;
      glass.h = box.max.y - box.min.y;
      // A parte do vidro que tem imagem (as coordenadas de textura não ocupam o quadrado todo).
      const uv = sm.geometry.getAttribute('uv');
      const r: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < uv.count; i++) {
        r[0] = Math.min(r[0], uv.getX(i));
        r[1] = Math.min(r[1], uv.getY(i));
        r[2] = Math.max(r[2], uv.getX(i));
        r[3] = Math.max(r[3], uv.getY(i));
      }
      tv = new CrtScreen(sm, sm.material, { aspect: glass.w / glass.h, uvRect: r });
    } else {
      // Sem o modelo: TV plana feita à mão.
      const stand = mesh(rbox(0.8, 0.1, 0.5, 0.04), toon('#1d1d24'));
      stand.position.y = CAB_TOP + 0.05;
      const neck = mesh(new THREE.BoxGeometry(0.16, 0.4, 0.1), toon('#1d1d24'));
      neck.position.y = CAB_TOP + 0.3;
      const bezel = mesh(rbox(glass.w + 0.25, glass.h + 0.25, 0.18, 0.06), toon('#15151c'));
      bezel.position.y = TV.y;
      const off = new THREE.MeshBasicMaterial({ color: '#0b0b10' });
      const screen = mesh(new THREE.PlaneGeometry(glass.w, glass.h), off, { cast: false });
      screen.position.copy(glass.center);
      tvg.add(stand, neck, bezel, screen);
      tv = new CrtScreen(screen, off, { aspect: glass.w / glass.h, uvRect: [0, 0, 1, 1] });
    }
    tvg.position.set(TV.x, 0, TV.z);
    tvg.rotation.y = TV_YAW;
    g.add(tvg);
    // A câmara pára de frente para o vidro, à distância certa para o ecrã encher o jogo.
    tvg.updateMatrixWorld(true);
    const front = new THREE.Vector3(Math.sin(TV_YAW), 0, Math.cos(TV_YAW));
    const center = tvg.localToWorld(glass.center.clone());
    const dist = glass.h / 2 / Math.tan(THREE.MathUtils.degToRad(ROOM_FOV / 2)) / TV_FILL;
    TV_VIEW.look.copy(center);
    TV_VIEW.pos.copy(center).addScaledVector(front, dist);
    // Luz que a TV deita na sala quando está ligada.
    const tvGlow = new THREE.PointLight('#a9b8ff', 0, 7);
    tvGlow.position.copy(center).addScaledVector(front, 1.2);
    g.add(tvGlow);
    updaters.push((_dt, time) => {
      tv.update(time);
      tvGlow.intensity = 4 * tv.level;
    });
  }

  scene.add(g);
  let last = -1;
  return {
    group: g,
    tv,
    update(time: number) {
      const dt = last < 0 ? 0 : Math.min(0.1, time - last);
      last = time;
      // A lareira tremeluz.
      fireLight.intensity = 14 + Math.sin(time * 9) * 2.4 + Math.sin(time * 23) * 1.4;
      (glow.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(time * 11) * 0.08;
      flames.forEach((f, i) => {
        f.scale.y = 1 + Math.sin(time * (7 + i) + i) * 0.2;
        f.position.x = (f.userData.x as number) + Math.sin(time * 5 + i * 2) * 0.04;
      });
      for (const u of updaters) u(dt, time);
    },
  };
}
