# Arquitetura

## Visão geral

```
 ┌──────────────────────┐        ┌───────────────────────┐        ┌────────────────────┐
 │  Ecrã principal (PC) │◄──────►│       Servidor        │◄──────►│  Telemóvel (×8)    │
 │  apps/web/index.html │ Socket │  apps/server          │ Socket │  apps/web/play.html│
 │  Three.js · lógica   │  .IO   │  salas · códigos ·    │  .IO   │  joystick, botões, │
 │  do jogo (autoridade)│        │  reconexão · relay    │        │  menus de escolha  │
 └──────────────────────┘        └───────────────────────┘        └────────────────────┘
```

**Decisão principal: o ecrã principal é a autoridade do jogo; o servidor é um "relay" inteligente.**

- Toda a lógica (tabuleiro, minijogos, pontuações) corre no browser do PC, junto com a renderização.
  Isto torna cada minijogo simples de escrever (física, colisões e regras num só sítio) e o servidor
  quase não gasta CPU — dá para alojar online barato.
- O servidor trata do que é difícil de fazer bem: códigos de sala, quem é quem, reconexões,
  validação de mensagens e limites (rate limit, tamanho de mensagens, nº de salas).
- Os telemóveis são "comandos burros": mostram o que o ecrã pede (`ControllerLayout`) e enviam input.

É o mesmo modelo usado por jogos de festa com telemóveis (estilo Jackbox/AirConsole).
As regras em si vivem em `packages/game`, separadas da encenação.

## Protocolo (`packages/shared`)

Uma única fonte de verdade: os schemas `zod` em `schemas.ts` validam tudo no servidor, e os tipos
TypeScript em `protocol.ts` são derivados deles. O browser só importa os tipos (zero custo no bundle).

| Evento | Direção | Para quê |
|---|---|---|
| `host:create` / `host:resume` | ecrã → servidor | Criar sala / recuperá-la após recarregar a página (com `hostToken`) |
| `host:send` | ecrã → servidor → telemóvel(eis) | `layout` (o que o telemóvel mostra), `vibrate`, `toast` |
| `host:lock` | ecrã → servidor | Trancar a sala durante o jogo (só entram reconexões) |
| `host:kick` | ecrã → servidor | Remover um jogador |
| `player:join` | telemóvel → servidor | Entrar com código + nome, ou voltar com `sessionToken` |
| `player:input` | telemóvel → servidor → ecrã | `stick` (x,y ∈ [-1,1]), `button` (a/b), `choice` (id) |
| `room:players` | servidor → todos | Lista de jogadores (cor, ligado, VIP) |
| `room:hostStatus` | servidor → telemóveis | O ecrã caiu / voltou |
| `room:closed` | servidor → todos | Sala terminou (motivo) |

### Layouts do comando

O ecrã decide o que cada telemóvel mostra, a cada momento:

- `wait` — mensagem de espera;
- `gamepad` — joystick e/ou até 2 botões com rótulos;
- `choices` — lista de botões, opcionalmente com cor e em grelha (personagens, caminhos, comprar estrela…);
- `dice` — botão grande de lançar; também lança ao abanar o telemóvel (onde o browser deixa).

O servidor guarda o último layout de cada jogador e reenvia-o quando ele reconecta.
Para um minijogo novo que precise de outro tipo de comando (ex.: desenhar, giroscópio), acrescenta
um novo `kind` ao `controllerLayoutSchema` e o respetivo render em `apps/web/src/controller/main.ts`.

## Robustez

- **Telemóvel perde rede / ecrã bloqueia / recarrega:** volta ao mesmo lugar com o `sessionToken`
  (guardado em `localStorage`). Durante o jogo o lugar é guardado indefinidamente; no lobby, 30 s.
- **Ecrã principal recarrega:** recupera a sala com o `hostToken` (`sessionStorage`) durante 2 min.
  Os telemóveis mostram "O ecrã principal desligou-se…" entretanto.
- **VIP:** o jogador ligado há mais tempo controla os menus; se sair, passa ao seguinte.
- **Latência:** WebSocket primeiro; joystick enviado no máximo a ~30/s com `volatile` (descartado se
  a rede engasgar, em vez de acumular atraso); botões e "largar o joystick" são sempre entregues.
- **Segurança:** todo o input é validado (zod), limitado a 120 msg/s por telemóvel e 16 KB por mensagem.
  Tokens aleatórios de 192 bits. Nomes limpos de caracteres de controlo.

## Regras do jogo (`packages/game`)

Lógica pura, sem gráficos nem rede, com testes (`npm test`). O ecrã principal usa estas funções e
trata só da encenação. Mudar uma regra (preço da estrela, moedas por casa…) é mexer em `RULES`.

- `board.ts` — tabuleiro como grafo dirigido de casas (`next[]`; mais de uma = cruzamento).
  A "Ilha do Coqueiro" é gerada em código: anel principal + atalho pelo centro + ponte sobre o mar.
- `party.ts` — estado da festa e regras: lugares (`seatCount`: mín. 4, par, máx. 10), ordem de jogo,
  dados (2 dados; iguais → 3.º dado), efeitos das casas, estrela, tipo de minijogo pelas cores
  (`decideMinigameTeams`), prémios, estrelas bónus, classificação e decisões dos bots.
- `characters.ts` — as 10 personagens originais (cores, forma do corpo, acessório).
- `rng.ts` — aleatório com semente (partidas reproduzíveis nos testes).

## Ecrã principal (`apps/web/src/host`)

