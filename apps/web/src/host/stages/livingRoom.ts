/**
 * Sala de estar do ecrã inicial: sofá, cadeirões, lareira acesa, tapete, janela com o céu lá fora,
 * televisão com «FESTA», estante, plantas e candeeiro. Quem entra vai-se sentando (sofá, cadeirões,
 * almofadas) e, quando já não há lugar, fica de pé junto à lareira.
 */
import * as THREE from 'three';
import { canvasTexture, mesh, toon, toonUnique } from '../three/materials';

/** Lugares por ordem de chegada (posição, para onde olha e se fica sentado). */
export const ROOM_SEATS: { x: number; z: number; yaw: number; sit: boolean; y?: number }[] = [
  { x: 0, z: -5.4, yaw: 0, sit: true, y: 0.62 },
  { x: -2.2, z: -5.4, yaw: 0.05, sit: true, y: 0.62 },
  { x: 2.2, z: -5.4, yaw: -0.05, sit: true, y: 0.62 },
  { x: -6.1, z: -3.2, yaw: 0.85, sit: true, y: 0.58 },
  { x: 6.1, z: -3.2, yaw: -0.85, sit: true, y: 0.58 },
  { x: -3.2, z: -1.6, yaw: 0.35, sit: true, y: 0.32 },
  { x: 3.2, z: -1.6, yaw: -0.35, sit: true, y: 0.32 },
  { x: 7.4, z: -6.3, yaw: -0.4, sit: false },
  { x: -7.6, z: -6.4, yaw: 0.4, sit: false },
  { x: 0, z: -1.2, yaw: 0, sit: false },
];

export interface LivingRoom {
  group: THREE.Group;
  update(time: number): void;
}

function planks(): THREE.CanvasTexture {
  const t = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c8935a';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      const shade = 190 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.7)},${Math.floor(shade * 0.42)},0.55)`;
      ctx.fillRect(0, y, s, 30);
      ctx.fillStyle = 'rgba(90,55,25,0.55)';
      ctx.fillRect(0, y + 30, s, 2);
      const cut = Math.floor(Math.random() * s);
      ctx.fillRect(cut, y, 2, 30);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}

function wallpaper(): THREE.CanvasTexture {
  const t = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#f6e7c8';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#efd9ad';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 14, s);
    ctx.fillStyle = 'rgba(214,120,90,0.35)';
    for (let x = 16; x < s; x += 32)
      for (let y = 16; y < s; y += 32) {
        ctx.beginPath();
        ctx.arc(x + 7, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 3);
  return t;
}

function tvScreen(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#6c5ce7');
    g.addColorStop(1, '#ff6fb5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.font = 'bold 64px Trebuchet MS, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1d1433';
    ctx.strokeText('FESTA', s / 2, s / 2 - 16);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('FESTA', s / 2, s / 2 - 16);
    ctx.font = 'bold 20px Trebuchet MS, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Entra com o telemóvel!', s / 2, s / 2 + 40);
  });
}

