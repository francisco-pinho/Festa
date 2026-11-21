/**
 * Ponte entre os mapas do jogo e o Blender (ver docs/BLENDER-MAPAS.md).
 *
 *   npm run mapa -- exportar ilha
 *       Cria blender/ilha-casas.glb: um ponto (empty) por casa, com o nome `casa_N` e as
 *       propriedades (tipo, seguinte, zona…), e um ponto `mapa` com as regras. Importa-se no
 *       Blender para servir de ponto de partida ao cenário.
 *
 *   npm run mapa -- importar ilha [ficheiro.glb]
 *       Lê o .glb exportado do Blender (por omissão blender/ilha.glb): as casas passam para
 *       packages/game/src/maps/ilha.ts e o .glb inteiro (cenário) vai para
 *       apps/web/public/maps/ilha.glb, onde o jogo o carrega.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BOARDS, boardToLayout, type LayoutSpace, type MapLayout } from '../packages/game/src';

const ROOT = resolve(import.meta.dirname, '..');
const [cmd, id, file] = process.argv.slice(2);

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
interface GltfNode {
  name?: string;
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
  matrix?: number[];
  children?: number[];
  extras?: Record<string, unknown>;
}

// ── GLB (glTF binário) ─────────────────────────────────

function writeGlb(path: string, json: object): void {
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4) text += ' ';
  const body = Buffer.from(text);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // «glTF»
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + body.length, 8);
  header.writeUInt32LE(body.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // «JSON»
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, body]));
}

function readGlbJson(path: string): { nodes?: GltfNode[]; scenes?: { nodes: number[] }[]; scene?: number } {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} não é um .glb (exporta como «glTF Binary»)`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Roda o vetor `v` pelo quaternião `q` (x, y, z, w). */
function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** Posição de cada nó no mundo (compõe as transformações dos pais). */
function worldPositions(nodes: GltfNode[], roots: number[]): Map<number, Vec3> {
  const out = new Map<number, Vec3>();
  // Cada pai como função local → mundo.
  const visit = (i: number, toWorld: (p: Vec3) => Vec3) => {
    const n = nodes[i]!;
    let local: (p: Vec3) => Vec3;
    if (n.matrix) {
      const m = n.matrix;
      local = ([x, y, z]) => [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
    } else {
      const t = n.translation ?? [0, 0, 0];
      const r = n.rotation ?? [0, 0, 0, 1];
      const s = n.scale ?? [1, 1, 1];
      local = (p) => {
        const q = rotate(r, [p[0] * s[0], p[1] * s[1], p[2] * s[2]]);
        return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
      };
    }
    const mine = (p: Vec3) => toWorld(local(p));
    out.set(i, mine([0, 0, 0]));
    for (const c of n.children ?? []) visit(c, mine);
  };
  for (const r of roots) visit(r, (p) => p);
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const list = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ── Comandos ───────────────────────────────────────────

function exportar(mapId: string): void {
  const def = BOARDS.find((b) => b.id === mapId);
  if (!def) throw new Error(`Mapa desconhecido: ${mapId} (há: ${BOARDS.map((b) => b.id).join(', ')})`);
  const layout = boardToLayout(def.create());
  const nodes: GltfNode[] = [
    { name: 'mapa', extras: { regras: JSON.stringify(layout.rules) } },
    ...layout.spaces.map((s) => ({
      name: s.name,
      translation: [r2(s.x), r2(s.y), r2(s.z)] as Vec3,
      // Propriedades em texto (no Blender aparecem em Object Properties → Custom Properties).
      extras: {
        tipo: s.type ?? '',
        seguinte: s.next.join(', '),
        zona: s.zone ?? '',
        estrela: s.star ? 1 : 0,
        loja: s.shopId ?? '',
      },
    })),
  ];
  const out = resolve(ROOT, 'blender', `${mapId}-casas.glb`);
  writeGlb(out, { asset: { version: '2.0', generator: 'Festa · mapa-blender' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes });
  console.log(`Feito: ${out} (${layout.spaces.length} casas). Importa no Blender: File → Import → glTF 2.0.`);
}

function importar(mapId: string, glbPath?: string): void {
  const src = resolve(ROOT, glbPath ?? `blender/${mapId}.glb`);
  const gltf = readGlbJson(src);
  const nodes = gltf.nodes ?? [];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const world = worldPositions(nodes, roots);
  // O Blender junta «.001» aos nomes repetidos: fica só o nome base.
  const base = (n: string) => n.replace(/\.\d+$/, '');
  const mapa = nodes.find((n) => base(n.name ?? '') === 'mapa');
  if (!mapa?.extras?.regras) throw new Error('Falta o objeto «mapa» com a propriedade «regras» (vem do exportar). Exportaste com «Custom Properties» ligado?');
  const spaces: LayoutSpace[] = [];
  nodes.forEach((n, i) => {
    const name = base(n.name ?? '');
    if (!/^casa_\w+$/.test(name)) return;
    const e = n.extras ?? {};
    const [x, y, z] = world.get(i) ?? [0, 0, 0];
    spaces.push({
      name,
      x: r2(x),
      y: r2(Math.max(0, y)),
      z: r2(z),
      ...(e.tipo ? { type: String(e.tipo) as LayoutSpace['type'] } : {}),
      next: list(e.seguinte),
      ...(e.zona ? { zone: String(e.zona) } : {}),
      ...(Number(e.estrela) ? { star: true } : {}),
      ...(e.loja ? { shopId: String(e.loja) } : {}),
    });
  });
  if (!spaces.length) throw new Error('Não encontrei casas (objetos com nome casa_…) no .glb');
  const layout: MapLayout = { rules: { ...(JSON.parse(String(mapa.extras.regras)) as MapLayout['rules']), scenery: `/maps/${mapId}.glb` }, spaces };
  const ts = `/** Gerado por \`npm run mapa -- importar ${mapId}\` a partir do Blender. Não editar à mão. */\nimport type { MapLayout } from '../layout';\n\nexport const layout: MapLayout = ${JSON.stringify(layout, null, 2)};\n`;
  writeFileSync(resolve(ROOT, 'packages/game/src/maps', `${mapId}.ts`), ts);
  // Regista o mapa em maps/index.ts (uma vez).
  const indexPath = resolve(ROOT, 'packages/game/src/maps/index.ts');
  let index = readFileSync(indexPath, 'utf8');
  const varName = `${mapId.replace(/\W/g, '_')}Layout`;
  if (!index.includes(`from './${mapId}'`)) {
    index = index.replace("import type { MapLayout } from '../layout';", `import type { MapLayout } from '../layout';\nimport { layout as ${varName} } from './${mapId}';`);
    index = index.replace(/export const LAYOUTS: Record<string, MapLayout> = \{(.*)\};/s, (_m, body: string) => `export const LAYOUTS: Record<string, MapLayout> = {${body.trim() ? ` ${body.trim().replace(/,$/, '')},` : ''} '${mapId}': ${varName} };`);
    writeFileSync(indexPath, index);
  }
  const dest = resolve(ROOT, 'apps/web/public/maps', `${mapId}.glb`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`Feito: ${spaces.length} casas → packages/game/src/maps/${mapId}.ts; cenário → apps/web/public/maps/${mapId}.glb`);
}

if (cmd === 'exportar' && id) exportar(id);
else if (cmd === 'importar' && id) importar(id, file);
else {
  console.log('Uso: npm run mapa -- exportar <mapa>   |   npm run mapa -- importar <mapa> [ficheiro.glb]');
  process.exitCode = 1;
}
