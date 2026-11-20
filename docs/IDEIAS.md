# Ideias para a Festa

Escreve aqui as tuas ideias. Copia o modelo de baixo para cada ideia nova (ou preenche um dos espaços vazios no fim) e preenche o que souberes — não é preciso preencher tudo. Eu leio este ficheiro, implemento as ideias e marco o estado de cada uma.

**Fotos:** guarda as imagens (prints, fotos, desenhos) na pasta `ideias-fotos/` (ao lado deste ficheiro) e escreve o nome do ficheiro no campo «Fotos» da ideia. Eu abro-as quando leio.

## Estados

| Caixa   | Significado                                      |
| ------- | ------------------------------------------------ |
| `[ ]` | por fazer                                        |
| `[~]` | a fazer                                          |
| `[x]` | feito                                            |
| `[?]` | tenho dúvidas (respondo em «Notas do Claude») |
| `[-]` | não dá / adiada                                |

## Tipos

minijogo · desporto · tabuleiro · mapa · personagem · comando (telemóvel) · visual · som · menu · online · outro

## Modelo

```markdown
### [ ] Título

- **Tipo:**
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):**
- **Como funciona:**
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:**
```

---

# As minhas ideias

> As ideias acabadas são apagadas daqui; ficam só as por fazer, em andamento ou com dúvidas.

---

### [x] Melhorar o comportamento idle das personagens

- **Tipo:** personagem, visual
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Remover o twitch periódico da cabeça que faz a personagem abanar a cabeça de x em x segundos. Adicionar animações idle ocasionais com trigger temporizado, sem alterar a posição sentada nem criar movimentos bruscos.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** as personagens ficam naturais enquanto esperam no lobby, sem o movimento involuntário da cabeça.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: na sala, a cabeça segue a animação devagar (o esticão vinha do salto no fim de cada volta da animação sentada). De 5 a 12 s, cada personagem vira a cabeça devagar para um lado e volta, sem sair do lugar. Falta confirmares no jogo.

---

### [x] Reposicionar e simplificar o QR code

- **Tipo:** visual, menu, online
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Mudar o QR code para a frente da mesa, onde não tape objetos nem jogadores. Mostrar apenas o link escrito por extenso e apresentar as dicas específicas de Android apenas ao passar o rato pelo símbolo de informação. Se possível, integrar o QR code num quadro ou noutro elemento da decoração.
- **Controlos no telemóvel (botões, joystick, abanar…):** o VIP mostra ou esconde o QR code com «-».
- **Como se ganha / o que acontece no fim:** o QR fica legível, acessível e integrado no cenário.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: o QR passou para a direita do quadro, o link aparece por extenso e as dicas do Android só no balão do botão «i» (ícone desenhado, sem emoji). Feito agora: o «−» do VIP mostra/esconde o quadro do QR (aparece no telemóvel como «− Esconder QR» / «− Mostrar QR»). Feito agora: o QR saiu do painel e passou para um quadro grande de madeira, de pé no chão à frente da mesa de centro e virado para a câmara (o chocolate quente e os livros foram para as pontas da mesa). O painel do canto fica só com o código, o link e o «i». O «−» esconde os dois. Corrigido o quadro que aparecia todo preto. Falta confirmares no jogo se o telemóvel lê bem o QR à distância.

---

### [x] Definir os comandos do jogador no lobby

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby e comando do jogador
- **Como funciona:** Atribuir A a mudar o nome, B às definições gerais (apenas VIP), X a mudar de lugar e Y a jogar (apenas VIP). Apagar o botão «+ Definições». O botão da engrenagem no canto superior direito abre as definições individuais. O botão «-», apenas para o VIP, mostra ou esconde o QR code.
- **Controlos no telemóvel (botões, joystick, abanar…):** A, B, X, Y, «+» e «-» conforme descrito.
- **Como se ganha / o que acontece no fim:** cada botão tem uma função única e respeita as permissões do VIP.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito. Todas as funções têm botão: ◀ ▶ escolhe a personagem; Ⓐ «Pronto» no carrossel e «Mudar personagem» depois de pronto (o Ⓐ não ficou com o nome para não se perder a troca de personagem); «+» «Mudar nome» (toda a gente; abre no telemóvel uma caixa com o nome atual, que fica único na sala); Ⓑ definições gerais, Ⓨ jogar e «−» QR só para o VIP; Ⓧ mudar de lugar; engrenagem ⚙️ = definições individuais. Saiu o «+ Definições». Falta confirmares no jogo.

