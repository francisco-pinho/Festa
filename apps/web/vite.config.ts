import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const SERVER = `http://localhost:${process.env.SERVER_PORT ?? 3000}`;

/** Em dev, /play → /play.html (em produção o servidor Express faz o mesmo). */
const controllerRoute = (): Plugin => ({
  name: 'festa-controller-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/play' || req.url?.startsWith('/play?')) {
        req.url = req.url.replace('/play', '/play.html');
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [controllerRoute()],
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
      },
    },
  },
});
