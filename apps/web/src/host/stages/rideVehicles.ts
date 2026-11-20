/**
 * Veículos das viagens no tabuleiro: cabine do teleférico/elevador (castelo), vagoneta da mina
 * (vulcão) e carrinho da montanha-russa (parque). Feitos de primitivas (os packs não têm nenhum).
 *
 * O veículo fica no ponto da curva (y = 0 são os carris, que estão 0,3 abaixo da curva, mais as
 * rodas); a personagem vai de pé no chão do veículo, `seat` acima desse ponto.
 */
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';

export type RideKind = 'cart' | 'elevator' | 'coaster';

/** Quanto o elevador sobe acima do andar mais alto da viagem antes de seguir pelo cabo. */
export const ELEVATOR_RISE = 8;
/** Altura do cabo do teleférico acima dos pés de quem vai na cabine. */
export const CABLE_ABOVE = 3;

/** Altura dos carris abaixo da curva (ver `rails` no boardThemes). */
const RAIL = -0.3;

export interface RideVehicle {
  root: THREE.Group;
  /** Altura dos pés de quem vai lá dentro, acima do ponto da curva. */
  seat: number;
  /** Porta/barra: 0 = fechada, 1 = aberta. */
  setOpen(k: number): void;
  /** Animação durante a viagem (rodas, balanço, corda do elevador). */
  update(time: number, speed: number, cableY?: number): void;
}

export function rideVehicle(kind: RideKind): RideVehicle {
  if (kind === 'elevator') return cabin();
  if (kind === 'cart') return mineCart();
  return coasterCar();
}

function wheels(root: THREE.Group, color: string, r: number, x: number, z: number, y: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const geo = new THREE.CylinderGeometry(r, r, 0.14, 12);
  geo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = mesh(geo, toon(color));
      w.position.set(sx * x, y, sz * z);
      root.add(w);
      out.push(w);
    }
  return out;
}

/** Cabine de ferro com lanterna, pendurada num braço que agarra o cabo; a porta da frente sobe. */
function cabin(): RideVehicle {
  const FLOOR = -0.1;
  const root = new THREE.Group();
  const iron = toon('#2f2f3a');
  const floor = mesh(new THREE.BoxGeometry(1.9, 0.2, 1.9), toon('#5a3a1e'), { receive: true });
  floor.position.y = FLOOR;
  root.add(floor);
  // Grades dos lados e de trás (a frente é a porta).
  const barGeo = new THREE.BoxGeometry(0.07, 2.5, 0.07);
  for (let i = 0; i < 6; i++) {
    const t = -0.85 + (i / 5) * 1.7;
    for (const [x, z] of [[-0.9, t], [0.9, t], [t, -0.9]] as const) {
      const bar = mesh(barGeo, iron);
      bar.position.set(x, FLOOR + 1.35, z);
      root.add(bar);
    }
  }
  const roof = mesh(new THREE.ConeGeometry(1.5, 0.7, 4), toon('#5b3a8a'));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = FLOOR + 2.95;
  const rim = mesh(new THREE.BoxGeometry(2, 0.14, 2), iron);
  rim.position.y = FLOOR + 2.6;
  root.add(roof, rim);
  const lamp = mesh(new THREE.SphereGeometry(0.16, 10, 8), toonUnique('#ffcf6a', { emissive: '#ffb347', emissiveIntensity: 2 }), { cast: false });
  lamp.position.set(0, FLOOR + 2.4, 0);
  root.add(lamp);
  // Braço até ao cabo e roda que corre no cabo.
  const arm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), iron);
  arm.position.y = FLOOR + 3.3 - 0.5 + 0.05;
  const grip = mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), toon('#c9a227'));
  grip.position.y = CABLE_ABOVE + 0.2;
  root.add(arm, grip);
  // Corda vertical (até à roldana) enquanto sobe/desce no poço.
  const rope = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), toon('#1d1d24'), { cast: false });
  rope.visible = false;
  root.add(rope);
  // Porta de grade à frente: sobe para abrir.
  const door = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const bar = mesh(barGeo, iron);
    bar.position.set(-0.85 + (i / 5) * 1.7, 0, 0);
    door.add(bar);
  }
  const cross = mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), iron);
  door.add(cross);
  door.position.set(0, FLOOR + 1.35, 0.9);
  root.add(door);
  return {
    root,
    seat: 0,
    setOpen: (k) => (door.position.y = FLOOR + 1.35 + k * 2.1),
    update: (time, speed, cableY) => {
      // Balança um pouco quando vai depressa no cabo.
      root.rotation.z = Math.sin(time * 3) * 0.03 * Math.min(1, speed / 6);
      grip.rotation.z = time * speed * 2;
      lamp.scale.setScalar(1 + Math.sin(time * 11) * 0.08);
      if (cableY === undefined) return;
      const len = cableY - (root.position.y + CABLE_ABOVE);
      rope.visible = len > 0.15;
      if (rope.visible) {
        rope.scale.y = len;
        rope.position.y = CABLE_ABOVE + len / 2;
      }
    },
  };
}