---

### [x] Separar as definições individuais das definições gerais

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** ecrã do telemóvel
- **Como funciona:** Criar um ecrã de definições individuais visível apenas no telemóvel do jogador, nunca no monitor partilhado. Deve conter teste de vibração, ecrã inteiro, teste de abano e restantes opções específicas desse jogador. Retirar essas opções das definições gerais.
- **Controlos no telemóvel (botões, joystick, abanar…):** engrenagem no canto superior direito para abrir e fechar.
- **Como se ganha / o que acontece no fim:** cada jogador altera as suas próprias preferências sem afetar o menu dos outros.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: a engrenagem ⚙️ fica no canto superior direito do telemóvel (substitui o botão dos sensores) e abre «As minhas definições»: sensores (ativar e calibrar o abanão, com medidor), teste de vibração, ecrã inteiro e, só para o VIP, «Mudar VIP». As definições gerais do PC já não tinham opções pessoais. A engrenagem funciona mesmo com o aviso «Ligação perdida» no ecrã. Falta confirmares no telemóvel.

---

### [?] Mostrar sempre o nome escolhido pelo jogador

- **Tipo:** personagem, menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** todo o jogo
- **Como funciona:** O nome predefinido da personagem só aparece quando o jogador está a escolher a personagem no telemóvel ou quando a personagem é um bot. Em todos os restantes ecrãs, placares e mensagens deve aparecer apenas o nome introduzido pelo jogador.
- **Controlos no telemóvel (botões, joystick, abanar…):** introdução e alteração do nome no botão A.
- **Como se ganha / o que acontece no fim:** não volta a aparecer o nome predefinido depois de o jogador escolher um nome.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Dúvida: no código, os jogadores humanos já aparecem sempre com o nome que escreveram (placares, mensagens, apostas, classificação); o nome da personagem só é usado nos bots e no carrossel de escolha. Onde viste o nome predefinido no lugar do teu? (ecrã, minijogo ou momento). Uma foto ajudava.

---

### [x] Implementar mudança de VIP no telemóvel

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** definições individuais do VIP
- **Como funciona:** Mostrar «Mudar VIP» apenas nas definições individuais do VIP. Ao selecionar, listar no próprio telemóvel todas as personagens com os nomes escolhidos pelos jogadores. Depois de escolher, pedir confirmação: «Mudar VIP para "placeholder"?» com opções SIM e NÃO em cores diferentes.
- **Controlos no telemóvel (botões, joystick, abanar…):** seleção e confirmação no telemóvel do VIP.
- **Como se ganha / o que acontece no fim:** o jogador confirmado passa a controlar as opções de VIP.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: ⚙️ → «⭐ Mudar VIP» (só aparece ao VIP) → lista dos outros jogadores ligados, com o nome que escolheram → «Mudar VIP para «nome»?» com SIM (verde) e NÃO (vermelho). O servidor só aceita o pedido do VIP atual e só para alguém ligado. Se o novo VIP se desligar, a coroa volta a quem está há mais tempo na sala. Falta confirmares no jogo.

---

### [x] Corrigir o bloqueio dos botões após inatividade

