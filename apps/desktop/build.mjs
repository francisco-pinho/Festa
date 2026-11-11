/**
 * Prepara a app de computador:
 *  - junta o processo principal (com o servidor) e o preload em ficheiros únicos (esbuild);
 *  - copia o `cloudflared` instalado neste PC para dentro da app (resources/bin), se existir.
 * O cliente web (apps/web/dist) entra como recurso extra pelo electron-builder.
 */
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
  // `electron` vem do próprio Electron; os outros são opcionais do `ws` (aceleradores nativos).
  external: ['electron', 'bufferutil', 'utf-8-validate'],
};

await build({ ...common, entryPoints: [join(here, 'src/main.ts')], outfile: join(here, 'dist/main.cjs') });
await build({ ...common, entryPoints: [join(here, 'src/preload.ts')], outfile: join(here, 'dist/preload.cjs') });

// cloudflared dentro da app (Windows): o que está instalado neste PC (instalado pelo winget oficial).
const candidates = [
  process.env.CLOUDFLARED,
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
].filter(Boolean);
const found = candidates.find((p) => existsSync(p));
mkdirSync(join(here, 'resources/bin'), { recursive: true });
const dest = join(here, 'resources/bin/cloudflared.exe');
if (found) {
  // Já lá está a mesma versão? (pode estar em uso por uma app aberta)
  if (!existsSync(dest) || statSync(dest).size !== statSync(found).size) copyFileSync(found, dest);
  console.log(`cloudflared incluído: ${found}`);
} else {
  console.warn('⚠ cloudflared não encontrado: a app vai precisar dele instalado para «Jogar online».');
}
