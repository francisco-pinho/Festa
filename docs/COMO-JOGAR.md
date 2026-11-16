# Como se joga

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

## Minijogos

31 minijogos (o Cabo de Guerra tem uma versão 1 contra 1 e outra por equipas, com ids diferentes), em [`apps/web/src/host/minigames/`](../apps/web/src/host/minigames/). O id serve para os testar diretamente: `http://localhost:5173/?minigame=<id>&mode=<modo>&players=6`.

| Minijogo | id | Modos |
|---|---|---|
| Apanha-Apanha | `tag` | 1 contra todos |
| Balão Rebentão | `balao` | todos contra todos, equipas, 1 contra todos |
| Batata Quente | `batata` | todos contra todos |
| Bolas de Neve | `neve` | todos contra todos, equipas |
| Bombardeiro | `bombardeiro` | 1 contra todos |
| Bombas Sobe-Desce | `bombas-passadeira` | todos contra todos |
| Cabo de Guerra | `cabo` | duelo 1 contra 1 |
| Cabo de Guerra (equipas) | `cabo-equipas` | equipas, 1 contra todos |
| Canoa a Pares | `canoa` | equipas |
| Chuva de Meteoros | `meteoros` | todos contra todos, equipas |
| Chuva de Moedas | `coin-shower` | todos contra todos, equipas |
| Chão de Cores | `cores` | todos contra todos, equipas |
| Conta as Ovelhas | `ovelhas` | todos contra todos |
| Corda Saltitona | `corda` | todos contra todos, equipas |
| Corrida de Bobsled | `bobsled` | equipas |
| Corrida no Gelo | `gelo` | todos contra todos, equipas |
| Diz o Maestro | `maestro` | todos contra todos, equipas |
| Empurra-Empurra | `sumo` | todos contra todos, equipas, 1 contra todos |
| Força Certa | `forca-certa` | todos contra todos, equipas |
| Fotografia Certa | `fotografia` | todos contra todos |
| Futebol de Carapaças | `futebol` | equipas |
| Martelão | `martelao` | 1 contra todos |
| Memória | `memoria` | todos contra todos |
| Olha para o Lado | `olha-lado` | 1 contra todos |
| Parede com Buraco | `parede-buraco` | todos contra todos, equipas |
| Pesca de Baús | `pesca` | todos contra todos, equipas |
| Pinball | `pinball` | todos contra todos |
| Pizza Rápida | `pizza` | todos contra todos, equipas |
| Plataformas que Caem | `plataformas` | todos contra todos, equipas |
| Pontaria | `pontaria` | duelo 1 contra 1 |
| Saque Rápido | `saque` | duelo 1 contra 1 |
| Volei de Praia | `volei` | equipas |

## O telemóvel não abre a página?

| Sintoma | Solução |
|---|---|
| Android: `ERR_TOO_MANY_RETRIES` | O Android 17 exige uma permissão para o Chrome aceder à rede local: **Definições → Apps → Chrome → Permissões → Dispositivos próximos** (ou "Rede local") → Permitir. Alternativa: usar o Firefox. |
| "A ligação não é privada" | Normal com `npm run dev:https` (certificado feito por nós): **Avançadas → Continuar**. |
| Não abre de todo | Telemóvel e PC têm de estar na **mesma rede Wi-Fi** (não a de convidados) e sem VPN; desliga os dados móveis. |