- **Tipo:** comando (telemóvel), outro
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** comando do telemóvel
- **Como funciona:** Se o telemóvel ficar muito tempo sem interação, atualmente alguns botões deixam de funcionar, de forma intermitente. Descobrir a causa (estado de inatividade, ligação ou renderização) e garantir que todos os botões continuam funcionais. Apenas o botão de abrir as definições deve continuar disponível no eventual modo de inatividade intencional.
- **Controlos no telemóvel (botões, joystick, abanar…):** todos os botões devem responder; a engrenagem deve ser sempre capaz de abrir as definições.
- **Como se ganha / o que acontece no fim:** retomar o telemóvel depois de muito tempo não exige recarregar a página.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito. Havia duas causas. 1) Se o ecrã bloqueava a meio de um toque, o «largar» perdia-se: o botão ficava «preso» e o toque seguinte era ignorado, tanto no telemóvel como no PC (por isso falhava um toque sim, outro não). Agora o telemóvel larga tudo ao ir para segundo plano e o PC conta sempre cada toque. 2) Depois de mais de 20 s em segundo plano, a ligação podia estar morta sem o browser saber. Agora o telemóvel religa logo ao voltar (mesmo lugar e mesmo ecrã). Falta confirmares no telemóvel.

---

### [x] Botão para alternar ecrã inteiro

- **Tipo:** menu, outro
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** ecrã do PC, sempre visível (em todos os ecrãs)
- **Como funciona:** um botão fixo no ecrã do PC que alterna entre ecrã inteiro (sem barra de separadores do browser) e janela normal (com os separadores à vista).
- **Controlos no telemóvel (botões, joystick, abanar…):** nenhum; carrega-se com o rato no PC.
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: botão discreto no canto inferior direito do PC, em todos os ecrãs, que alterna entre ecrã inteiro e a janela normal (também acompanha o F11/Esc). Falta confirmares no jogo.

---

### [x] Mapa do vulcão dentro de um vulcão

- **Tipo:** mapa, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** mapa do vulcão
- **Como funciona:** o tabuleiro passa a ficar mesmo dentro da cratera de um vulcão, e não como está agora. As paredes da cratera rodeiam o mapa, como as muralhas do castelo, e tapam o horizonte: não se vê o cenário infinito.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):** mapa do castelo (as paredes não deixam ver o infinito)
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: o tabuleiro passa a estar dentro da cratera. Paredes de rocha basáltica com 60 m em arco à volta (atrás e dos lados; à frente fica aberto para a câmara, como no castelo), com a orla de cima recortada, cascatas de lava a escorrer, um rio de lava ao pé da parede e céu de fumo avermelhado. O cone do meio fica, como cone interior da cratera. Falta confirmares no jogo.

---

### [x] Não se ver o cenário infinito

- **Tipo:** visual, mapa
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** todos os jogos, exceto o mapa da ilha
- **Como funciona:** em cada jogo, arranjar maneira de o horizonte infinito não ficar estranho (paredes, montanhas, edifícios, nevoeiro, cúpula…), como no castelo. A ilha fica como está: o mar infinito faz sentido.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):** mapa do castelo
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito nos mapas: vulcão (paredes da cratera), parque (colinas altas à volta), cidade (arranha-céus com janelas acesas à volta); o castelo já tinha paredes e a ilha fica com o mar. Nos minijogos, os que usam o cenário do mapa já tinham um fundo alto e fechado. Os que se passam num sítio próprio (cais no mar, rio, lago, neve, praia do vólei) ficam como estão, porque o horizonte faz parte do sítio. Ainda não fiz os desportos (dúvida 2). Falta confirmares no jogo.

---

### [~] Disposição das casas única em cada mapa