/** Vagoneta de mina: caixa de madeira com aros de ferro, rodas e uma lanterna à frente. */
function mineCart(): RideVehicle {
  const FLOOR = RAIL + 0.24 + 0.14; // rodas (raio 0,24) em cima dos carris
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wood = toon('#7a5230');
  const iron = toon('#3a3a44');
  const bottom = mesh(new THREE.BoxGeometry(1.3, 0.12, 1.7), wood);
  bottom.position.y = FLOOR;
  body.add(bottom);
  for (const [x, z, w, d] of [[-0.7, 0, 0.12, 1.8], [0.7, 0, 0.12, 1.8], [0, -0.9, 1.5, 0.12], [0, 0.9, 1.5, 0.12]] as const) {
    const side = mesh(new THREE.BoxGeometry(w, 0.75, d), wood);
    side.position.set(x, FLOOR + 0.4, z);
    body.add(side);
    const band = mesh(new THREE.BoxGeometry(w + 0.04, 0.1, d + 0.04), iron);
    band.position.set(x, FLOOR + 0.72, z);
    body.add(band);
  }
  const ws = wheels(root, '#2b2b33', 0.24, 0.62, 0.55, RAIL + 0.24);
  const lamp = mesh(new THREE.SphereGeometry(0.14, 10, 8), toonUnique('#ffcf6a', { emissive: '#ffa53a', emissiveIntensity: 2 }), { cast: false });
  lamp.position.set(0, FLOOR + 0.85, 0.98);
  body.add(lamp);
  return {
    root,
    seat: FLOOR + 0.06,
    setOpen: () => {},
    update: (time, speed) => {
      for (const w of ws) w.rotation.x += speed * 0.06;
      // Abana nos carris.
      body.rotation.z = Math.sin(time * 17) * 0.025 * Math.min(1, speed / 5);
      body.position.y = Math.abs(Math.sin(time * 23)) * 0.03 * Math.min(1, speed / 5);
    },
  };
}

/** Carrinho da montanha-russa: carroçaria vermelha, frente arredondada e barra de segurança. */
function coasterCar(): RideVehicle {
  const FLOOR = RAIL + 0.18 + 0.12; // rodas (raio 0,18) em cima dos carris
  const root = new THREE.Group();
  const red = toonUnique('#ff3b5c');
  const body = mesh(new THREE.BoxGeometry(1.4, 0.6, 1.8), red);
  body.position.y = FLOOR + 0.2;
  const nose = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 16, 1, false, -Math.PI / 2, Math.PI), red);
  nose.position.set(0, FLOOR + 0.2, 0.9);
  const stripe = mesh(new THREE.BoxGeometry(1.44, 0.12, 1.84), toon('#ffd23f'));
  stripe.position.y = FLOOR + 0.42;
  root.add(body, nose, stripe);
  const ws = wheels(root, '#9aa3ad', 0.18, 0.66, 0.6, RAIL + 0.18);
  // Barra de segurança: baixa ao arrancar.
  const bar = new THREE.Group();
  const tube = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), toon('#ffd23f'));
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0, 0, 0.55);
  bar.add(tube);
  bar.position.set(0, FLOOR + 0.55, -0.25);
  root.add(bar);
  return {
    root,
    seat: FLOOR + 0.1,
    setOpen: (k) => (bar.rotation.x = -k * 1.2),
    update: (_time, speed) => {
      for (const w of ws) w.rotation.x += speed * 0.08;
    },
  };
}
