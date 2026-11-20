# Modo tester — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/teste` no PC corre o jogo com um QR; o telemóvel abre `/tester`, um painel que lança qualquer cenário e mexe no jogo a meio.

**Architecture:** Canal novo `tester:*` no servidor (só `FESTA_DEV=1`), independente do código da sala: o host de `/teste` anuncia-se, os painéis ligam-se, o servidor reencaminha comandos e estado. No host, um módulo `host/tester/` (carregado só em `/teste`) guarda o cenário em `sessionStorage`, relança-o ao arrancar e aplica comandos através de ganchos pequenos no `Director` e no `PartyFlow`.

**Tech Stack:** TypeScript, Vite 8, socket.io 4, zod 4, vitest (servidor), Three.js (host).

**Spec:** `docs/superpowers/specs/2026-11-20-modo-tester-design.md`

## Global Constraints

- Tudo de tester só com `import.meta.env.DEV` (web) e `FESTA_DEV=1` (servidor). `npm run build` não inclui `tester.html` nem `host/tester/`.
- `/` não muda de comportamento.
- Textos visíveis em PT-PT.
- O painel nunca é jogador (não usa `player:join`).
- Em `/teste`: sem telemóveis de jogadores, sala trancada (`connection.setLocked(true)`), sem QR de entrada.
- O nível dos bots do painel fica só em memória (não grava em `localStorage`).
- Sobrevivem ao recarregar: cenário, velocidade do tempo, lugar do teclado. Não sobrevivem: dados forçados, moedas/estrelas/itens dados, teletransportes.
- `Director.ts` e `PartyFlow.ts` têm alterações por commitar do utilizador: antes da Task 4, confirmar com ele que estão commitadas (ou commitar só com `git add -p`).

## Review Focus

1. Servidor reinicia com painel e `/teste` abertos → ambos religam e o painel volta a mostrar estado sem tocar em nada.
2. Painel abre antes de `/teste` (ou `/teste` fecha) → painel mostra «À espera do ecrã /teste…», comandos ficam desativados.
3. Comando de tabuleiro enviado fora de uma festa (ex.: `teleport` num desporto) → ignorado sem erro; o estado diz a fase atual.
4. Dois separadores `/teste` abertos → o mais recente é o host de teste; o antigo deixa de receber comandos.
5. Cenário guardado inválido (ex.: minijogo apagado do código) → arranca no lobby normal e limpa o `sessionStorage`, sem ecrã «Ups!» em ciclo.

---

### Task 1: Protocolo tester em `@festa/shared`

**Files:**
- Modify: `packages/shared/src/protocol.ts` (eventos + tipos)
- Modify: `packages/shared/src/schemas.ts` (schemas zod)
- Test: `apps/server/test/tester.test.ts` (parte de schemas)

**Interfaces:**
- Produces (em `protocol.ts`, exportados):
  ```ts
  type BotLevelId = string; // id de BOT_LEVELS (validado no host)
  type Scenario =
    | { kind: 'lobby' }
    | { kind: 'menu'; players: number; botLevel: BotLevelId; keyboardSeat: number | null }
    | { kind: 'party'; board: string; rounds: number; players: number; botLevel: BotLevelId; keyboardSeat: number | null }
    | { kind: 'minigame'; id: string; mode: 'ffa' | 'teams' | 'oneVsAll'; players: number; botLevel: BotLevelId; keyboardSeat: number | null }
    | { kind: 'sport'; id: string; players: number; botLevel: BotLevelId; keyboardSeat: number | null }
    | { kind: 'finale'; board: string; players: number; botLevel: BotLevelId };
  type TesterCmd =
    | { t: 'scenario'; scenario: Scenario }
    | { t: 'time'; scale: 0 | 1 | 2 | 4 }
    | { t: 'nextDice'; values: number[] }          // 1..6, 1–3 valores
    | { t: 'teleport'; playerId: string; spaceId: number }
    | { t: 'give'; playerId: string; coins?: number; stars?: number; item?: string } // coins/stars podem ser negativos
    | { t: 'takeItem'; playerId: string; index: number }
    | { t: 'round'; round: number }
    | { t: 'moveStar' }
    | { t: 'endMinigame'; winners?: string[] }
    | { t: 'skipPractice' }
    | { t: 'reload' };
  interface TesterCatalog { boards: {id:string;name:string}[]; minigames: {id:string;name:string;modes:string[];duel:boolean}[]; sports: {id:string;name:string}[]; botLevels: {id:string;label:string}[]; items: {id:string;name:string}[] }
  interface TesterState {
    phase: 'lobby' | 'menu' | 'board' | 'minigame' | 'practice' | 'sport' | 'finale' | 'other';
    scenario: Scenario | null; timeScale: number;
    round?: number; totalRounds?: number; starSpaceId?: number; spaces?: { id: number; type: string }[];
    players: { id: string; name: string; isBot: boolean; coins?: number; stars?: number; items?: string[]; spaceId?: number }[];
    catalog: TesterCatalog;
  }
  ```
