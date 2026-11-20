# Modo tester — painel de controlo no telemóvel

## Intenção

Testar qualquer parte da Festa sem jogar até lá chegar. O ecrã grande corre o jogo
normal; um telemóvel lê um QR e abre um **painel de tester** que salta para qualquer
cenário, controla bots e jogadores, mexe no estado a meio e acelera o tempo.
Ao gravar código, o jogo recarrega e volta ao mesmo cenário, sem passar pelo lobby.

## Objetivos

1. `npm run dev` serve dois endereços no mesmo processo:
   - `localhost:5173/` → jogo normal, sem nada de tester.
   - `localhost:5173/teste` → o mesmo jogo + QR pequeno num canto para o painel.
2. Painel no telemóvel (`/tester`, página nova) liga-se como **tester**, não como jogador:
   não ocupa lugar, não conta para bots.
3. **Saltar para qualquer cenário**: lobby, menu, festa (mapa + rondas), minijogo
   (modo ffa / equipas / 1 contra todos / duelo), desporto, estrelas bónus / pódio.
   Escolher nº de jogadores (1–8) e nível dos bots.
4. **Mexer a meio**:
   - Tempo: pausa, ×1, ×2, ×4 (`engine.timeScale` já existe).
   - Tabuleiro: forçar o próximo dado, teletransportar jogador para uma casa,
     dar/tirar moedas, estrelas e itens, mudar a ronda, mudar a casa da estrela.
   - Minijogo: terminar já, escolher o vencedor, saltar o treino.
   - Assumir um lugar pelo teclado do PC (aplica-se no relançamento do cenário).
5. **Recarregar sem perder o cenário**: o host guarda o último cenário lançado e
   relança-o sozinho depois de cada recarregamento. O painel do telemóvel mantém-se
   ligado (religa sozinho também se o servidor reiniciar).
6. Painel mostra o estado atual: fase, ronda, jogadores (moedas, estrelas, itens, casa).

## Não objetivos

- Retomar o **momento exato** (meio de um minijogo, bola no ar). Relança o cenário
  do início. Guardar o estado interno de cada minijogo é muito trabalho e frágil.
- Telemóveis falsos (comandos simulados para ver o ecrã de cada jogador) — fase futura.
- Testes automáticos / gravação de sessões.

## Anti-objetivos

- Nada disto pode aparecer em `npm run app` / `npm run build` / `npm start`.
- O jogo normal (`/`) não pode mudar de comportamento.
- O painel não pode ser um jogador (estragaria testes de lobby e contagem de bots).

## Restrições

- Todo o código de tester só corre com `import.meta.env.DEV` (web) e
  `FESTA_DEV=1` (servidor). A build de produção não inclui `/tester`.
- Textos em PT-PT.
- `PartyFlow.ts` tem 1837 linhas: os ganchos têm de ser pontuais, não um refactor.

## Abordagens consideradas

- **A. Página própria `/tester` no telemóvel, ligação de tipo «tester» (escolhida).**
  Copia o padrão do espectador `/ver` (`viewer:join` + reencaminhamento no
  `socketServer.ts`). Não mexe nos lugares nem no lobby. Custa uma página nova e um
  canal novo no servidor.
- B. Separador de tester dentro do comando `/play`. Mais barato, mas o telemóvel
  entra como jogador: ocupa lugar, baralha a contagem de bots, impede «8 bots sem
  humanos». Rejeitada.
- C. Painel por cima do jogo no PC. Simples, mas tapa o ecrã e não é o pedido.
  Rejeitada.

## Como funciona (decidido)

### Ligação

- O canal tester **não depende do código da sala**: se o servidor reiniciar, a sala
  muda de código, mas o painel continua ligado ao host de teste.
  - Host em `/teste` emite `tester:host` ao ligar (e a cada religação).
  - Painel emite `tester:join` ao ligar.
  - Servidor (só com `FESTA_DEV=1`) guarda o socket do host de teste e o conjunto de
    painéis; reencaminha `tester:cmd` (painel → host) e `tester:state` (host → painéis).
  - Se não houver host de teste, o painel mostra «À espera do ecrã /teste…».
- O QR em `/teste` aponta para `http(s)://<ip-lan>:5173/tester` (mesmo método que o
  QR de entrada dos jogadores, `joinUrl.ts`).

### Comandos (painel → host)

Mensagens tipadas em `packages/shared`, ex.:

