/** Cenário à volta dos minijogos: um anel de árvores, plantas e adereços (modelos detalhados, se estiverem carregados). */
import * as THREE from 'three';
import type { Rng } from '@festa/game';
import { PROPS, pickProp } from '../three/props';

export function ringDecor(scene: THREE.Scene, rng: Rng, radius: number, count = 26, opts: { props?: readonly string[]; trees?: readonly string[]; ground?: string } = {}): void {
  const trees = opts.trees ?? PROPS.trees;
  // Minijogos rodeados de água: uma faixa de terra para o cenário não flutuar.
  if (opts.ground) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 1, radius + 16, 64), new THREE.MeshToonMaterial({ color: opts.ground }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.02;
    ring.receiveShadow = true;
    scene.add(ring);
  }
  // Sem baús, montes de moedas nem caixotes: pareciam objetos do jogo (e confundiam).
  const looksLikeItem = /Chest|Coin|Crate/i;
  const props = opts.props ?? [...PROPS.plants, ...PROPS.fantasyProps.filter((k) => !looksLikeItem.test(k)).slice(0, 10)];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.next() * 0.2;
    const big = i % 2 === 0;
    const o = big ? pickProp(trees, rng.next(), { height: 5 + rng.next() * 3 }) : pickProp(props, rng.next(), { height: 0.9 + rng.next() * 1 });
    if (!o) continue;
    const r = radius + (big ? 4 + rng.next() * 6 : rng.next() * 3);
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.rotation.y = rng.next() * Math.PI * 2;
    scene.add(o);
  }
}