- Eventos novos em `ClientToServerEvents`: `'tester:host': () => void`, `'tester:join': () => void`, `'tester:cmd': (cmd: TesterCmd) => void`, `'tester:state': (state: TesterState) => void`.
- Em `ServerToClientEvents`: `'tester:cmd': (cmd: TesterCmd) => void` (para o host), `'tester:state': (state: TesterState) => void` (para painéis), `'tester:hostStatus': (connected: boolean) => void` (para painéis).
- Em `schemas.ts`: `testerCmdSchema` (zod, discriminado por `t`; `players` 1–8, `rounds` 1–30, `scale` em {0,1,2,4}, `values` 1–3 inteiros 1–6, `keyboardSeat` 0–7 ou null).

- [ ] **Step 1: Teste falhado** — `apps/server/test/tester.test.ts`, `describe('testerCmdSchema')`:
  - `safeParse({ t: 'time', scale: 4 }).success === true`
  - `safeParse({ t: 'time', scale: 3 }).success === false`
  - `safeParse({ t: 'nextDice', values: [7] }).success === false`
  - `safeParse({ t: 'scenario', scenario: { kind: 'party', board: 'ilha', rounds: 2, players: 9, botLevel: 'normal', keyboardSeat: null } }).success === false`
  - `safeParse({ t: 'scenario', scenario: { kind: 'minigame', id: 'Tag', mode: 'teams', players: 4, botLevel: 'normal', keyboardSeat: 0 } }).success === true`
- [ ] **Step 2:** `npm test -w @festa/server -- tester` → FAIL (schema não existe).
- [ ] **Step 3:** Implementar tipos e `testerCmdSchema` (exportado de `@festa/shared/schemas`).
- [ ] **Step 4:** `npm test -w @festa/server -- tester` → PASS; `npm run typecheck` → sem erros.
- [ ] **Step 5:** Commit `feat(tester): protocolo e schemas do painel de tester`.

### Task 2: Reencaminhamento no servidor (só dev)

**Files:**
- Modify: `apps/server/src/socketServer.ts` (handlers `tester:*`, opção `tester?: boolean` em `SocketServerOptions`)
- Modify: `apps/server/src/app.ts:65` (passar `tester: !!opts.devWebPort`)
- Test: `apps/server/test/tester.test.ts`

**Interfaces:**
- Consumes: Task 1 (`testerCmdSchema`, eventos).
- Produces: comportamento —
  - `tester:host` → este socket passa a host de teste (substitui o anterior); emite `tester:hostStatus(true)` a todos os painéis.
  - `tester:join` → socket entra no conjunto de painéis; recebe logo `tester:hostStatus(<há host>)` e o último `TesterState` em cache, se houver.
  - `tester:cmd` (de painel, validado com `testerCmdSchema`, rate limit 20/s) → `tester:cmd` só para o host de teste. De não-painel: ignorado.
  - `tester:state` (só do host de teste) → guardado em cache e enviado a todos os painéis.
  - `disconnect` do host de teste → `tester:hostStatus(false)` aos painéis; limpa a cache.
  - Sem `opts.tester`: nenhum destes handlers existe.

- [ ] **Step 1: Testes falhados** em `tester.test.ts` (copiar `beforeEach`/`client()` de `socket.test.ts`, com `tester: true`):
  - `painel recebe hostStatus false sem host`: painel `tester:join` → `next(painel,'tester:hostStatus') === false`.
  - `comando chega ao host`: host `tester:host`, painel `tester:join`, painel emite `{t:'time',scale:2}` → `next(host,'tester:cmd')` igual a `{t:'time',scale:2}`.
  - `comando inválido não chega`: painel emite `{t:'time',scale:3}` e depois `{t:'reload'}` → o primeiro `tester:cmd` no host é `{t:'reload'}`.
  - `estado chega ao painel e fica em cache`: host emite `tester:state(S)`; painel novo faz `tester:join` → recebe `S`.
  - `host novo substitui o antigo`: host A e B fazem `tester:host`; comando chega a B e não a A (A sem `tester:cmd` em 200 ms).
  - `host sai`: host desliga → painel recebe `tester:hostStatus(false)`.
  - `sem opção tester`: servidor com `tester` omitido; host `tester:host`, painel emite cmd → host sem `tester:cmd` em 200 ms.
