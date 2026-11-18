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

### [x] Corrigir posições dos lugares no lobby

- **Tipo:** visual, personagem
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lugares das personagens no lobby
- **Como funciona:** Usar o lugar 1 (centro do sofá, onde a personagem começa) como referência e corrigir a ordem e a posição. Ajustar o lugar 3 para a personagem ficar sentada no sofá e não a flutuar na almofada; ajustar os lugares 4 e 5 dos sofás individuais para ficarem bem sentadas; trocar o lugar 8 por uma posição que não fique escondida atrás da cadeira; no lugar 9, manter a posição em frente à lareira mas virar a personagem para a frente; substituir o lugar 10, que está fora do ecrã, por uma posição visível.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** todas as personagens ficam visíveis e corretamente sentadas.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: lugares 1–3 alinhados no sofá (o 1 é a referência), o 3 mais baixo e à frente, o 4 e o 5 mais baixos nos cadeirões, o 8 e o 10 visíveis. O lugar 9 voltou para a frente da lareira, de pé e virado para a câmara. Falta confirmares tudo no jogo.

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