- **Tipo:** mapa, tabuleiro
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** todos os mapas do tabuleiro
- **Como funciona:** os mapas deixam de ser todos um círculo com um caminho extra. Cada mapa tem uma disposição de casas própria e mais complexa (vários cruzamentos, atalhos, ramos, voltas diferentes), para que nenhum se pareça com outro.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** A fazer, mapa a mapa. Ilha refeita ao estilo dos mapas do Super Mario Party Jamboree (Goomba Lagoon), ver ideias-fotos/ilha-colar-de-ilhotas.svg: colar de 4 ilhotas em cima de rochas (aldeia, doca, gruta, praia das conchas). Em cada ilhota o caminho divide-se em dois à volta e volta a juntar-se. Entre ilhotas: cais do navio (com a Taberna do Navio, 3.ª loja) e carreiro na encosta do vulcão. Atalhos: ponte sobre a baía (maré baixa), túnel da gruta (maré alta) e trilho da selva da aldeia ao topo do vulcão (alavanca). 104 casas, 7 cruzamentos. Falta veres no jogo, sobretudo as rochas das ilhotas e as rampas entre ilhotas e caminhos, antes de eu fazer os outros mapas.

---

### [x] Valor dos dados da ordem no placar

- **Tipo:** tabuleiro, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** início da festa, quando se lançam os dados para decidir a ordem de jogar
- **Como funciona:** à medida que cada jogador lança, o placar mostra quanto tirou, ao lado do nome.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: enquanto se decide a ordem, o placar mostra o dado (e a soma) de quem já lançou; depois volta aos itens. Falta confirmares no jogo.

---

### [x] Cenário dos minijogos coerente com o mapa

- **Tipo:** minijogo, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** minijogos da festa, a começar pela Pontaria (`Marksman.ts`)
- **Como funciona:** o cenário de cada minijogo combina com o mapa onde se está a jogar. Exemplo: na Pontaria, no mapa do vulcão, não aparecem árvores; aparecem coisas do vulcão (rochas, lava…). O mesmo para os outros mapas.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: na Pontaria, a floresta à volta passa a usar o cenário do mapa (árvores na ilha e no parque; rochas altas e árvores secas no vulcão; prédios na cidade; árvores secas e campas no castelo) e o chão tem a cor do mapa. Na Canoa a Pares, as margens também seguem o mapa. Os minijogos de fila e de arena já usavam o tema do mapa. Falta confirmares no jogo.

---

### [x] Treino numa janela durante a explicação do minijogo

- **Tipo:** minijogo, comando (telemóvel), visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** ecrã de explicação antes de cada minijogo (título, regras e comandos)
- **Como funciona:** enquanto o texto explica o minijogo e os comandos, aparece ao lado uma janela pequena com uma versão de treino do minijogo a correr. Os jogadores já controlam as suas personagens nessa janela, para experimentar. Nada do que acontece no treino conta. Cada jogador carrega em − quando estiver pronto, e o ecrã mostra quem já está pronto. O minijogo a sério só começa quando todos estiverem prontos. Substitui o «Treino!» atual em ecrã inteiro, que aparece depois da explicação (`practice()` no `PartyFlow.ts`).
- **Controlos no telemóvel (botões, joystick, abanar…):** os do próprio minijogo, na janela de treino; − = «Pronto».
- **Como se ganha / o que acontece no fim:** com todos prontos, a janela fecha e o minijogo começa (contagem 3, 2, 1). Os bots ficam prontos sozinhos.
- **Inspirado em (jogo, vídeo, link, imagem…):** Super Mario Party Jamboree (Switch). Antes de cada minijogo há um ecrã com a explicação e os comandos e, ao lado, uma janela com uma versão de treino que se joga por inteiro. O minijogo só começa quando todos carregam em «Pronto», por isso pode treinar-se o tempo que se quiser. Fonte: https://gamerant.com/super-mario-party-jamboree-beginner-tips-best-strategies/
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: na explicação do minijogo, o painel encosta à esquerda e à direita abre-se uma janela com o minijogo de treino a correr (desenhado pelo Engine na mesma tela, com moldura dourada e o letreiro TREINO). Os jogadores já controlam as personagens; o treino recomeça sozinho se acabar e nada conta. Cada um carrega em − quando está pronto e o painel mostra quem já está (verde). O minijogo começa quando todos estiverem prontos (mínimo 2 s); bots e quem perdeu a ligação contam como prontos; no PC, Enter põe todos prontos. O narrador cala-se quando todos estão prontos. Saiu o treino antigo em ecrã inteiro. Só com bots não há treino. Falta confirmares no jogo, sobretudo o tamanho e o sítio da janela.

