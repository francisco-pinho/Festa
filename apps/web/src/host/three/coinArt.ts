/**
 * Moedas desenhadas (sem emojis): face com aro em relevo e brilho, com uma estrela (normal)
 * ou um «3» (moeda grande, roxa); borda serrilhada; e uma aura suave para destacar.
 */
import * as THREE from 'three';

/** Face da moeda: aro em relevo, fundo com brilho e uma estrela (ou o «3» na grande). */
function coinFace(big: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const base = big ? ['#f2c6ff', '#a24ae0', '#5a1f8f'] : ['#fff3b0', '#ffc928', '#c98400'];
  const grd = g.createRadialGradient(cx * 0.75, cx * 0.7, 10, cx, cx, cx);
  grd.addColorStop(0, base[0]!);
  grd.addColorStop(0.55, base[1]!);
  grd.addColorStop(1, base[2]!);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.lineWidth = 16;
  g.strokeStyle = big ? '#ffd23f' : '#e0a100';
  g.beginPath();
  g.arc(cx, cx, cx - 14, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(cx, cx, cx - 24, Math.PI * 1.05, Math.PI * 1.7);
  g.stroke();
  if (big) {
    g.font = 'bold 150px Trebuchet MS, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = '#3a0f60';
    g.strokeText('3', cx, cx + 8);
    g.fillStyle = '#ffffff';
    g.fillText('3', cx, cx + 8);
  } else {
    // Estrela em relevo: sombra escura deslocada e estrela clara por cima.
    const star = (dx: number, dy: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 62 : 26;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(cx + dx + Math.cos(a) * r, cx + dy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    };
    star(4, 5, 'rgba(140,85,0,0.65)');
    star(0, 0, '#fff0a0');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Borda serrilhada (riscas) para o lado da moeda. */
function edgeTexture(big: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = big ? '#d9a400' : '#e0a100';
  g.fillRect(0, 0, 128, 8);
  g.fillStyle = big ? '#8a5a00' : '#a06c00';
  for (let x = 0; x < 128; x += 4) g.fillRect(x, 0, 2, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 4;
  return t;
}

/** Materiais da moeda para um CylinderGeometry (lado, cima, baixo), metálicos e com brilho. */
export function coinMaterials(big: boolean): THREE.MeshStandardMaterial[] {
  const face = coinFace(big);
  const edge = edgeTexture(big);
  const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.55, roughness: 0.32, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.28 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edge, metalness: 0.6, roughness: 0.35, emissive: '#ffffff', emissiveMap: edge, emissiveIntensity: 0.2 });
  return [edgeMat, faceMat, faceMat];
}

/** Brilho redondo e suave (aura). */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