```ts
type TesterCmd =
  | { t: 'scenario'; scenario: Scenario }
  | { t: 'time'; scale: 0 | 1 | 2 | 4 }
  | { t: 'nextDice'; values: number[] }            // próximo lançamento
  | { t: 'teleport'; playerId: string; spaceId: number }
  | { t: 'give'; playerId: string; coins?: number; stars?: number; item?: ItemId }
  | { t: 'takeItem'; playerId: string; index: number }
  | { t: 'round'; round: number }
  | { t: 'moveStar' }
  | { t: 'endMinigame'; winners?: string[] }
  | { t: 'skipPractice' }
  | { t: 'takeOver'; seat: number | null }         // índice do lugar do teclado; relança o cenário
  | { t: 'reload' };                                // relança o cenário atual

type Scenario =
  | { kind: 'lobby' }
  | { kind: 'party'; board: string; rounds: number; players: number; botLevel: BotLevel }
  | { kind: 'minigame'; id: string; mode: MinigameMode; players: number; botLevel: BotLevel }
  | { kind: 'sport'; id: string; players: number; botLevel: BotLevel }
  | { kind: 'finale'; board: string; players: number };  // estrelas bónus + pódio
```

### Lado do host

- Novo módulo `apps/web/src/host/tester/` carregado só em `/teste` (`import()`
  dinâmico dentro de `if (import.meta.env.DEV)`), para não pesar em `/`.
- **Cenário**: guardado em `sessionStorage`. Em `/teste`, o arranque lê-o e chama os
  `director.test*` que já existem (`testParty`, `testMinigame`, `testSport`) em vez de
  `director.run()`. Um cenário novo do painel grava e recarrega a página — o mesmo
  caminho que o recarregamento do Vite, por isso só há um caminho para testar.
- **Ganchos no PartyFlow** (mínimos):
  - `rollDieFor` passa por uma fila de dados forçados, se houver.
  - Alterações de estado (moedas, estrelas, itens, casa, ronda, estrela) mexem em
    `this.state` e chamam `scoreboard()` / `arrangeAll(true)` / `refreshBoards()`.
    Só aplicadas entre passos (não a meio de uma animação), via fila consumida no
    início de cada vez/ação.
  - `finale` exposto como cenário direto com um estado gerado (moedas e estrelas
    aleatórias).
- **Minijogos**: `endMinigame` e `skipPractice` precisam de um sinal comum em
  `runMinigame` / `practice` (ex.: `AbortSignal` ou promessa que corre contra o fim
  normal). Vencedores forçados substituem o ranking devolvido.
- **Estado (host → painel)**: enviado a cada mudança relevante (fase, vez, fim de
  minijogo) e no máximo 2×/s.

### Painel no telemóvel

- Página `tester.html` + `src/tester/main.ts`, HTML simples, sem Three.js.
- Separadores: **Cenário** · **Tempo** · **Tabuleiro** · **Minijogo** · **Estado**.
- Listas de mapas, minijogos e desportos vêm de `MINIGAMES` / `SPORTS` / mapas, não
  escritas à mão.
- Lembra os últimos valores do formulário (`localStorage`).

### Servidor

- `tester:*` só registados quando `FESTA_DEV=1`. Em produção não existem.
- Reconexão: socket.io religa sozinho; host e painel voltam a anunciar-se.

## Decisões do utilizador

- **Assumir um lugar** só no relançamento: escolhe-se o lugar e o cenário recomeça
  com o teclado do PC nesse lugar. Sem troca a meio do jogo.
- **Sem telemóveis de jogadores em `/teste`**: só bots + teclado do PC. Não aparece
  o QR de entrada; o lobby de teste não aceita jogadores (sala trancada,
  `host:lock`). Os `test*` deixam de sentar telemóveis ligados.

## Decisões do Claude (a confirmar na leitura)

- **O que sobrevive ao recarregar**: cenário + velocidade do tempo + lugar assumido
  pelo teclado (tudo em `sessionStorage`, reaplicado depois do `director.test*`).
  Ações únicas (dados forçados, dar moedas, teletransporte) não sobrevivem.
- **Nº de jogadores** = total de lugares.
- **Menu** passa a ser um `kind` do `Scenario`. **Duelo** não é um modo: vem de
  `def.duel` do minijogo.
- **Nível dos bots** escolhido no painel fica só em memória, para não mudar as
  definições do jogo normal.

## Deixado ao construtor

- Layout exato do painel e estilo (seguir `controller.css`).
- Onde exatamente ficam as filas de comandos dentro do `PartyFlow`.
- Como gerar o estado do cenário `finale`.
- Rota `/teste` e `/tester` no plugin `controllerRoute` do `vite.config.ts`.