---

### [x] Símbolos das casas por cima dos dados

- **Tipo:** tabuleiro, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** tabuleiro, ao lançar os dados
- **Como funciona:** ao lançar os dados, os símbolos das casas (ex.: a escada) aparecem desenhados por cima dos dados, quando deviam ficar escondidos atrás deles. É preciso corrigir. Antes tinha pedido para tirar todos os emojis do jogo; talvez seja melhor apenas retirar… (frase incompleta — ver Notas do Claude).
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:** os dados ficam sempre à frente; nenhum símbolo das casas aparece por cima deles.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):** dados-simbolo-casa-por-cima.png
- **Notas do Claude:** Feito: as placas do cenário (símbolos de túneis, vagoneta, lojas, portagens, banco, armadilhas, fantasma…) eram desenhadas sempre por cima de tudo. Agora ficam escondidas atrás do que estiver à frente (dados, personagens). Os números e textos que flutuam por cima das personagens continuam sempre visíveis. Não retirei nenhum símbolo (a tua frase ficou a meio). Falta confirmares no jogo.

---

### [x] Saque Rápido: banana, pistola de bandeira e misses

- **Tipo:** minijogo
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** minijogo Saque Rápido (`QuickDraw.ts`)
- **Como funciona:**
  - **Banana:** arranjar um modelo de banana em estilo de desenho animado, mas que se perceba que é uma banana.
  - **Pistola da personagem do meio:** fica sempre na mão, com a mão a apontar para cima.
  - **Hora de disparar:** só aparece uma animação da pistola a disparar, e dela sai a bandeira (como as pistolas de brincar com «BANG»).
  - **Misses:** quem carrega mais devagar não conta como miss. Só conta como miss quem carrega antes da hora. Não faz sentido perder duas vidas de uma vez.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito, sem modelo nos packs: 1) Banana nova feita no código, curva, gorda ao meio e fina nas pontas, com pé verde e ponta escura. 2) O árbitro tem o braço direito sempre esticado para cima com a pistola na mão (IK do braço, independente da animação). 3) Ao disparar, o árbitro já não faz animação: só a pistola dá um coice, sai fumo e a bandeira. 4) Causa das duas vidas: a carregadela de quem foi mais lento ficava guardada e, na vez seguinte, contava como falso arranque. Agora é ignorada; só perde vida quem carrega antes da bandeira. Falta confirmares no jogo, sobretudo a posição do braço levantado (pode precisar de acerto).

---

### [?] Dados iguais: os dois primeiros dados não desaparecem

- **Tipo:** tabuleiro, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** tabuleiro, quando se tiram dois dados iguais e aparece o terceiro dado
- **Como funciona:** ao tirar dados iguais, os dois primeiros dados não podem desaparecer para dar lugar ao terceiro. Pode aparecer uma mensagem («Dados iguais!»), mesmo que os tape por um momento, mas os dados continuam lá e o terceiro junta-se a eles.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:** no fim veem-se os três dados lado a lado antes de se juntarem no número total.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Dúvida: no código, os dois primeiros dados já não desaparecem: o terceiro junta-se na mesma fila e a câmara afasta-se para caberem os três (corrigido no commit 6940e3e). A câmara do lançamento já calcula a distância para caberem todos os dados. Viste isto na app de computador (npm run app)? Essa usa a última build, que pode ser anterior à correção. Se viste em npm run dev, diz-me em que momento (dados iguais normais, Dado Extra, Dado Dourado…).
  1. Com três dados, a câmara afasta-se um pouco (recomendo; é o mais simples).
  2. Os três dados encolhem e ficam mais juntos.
  3. O terceiro dado aparece por cima, no meio dos outros dois, em triângulo, sem mexer nos primeiros.