- [ ] **Step 2:** `npm test -w @festa/server -- tester` → FAIL.
- [ ] **Step 3:** Implementar no `registerSocketHandlers`, dentro de `if (opts.tester)`, com estado em closure (`testerHost: string | null`, `panels: Set<string>`, `lastState: TesterState | null`). Na `disconnect` existente, limpar painel/host.
- [ ] **Step 4:** `npm test -w @festa/server` → tudo PASS (incluindo `socket.test.ts`).
- [ ] **Step 5:** Commit `feat(tester): servidor reencaminha comandos e estado do painel`.

### Task 3: Rotas `/teste` e `/tester`

**Files:**
- Modify: `apps/web/vite.config.ts` (`controllerRoute`)
- Create: `apps/web/tester.html` (raiz web, igual em estrutura a `ver.html`, script `/src/tester/main.ts`, título «Festa · Tester»)
- Create: `apps/web/src/tester/main.ts` (placeholder: escreve «Tester» no `#app`; Task 6 preenche)

**Interfaces:**
- Produces: `/teste` e `/teste?…` servem `index.html` (URL do browser mantém-se `/teste`); `/tester` serve `tester.html`. `tester.html` não entra em `build.rollupOptions.input`.

- [ ] **Step 1:** Acrescentar as duas reescritas ao middleware `controllerRoute` (`/teste` → `/index.html`, `/tester` → `/tester.html`, mesma forma que `/ver`).
- [ ] **Step 2:** `npm run build -w @festa/web` → sucesso; `ls apps/web/dist` não tem `tester.html`. (Build web só, não `npm run app`.)
- [ ] **Step 3:** Commit `feat(tester): rotas /teste e /tester no Vite`.

### Task 4: Host — arranque em `/teste`, cenário guardado, ligação e QR

**Files:**
- Create: `apps/web/src/host/tester/scenarioStore.ts`
- Create: `apps/web/src/host/tester/TesterHost.ts`
- Create: `apps/web/src/host/tester/tester.css` (QR do canto)
- Modify: `apps/web/src/host/main.ts:53-89` (ramo `/teste`)
- Modify: `apps/web/src/host/HostConnection.ts` (expor `onTesterCmd`, `sendTesterState`, `announceTesterHost`)
- Modify: `apps/web/src/host/game/Settings.ts` (override do nível em memória)
- Modify: `apps/web/src/host/PlayerHub.ts` (`addKeyboardPlayer`)
- Modify: `apps/web/src/host/game/Director.ts` (seats de teste, `testFinale`, `testMenu` público)

