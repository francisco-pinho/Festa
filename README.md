# Festa 🎉

Jogo de festa em **3D** para o **PC**, com os **telemóveis como comandos**: cada jogador escolhe uma
personagem, avança num tabuleiro lançando dados e, no fim de cada ronda, há um minijogo.
Os telemóveis não instalam nada: leem o QR code (ou abrem `http://<pc>/play`) e escrevem o código da sala.

## Arranque rápido

Requisitos: [Node.js](https://nodejs.org) 20 ou superior.

```bash
npm install
```

```bash
npm run dev
```

- Abre **http://localhost:5173** no PC (de preferência numa TV/ecrã grande).
- Nos telemóveis (na **mesma rede Wi-Fi**), lê o QR code. O primeiro a entrar é o VIP ⭐ e escolhe o nº de rondas.
- Sem telemóvel à mão? Tecla **1** (WASD + Espaço) e **2** (setas + `.`) juntam jogadores de teclado.
- Se o QR mostrar o IP errado (VirtualBox, VPN, WSL…), carrega em **I** no lobby.

> **Windows:** da primeira vez, o Windows pergunta se o Node.js pode aceitar ligações na rede. Aceita para **redes privadas**, senão os telemóveis não chegam ao PC.

## Como se joga

1. **Lobby** — entram de 1 a 10 jogadores. Os **bots** completam a mesa: mínimo 4 e sempre um número **par**.
2. **Personagens** — cada um escolhe a sua no telemóvel (10 personagens originais).
3. **Ordem de jogo** — todos lançam um dado; o maior joga primeiro.
4. **Rondas** — na sua vez, cada jogador lança **dois dados** (botão ou abanar o telemóvel) e anda a soma.
   **Dados iguais** dão direito a um **terceiro dado**. Nos cruzamentos escolhe o caminho no telemóvel.
5. **Casas** — 🔵 +3 moedas · 🔴 −3 · 🍀 sorte · ❗ azar · ❓ tornado (troca de lugar). Nas 3 últimas rondas, azuis e vermelhas valem o dobro.
6. **Estrela** — ao passar por ela com 20 moedas, podes comprá-la; depois muda de sítio.
7. **Minijogo no fim de cada ronda** — o tipo depende das cores onde todos pararam:
   todos iguais → **todos contra todos**; só um diferente → **1 contra todos**; resto → **equipas** iguais.
   Os vencedores ganham 10 moedas.
8. **Final** — estrelas bónus (minijogos, fortuna, aventura) e pódio. Ganha quem tiver mais estrelas (desempate: moedas).

## Modos de ligação

| Modo | Como | Quem vê o ecrã |
|---|---|---|
| **Local (LAN)** | `npm run build` e `npm start` no PC (porta 3000). Telemóveis entram pelo IP do PC. | Todos na sala |
| **Online** | Alojar o servidor com `PUBLIC_URL` definido. Telemóveis entram de qualquer lado. | À distância, por partilha de ecrã |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor (porta 3000) + Vite (porta 5173), com recarregamento automático |
| `npm run build` | Compila o cliente web para `apps/web/dist` |
| `npm start` | Produção: um só processo serve o jogo, o comando e o Socket.IO |
| `npm test` | Testes das regras do jogo e do servidor |
| `npm run typecheck` | Verifica tipos em todos os pacotes |

### Ferramentas de desenvolvimento (só em `npm run dev`)

- Tecla **T** no lobby: festa de **1 ronda** (para testar o final depressa).
- `http://localhost:5173/?minigame=sumo&mode=teams&players=8`: corre um minijogo diretamente com bots
  (`minigame`: `coin-shower`, `sumo`, `tag`; `mode`: `ffa`, `teams`, `oneVsAll`).
- Na consola do browser, `window.festa` dá acesso ao motor, HUD e ligação.

## Estrutura

```
packages/shared   Protocolo de rede (tipos + validação zod)
packages/game     Regras da festa: tabuleiro, dados, casas, estrela, minijogos, bots (sem gráficos, com testes)
apps/server       Node + Express + Socket.IO: salas, códigos, reconexão, encaminhamento
apps/web          Vite: ecrã principal 3D (Three.js, index.html) e comando do telemóvel (play.html)
docs/             Arquitetura e decisões
```

Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
