# Recursos externos (modelos, texturas, sons)

Só usamos recursos com licença que permita uso comercial e redistribuição no repositório
(de preferência **CC0**). Cada recurso fica registado aqui com a origem exata.

| Recurso | Ficheiros no projeto | Autor | Origem | Licença | Data |
|---|---|---|---|---|---|
| KayKit Character Pack: Adventurers 1.0 — 5 personagens com esqueleto e 76 animações (Barbarian, Knight, Mage, Rogue, Rogue_Hooded) | `apps/web/public/models/kaykit/*.glb` + `LICENSE.txt` | Kay Lousberg (kaylousberg.com) | [GitHub oficial](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) — pasta `addons/kaykit_character_pack_adventures/Characters/gltf` | CC0 1.0 (ficheiro `LICENSE.txt` incluído) | 2026-11-11 |

## Como os usamos

- As armas, escudos e livros dos modelos ficam escondidos; as mãos ficam livres para os objetos do jogo.
- A roupa é recolorida em código para a cor de cada uma das 10 personagens (a pele mantém-se),
  e algumas usam os nossos acessórios (orelhas, coroa, folha…) em vez do chapéu do modelo.
- Mapeamento personagem → modelo base: `apps/web/src/host/three/characterAssets.ts` (`LOOKS`).

## Para acrescentar um recurso

1. Confirmar a licença (CC0 ou equivalente) e guardar o ficheiro de licença junto do recurso.
2. Pôr os ficheiros em `apps/web/public/...`.
3. Acrescentar uma linha à tabela acima.