```
main.ts            arranque: Engine + Hud + Director
game/Director.ts   o "realizador": conduz a festa inteira (async/await, passo a passo)
game/Seats.ts      lugares (telemóvel, teclado, bot) com a mesma interface; decide() pede escolhas
three/             motor 3D: Engine (ciclo + palcos), tweens, materiais toon, CharacterModel, Dice
stages/            palcos 3D: BoardStage (tabuleiro), ShowcaseStage (lobby, personagens, pódio)
minigames/         ArenaMinigame (base) + CoinShower, Sumo, Tag
ui/Hud.ts          interface em HTML por cima do 3D (placar, faixas, painéis)
PlayerHub.ts       input de telemóveis e teclado, num só sítio
```

- **3D:** Three.js com materiais *toon* (aspeto cartoon), sombras e água animada. As personagens são
  construídas com formas simples e animadas por código (`idle`, `walk`, `run`, `cheer`, `sad`, `dizzy`, `hit`).
  Para trocar por modelos `.glb` animados no futuro, basta reimplementar `CharacterModel` com a mesma API.
- **Realizador:** cada passo é uma função `async` que espera por animações (`engine.tween/wait`) e por
  decisões (`seats.decide`). Uma decisão resolve-se com o telemóvel, o teclado ou, se o lugar for bot
  ou o humano estiver desligado, com a IA — por isso a festa nunca fica presa à espera de alguém.
- **Tempo de jogo:** tweens e esperas usam o relógio do motor. Se o browser deixar de desenhar
  (janela minimizada), a lógica continua a correr em segundo plano.

### Como adicionar um minijogo

1. Cria `minigames/OMeuJogo.ts` estendendo `ArenaMinigame` (vê `CoinShower.ts` como modelo):
   - no construtor monta o cenário e chama `spawnActors(...)`;
   - `step(dt)` — regras a cada frame (chama `endGame()` quando acabar);
   - `think(actor)` — IA dos bots (usa `steer()` e `ctx.botPad(id).press('a')`);
   - `scores()` e `winners()`.
2. Exporta um `MinigameDef` com nome, modos suportados (`ffa`, `teams`, `oneVsAll`), descrição e botões.
3. Acrescenta-o à lista em `minigames/index.ts`.
4. Testa-o diretamente: `http://localhost:5173/?minigame=<id>&mode=<modo>&players=6`.

## Modo Desportos (`apps/web/src/host/sports`)

```
sports/types.ts        SportDef (nome, nº de lugares, create) e SportRun (palco 3D com play())
sports/SportStage.ts   base: céu/luz, personagens, câmara suave, placar
sports/index.ts        descobre os desportos em sports/<id>/sport.ts (import.meta.glob)
sports/<id>/           cada desporto: sport.ts (definição) + <Nome>Stage.ts (jogo 3D)
packages/game/src/sports/<id>.ts   regras puras e testadas (pontuação, contagens…)
```

- **Gestos:** o telemóvel mostra o layout `motion` e envia `swing` `{ power, dir, spin, hand }`.
  Com sensores (HTTPS), segura-se a zona e faz-se o movimento: o pico da aceleração dá a força,
  a aceleração lateral a direção e a rotação do pulso o efeito. Sem sensores, o arrastar dá o mesmo
  (velocidade = força, desvio = direção, curvatura = efeito). No teclado: segurar e largar o botão.
- **Por turnos** (bowling, golfe): `seats.awaitSwing(seat, …)` espera pelo gesto de um jogador
  (ou decide pelo bot / jogador desligado).
- **Em tempo real** (ténis, boxe, basebol): o palco ouve `hub.events.on('swing')` e decide se a
  pancada acertou pelo momento em que chegou.

### Como adicionar um desporto

1. Regras puras (se houver contagens) em `packages/game/src/sports/<id>.ts`, com testes.
2. `apps/web/src/host/sports/<id>/<Nome>Stage.ts` estendendo `SportStage` e implementando `play()`.
3. `apps/web/src/host/sports/<id>/sport.ts` a exportar por omissão o `SportDef`.
4. Testar: `http://localhost:5173/?sport=<id>&players=2` (bots completam os lugares).

## Online

- Alojar: `npm install && npm run build && npm start` em qualquer serviço com Node e WebSockets.
  Define `PUBLIC_URL=https://o-teu-dominio` para o QR apontar para lá. HTTPS é recomendado
  (ativa o "manter ecrã ligado" nos telemóveis e é obrigatório em muitos alojamentos).
- Hoje, jogar à distância = os telemóveis ligam-se de qualquer lado e quem não está com o PC vê o ecrã
  por partilha (Discord, etc.).

## Próximos passos sugeridos

- **Mais minijogos** (o género vive da variedade): cada um é um ficheiro em `minigames/`.
- **Desportos:** modo treino com desafios e medalhas, e afinar a sensibilidade dos gestos em telemóveis reais.
- **Mais tabuleiros** e casas especiais (loja de objetos, duelos, eventos próprios do tabuleiro).
- **Som e música**, modelos 3D mais detalhados (`.glb`), mais animações.
- **Guardar a festa** a meio, para sobreviver a um recarregar do ecrã principal (hoje volta ao lobby).
- **Ecrãs espectadores online:** permitir que outros PCs vejam o jogo sem partilha de ecrã —
  o host transmite snapshots do estado (`host:state`) e os espectadores só desenham.
- Mais tipos de comando (giroscópio, desenho, texto), sons, avatares/personagens.
- Persistência (salas sobrevivem a reinícios do servidor) e escala horizontal (adapter Redis do Socket.IO).