export function buildLivingRoom(scene: THREE.Scene): LivingRoom {
  const g = new THREE.Group();
  scene.background = new THREE.Color('#2a1f3d');
  scene.fog = null;
  // Luz de interior: suave e quente, com sol a entrar pela janela.
  g.add(new THREE.HemisphereLight('#fff1dc', '#6a4a3a', 1.5));
  const sun = new THREE.DirectionalLight('#fff3dc', 1.6);
  sun.position.set(-4, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -16;
  sc.right = sc.top = 16;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  g.add(sun, sun.target);

  // Chão de madeira e paredes
  const floor = mesh(new THREE.BoxGeometry(28, 0.3, 20), toonUnique('#ffffff', { map: planks() }), { cast: false, receive: true });
  floor.position.set(0, -0.15, -1);
  const wallMat = toonUnique('#ffffff', { map: wallpaper() });
  const back = mesh(new THREE.BoxGeometry(28, 9, 0.4), wallMat, { cast: false, receive: true });
  back.position.set(0, 4.5, -9.2);
  const left = mesh(new THREE.BoxGeometry(0.4, 9, 20), wallMat, { cast: false, receive: true });
  left.position.set(-13.8, 4.5, -1);
  const right = left.clone();
  right.position.x = 13.8;
  const skirting = mesh(new THREE.BoxGeometry(28, 0.5, 0.1), toon('#8a5a2b'), { cast: false });
  skirting.position.set(0, 0.25, -8.95);
  g.add(floor, back, left, right, skirting);

  // Tapete redondo
  const rug = mesh(new THREE.CylinderGeometry(1, 1, 0.04, 48), toon('#c94f5a'), { cast: false, receive: true });
  rug.scale.set(6.5, 1, 3.8);
  rug.position.set(0, 0.02, -2.6);
  const rugIn = mesh(new THREE.CylinderGeometry(1, 1, 0.05, 48), toon('#f2c14e'), { cast: false, receive: true });
  rugIn.scale.set(5.6, 1, 3.1);
  rugIn.position.set(0, 0.03, -2.6);
  const rugCore = mesh(new THREE.CylinderGeometry(1, 1, 0.06, 48), toon('#c94f5a'), { cast: false, receive: true });
  rugCore.scale.set(4.6, 1, 2.4);
  rugCore.position.set(0, 0.035, -2.6);
  g.add(rug, rugIn, rugCore);

  // Sofá (3 lugares) encostado à parede de trás
  const sofaMat = toon('#3f7fbf');
  const sofaDark = toon('#2f6299');
  const sofa = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(7.4, 0.7, 2), sofaDark);
  base.position.y = 0.35;
  const backrest = mesh(new THREE.BoxGeometry(7.4, 1.8, 0.6), sofaMat);
  backrest.position.set(0, 1.25, -0.75);
  sofa.add(base, backrest);
  for (const sx of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.6, 1.3, 2), sofaMat);
    arm.position.set(sx * 3.7, 0.65, 0);
    sofa.add(arm);
  }
  for (let i = -1; i <= 1; i++) {
    const cushion = mesh(new THREE.BoxGeometry(2.1, 0.3, 1.5), sofaMat);
    cushion.position.set(i * 2.2, 0.82, 0.15);
    sofa.add(cushion);
  }
  sofa.position.set(0, 0, -6.4);
  g.add(sofa);

  // Cadeirões (um de cada lado), virados para o meio
  for (const sx of [-1, 1]) {
    const chair = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(2, 0.7, 1.8), toon('#d9774b'));
    seat.position.y = 0.35;
    const cback = mesh(new THREE.BoxGeometry(2, 1.6, 0.5), toon('#c2603a'));
    cback.position.set(0, 1.1, -0.7);
    chair.add(seat, cback);
    for (const ax of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(0.4, 1, 1.8), toon('#c2603a'));
      arm.position.set(ax * 1, 0.6, 0);
      chair.add(arm);
    }
    chair.position.set(sx * 6.1, 0, -3.6);
    chair.rotation.y = -sx * 0.85;
    g.add(chair);
  }

  // Almofadas no chão (puffs)
  for (const sx of [-1, 1]) {
    const pouf = mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.35, 20), toon(sx < 0 ? '#ffd23f' : '#4cd964'));
    pouf.position.set(sx * 3.2, 0.17, -1.6);
    g.add(pouf);
  }

  // Lareira à direita, na parede de trás
  const fire = new THREE.Group();
  const stone = mesh(new THREE.BoxGeometry(4.2, 4.4, 1.2), toon('#b9a28a'));
  stone.position.y = 2.2;
  const mantel = mesh(new THREE.BoxGeometry(4.8, 0.3, 1.5), toon('#7a4f28'));
  mantel.position.set(0, 3.2, 0.1);
  const hole = mesh(new THREE.BoxGeometry(2.4, 1.9, 0.6), toon('#1d1433'), { cast: false });
  hole.position.set(0, 1.05, 0.35);
  fire.add(stone, mantel, hole);
  const flames: THREE.Mesh[] = [];
  const flameColors = ['#ff6a1a', '#ffa41b', '#ffd23f'];
  for (let i = 0; i < 5; i++) {
    const f = mesh(new THREE.ConeGeometry(0.28 - (i % 3) * 0.05, 0.9 - (i % 3) * 0.2, 8), toonUnique(flameColors[i % 3]!, { emissive: flameColors[i % 3]!, emissiveIntensity: 1.4 }), { cast: false });
    f.position.set(-0.6 + i * 0.3, 0.55, 0.45 + (i % 2) * 0.1);
    fire.add(f);
    flames.push(f);
  }
  const logs = mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 8), toon('#5b3a1e'), { cast: false });
  logs.rotation.z = Math.PI / 2;
  logs.position.set(0, 0.2, 0.45);
  fire.add(logs);
  const fireLight = new THREE.PointLight('#ff9a3c', 14, 12);
  fireLight.position.set(0, 1, 1.4);
  fire.add(fireLight);
  fire.position.set(8.6, 0, -8.6);
  g.add(fire);

  // Janela (com o céu) e cortinas, por cima do sofá
  const win = new THREE.Group();
  const frame = mesh(new THREE.BoxGeometry(5.4, 3.4, 0.2), toon('#ffffff'), { cast: false });
  const pane = mesh(new THREE.PlaneGeometry(4.9, 2.9), new THREE.MeshBasicMaterial({ color: '#9fd8ff' }), { cast: false });
  pane.position.z = 0.11;
  const crossV = mesh(new THREE.BoxGeometry(0.15, 2.9, 0.1), toon('#ffffff'), { cast: false });
  crossV.position.z = 0.15;
  const crossH = mesh(new THREE.BoxGeometry(4.9, 0.15, 0.1), toon('#ffffff'), { cast: false });
  crossH.position.z = 0.15;
  win.add(frame, pane, crossV, crossH);
  for (const sx of [-1, 1]) {
    const curtain = mesh(new THREE.BoxGeometry(1.1, 4, 0.2), toon('#c94f5a'), { cast: false });
    curtain.position.set(sx * 3.1, -0.2, 0.25);
    win.add(curtain);
  }
  win.position.set(0, 5.3, -8.95);
  g.add(win);

  // Televisão na parede à esquerda (com móvel)
  const tv = new THREE.Group();
  const cabinet = mesh(new THREE.BoxGeometry(4.4, 1.2, 1.2), toon('#7a4f28'));
  cabinet.position.y = 0.6;
  const screenFrame = mesh(new THREE.BoxGeometry(4, 2.4, 0.2), toon('#1d1433'));
  screenFrame.position.set(0, 2.9, -0.3);
  const screen = mesh(new THREE.PlaneGeometry(3.7, 2.1), new THREE.MeshBasicMaterial({ map: tvScreen() }), { cast: false });
  screen.position.set(0, 2.9, -0.19);
  tv.add(cabinet, screenFrame, screen);
  tv.position.set(-8.4, 0, -8.4);
  g.add(tv);

  // Estante, plantas e candeeiro de pé
  const shelf = new THREE.Group();
  const sframe = mesh(new THREE.BoxGeometry(2.4, 5, 0.9), toon('#8a5a2b'));
  sframe.position.y = 2.5;
  shelf.add(sframe);
  const bookColors = ['#ff6b7a', '#3fa7ff', '#ffd23f', '#4cd964', '#b98cff'];
  for (let row = 0; row < 3; row++)
    for (let b = 0; b < 6; b++) {
      const book = mesh(new THREE.BoxGeometry(0.28, 0.9 + ((b * 7 + row) % 3) * 0.12, 0.6), toon(bookColors[(b + row) % 5]!), { cast: false });
      book.position.set(-0.85 + b * 0.32, 1 + row * 1.5, 0.2);
      shelf.add(book);
    }
  shelf.position.set(-12.9, 0, -5.5);
  shelf.rotation.y = Math.PI / 2;
  g.add(shelf);
  for (const [px, pz] of [[-4.6, -8.2], [12.6, -2.5]] as const) {
    const pot = mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 12), toon('#d9774b'));
    pot.position.set(px, 0.4, pz);
    const leaves = mesh(new THREE.SphereGeometry(0.95, 12, 10), toon('#3f9d4a'));
    leaves.scale.set(1, 1.3, 1);
    leaves.position.set(px, 1.7, pz);
    g.add(pot, leaves);
  }
  const lamp = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4), toon('#3a3150'));
  pole.position.y = 2;
  const shade = mesh(new THREE.ConeGeometry(0.7, 0.8, 16, 1, true), toonUnique('#fff1c2', { emissive: '#ffd27a', emissiveIntensity: 0.5, side: THREE.DoubleSide }));
  shade.position.y = 4;
  const bulb = new THREE.PointLight('#ffd9a0', 8, 9);
  bulb.position.y = 3.8;
  lamp.add(pole, shade, bulb);
  lamp.position.set(-9.8, 0, -3);
  g.add(lamp);
  // Quadro na parede
  const picture = mesh(new THREE.BoxGeometry(2.2, 1.6, 0.1), toon('#ffd23f'), { cast: false });
  picture.position.set(4.6, 5.6, -8.95);
  const art = mesh(new THREE.PlaneGeometry(1.9, 1.3), new THREE.MeshBasicMaterial({ color: '#7ccf5b' }), { cast: false });
  art.position.set(4.6, 5.6, -8.88);
  g.add(picture, art);

  scene.add(g);
  return {
    group: g,
    update(time: number) {
      // A lareira tremeluz.
      fireLight.intensity = 12 + Math.sin(time * 9) * 2 + Math.sin(time * 23) * 1.2;
      flames.forEach((f, i) => {
        f.scale.y = 1 + Math.sin(time * (7 + i) + i) * 0.18;
        f.position.x = -0.6 + i * 0.3 + Math.sin(time * 5 + i * 2) * 0.03;
      });
    },
  };
}