**Interfaces:**
- Consumes: Task 1 tipos; Task 2 eventos.
- Produces:
  - `scenarioStore.ts`: `loadScenario(): StoredTester | null`, `saveScenario(s: StoredTester): void`, `clearScenario(): void`, com `StoredTester = { scenario: Scenario; timeScale: number }`, chave `sessionStorage` `'festa.tester'`. `load` devolve `null` se o JSON falhar.
  - `HostConnection`: `announceTesterHost(): void` (emite `tester:host` agora e a cada `connect`), `onTesterCmd(fn: (cmd: TesterCmd) => void): () => void`, `sendTesterState(s: TesterState): void`.
  - `Settings`: `overrideBotLevel(id: BotLevel | null): void` — `botSkill`, `botLevelLabel` e `value.botLevel` passam a devolver o override; `set()` não grava o override.
  - `PlayerHub`: `addKeyboardPlayer(id: 'kb1'): HubPlayer` (ativa o perfil se ainda não estiver, como `toggleKeyboardPlayer`).
  - `Director`:
    - `useTesterSeats(keyboardSeat: number | null): void` — a partir daí os `test*` não sentam telemóveis; o lugar `keyboardSeat` é o `kb1` (não-bot), o resto bots `CHARACTERS[i]`.
    - Os três blocos de seats repetidos em `testMinigame`/`testParty`/`testSport` passam a um só `private devSeats(total: number): void`.
    - `testMenu()` passa a público (cenário `menu`).
    - `testFinale(boardId: string, players: number): Promise<void>` — seats + `partyFlow().testFinale(boardId)`.
  - `TesterHost` (`new TesterHost(deps)`, `deps = { engine, director, connection, hud }`):
    - `start(): Promise<void>` — `connection.setLocked(true)`; `announceTesterHost()`; desenha o QR para `${getJoinBaseUrl()}/tester` (lib `qrcode`, já instalada) num canto, ~120 px, com texto «Painel de tester»; lê `loadScenario()`; aplica `engine.timeScale`, `settings.overrideBotLevel`, `director.useTesterSeats`; lança o cenário (`lobby` → `director.run()`, `menu` → `testMenu()`, `party` → `testParty`, `minigame` → `testMinigame`, `sport` → `testSport`, `finale` → `testFinale`). Sem cenário guardado: `director.run()`.
    - Cenário inválido (id desconhecido ou o lançamento atira erro na primeira vez) → `clearScenario()` e `location.reload()` uma vez.
    - Comandos: `scenario` → `saveScenario` + `location.reload()`; `time` → `engine.timeScale = scale` + guarda; `reload` → `location.reload()`; resto → passa à Task 5 (`flow.tester?.apply(cmd)`).
    - Estado: `sendTesterState` a cada 500 ms se mudou (comparar JSON), com `catalog` de `BOARDS`, `MINIGAMES`, `SPORTS`, `BOT_LEVELS`, `ITEMS`.
  - `main.ts`: `const testerMode = import.meta.env.DEV && location.pathname === '/teste'`. Se sim, `await import('./tester/TesterHost')` e `start()` em vez do ramo `main` atual; os parâmetros `?minigame=` etc. continuam a funcionar em `/`.

- [ ] **Step 1:** Implementar `scenarioStore.ts`, `Settings.overrideBotLevel`, `PlayerHub.addKeyboardPlayer`, `HostConnection` tester.
- [ ] **Step 2:** Implementar `Director.devSeats`, `useTesterSeats`, `testFinale`, `testMenu` público. `npm run typecheck` → sem erros.
- [ ] **Step 3:** Implementar `TesterHost` e o ramo em `main.ts`.
- [ ] **Step 4:** `npm run typecheck` e `npm run build -w @festa/web` → sem erros; `grep -r "Painel de tester" apps/web/dist` → nada (fora da build).
- [ ] **Step 5:** Commit `feat(tester): /teste lança o cenário guardado e liga-se ao painel`.

### Task 5: Ganchos no PartyFlow (tabuleiro e minijogo)

**Files:**
- Create: `apps/web/src/host/tester/PartyHooks.ts`
- Modify: `apps/web/src/host/game/PartyFlow.ts` (pontos indicados abaixo)
- Test: `packages/game/test/party.test.ts` (só se `rollDieFor` mudar — não deve)

**Interfaces:**
- Consumes: Task 4 (`TesterHost` chama `flow.tester?.apply(cmd)` e lê `flow.tester?.snapshot()`).
- Produces:
  - `PartyFlow.tester: PartyHooks | null` — criado só quando `import.meta.env.DEV` e `TesterHost` ativo (`TesterHost` faz `director.flow.tester = new PartyHooks(flow)` ao ver um `flow` novo).
  - `PartyHooks`:
    - `apply(cmd: TesterCmd): void` — põe em fila; `nextDice` guarda os valores.
    - `takeDie(): number | null` — próximo valor forçado.
    - `flush(): void` — aplica `teleport`/`give`/`takeItem`/`round`/`moveStar` ao `state` e chama os refresh do `PartyFlow` (`scoreboard()`, `arrangeAll(true)`, `refreshBoards()`, `pushStatus()`). `give.item` respeita `MAX_ITEMS`; moedas/estrelas nunca abaixo de 0.
    - `endSignal(): boolean` e `endWinners(): string[] | null` — consumidos pelo ciclo do minijogo.
    - `skipPracticeSignal(): boolean`.
    - `phase: TesterState['phase']` e `snapshot(): Pick<TesterState, 'phase'|'round'|'totalRounds'|'starSpaceId'|'spaces'|'players'>`.
  - Para isso, `PartyFlow` expõe (em vez de `private`) só o que `PartyHooks` usa: `state`, `scoreboard`, `arrangeAll`, `refreshBoards`, `pushStatus`, `stage`.
