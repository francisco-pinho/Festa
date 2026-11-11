import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const SERVER = `http://localhost:${process.env.SERVER_PORT ?? 3000}`;

/** Em dev, /play → /play.html (em produção o servidor Express faz o mesmo). */
const controllerRoute = (): Plugin => ({
  name: 'festa-controller-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/play' || req.url?.startsWith('/play?')) {
        req.url = req.url.replace('/play', '/play.html');
      }
      if (req.url === '/ver' || req.url?.startsWith('/ver?')) {
        req.url = req.url.replace('/ver', '/ver.html');
      }
      next();
    });
  },
});

export default defineConfig({
  // FESTA_HTTPS=1 (npm run dev:https): HTTPS com certificado autoassinado,
  // necessário para os sensores de movimento dos telemóveis numa rede local.
  plugins: [controllerRoute(), ...(process.env.FESTA_HTTPS === '1' ? [basicSsl()] : [])],
  server: {
    host: true, // acessível na rede local, para os telemóveis
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true },
      '/api': SERVER,
    },
  },
  build: {
    // O Three.js só é carregado no ecrã principal, não nos telemóveis.
    chunkSizeWarningLimit: 1_500,
    rollupOptions: {
      input: {
        host: resolve(import.meta.dirname, 'index.html'),
        controller: resolve(import.meta.dirname, 'play.html'),
        viewer: resolve(import.meta.dirname, 'ver.html'),
      },
    },
  },
});