---

### [~] Mais duelos e mais minijogos

- **Tipo:** minijogo
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** duelos e minijogos da festa
- **Como funciona:** fazer mais duelos (só há 3: Pontaria, Saque Rápido e Cabo de Guerra) e mais minijogos, inspirados em jogos que já existem. A lista completa, com a pesquisa, está em `docs/MINIJOGOS-LISTA.md`: lote 5 (8 duelos) e lote 6 (8 minijogos).
- **Controlos no telemóvel (botões, joystick, abanar…):** depende de cada um
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):** Mario Party 3 e 7 (duelos), Wii Party (1 vs 1), Pummel Party
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** A fazer. Duelos novos já feitos (lote 5): Corta a Árvore (carregar depressa em A ou abanar para derrubar a árvore primeiro), Salta o Ponteiro (saltar o ponteiro de um relógio gigante; 3 corações; cada volta mais rápido) e Apanha a Galinha (cercado com joystick; a galinha foge; melhor de 3). Agora há 6 duelos. Falta: o resto do lote 5 (Foge do Choque, Constrói a Ponte, Pesa os Sacos, Luzes por Ordem, Corrida da Bandeira) e o lote 6 de minijogos. Falta confirmares os 3 novos no jogo (no menu «Testar minijogos» ou no painel de tester).

---

### [x] Voleibol de Praia: cenário, equipas, campo e serviço

- **Tipo:** minijogo, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** minijogo Voleibol de Praia (`BeachVolley.ts`)
- **Como funciona:**
  - **Cenário:** o campo parece estar a flutuar sobre lava. Corrigir o cenário todo, para parecer uma praia a sério.
  - **Equipas:** num jogo de 10 jogadores só jogam 8. Têm de jogar todos (5 contra 5, e o mesmo para outros números).
  - **Tamanho do campo:** o campo ajusta-se ao número de jogadores. As dimensões têm de permitir perder pontos; senão fica fácil demais e ninguém perde.
  - **Linhas:** faltam as linhas normais de um campo de voleibol.
  - **Serviço:** a bola é servida por um jogador, em vez de aparecer do nada.
  - **Animações:** as animações de bater na bola têm de ser melhores.
  - **Posições iniciais:** os jogadores não começam todos na mesma linha. Ficam espalhados pelo campo, de forma alinhada.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: 1) Praia a sério: areia larga até ao mar ao fundo (nunca lava, em nenhum mapa), areia molhada junto à água, palmeiras, chapéus de sol e toalhas. 2) Só jogavam 8 de 10 porque o painel de tester limitava a 8 (já corrigido); o minijogo já punha toda a gente em campo, 5 contra 5 com 10. 3) O campo cresce com o número de jogadores por equipa (com 2 por equipa é maior do que era), para ser preciso correr e haver pontos perdidos. A câmara afasta-se para caber tudo. 4) Linhas de campo: fundo, laterais, linha central e linhas de ataque. 5) O serviço é feito por um jogador da equipa que serve, à vez, atrás da linha de fundo: atira a bola ao ar e bate-lhe. 6) Animações: remate com salto e braço por cima; passe com os braços à frente e um saltinho. 7) Posições iniciais em grelha no meio campo (fila junto à rede e fila de trás). Falta confirmares no jogo, sobretudo se a dificuldade ficou boa.

---

### [x] Ecrã a explicar o item ao recebê-lo

- **Tipo:** tabuleiro, menu
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** tabuleiro: depois de rodar o item grátis e depois de comprar um item na loja
- **Como funciona:** quando se recebe um item (na roleta do item grátis ou ao comprar na loja), aparece um ecrã a explicar o que o item faz. Avança-se com o botão −.
- **Controlos no telemóvel (botões, joystick, abanar…):** − para avançar
- **Como se ganha / o que acontece no fim:** depois de carregar em −, o jogo continua.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: depois do item grátis e depois de comprar na loja aparece um ecrã com o nome, o que o item faz e como se usa. Quem o recebeu avança com −; os bots avançam sozinhos ao fim de 2,5 s. Falta confirmares no jogo.