- Pontos no `PartyFlow.ts`:
  - `turn()` e o terceiro dado: `const v = this.tester?.takeDie() ?? rollDieFor(p, this.rng)`.
  - Início de `turn()` e início de `roundMinigame()`: `this.tester?.flush()`.
  - Ciclo `while (!run.finished)` em `runMinigame`: sair também se `this.tester?.endSignal()`; depois, `const roundWinners = this.tester?.endWinners() ?? run.winners()`. Com fim forçado, acaba todas as rondas do minijogo (sair do ciclo das rondas).
  - `practice()`: condição do `while` inclui `!this.tester?.skipPracticeSignal()`.
  - `phase` atualizado em `turn` (`'board'`), `practice` (`'practice'`), `runMinigame` (`'minigame'`), `finale` (`'finale'`).
  - `testFinale(boardId: string): Promise<void>` novo: `minigameSetup(boardId)`; dá a cada jogador `coins` 0–60 e `stars` 0–4 e stats aleatórios com `this.rng`; `finale(this.state)`.
- Comandos que não se aplicam à fase atual são descartados em `apply` (Review Focus 3).

- [ ] **Step 1:** Implementar `PartyHooks.ts` e os pontos no `PartyFlow.ts`.
- [ ] **Step 2:** `npm run typecheck` → sem erros; `npm test -w @festa/game` → PASS.
- [ ] **Step 3:** Commit `feat(tester): ganchos de dados, estado e fim de minijogo no PartyFlow`.

### Task 6: Painel no telemóvel

**Files:**
- Modify: `apps/web/src/tester/main.ts`
- Create: `apps/web/src/tester/tester.css`

**Interfaces:**
- Consumes: Task 1 (`TesterCmd`, `TesterState`); `connectSocket()` de `src/common/socket.ts`.
- Produces: página com
  - Barra de topo: estado da ligação («Ligado ao ecrã» / «À espera do ecrã /teste…»), fase atual, botão **Recarregar**.
  - Separadores **Cenário** · **Tempo** · **Tabuleiro** · **Minijogo** · **Estado**.
  - **Cenário**: tipo (lobby, menu de minijogos, festa, minijogo, desporto, final); campos conforme o tipo, preenchidos a partir de `state.catalog`; jogadores 1–8; nível dos bots; lugar do teclado (nenhum / 1–8); botão **Lançar** → `{t:'scenario'}`. Últimos valores em `localStorage` (`'festa.tester.form'`).
  - **Tempo**: botões ⏸ ×1 ×2 ×4 → `{t:'time'}`; o ativo realçado por `state.timeScale`.
  - **Tabuleiro** (ativo só em `phase` `board`): jogador (lista de `state.players`); dados forçados (1–6, 1 a 3 valores); casa (lista de `state.spaces`) → teletransportar; ±moedas (±5, ±20), ±estrela; dar item (lista); tirar item (toque no item); ronda; mover estrela.
  - **Minijogo** (ativo em `minigame`/`practice`): **Saltar treino**, **Terminar já**, **Terminar com vencedor** (escolha de jogadores).
  - **Estado**: tabela de jogadores (moedas, estrelas, itens, casa) e ronda.
  - Sem host: todos os botões desativados exceto o separador Cenário em leitura.
- Estilo: seguir variáveis/cores de `src/controller/controller.css`; botões ≥ 44 px.

- [ ] **Step 1:** Implementar a página (HTML gerado em TS, sem framework, como `src/viewer/main.ts`).
- [ ] **Step 2:** `npm run typecheck` → sem erros.
- [ ] **Step 3:** Commit `feat(tester): painel de controlo no telemóvel`.

### Task 7: Verificação final e documentação

**Files:**
- Modify: `docs/ARQUITETURA.md` (secção curta «Modo tester»: endereços, onde está o código, só em dev)

- [ ] **Step 1:** `npm run typecheck` e `npm test` → tudo PASS.
- [ ] **Step 2:** `npm run build -w @festa/web` → `dist` sem `tester.html`; `grep -rl "tester:" apps/web/dist` → nada.
- [ ] **Step 3:** Escrever a secção em `docs/ARQUITETURA.md`.
- [ ] **Step 4:** Commit `docs: modo tester`.
- [ ] **Step 5:** Dizer ao utilizador o que verificar no jogo (não testar sozinho): abrir `localhost:5173/teste`, ler o QR, lançar uma festa com 6 jogadores, forçar dado 6, ×4, gravar um ficheiro e ver o cenário voltar.
