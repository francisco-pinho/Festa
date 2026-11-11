# Plano de melhorias

Documento de trabalho: junta todos os pedidos, a pesquisa feita e a ordem em que vamos fazer as coisas.
Vamos uma coisa de cada vez: cada tarefa tem a sua caixa `[ ]` e passa a `[x]` quando estiver feita e testada.

> Regra de ouro: tudo o que é **mecânica do género** (tabuleiro, lojas, itens, desportos com movimento)
> pode inspirar-se nos jogos de referência; **nomes, personagens, mapas e aspeto são sempre nossos**.

---

## 0. Pedidos recebidos (resumo)

**Festa**
1. Mapas maiores e mais variados: lojas, túneis, casas de evento, cada mapa com a sua mecânica própria.
2. Vários mapas diferentes.
3. Escolher a dificuldade dos bots.
4. Ver o mapa todo ao lançar os dados e ao escolher caminho.
5. Abanar o telemóvel para lançar os dados não funciona.
6. Cair numa casa onde já está alguém → duelo (minijogo 1 contra 1) a valer o lugar.
7. Itens que se compram com moedas.
8. Mais animações nos eventos que hoje são só uma mensagem (ex.: estrelas bónus).

**Geral**
9. Comandos do telemóvel na horizontal.
10. Modelos 3D mais complexos e realistas (podem vir da internet).
11. Menu durante o jogo com "Sair" e "Definições".

**Desportos**
12. **Bowling:** mais animações; um salão a sério com várias pistas; lançar com o movimento real (braço para a frente); física da bola e dos pinos melhor; placar por cima como no bowling real; 3 lançamentos na última jogada.
13. **Ténis:** só os jogadores de trás jogam; campo mais realista e completo; física muito melhor.
14. **Golfe:** arrastar o dedo não funciona bem → mecânica ao estilo dos jogos de golfe da Switch; vários tacos.
15. **Boxe:** refazer quase tudo: mãos verdadeiras (não bolas a flutuar), poder mexer o boneco, mostrar claramente o dano, placar melhor. Estudar o mercado.
16. **Basebol:** refazer: física, dinâmica, campo. Estudar o mercado.
17. Tudo mais realista e com mais animações.

**Segunda ronda de pedidos (depois das fases 0–7)**
18. **Comando como os da Switch:** o telemóvel passa a ser um comando fixo (direcional/joystick, botões A, B, X, Y e +), igual na Festa e nos Desportos. As opções aparecem **no ecrã grande** e escolhem-se com o direcional e o A — o telemóvel deixa de mostrar listas de opções.
19. **Mapas muito mais bonitos:** melhorar os modelos de todos os cenários (não as personagens): tabuleiros, salão de bowling, ringue, estádio de basebol, campo de golfe e de ténis.
20. **Tabuleiros muito mais complexos:** mais caminhos, cruzamentos, atalhos e interações com o cenário.
21. **Escolher a personagem uma vez, no início** (ao entrar), e não no começo de cada jogo.
22. **Menu principal mais bonito:** as personagens aparecem à medida que os jogadores entram; depois escolhe-se o modo (Festa ou Desportos); só no modo Festa aparecem as rondas e a dificuldade dos bots.
23. **Jogar fora de casa:** funcionar em local, online (cada um em sua casa) ou misto — estudar a opção mais viável (ver §3.7).
24. **Controlo nos desportos:** golfe como no golfe da Switch, **só com botões**; os outros desportos **só com movimento**. No bowling, **não é preciso largar o botão** para lançar: a bola sai no fim do gesto.
25. **Vibração** no telemóvel em todos os jogos e na Festa, conforme o que acontece (dados, moedas, estrela, duelo, armadilha, golpes, bola, pinos…).

---

## 1. Problemas que já identifiquei no código

| # | Problema | Causa | Onde |
|---|---|---|---|
| P1 | Telemóveis Android não abrem a página (`ERR_TOO_MANY_RETRIES`) | O Android 17 obriga o Chrome a ter a permissão **Dispositivos próximos / Rede local** | Fora do código. Pôr a dica no lobby e no README |
| P2 | Abanar para lançar dados não funciona | Só escuta sensores com HTTPS; limiar muito alto (16 m/s²); no Android recente os sensores podem precisar de autorização; nada mostra se o sensor está ativo | `controller/main.ts` → `renderDice` |
| P3 | Comandos ao alto | Não há bloqueio de orientação; o CSS em modo retrato empilha as zonas | `controller.css`, `controller/main.ts` |
| P4 | Ténis: só jogam os de trás | O jogador "responsável" é o mais perto do ponto onde a bola **já ressaltou** (fundo do campo) → nunca é o da rede; não há volei | `TennisStage.planMovement` |
| P5 | Bowling: 3.º lançamento na última jogada | A regra oficial só dá 3.ª bola com strike ou spare na 10.ª. **Confirmar o que viste** (ver perguntas, Q1) | `bowling.ts → isFrameDone` |
| P6 | Boxe: luvas são esferas soltas | As personagens não têm esqueleto (são formas soltas); as luvas são objetos à parte | `CharacterModel`, `BoxingStage` |
| P7 | Golfe: arrastar é impreciso | A força vem da velocidade do dedo, difícil de dosear | `GolfStage`, `motion.ts` |