---

### [x] Lojas e cenário atrás do caminho, nunca à frente

- **Tipo:** tabuleiro, mapa, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** todos os mapas; exemplo: o «Ferreiro da Mina» (loja)
- **Como funciona:** o Ferreiro da Mina está do lado de cá das casas e do caminho (entre a câmara e o tabuleiro) e tapa a vista. Lojas, edifícios e outros objetos do cenário têm de ficar do lado de lá do caminho, para se ver sempre a frente sem nada a tapar. Corrigir em todo o jogo, onde quer que aconteça.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: lojas (incluindo o Ferreiro da Mina), casa da mina, acampamento, estações de metro, mastros do teleférico e entrada do parque passam a ficar do lado de lá do caminho (longe da câmara). Se esse sítio cair em cima de outro caminho, o edifício roda um pouco até encontrar espaço. Portagens, alavancas e outros objetos ao lado das casas também preferem o lado de lá; só ficam do lado de cá quando do outro lado não há espaço. Falta confirmares no jogo, mapa a mapa.

---

### [x] Força Certa: só aparecem 6 de 10 jogadores

- **Tipo:** minijogo, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** minijogo Força Certa (atirar a bola para ficar perto da bandeira, `RightForce.ts`)
- **Como funciona:** num jogo de 10 jogadores só se veem 6 no ecrã. Corrigir para se verem todos (pistas e câmara ajustadas ao número de jogadores).
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: a câmara afasta-se conforme o número de pistas, para caberem todas (até 10). Com 4 jogadores fica igual. Falta confirmares no jogo.

---

### [x] Armadilha com modelo 3D no tabuleiro

- **Tipo:** tabuleiro, visual
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** tabuleiro, nas casas onde alguém pôs uma armadilha (item Armadilha)
- **Como funciona:** a armadilha posta numa casa passa a ter um modelo 3D próprio (ex.: uma ratoeira ou um alçapão), em vez de ser só um símbolo por cima da casa.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: a armadilha passa a ser uma armadilha de mandíbulas em 3D (base de metal, duas mandíbulas abertas com dentes, placa dourada e mola), que aparece a saltar do chão ao lado da casa. Feita no código, porque não encontrei modelo nos packs. Falta confirmares no jogo.

---

### [x] Painel de tester: deixar escolher até 10 jogadores

- **Tipo:** outro
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** painel de tester (`/tester`), separador Cenário
- **Como funciona:** ao pôr 10 jogadores no painel, só jogam 8. O jogo aceita até 10 (`MAX_PLAYERS = 10`), por isso o painel também tem de deixar escolher 10.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: o painel e a validação do servidor usam MAX_PLAYERS (10); o lugar do teclado vai até 10. Falta confirmares no jogo.

---

### [x] Plataformas que Caem: rachar primeiro, cair à segunda

- **Tipo:** minijogo
- **Prioridade (alta / média / baixa):**
- **Onde no jogo (ecrã, minijogo, mapa…):** minijogo Plataformas que Caem (`FallingTiles.ts`)
- **Como funciona:** hoje as placas caem logo que se pisam. Passam a demorar mais a partir. Na primeira passagem, a placa fica com uma racha no meio. Só cai quando alguém volta a passar por cima dela.
- **Controlos no telemóvel (botões, joystick, abanar…):**
- **Como se ganha / o que acontece no fim:**
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: na primeira passagem o azulejo fica com uma racha escura no meio; só quando alguém volta a entrar nele é que se desfaz e cai (agora demora 1,3 s, e 0,9 s na 2.ª ronda; antes 0,75 s e 0,5 s). Saltar e cair no mesmo azulejo não conta como nova passagem; o azulejo onde cada um começa também não. Os bots evitam azulejos rachados. Falta confirmares no jogo.

---
