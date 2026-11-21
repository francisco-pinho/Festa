# Mapas no Blender

Os tabuleiros podem ser desenhados no **Blender** (gratuito, blender.org): terreno, montanhas,
rochas, árvores, edifícios e o sítio de cada casa. O jogo carrega o cenário tal como está no
Blender e lê de lá as casas. As regras (lojas, maré, portões, túneis, alavancas…) vêm junto.

## Como funciona

```
npm run mapa -- exportar ilha     →  blender/ilha-casas.glb   (as casas do mapa atual, para começar)
          (montas o cenário no Blender e exportas para blender/ilha.glb)
npm run mapa -- importar ilha     →  o jogo passa a usar o mapa do Blender
```

Depois de `importar`, o mapa do Blender substitui o desenho feito em código. Para voltar atrás,
apaga a linha da ilha em `packages/game/src/maps/index.ts`.

## 1. Começar

1. Instala o Blender 4.x.
2. No terminal: `npm run mapa -- exportar ilha`
3. No Blender: **File → New → General**, apaga o cubo, a câmara e a luz.
4. **File → Import → glTF 2.0** e escolhe `blender/ilha-casas.glb`.
5. Guarda o ficheiro de trabalho como `blender/ilha.blend` (é aqui que vais trabalhando).

Aparecem pontos (empties) com o nome `casa_0`, `casa_1`… e um ponto `mapa`. Cada casa tem
propriedades em **Object Properties → Custom Properties**:

| Propriedade | O que é | Exemplo |
|---|---|---|
| `tipo` | tipo da casa (vazio = o jogo escolhe ao calhas) | `blue`, `red`, `lucky`, `unlucky`, `event`, `shop`, `item`, `vs`, `villain`, `bank`, `cannon`, `lever`, `start` |
| `seguinte` | casas para onde se pode andar a seguir (mais do que uma = cruzamento) | `casa_4, casa_17` |
| `zona` | zona do mapa (eventos e efeitos) | `beach`, `jungle`, `bridge` |
| `estrela` | 1 = a estrela pode aparecer aqui | `1` |
| `loja` | id da loja nesta casa | `praia` |

O ponto `mapa` tem a propriedade `regras`, com o resto (lojas, portões, túneis, alavancas,
canhões, maré). Normalmente não é preciso mexer; se mexeres, as casas são indicadas pelo nome.

## 2. Montar o cenário

- **Eixos:** no Blender o «para cima» é Z. O jogo olha para o mapa vindo de **−Y** do Blender
  (a câmara fica desse lado), por isso o que estiver desse lado fica à frente.
- **Escala:** 1 unidade = 1 metro. As casas estão a cerca de 3,5 m umas das outras.
- **Terreno:** cria um plano grande, subdivide-o e esculpe (modo **Sculpt**) a montanha, as
  ilhotas e as praias. Pinta com materiais simples (Principled BSDF, cor base). Texturas de imagem
  também funcionam.
- **Mar:** o jogo já põe o mar à altura −0,6 m. Deixa o terreno da ilha acima disso.
- **Modelos prontos:** podes importar os dos packs que o jogo já usa
  (`apps/web/public/models/…/*.glb`) e espalhá-los à vontade.
- **Mexer nas casas:** arrasta os pontos `casa_…` para onde quiseres, incluindo para cima da
  montanha (a altura conta). Cada ponto tem de ficar à superfície do terreno.
- **Casas novas:** duplica um ponto (Shift+D) e muda-lhe o nome para um novo (`casa_200`), e
  acerta o `seguinte` dele e da casa que vem antes. Casas a menos de 2,4 m umas das outras
  ficam sobrepostas no jogo.
- **Não mudes os nomes** das casas existentes: as regras apontam para elas pelo nome.

## 3. Exportar do Blender

**File → Export → glTF 2.0**, com:
- **Format:** glTF Binary (`.glb`)
- **Include:** ✅ Custom Properties (sem isto as casas perdem as propriedades)
- **Transform:** ✅ +Y Up
- **Mesh:** ✅ Apply Modifiers
- Guarda como `blender/ilha.glb`.

## 4. Pôr no jogo

```
npm run mapa -- importar ilha
```

Isto cria `packages/game/src/maps/ilha.ts` (as casas) e copia o cenário para
`apps/web/public/maps/ilha.glb`. Abre o jogo (`npm run dev`) e escolhe a ilha: o cenário é o
do Blender. Se faltar alguma casa referida no `seguinte` ou nas regras, o importar não
estraga nada: o jogo mostra o erro com o nome da casa em falta.

## Limites desta primeira versão

- Do cenário em código só ficam o céu, a luz, o mar e as nuvens. As animações próprias de cada
  mapa (a ponte a aparecer com a maré, as portas da gruta) ainda não existem nos mapas do
  Blender: as regras funcionam, mas sem esse efeito visual.
- Ficheiros `.glb` muito pesados (milhões de triângulos, texturas 4K) deixam o jogo lento:
  usa **Decimate** e texturas até 2K.