---

## 2. Pesquisa (estudo de mercado)

### 2.1 Jogos de tabuleiro em festa
Fontes: [Mario Wiki — Item Shop](https://www.mariowiki.com/Item_Shop_(Mario_Party_series)), [Mario Party Legacy — Jamboree](https://mariopartylegacy.com/games/super-mario-party-jamboree/), [Rainbow Galleria](https://www.mariowiki.com/Rainbow_Galleria), [Game Rant — guia do tabuleiro](https://gamerant.com/super-mario-party-jamboree-rainbow-galleria-board-guide/).

- **Itens baratos e com efeitos claros**: +5 casas (3 moedas), dado duplo (5), dado triplo (10), dado que dá moedas iguais ao número tirado, ir até à loja (6), ir ter com outro jogador (7), dado lento para os outros (1–3), roubar um item, armadilha de estrela, desafiar alguém para duelo (40).
- **Lojas variadas no mesmo mapa**: loja barata, loja "de luxo", loja só para o último classificado (dá-lhe moedas), **saldos relâmpago** (metade do preço numa ronda), stock que muda a meio do jogo.
- **Cada mapa tem 1–2 mecânicas próprias** e itens que só existem nele (mudar a maré, inverter um tapete rolante, rodar uma torre, acordar uma criatura que anda pelo mapa).
- **Casas especiais**: loja, evento do mapa, sorte, azar, "vilão" (perder moedas/estrela, baralhar, igualar moedas), VS (todos apostam moedas), duelo.

### 2.2 Golfe (referência: golfe da Switch)
Fontes: [Nintendo — planear a tacada](https://www.nintendo.com/us/whatsnew/planning-your-shot-in-mario-golf-super-rush/), [Game8 — controlos](https://game8.co/games/Mario-Golf-Super-Rush/archives/333996), [Outsider Gaming — controlos](https://outsidergaming.com/mario-golf-super-rush-complete-controls-guide-for-nintendo-switch-motion-button-controls/).

- **Medidor de força vertical**: toca para começar, toca para parar na força desejada. Zonas vermelhas no topo = mais força mas a bola pode desviar.
- **Efeito**: topspin (rola mais) ou backspin (trava/volta para trás) escolhido ao parar o medidor.
- **Curva e altura** depois de definir a força (inclinar para os lados, mais alto/mais baixo).
- **Tacos**: o joystick muda de taco; a diferença principal é o alcance. Mostrar no mapa onde cai cada taco.
- **Com movimento**: levar o taco atrás e para a frente; a força vem do balanço; inclinar no fim curva a bola.
- **Terreno** (subidas/descidas) muda o ressalto e o efeito.

### 2.3 Boxe
Fontes: [Sports Resort Wiki — guia de boxe](https://sports-resort.wiki/guides/boxing-guide), [Nintendo Everything — dicas](https://nintendoeverything.com/nintendo-switch-sports-resort-beginner-tips-and-tricks/), [Wii Sports (Wikipedia)](https://en.wikipedia.org/wiki/Wii_Sports).

- **Tipos de soco pelo gesto**: direto (para a frente), gancho (arco de lado), uppercut (de baixo para cima).
- **A distância importa**: gancho ao longe falha e deixa-te exposto; uppercut colado não tem espaço.
- **Esquivar inclinando** + **contra-ataque** logo a seguir a esquivar.
- **Barra de soco**: quanto mais cheia, mais forte (castiga quem só carrega no botão).
- **"Sinais" do adversário**: ombro desce antes do gancho, recua antes do direto. Isto dá leitura e estratégia.
- Defender bem vale mais do que bater muito.

### 2.4 Basebol
Fontes: [StrategyWiki — Wii Sports Baseball](https://strategywiki.org/wiki/Wii_Sports/Baseball), [Wii Sports Wiki — Baseball](https://wiisports.fandom.com/wiki/Baseball_(sport)), [MiiWiki — Baseball](https://miiwiki.org/wiki/Baseball).

- **3 entradas**; só se lança e bate. A defesa e as corridas são automáticas.
- **4 tipos de lançamento**: rápida, curva, "screwball" (curva para o outro lado), "splitter" (cai no fim). Mais lançamento lateral/por baixo.
- **Velocidade** = rapidez do gesto + tipo de lançamento. **Sítio** (dentro/fora/alto/baixo) com o direcional.
- **Batida**: o bastão tem de cruzar a bola **no momento** em que passa a base. Cedo/tarde = foul. Bater para cima = mais home runs, mas demasiado alto = bola apanhada no ar.
- Se a bola cai no campo: simples, duplo ou triplo conforme o tempo que fica no campo.

### 2.5 Bowling
Fontes: [resort-bowling (Three.js + Rapier)](https://github.com/fish01-jpg/resort-bowling), [Strike Lab — física](https://github.com/Willebrew/bowling-physics-sim), [BowlingAlley — física por impulsos](https://github.com/KarmelMassil/BowlingAlley), [Hook (Wikipedia)](https://en.wikipedia.org/wiki/Hook_(bowling)).

- **Física realista**: a bola **desliza** na zona com óleo (2/3 iniciais), **curva** quando chega à parte seca e depois **rola** a direito. O efeito vem da rotação lateral.
- Atrito no óleo ~0,04 e na parte seca ~0,22; pino 1,58 kg.
- **Pinos como corpos rígidos** (motor de física, ex.: Rapier) ou "pinos que tombam" simplificados, mais **paredes laterais** onde os pinos ressaltam e voltam para o meio.
- Mais realismo de "pin action": acertar no "bolso" (entre os pinos 1 e 3) dá strike muitas vezes; acertar de frente deixa "splits".

### 2.6 Modelos 3D gratuitos (licença CC0, uso livre)
Fontes: [Cinevva — personagens rigged gratuitas](https://app.cinevva.com/guides/free-rigged-3d-character-models), [Quaternius — Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html), [KayKit Adventurers (GitHub)](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), [Poly Pizza](https://poly.pizza/m/DgOCW9ZCRJ), [AssetHoard](https://assethoard.com/free-game-assets).

- **Quaternius**: personagens com esqueleto humanoide "universal" + biblioteca de animações (parte gratuita), glTF, CC0. Proporções "Regular" são as mais realistas.
- **KayKit (Adventurers)**: 4–6 personagens estilizadas com **75 animações** e acessórios, glTF, CC0.
- **Kenney**: personagens animadas simples, CC0.
- Regras para nós: **só CC0** (ou licença que permita redistribuir no repositório), guardar em `apps/web/public/models/` e registar a origem de cada ficheiro em `docs/ASSETS.md`. Cada download é feito com a tua autorização.

---

## 3. Decisões técnicas transversais

### 3.1 Personagens com esqueleto (resolve P6 e o pedido 10)
- Trocar as personagens feitas de formas por **modelos glTF com esqueleto e animações** (`THREE.AnimationMixer`).
- Manter a **mesma interface** do `CharacterModel` (`setAnim`, `faceTowards`, `root`) para não partir a Festa nem os desportos.
- Cada uma das 10 personagens = modelo base + cores/roupa/acessório próprios (identidade nossa).
- Animações necessárias: parado, andar, correr, saltar, festejar, triste, tonto, cair/levantar, soco (direto/gancho/uppercut), defender, esquivar, lançar (bowling/basebol), bater (ténis/basebol), tacada de golfe.
- **Objetos nas mãos** (raquete, taco, bastão, bola, luvas) presos ao "osso" da mão.

### 3.2 Motor de física
- Usar **Rapier** (`@dimforge/rapier3d-compat`, WASM) no bowling (pinos e bola) e no basebol/golfe para os ressaltos.
- Ténis: física própria com **resistência do ar e efeito Magnus** (topspin/slice), que é mais previsível e fácil de afinar.

### 3.3 Comando do telemóvel na horizontal (P3)
- Ao entrar na sala: ecrã inteiro + `screen.orientation.lock('landscape')` (Android).
- Se o telemóvel estiver ao alto (iPhone não deixa bloquear): mostrar "🔄 Roda o telemóvel".
- Todos os comandos redesenhados para paisagem: zona do polegar esquerdo (joystick/apontar) e direito (botões/gesto).

### 3.4 Sensores de movimento fiáveis (P2, gestos reais)
- Ecrã de **"Ativar sensores"** na entrada da sala (pede autorização no iPhone e confirma no Android que chegam dados), com um indicador "📳 sensor ativo".
- Calibração simples: "abana o telemóvel" → ajusta o limiar ao telemóvel.
- Lançar dados: abanar com limiar mais baixo e com sacudidela detetada por mudança brusca, não só pela força.
- Gestos de desporto reconhecidos pela **forma** do movimento (para a frente, de lado, de baixo para cima), com o giroscópio, e não só pelo pico da aceleração.

### 3.5 Menu de pausa e definições (pedido 11)
- **Esc** no PC ou botão **☰** no telemóvel do VIP → **Pausa** (o tempo do jogo para mesmo).
- Opções: Continuar · Definições · Sair para o lobby (pede confirmação).
- Definições: dificuldade dos bots, volume (música/efeitos), velocidade das animações, mostrar dicas, sensibilidade dos gestos.
- Guardadas no browser do PC.

### 3.6 Dificuldade dos bots (pedido 3)
- Níveis: **Fácil · Normal · Difícil · Mestre**, escolhidos no lobby e nas definições.
- Afeta: precisão e reação nos minijogos e desportos, escolha de caminhos e itens, compras na loja. Os bots nunca fazem batota nos dados.

---

### 3.7 Jogar fora de casa: local, online ou misto (pedido 23)
Fontes: [Cloudflare Quick Tunnels (guia)](https://flaviocopes.com/cloudflare-quick-tunnels/), [Render — Free](https://render.com/docs/free), [Render — WebSockets no plano grátis](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages), [Fly.io — preços](https://fly.io/docs/about/pricing/), [MDN — getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [Cloudflare Realtime TURN — preços](https://developers.cloudflare.com/realtime/sfu/pricing).

Hoje: o PC corre o servidor (relé Socket.IO) e o ecrã do jogo; os telemóveis ligam-se pela rede de casa. Isto já funciona para **local**.
Para **online**, há dois problemas distintos: (1) os telemóveis de fora têm de chegar ao servidor, e (2) quem está em casa dele tem de **ver o ecrã do jogo**.

| Opção | Como | Custo | Prós | Contras |
|---|---|---|---|---|
| **A. Túnel a partir do PC** (Cloudflare Quick Tunnel) | `npm run online` arranca o servidor e um túnel → link público `https://…trycloudflare.com` + QR | Grátis, sem conta | Liga já; HTTPS verdadeiro nos telemóveis (acaba o aviso do certificado e ajuda nos sensores); local e online na mesma sala | Link muda a cada vez; "para testes" (sem garantias); até ~200 ligações (chega bem) |
| B. Servidor alojado (Fly.io) | Servidor + página num domínio fixo; o PC só abre o ecrã do jogo | ~2,2 $/mês (256 MB sempre ligado) | Link fixo, sempre disponível | Custo mensal; o tráfego dos jogadores locais também vai à internet (+20–60 ms) |
| C. Render grátis | Igual a B | Grátis | Sem custo | Adormece após 15 min sem tráfego e demora ~1 min a acordar; 750 h/mês |

**Ver o ecrã em casa de cada um:** o ecrã grande é que corre o jogo (host autoritativo), por isso os jogadores remotos veem um **vídeo do ecrã**:
- No PC, botão «Convidar jogadores online» → partilha do separador do jogo (`getDisplayMedia`, 1 clique) → enviado por **WebRTC** a uma página `/ver` (no PC/TV do jogador remoto; no telemóvel, vídeo em cima e comando em baixo).
- STUN grátis da Cloudflare; quando a ligação direta falha, **TURN** da Cloudflare (1000 GB/mês grátis — ~1 GB por hora e por espectador a 720p).
- Alternativa sem trabalho: partilhar o ecrã por Discord/Meet.
- **Atraso:** o vídeo chega ~150–300 ms atrasado → nos desportos de tempo (ténis, basebol, bowling) cada jogador remoto tem uma compensação de atraso medida automaticamente.

**Recomendação:** começar pela **A** (grátis, resolve local + online + misto já), com o vídeo WebRTC para quem está fora; se quiserem um link fixo, passar para a **B** sem mudar o código.

## 4. Ordem de trabalho proposta

Cada fase termina testada, com commit e push no seu ramo.

### Fase 0 — Fundações (desbloqueia o resto)
- [x] Dica do Android 17 (permissão "Dispositivos próximos") no lobby e no README (P1)
- [x] Comando na horizontal + "roda o telemóvel" (3.3)
- [x] Ecrã "Ativar sensores" com indicador e calibração; corrigir abanar dados (3.4, P2) — falta confirmar num telemóvel real
- [x] Menu de pausa com Sair e Definições (3.5) — sem volume ainda (não há sons)
- [x] Dificuldade dos bots (3.6)
- [x] Escolher o pack de modelos, descarregar (com autorização) e criar o novo `CharacterModel` com esqueleto (3.1) — KayKit Adventurers (CC0), ver `docs/ASSETS.md`
- [x] Integrar o Rapier (3.2)

### Fase 1 — Festa
- [x] **Vista do mapa**: ao lançar os dados, botão "🗺️ Ver mapa" (telemóvel e PC) que mostra o mapa todo com a estrela, as lojas e os jogadores; nos cruzamentos, câmara aérea que mostra os caminhos com a distância até à estrela
- [x] **Itens e inventário** (máx. 3 por jogador), usados antes de lançar os dados. Nomes nossos, por exemplo:
  Turbo (+3 casas), Dado Duplo, Dado Triplo, Dado Dourado (moedas = número tirado), Dado Preguiçoso (os outros só tiram 1–3), Bilhete da Loja, Espelho Troca-Lugar, Íman de Moedas, Armadilha de Moedas/Estrela, Luva de Desafio
- [x] **Lojas** como casas no mapa (passar por elas dá para comprar); loja do último lugar; saldos relâmpago
- [x] **Duelo na casa ocupada**: quem chega desafia quem lá está para um minijogo 1 contra 1 — quem perde dá 5 moedas e recua 3 casas
- [x] **Novas casas**: Loja, Túnel/Teleporte, VS (todos apostam), Evento do mapa, Vilão (perde moedas/estrela, baralha posições), Duelo
- [x] **Animações de eventos** (roletas, moedas a voar, estrela roubada, cerimónia das estrelas bónus em palco; falta som): estrelas bónus com cerimónia (holofote, personagem a receber a estrela, confetes), compra de estrela, tornado, loja, itens
- [x] **Mapas maiores** (60–90 casas, 3–4 cruzamentos, zonas diferentes) — 5 mapas feitos, cada um com a sua mecânica: Ilha (86), Cidade Néon (75), Mina do Vulcão (76), Castelo Assombrado (70, 3 andares) e Parque de Diversões (68):
  - **Ilha do Coqueiro (renovada)**: a maré sobe/desce a cada 3 rondas e abre/fecha a ponte; gruta com túnel
  - **Cidade Néon**: muitas lojas, saldos, **metro** (túneis entre estações que custam moedas), semáforos que fecham ruas
  - **Mina do Vulcão**: **vagonetas** em carris (atalho pago e casa de evento que te leva 4–8 casas), erupção a cada 3 rondas que fecha a cratera e queima 5 moedas a quem lá está
  - **Castelo Assombrado**: 3 andares ligados por **elevadores** e escadarias com portas que alternam a cada ronda; o fantasma vende uma estrela por 30 moedas (ou rouba 3–8)
  - **Parque de Diversões**: **roda gigante** que gira 2 casas por ronda e leva quem lá está, montanha-russa como atalho (5 moedas), corredor das barracas
- [x] Minijogos 1 contra 1 para os duelos: **Saque Rápido** (reflexos ao «JÁ!»), **Cabo de Guerra** (A e B à vez) e **Pontaria** (parar o marcador no verde); teste em `/?minigame=saque|cabo|pontaria&players=2`

### Fase 2 — Bowling
- [x] Salão de bowling completo: 5 pistas lado a lado (bots a jogar nas vizinhas), retorno de bolas, sofás onde os jogadores esperam sentados, máquina de pinos (levanta, varre, pousa), luzes, néon, alcatifa e máquinas de jogos
- [x] **Placar suspenso** por cima da pista, como no bowling real (as 10 jogadas com X, / e totais)
- [x] Física com Rapier (`lanePhysics.ts`): óleo/parte seca, a curva nasce do efeito da bola a agarrar na parte seca, pinos como corpos rígidos, calhas, paredes e fosso. Afinação fora do browser: `npx tsx apps/web/tools/tune-bowling.ts pocket`
- [x] **Lançamento real**: segurar o botão, levar o braço atrás e para a frente (pêndulo); força = velocidade; rodar o pulso no fim = efeito; **rodar o telemóvel ao apontar** muda o ângulo (nova mensagem `aim`; toca no indicador para centrar). Bots calculam a trajetória para o bolso / para os pinos que sobram — *falta testar a inclinação num telemóvel real*
- [x] Animações: corrida de aproximação com a bola na mão, lançamento, reação virada para a câmara, câmara lenta no impacto, repetição do strike de outro ângulo
- [x] Rever a última jogada (ver Q1): o código segue a regra oficial (3.ª bola só com strike ou spare na 10.ª) e está correto; muda-se se preferires 3 bolas sempre

### Fase 3 — Boxe (refazer)
- [x] Personagens com esqueleto e **luvas nas mãos** (presas ao osso da mão, seguem as animações)
- [x] **Mexer o boneco**: joystick para avançar/recuar/rodar à volta do adversário; inclinar o telemóvel (ou ⬅️➡️) para **esquivar**
- [x] Socos pelo gesto: **direto (jab com a esquerda), gancho, uppercut**, com alcance (longe falha, colado tira força). No ecrã: tocar / arrastar de lado / arrastar para cima — *classificação por movimento por afinar no telemóvel*
- [x] **Barra de soco** (energia) e contra-ataque depois de esquivar (×1,6)
- [x] **Dano bem visível**: flash vermelho, faíscas de impacto, cabeça a recuar, número de dano, câmara a tremer, vibração forte no telemóvel de quem leva
- [x] Placar novo: barras de vida grandes no topo (lutador vs lutador), barra de energia, quedas, rondas e tempo
- [x] Bots com "sinais" antes de atacar (luva a brilhar, agachar para o uppercut; mais longos nos bots fáceis)
- [x] Arena com público animado (reage aos golpes), árbitro (conta as quedas, levanta o braço do vencedor), sino entre rondas; no chão, dar socos levanta-te mais depressa

### Fase 4 — Basebol (refazer)
- [x] Estádio completo: bancadas com público, placar eletrónico (entradas, B/S/E, velocidade do lançamento), 9 defesas com bonés da equipa, bases, bancos, rede, postes de foul e torres de luz
- [x] **Lançamento**: 4 tipos (rápida, curva, screwball, splitter) escolhidos no telemóvel; apontar a zona com o joystick; velocidade pelo gesto; o efeito só aparece no fim
- [x] **Batida**: gesto de lado; altura do bastão (joystick) + momento decidem ângulo e direção (rasteira, linha, alta, home run, foul); compensa ~60 ms de atraso da rede — *afinar no telemóvel*
- [x] Física da bola (ar, ressaltos, rolar, vedação), defesas que correm, apanham e lançam para a base, corredores que correm as bases; o resultado (simples…triplo, eliminado) sai da corrida entre o corredor e o lançamento
- [x] Repetição dos home runs em câmara lenta, fogo de artifício, público a saltar, animações de lançador, batedor, apanhador e defesas

### Fase 5 — Golfe (refazer o controlo)
- [x] **Medidor de força** no telemóvel: toca para começar, toca para parar; zona vermelha (até 110 %) dá mais distância mas desvia
- [x] **Efeito**: topspin / backspin ao parar o medidor (botões ⬆️/⬇️); no green o backspin faz a bola recuar
- [x] **Curva/altura**: joystick enquanto o medidor anda (lados = curva, cima/baixo = altura)
- [x] **Tacos**: Driver, Madeira 3, Ferros (5, 7, 9), Wedge, Putter. Mudar no telemóvel; a trajetória e a área onde cai aparecem no campo
- [x] Modo com movimento: balançar o telemóvel como um taco (força pelo balanço) — *por afinar no telemóvel*
- [x] Terreno com relevo (colinas, green inclinado com setas), 5 buracos (3 com mais de 3 jogadores), caddie com dicas (taco, vento, inclinação, água). Física em `simulateShot` (bots usam `planShot`)

### Fase 6 — Ténis (física e campo)
- [x] Corrigir P4: os da rede também jogam (voleis de bolas que passam perto); quem bate é quem chega primeiro a um ponto onde a bola se pode bater
- [x] Física: resistência do ar, efeito Magnus (topspin/slice), ressalto que depende do efeito; `planShot` acerta no alvo e garante a rede
- [x] Gestos: direção pelo movimento (direita/esquerda) e pelo momento, topspin a bater de baixo para cima, slice de cima para baixo, smash automático em bolas altas — *afinar no telemóvel*
- [x] Estádio: bancadas com público, árbitro de cadeira, apanha-bolas, placar, publicidade, rede com malha, sombras
- [x] Animações de direita/esquerda, serviço com lançamento da bola (falta e dupla falta), corrida e passos laterais (o deslize ficou por fazer)

### Fase 7 — Polimento geral
- [x] Sons e música: gerados no browser (Web Audio, `host/audio/Sound.ts`), sem ficheiros nem licenças — 27 efeitos (moedas, dados, estrela, socos, bola, pinos, público, fogo de artifício, contagens…) e 5 músicas (lobby, tabuleiro, minijogo, desportos, final). Volume de efeitos e música nas definições; botão «ligar o som» no ecrã principal
- [~] Mais animações e efeitos (partículas, câmara lenta, repetições) — feito nas fases 2–6 (repetições do strike e do home run, câmara lenta, faíscas, fogo de artifício); falta o deslize no ténis e efeitos no tabuleiro
- [ ] Testar com telemóveis reais: Android recente e iPhone

---

### Fase 8 — Comando ao estilo Switch + menu principal novo (pedidos 18, 21, 22)
- [x] Comando único no telemóvel (layout `pad`): cruz ou joystick à esquerda, A/B/X/Y à direita, + (menu) e − (mapa); o movimento (como um Joy-Con) nos desportos
- [x] Todas as escolhas passam para o ecrã grande com cursor (`ScreenMenus`): caminhos, loja, itens (X), estrela, fantasma, alvos, menus; A confirma, B volta; os bots mexem o cursor à vista
- [x] O telemóvel só mostra o que é preciso: botões ativos acendem e têm legenda curta (ex.: «A Lançar», «X Itens», «− Mapa»)
- [x] Desportos: **golfe só com botões** (joystick aponta, X/Y mudam de taco, A inicia o medidor no ecrã grande, A/X/Y param: normal/topspin/backspin); **bowling, ténis, boxe e basebol com movimento** (arrastar o dedo só como recurso sem sensores)
- [x] Bowling: a bola sai no fim do gesto, sem ter de largar o botão (o gesto deteta-se quando a aceleração cai depois do pico)
- [x] **Vibração** em tudo, conforme o que acontece: dados, passos, moedas (+/−), estrela, duelo, trocas, Trapaceiro, desportos (pinos, tacada, água, pontos, socos), botões do comando
- [x] Menu principal 3D: cada jogador que entra aparece com a sua personagem (◀ ▶ no comando, A pronto); quem fica numa personagem já escolhida salta para uma livre
- [x] Depois: o VIP escolhe **Festa**, **Desportos** ou **Definições**; só na Festa aparecem mapa, rondas e bots
- [x] A personagem fica para todos os jogos até sair da sala (dá para trocar no menu principal com B)

- [x] **Narrador** («Zé Microfone»): personagem 3D com microfone que explica as regras da festa e do mapa, cada minijogo/duelo e cada desporto antes de começar; fala em voz alta (voz do browser em português de Portugal), gesticula e acena a cada palavra; «−» salta; música baixa enquanto fala; pode desligar-se nas definições
- [x] Comando: cruz e botões encostados às pontas do ecrã; boxe com câmara de lado que só acompanha para os lados e cordas da frente quase transparentes quando os lutadores se aproximam

### Fase 9 — Cenários novos (pedido 19)
- [x] Packs de cenários CC0 (5 da KayKit e 4 da Kenney, dos sites oficiais; 174 modelos, ~6 MB) — ver `docs/ASSETS.md`
- [x] Tabuleiros com os modelos novos: ilha (palmeiras, barcos a balançar, cais, torre, folhas a cair), cidade (prédios, carros, candeeiros), vulcão (montanhas, rochas, acampamento, brasas a subir), castelo (castelo e torres ao fundo, cripta, cemitério com lanternas acesas e pirilampos), parque (bancas, entrada, mesas, moinhos, confetes; nada por baixo da montanha-russa)
- [~] Desportos: golfe (árvores, plantas, rochas), bowling (sala de espera mobilada), ténis e basebol (árvores e candeeiros à volta) — o ringue de boxe ficou como estava

### Fase 10 — Tabuleiros mais complexos (pedido 20)
- [x] Mais caminhos e cruzamentos por mapa: um caminho novo por mapa com portão de alavanca (selva, becos em obras, ponte de lava, passagem secreta atrás de uma estante, labirinto dos espelhos); portagens com dono (quem paga recebe a próxima)
- [x] Mais interações com o cenário: alavancas (quem passa decide se puxa), canhões/géiser que disparam para outra zona, cofre/banco; eventos por zona (baú do tesouro na praia/selva/mina/pátio/feira, derrocada na cratera)
- [x] Casas novas: 🏦 banco, 💥 canhão, 🎚️ alavanca
- Ferramenta: `npx tsx tools/board-svg.ts` desenha os mapas em `/dev-boards.html` para planear caminhos

### Fase 11 — Jogar fora de casa (pedido 23, ver §3.7)
- [x] `npm run online`: servidor + túnel Cloudflare, link público e QR no lobby (local e online na mesma sala) — precisa do `cloudflared` instalado (ver docs/ONLINE.md)
- [x] Vídeo do ecrã para quem está fora: tecla **V** partilha o separador, WebRTC (STUN Cloudflare; TURN com chaves), página `/ver` e botão 📺 no comando
- [x] Compensação de atraso por jogador (ping/pong + atraso do vídeo): ténis recua a bola, basebol recua o swing
- [x] (Opcional) `Dockerfile` + `fly.toml` para alojar no Fly.io (não publicado)

## 5. Perguntas para ti (antes das fases respetivas)

- **Q1 (bowling):** na regra oficial, a 10.ª jogada só tem 3.º lançamento se fizeres strike ou spare. Queres a regra oficial, ou **3 lançamentos sempre** na última jogada? E viste algum caso em que fizeste strike/spare e não te deu o 3.º?
- ~~**Q2 (modelos):**~~ Respondida: KayKit (cartoon).
- ~~**Q3 (duelo)**~~ Respondida: obrigatório; quem perde recua 3 casas e dá 5 moedas.
- ~~**Q4 (itens)**~~ Respondida: máx. 3 itens; há o Ladrão de Estrelas (40 moedas).
- ~~**Q5 (mapas)**~~ Respondida: Ilha renovada + Cidade Néon primeiro. preferes um estilo **realista** (proporções humanas, Quaternius "Regular") ou **estilizado/cartoon mais detalhado** (KayKit)? Os packs gratuitos com muitas animações são mais estilizados.
- **Q3 (duelo):** quando cais numa casa ocupada, o que vale o duelo? Proposta: quem perde recua 3 casas e dá 5 moedas a quem ganha. O duelo é obrigatório ou quem chega pode escolher?
- **Q4 (itens):** quantos itens no máximo por jogador (proposta: 3)? Podem roubar-se estrelas com itens?
- **Q5 (mapas):** concordas com os 5 temas propostos? Por qual começamos?

---

## 6. Registo de progresso

| Data | Fase/tarefa | Ramo | Estado |
|---|---|---|---|
| 2026-11-11 | Plano criado | `jogos-todos` | ✔ |
| 2026-11-11 | Fase 0: dica Android, horizontal, sensores, pausa/definições, dificuldade, Rapier | `fase0-fundacoes` | ✔ |
| 2026-11-11 | Fase 0: modelos 3D com esqueleto (KayKit, 76 animações, 10 personagens recoloridas) | `fase0-fundacoes` | ✔ |
| 2026-11-11 | Fase 1: mapas Ilha e Cidade, itens, lojas, duelos, VS, Trapaceiro, vista do mapa, cerimónia | `fase1-festa` | ✔ |
| 2026-11-11 | Fase 1: mapas Mina do Vulcão, Castelo Assombrado e Parque de Diversões (cenários 3D, vagonetas, elevadores, montanha-russa, erupção, portas, roda, fantasma) | `fase1-festa` | ✔ |
| 2026-11-11 | Fase 1: minijogos de duelo 1 contra 1 (Saque Rápido, Cabo de Guerra, Pontaria) | `fase1-festa` | ✔ |
| 2026-11-11 | Fase 2: bowling novo (salão, placar suspenso, física Rapier, pêndulo + inclinação, câmara lenta e repetição) | `fase2-bowling` | ✔ (falta testar no telemóvel) |
| 2026-11-11 | Fase 3: boxe refeito (luvas nas mãos, mover, 4 socos com alcance, energia, esquiva + contra-ataque, dano visível, árbitro, público, placar) | `fase3-boxe` | ✔ (falta testar no telemóvel) |
| 2026-11-12 | Fase 4: basebol refeito (estádio, 4 lançamentos, altura do bastão, física da bola, 9 defesas, corredores, placar eletrónico, repetição de home runs) | `fase4-basebol` | ✔ (falta testar no telemóvel) |
| 2026-11-12 | Fase 5: golfe novo (7 tacos, medidor com zona vermelha, efeito, curva/altura, balançar, relevo, 5 buracos, caddie) | `fase5-golfe` | ✔ (falta testar no telemóvel) |
| 2026-11-12 | Fase 6: ténis (física com Magnus, voleis e smashes, topspin/slice pelo gesto, serviço com faltas, estádio) | `fase6-tenis` | ✔ (falta testar no telemóvel) |
| 2026-11-12 | Fase 7: sons e música gerados (Web Audio), volume nas definições | `fase7-polimento` | ✔ (falta testar com telemóveis reais) |
| 2026-11-12 | Fase 8: comando único estilo Switch, menus no ecrã grande, menu principal com personagens, golfe por botões, gestos no fim do movimento, vibração; corrige a cabeça a abanar nas animações triste/tonto | `fase8-comando` | ✔ (testado com telemóvel simulado e teclado) |
| 2026-11-12 | Narrador com corpo e voz; comandos nas pontas do telemóvel; câmara e cordas do boxe | `fase8-comando` | ✔ (voz não confirmada a ouvir) |
| 2026-11-12 | Fase 9: cenários com modelos CC0 (KayKit e Kenney) nos 5 tabuleiros e em 4 desportos | `fase9-cenarios` | ✔ (primeira passagem) |
| 2026-11-12 | Fase 10: alavancas e portões, portagens com dono, canhões/géiser, banco, baús e derrocadas por zona, um caminho novo por mapa | `fase10-tabuleiros` | ✔ (testado com bots) |
| 2026-11-12 | Fase 11: `npm run online` (túnel Cloudflare), vídeo WebRTC `/ver` e 📺 no comando, compensação de atraso, Dockerfile/fly.toml | `fase11-online` | ✔ (vídeo testado entre separadores; túnel por testar: falta instalar o cloudflared) |
