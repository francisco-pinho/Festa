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

### O telemóvel não abre a página?

| Sintoma | Solução |
|---|---|
| Android: `ERR_TOO_MANY_RETRIES` | O Android 17 exige uma permissão para o Chrome aceder à rede local: **Definições → Apps → Chrome → Permissões → Dispositivos próximos** (ou "Rede local") → Permitir. Alternativa: usar o Firefox. |
| "A ligação não é privada" | Normal com `npm run dev:https` (certificado feito por nós): **Avançadas → Continuar**. |
| Não abre de todo | Telemóvel e PC têm de estar na **mesma rede Wi-Fi** (não a de convidados) e sem VPN; desliga os dados móveis. |

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

## Modo Desportos 🏆

No lobby, o VIP escolhe **Desportos** (ou tecla **D**) e depois o desporto. O telemóvel passa a ser
o "comando com sensores": faz-se o gesto com o braço — ou, sem sensores, arrastando o dedo.

| Desporto | Jogadores | Como se joga |
|---|---|---|
| 🎳 Bowling | 1–10 (sozinho joga contra um bot) | 🕹️ posiciona-te, lança com o braço; rodar o pulso dá efeito |
| 🎾 Ténis | 4 (pares; bots completam) | As personagens correm sozinhas; tu só bates. Cedo = cruzado, tarde = para o outro lado |
| ⛳ Golfe | 1–10 | 🕹️ aponta, a força da tacada decide a distância; 3 buracos com lagos, bunkers e vento |
| 🥊 Boxe | 2–10 (rei do ringue) | Socos com a esquerda/direita, segura 🛡️ para defender; quedas, contagem e KO |
| ⚾ Basebol | 2–10 (duas equipas) | Lançador: força = velocidade. Batedor: bate de lado quando a bola chega |

### Sensores de movimento (HTTPS)

Os browsers só dão acesso aos sensores dos telemóveis em **HTTPS**. Para os usar na rede local:

```bash
npm run dev:https
```

(ou `npm run start:https` em produção). O certificado é autoassinado: da primeira vez, o telemóvel
mostra um aviso de segurança — escolhe "Avançar/Continuar". No iPhone aparece ainda um botão para
autorizar o movimento. Sem HTTPS, tudo funciona com gestos de arrastar no ecrã.

### Ramos (git)

Cada jogo vive no seu ramo, para poder ser revisto e juntado em separado:

| Ramo | Conteúdo |
|---|---|
| `jogo-festa` | Modo Festa (tabuleiro, minijogos) |
| `jogo-sports` | Base do modo Desportos (escolha de modo, gestos, HTTPS) — a partir de `jogo-festa` |
| `jogo-bowling`, `jogo-tenis`, `jogo-golfe`, `jogo-boxe`, `jogo-basebol` | Cada desporto, a partir de `jogo-sports` |

Os desportos são descobertos automaticamente (`apps/web/src/host/sports/<id>/sport.ts`), por isso
os ramos juntam-se sem conflitos.

## App de computador (Festa.exe)

```bash
npm run app
```

Gera em `apps/desktop/release/` o **instalador** (`Festa-0.1.0-instalador.exe`) e a versão **portátil**
(`Festa-0.1.0-portatil.exe`, corre sem instalar). A app traz tudo: o servidor, o jogo e o `cloudflared`.
- Abre em ecrã inteiro (**F11** alterna; **Alt+F4** fecha).
- Os telemóveis entram pelo QR, em HTTPS (para os sensores de movimento). Na rede de casa aparece uma vez
  o aviso de ligação não privada: **Avançadas → Continuar**.
- **🌍 Jogar online** (no lobby, com o rato) abre o túnel da Cloudflare: o QR passa a servir em casa e fora,
  sem avisos.
- **V** partilha o ecrã com quem está fora (sem caixa de escolha).
- O Windows mostra o aviso do SmartScreen da primeira vez (a app não tem assinatura digital):
  **Mais informações → Executar mesmo assim**.
- Testar sem empacotar: `npm run app:dev`.

## Modos de ligação

| Modo | Como | Quem vê o ecrã |
|---|---|---|
| **Local (LAN)** | `npm run build` e `npm start` no PC (porta 3000). Telemóveis entram pelo IP do PC. | Todos na sala |
| **Online / misto** | `npm run online`: túnel grátis da Cloudflare, link público e QR no lobby. Em casa e fora usam o mesmo link. | Quem está fora abre `/ver` (ou 📺 no comando); no PC carrega **V** para partilhar o ecrã |
| **Alojado (opcional)** | Fly.io com `Dockerfile` + `fly.toml`: link fixo. | Igual ao online |

Detalhes, TURN da Cloudflare e compensação de atraso: [docs/ONLINE.md](docs/ONLINE.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor (porta 3000) + Vite (porta 5173), com recarregamento automático |
| `npm run build` | Compila o cliente web para `apps/web/dist` |
| `npm start` | Produção: um só processo serve o jogo, o comando e o Socket.IO |
| `npm run online` | Compila, arranca o servidor e abre um túnel Cloudflare para jogar com quem está fora |
| `npm run app` | Gera o instalador e a versão portátil da app de computador (Electron) |
| `npm test` | Testes das regras do jogo e do servidor |
| `npm run typecheck` | Verifica tipos em todos os pacotes |

### Ferramentas de desenvolvimento (só em `npm run dev`)

- Tecla **T** no lobby: festa de **1 ronda** (para testar o final depressa).
- `http://localhost:5173/?sport=bowling&players=2`: joga um desporto diretamente (bots completam).
  Desportos: `bowling`, `tennis`, `golf`, `boxing`, `baseball` (cada um no seu ramo).
- `http://localhost:5173/?minigame=sumo&mode=teams&players=8`: corre um minijogo diretamente com bots
  (`minigame`: `coin-shower`, `sumo`, `tag`; `mode`: `ffa`, `teams`, `oneVsAll`).
- Na consola do browser, `window.festa` dá acesso ao motor, HUD e ligação.

## Estrutura

```
packages/shared   Protocolo de rede (tipos + validação zod)
packages/game     Regras (sem gráficos, com testes): festa, e desportos em src/sports/
apps/server       Node + Express + Socket.IO: salas, códigos, reconexão, encaminhamento
apps/web          Vite: ecrã principal 3D (Three.js, index.html) e comando do telemóvel (play.html)
docs/             Arquitetura e decisões
```

Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
