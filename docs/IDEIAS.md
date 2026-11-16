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

### [?] Corrigir posições dos lugares no lobby

- **Tipo:** visual, personagem
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lugares das personagens no lobby
- **Como funciona:** Usar o lugar 1 (centro do sofá, onde a personagem começa) como referência e corrigir a ordem e a posição. Ajustar o lugar 3 para a personagem ficar sentada no sofá e não a flutuar na almofada; ajustar os lugares 4 e 5 dos sofás individuais para ficarem bem sentadas; trocar o lugar 8 por uma posição que não fique escondida atrás da cadeira; no lugar 9, manter a posição em frente à lareira mas virar a personagem para a frente; substituir o lugar 10, que está fora do ecrã, por uma posição visível.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** todas as personagens ficam visíveis e corretamente sentadas.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: lugares 1–3 alinhados no sofá (o 1 é a referência), o 3 mais baixo e à frente, o 4 e o 5 mais baixos nos cadeirões, o 8 e o 10 visíveis. Dúvida: o lugar 9 está agora no canto direito, virado para a sala, e já não à frente da lareira. Queres que volte à lareira, virado para a câmara? Falta confirmares tudo no jogo.

---

### [ ] Melhorar o comportamento idle das personagens

- **Tipo:** personagem, visual
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Remover o twitch periódico da cabeça que faz a personagem abanar a cabeça de x em x segundos. Adicionar animações idle ocasionais com trigger temporizado, sem alterar a posição sentada nem criar movimentos bruscos.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** as personagens ficam naturais enquanto esperam no lobby, sem o movimento involuntário da cabeça.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** A API de animações existente inclui `idle` e outras animações em `CharacterModel`; reutilizar esse sistema.

---

### [~] Reposicionar e simplificar o QR code

- **Tipo:** visual, menu, online
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Mudar o QR code para a frente da mesa, onde não tape objetos nem jogadores. Mostrar apenas o link escrito por extenso e apresentar as dicas específicas de Android apenas ao passar o rato pelo símbolo de informação. Se possível, integrar o QR code num quadro ou noutro elemento da decoração.
- **Controlos no telemóvel (botões, joystick, abanar…):** o VIP mostra ou esconde o QR code com «-».
- **Como se ganha / o que acontece no fim:** o QR fica legível, acessível e integrado no cenário.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: o QR passou para a direita do quadro, o link aparece por extenso e as dicas do Android só no balão do botão «i» (ícone desenhado, sem emoji). Falta: pôr o QR à frente da mesa ou num quadro da parede, e o «−» do VIP a mostrar/esconder.

---

### [?] Definir os comandos do jogador no lobby

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby e comando do jogador
- **Como funciona:** Atribuir A a mudar o nome, B às definições gerais (apenas VIP), X a mudar de lugar e Y a jogar (apenas VIP). Apagar o botão «+ Definições». O botão da engrenagem no canto superior direito abre as definições individuais. O botão «-», apenas para o VIP, mostra ou esconde o QR code.
- **Controlos no telemóvel (botões, joystick, abanar…):** A, B, X, Y, «+» e «-» conforme descrito.
- **Como se ganha / o que acontece no fim:** cada botão tem uma função única e respeita as permissões do VIP.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Feito: Ⓑ = definições gerais só para o VIP, Ⓨ = jogar só para o VIP, Ⓧ = mudar de lugar; saiu o «+ Definições». Dúvida: hoje o Ⓐ escolhe a personagem no carrossel e, depois de pronto, faz «Mudar personagem». Se o Ⓐ passar a «mudar o nome», como se muda de personagem depois de pronto? Falta ainda o «−» do VIP para o QR e a engrenagem (ver «Separar as definições individuais»).

---

### [ ] Separar as definições individuais das definições gerais

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** ecrã do telemóvel
- **Como funciona:** Criar um ecrã de definições individuais visível apenas no telemóvel do jogador, nunca no monitor partilhado. Deve conter teste de vibração, ecrã inteiro, teste de abano e restantes opções específicas desse jogador. Retirar essas opções das definições gerais.
- **Controlos no telemóvel (botões, joystick, abanar…):** engrenagem no canto superior direito para abrir e fechar.
- **Como se ganha / o que acontece no fim:** cada jogador altera as suas próprias preferências sem afetar o menu dos outros.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Distinguir estado local do comando de opções do host em `Settings`.

---

### [ ] Mostrar sempre o nome escolhido pelo jogador

- **Tipo:** personagem, menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** todo o jogo
- **Como funciona:** O nome predefinido da personagem só aparece quando o jogador está a escolher a personagem no telemóvel ou quando a personagem é um bot. Em todos os restantes ecrãs, placares e mensagens deve aparecer apenas o nome introduzido pelo jogador.
- **Controlos no telemóvel (botões, joystick, abanar…):** introdução e alteração do nome no botão A.
- **Como se ganha / o que acontece no fim:** não volta a aparecer o nome predefinido depois de o jogador escolher um nome.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Não confundir o identificador interno da personagem com o nome apresentado.

---

### [ ] Implementar mudança de VIP no telemóvel

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** definições individuais do VIP
- **Como funciona:** Mostrar «Mudar VIP» apenas nas definições individuais do VIP. Ao selecionar, listar no próprio telemóvel todas as personagens com os nomes escolhidos pelos jogadores. Depois de escolher, pedir confirmação: «Mudar VIP para "placeholder"?» com opções SIM e NÃO em cores diferentes.
- **Controlos no telemóvel (botões, joystick, abanar…):** seleção e confirmação no telemóvel do VIP.
- **Como se ganha / o que acontece no fim:** o jogador confirmado passa a controlar as opções de VIP.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** A lista deve usar os nomes atuais dos jogadores e atualizar a autoridade VIP da sala.

---

### [ ] Corrigir o bloqueio dos botões após inatividade

- **Tipo:** comando (telemóvel), outro
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** comando do telemóvel
- **Como funciona:** Se o telemóvel ficar muito tempo sem interação, atualmente alguns botões deixam de funcionar, de forma intermitente. Descobrir a causa (estado de inatividade, ligação ou renderização) e garantir que todos os botões continuam funcionais. Apenas o botão de abrir as definições deve continuar disponível no eventual modo de inatividade intencional.
- **Controlos no telemóvel (botões, joystick, abanar…):** todos os botões devem responder; a engrenagem deve ser sempre capaz de abrir as definições.
- **Como se ganha / o que acontece no fim:** retomar o telemóvel depois de muito tempo não exige recarregar a página.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Investigar `controller/main.ts`, reconexão e atualizações de layout sem assumir que o problema é apenas visual.

---
