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

### [ ] Sugerir nomes alternativos para a aplicação

- **Tipo:** outro
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** identidade da aplicação
- **Como funciona:** Apresentar várias sugestões de nomes alternativos para a aplicação Festa.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** não aplicável
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Escolher um nome que continue a funcionar para o modo Festa, desportos e jogo online.

---

### [x] Remover «Voltar à sala» da televisão

- **Tipo:** menu, visual
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** televisão ao iniciar um jogo
- **Como funciona:** Retirar a opção «Voltar à sala» da interface da televisão; essa ação deve ser feita exclusivamente pelo botão B.
- **Controlos no telemóvel (botões, joystick, abanar…):** botão B.
- **Como se ganha / o que acontece no fim:** não há duas ações diferentes para a mesma função.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Rever o fluxo do `Director` e os painéis de `Hud`.
---

### [ ] Reposicionar a luminária e as prateleiras

- **Tipo:** visual, mapa
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Colocar a luminária à esquerda do sofá principal, alinhada com ele e atrás do sofá individual da esquerda. A posição deve ser a interseção dos eixos dos dois sofás. Centrar a prateleira de cima no meio da parede e eliminar completamente a prateleira de baixo.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** a decoração fica alinhada e sem a prateleira inferior.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Ajustar os objetos do cenário sem alterar os lugares das personagens.

---

### [ ] Corrigir o cenário e a decoração do lobby

- **Tipo:** visual, mapa
- **Prioridade (alta / média / baixa):** média
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Remover o espelho cinzento no centro da parede atrás do sofá. Repor as paredes do modelo transferido anteriormente, em vez das paredes do pack das personagens. Ao virar a câmara para a televisão, corrigir a parede traseira roxa para ter a mesma cor uniforme das restantes.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** o lobby fica visualmente coerente e sem elementos a mais.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Ver `ShowcaseStage`, `livingRoom` e os recursos do cenário.

---

### [ ] Corrigir posições dos lugares no lobby

- **Tipo:** visual, personagem
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lugares das personagens no lobby
- **Como funciona:** Usar o lugar 1 (centro do sofá, onde a personagem começa) como referência e corrigir a ordem e a posição. Ajustar o lugar 3 para a personagem ficar sentada no sofá e não a flutuar na almofada; ajustar os lugares 4 e 5 dos sofás individuais para ficarem bem sentadas; trocar o lugar 8 por uma posição que não fique escondida atrás da cadeira; no lugar 9, manter a posição em frente à lareira mas virar a personagem para a frente; substituir o lugar 10, que está fora do ecrã, por uma posição visível.
- **Controlos no telemóvel (botões, joystick, abanar…):** não aplicável
- **Como se ganha / o que acontece no fim:** todas as personagens ficam visíveis e corretamente sentadas.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Confirmar coordenadas, rotação e altura dos lugares em `ShowcaseStage`/`livingRoom`.

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

### [ ] Iniciar o jogo com o volume guardado

- **Tipo:** som, menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** arranque e lobby
- **Como funciona:** Retirar o botão de ativar o som por tecla ou rato. Ao abrir, o jogo deve iniciar automaticamente com o último volume usado.
- **Controlos no telemóvel (botões, joystick, abanar…):** música e efeitos continuam a ser ajustáveis nas definições.
- **Como se ganha / o que acontece no fim:** o volume fica persistido entre sessões.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Relacionado com `SoundEngine`/`applyVolumes` e as definições gerais.

---

### [ ] Reposicionar e simplificar o QR code

- **Tipo:** visual, menu, online
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby
- **Como funciona:** Mudar o QR code para a frente da mesa, onde não tape objetos nem jogadores. Mostrar apenas o link escrito por extenso e apresentar as dicas específicas de Android apenas ao passar o rato pelo símbolo de informação. Se possível, integrar o QR code num quadro ou noutro elemento da decoração.
- **Controlos no telemóvel (botões, joystick, abanar…):** o VIP mostra ou esconde o QR code com «-».
- **Como se ganha / o que acontece no fim:** o QR fica legível, acessível e integrado no cenário.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Não usar o símbolo de informação como emoji; deve ser um ícone de interface sem emojis.

---

### [ ] Melhorar o menu de definições gerais

- **Tipo:** menu, som
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** definições gerais do VIP
- **Como funciona:** Remover a opção de velocidade das animações e fixar a velocidade normal. Transformar música e efeitos em sliders de 0 a 100. Remover o botão de fechar, porque essa função pertence ao botão B. Remover a dificuldade dos bots deste menu, porque deve ser escolhida ao iniciar cada jogo na televisão.
- **Controlos no telemóvel (botões, joystick, abanar…):** sliders e opções no telemóvel do VIP.
- **Como se ganha / o que acontece no fim:** as definições gerais mostram apenas opções globais válidas para a sessão.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** `Settings.ts` já concentra `SettingsData`; alinhar o modelo com os novos limites e permissões.

---

### [ ] Definir os comandos do jogador no lobby

- **Tipo:** comando (telemóvel), menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby e comando do jogador
- **Como funciona:** Atribuir A a mudar o nome, B às definições gerais (apenas VIP), X a mudar de lugar e Y a jogar (apenas VIP). Apagar o botão «+ Definições». O botão da engrenagem no canto superior direito abre as definições individuais. O botão «-», apenas para o VIP, mostra ou esconde o QR code.
- **Controlos no telemóvel (botões, joystick, abanar…):** A, B, X, Y, «+» e «-» conforme descrito.
- **Como se ganha / o que acontece no fim:** cada botão tem uma função única e respeita as permissões do VIP.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Rever os layouts enviados por `PlayerHub` e renderizados em `controller/main.ts`.

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

### [ ] Restringir o jogo online e o menu geral ao VIP

- **Tipo:** online, menu
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** lobby e definições gerais
- **Como funciona:** Mover «Jogar Online» para as definições gerais e torná-lo acessível apenas ao VIP. A opção «Fechar o jogo» também deve existir apenas nesse menu geral e apenas para o VIP. Retirar o botão «Fechar» das definições, pois fechar é a função do botão B.
- **Controlos no telemóvel (botões, joystick, abanar…):** B abre as definições gerais para o VIP e também fecha ecrãs quando essa for a função definida.
- **Como se ganha / o que acontece no fim:** jogadores normais não conseguem alterar a sessão nem fechar o jogo.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Manter as permissões consistentes entre o host, o layout do telemóvel e a interface apresentada.

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

### [x] Remover todos os emojis da aplicação

- **Tipo:** outro, menu, visual
- **Prioridade (alta / média / baixa):** alta
- **Onde no jogo (ecrã, minijogo, mapa…):** aplicação inteira, incluindo televisão
- **Como funciona:** Eliminar definitivamente todos os emojis de textos, botões, instruções, televisão, README/interface e restantes ecrãs. Não voltar a adicionar emojis sem perguntar primeiro se são realmente necessários.
- **Controlos no telemóvel (botões, joystick, abanar…):** substituir emojis usados como ícones por ícones visuais ou texto acessível.
- **Como se ganha / o que acontece no fim:** nenhum emoji aparece na aplicação.
- **Inspirado em (jogo, vídeo, link, imagem…):**
- **Fotos (nomes dos ficheiros em `ideias-fotos/`):**
- **Notas do Claude:** Inclui especificamente os emojis atualmente usados na televisão e nos menus; confirmar também strings e documentação visível ao utilizador.

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
