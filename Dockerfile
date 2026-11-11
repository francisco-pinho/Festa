# Festa num servidor alojado (opcional; ver docs/ONLINE.md). O jogo, o comando e o vídeo
# ficam num só endereço fixo; o PC só abre o ecrã do jogo nesse endereço.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci && npm run build
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
