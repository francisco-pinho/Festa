# Recursos externos (modelos, texturas, sons)

Só usamos recursos com licença que permita uso comercial e redistribuição no repositório
(de preferência **CC0**). Cada recurso fica registado aqui com a origem exata.

| Recurso | Ficheiros no projeto | Autor | Origem | Licença | Data |
|---|---|---|---|---|---|
| KayKit Character Pack: Adventurers 1.0 — 5 personagens com esqueleto e 76 animações (Barbarian, Knight, Mage, Rogue, Rogue_Hooded) | `apps/web/public/models/kaykit/*.glb` + `LICENSE.txt` | Kay Lousberg (kaylousberg.com) | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) — pasta `addons/kaykit_character_pack_adventures/Characters/gltf` | CC0 1.0 (ficheiro `LICENSE.txt` incluído) | 2026-11-11 |
| KayKit City Builder Bits 1.0 — prédios, carros, candeeiros, bancos, mobiliário urbano (22 modelos) | `apps/web/public/models/kaykit-city/` + `LICENSE.txt` | Kay Lousberg | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | CC0 1.0 | 2026-11-12 |
| KayKit Halloween Bits 1.0 — campas, árvores secas, cripta, portões, lanternas, abóboras (24) | `apps/web/public/models/kaykit-halloween/` + `LICENSE.txt` | Kay Lousberg | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) | CC0 1.0 | 2026-11-12 |
| KayKit Medieval Hexagon Pack 1.0 — castelo, torres, mina, montanhas, acampamento (27) | `apps/web/public/models/kaykit-medieval/` + `LICENSE.txt` | Kay Lousberg | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0 1.0 | 2026-11-12 |
| KayKit Furniture Bits 1.0 — sofás, mesas, candeeiros, tapetes (10) | `apps/web/public/models/kaykit-furniture/` + `LICENSE.txt` | Kay Lousberg | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0) | CC0 1.0 | 2026-11-12 |
| KayKit Restaurant Bits 1.0 — mesas de comida, caixas, hambúrguer (5) | `apps/web/public/models/kaykit-restaurant/` + `LICENSE.txt` | Kay Lousberg | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0) | CC0 1.0 | 2026-11-12 |
| Kenney Pirate Kit 2.1 — palmeiras, barcos, cais, rochas de praia, torre de vigia (24) | `apps/web/public/models/kenney-pirate/` + `LICENSE.txt` | Kenney (kenney.nl) | [kenney.nl/assets/pirate-kit](https://kenney.nl/assets/pirate-kit) | CC0 1.0 | 2026-11-12 |
| Kenney Nature Kit 2.1 — árvores, rochas, plantas, flores, troncos (42) | `apps/web/public/models/kenney-nature/` + `LICENSE.txt` | Kenney | [kenney.nl/assets/nature-kit](https://kenney.nl/assets/nature-kit) | CC0 1.0 | 2026-11-12 |
| Kenney Coaster Kit 1.0 — bancas, entrada do parque, árvores, bancos (14) | `apps/web/public/models/kenney-coaster/` + `LICENSE.txt` | Kenney | [kenney.nl/assets/coaster-kit](https://kenney.nl/assets/coaster-kit) | CC0 1.0 | 2026-11-12 |
| Kenney Minigolf Kit 3.1 — moinhos, castelo, bandeiras (6) | `apps/web/public/models/kenney-minigolf/` + `LICENSE.txt` | Kenney | [kenney.nl/assets/minigolf-kit](https://kenney.nl/assets/minigolf-kit) | CC0 1.0 | 2026-11-12 |

## Cenários detalhados (Quaternius, CC0)

Versão gratuita («Standard») das MegaKits, descarregada do itch.io oficial da Quaternius
(https://quaternius.itch.io). Licença CC0 1.0 (ficheiro `LICENSE.txt` em cada pasta).

| Pasta | Pack | O que usamos |
|---|---|---|
| `models/q-nature` | Stylized Nature MegaKit | 63 modelos: árvores comuns, pinheiros, árvores torcidas e secas, arbustos, flores, fetos, cogumelos, erva, pedras e calçadas |
| `models/q-city` | Downtown City MegaKit | 3 prédios completos + adereços de rua (bolardos, floreiras, ar condicionado) |
| `models/q-medieval` | Medieval Village MegaKit | 40 peças: vedações, carroça, caixotes, trepadeiras, chaminés, paredes, telhados, escadas |
| `models/q-props` | Fantasy Props MegaKit | 40 adereços: barris, baús, bancas, bandeiras, tochas, bigorna, caldeirão, estante, castiçais, boneco de treino… |

As texturas originais (2048–4096 px, 182 MB) foram reduzidas para 1024 px (cor) e 512 px (normais e
rugosidade), JPEG quando não há transparência: ficam com 6 MB. Para refazer: `tools/pick-quaternius.py`
(escolha e cópia) e `electron tools/shrink-textures.cjs` (redução com o Electron, sem instalar nada).

## Como os usamos

- As armas, escudos e livros dos modelos ficam escondidos; as mãos ficam livres para os objetos do jogo.
- A roupa é recolorida em código para a cor de cada uma das 10 personagens (a pele mantém-se),
  e algumas usam os nossos acessórios (orelhas, coroa, folha…) em vez do chapéu do modelo.
- Mapeamento personagem → modelo base: `apps/web/src/host/three/characterAssets.ts` (`LOOKS`).
- Cenários: só copiámos os modelos usados (174, ~6 MB). Carregam-se por tema em `apps/web/src/host/three/props.ts`
  (`THEME_PROPS`), assentam no chão e ganham a altura pedida; se algum faltar, o cenário usa a versão feita em código.

## Para acrescentar um recurso

1. Confirmar a licença (CC0 ou equivalente) e guardar o ficheiro de licença junto do recurso.
2. Pôr os ficheiros em `apps/web/public/...`.
3. Acrescentar uma linha à tabela acima.
