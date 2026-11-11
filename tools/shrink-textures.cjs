/**
 * Reduz texturas com o Electron (nativeImage), sem instalar nada.
 * Uso: electron tools/shrink-textures.cjs <lista.json>  (gerada pelo tools/pick-quaternius.py)
 * Cada entrada: { src, dst, size, png } → redimensiona para `size` px (no máximo) e grava PNG ou JPEG (q=85).
 */
const { app, nativeImage } = require('electron');
const fs = require('node:fs');

app.whenReady().then(() => {
  const list = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
  let before = 0;
  let after = 0;
  for (const job of list) {
    const img = nativeImage.createFromPath(job.src);
    if (img.isEmpty()) {
      console.warn('não li', job.src);
      continue;
    }
    const { width, height } = img.getSize();
    const k = Math.min(1, job.size / Math.max(width, height));
    const out = k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' }) : img;
    const buf = job.png ? out.toPNG() : out.toJPEG(85);
    fs.writeFileSync(job.dst, buf);
    before += fs.statSync(job.src).size;
    after += buf.length;
  }
  console.log(`texturas: ${list.length} · ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
  app.quit();
});
