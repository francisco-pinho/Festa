# Jogar fora de casa (online e misto)

O PC continua a ser o ecrã do jogo e a autoridade do jogo. Para quem está fora é preciso:
1. que o **telemóvel** chegue ao servidor, e
2. que a pessoa **veja o ecrã** do jogo.

## 1. `npm run online` (recomendado, grátis)

```bash
npm run online
```

- Compila o jogo, arranca o servidor numa só porta (3000) e abre um **túnel rápido da Cloudflare**
  (`https://…trycloudflare.com`, sem conta).
- O QR do lobby passa a usar o link público: serve **para quem está em casa e para quem está fora**
  (e com HTTPS verdadeiro: sem avisos de certificado e com os sensores de movimento a funcionar).
- O link muda de cada vez que se corre o comando.
- Opções: `--sem-build` (já compilado), `--sem-browser` (não abre o browser).

É preciso ter o `cloudflared` instalado (uma vez; o jogo não descarrega programas sozinho):

| Sistema | Instalação |
|---|---|
| Windows | `winget install --id Cloudflare.cloudflared` |
| macOS | `brew install cloudflared` |
| Linux | [página oficial de downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |

Sem ele, o comando arranca só para a rede de casa e explica como instalar.

## 2. Ver o ecrã à distância

- No PC, carrega **V** (em qualquer altura) e escolhe **este separador** na janela do browser.
  Em baixo à esquerda aparece «📺 A partilhar o ecrã · N a ver». V outra vez para parar.
- Quem está fora abre **`<link>/ver`** no PC ou na TV e escreve o código da sala
  (ou toca em **📺** no comando para ver o ecrã por trás dos botões, só com o telemóvel).
- O vídeo vai por **WebRTC** diretamente do PC para cada espectador (até 8 por sala); o servidor só
  passa a sinalização.
- **STUN** da Cloudflare é usado sempre. Em redes difíceis (4G, empresas) a ligação direta pode falhar:
  para isso há **TURN** da Cloudflare (1000 GB/mês grátis). Cria uma chave TURN no painel da Cloudflare
  (Realtime → TURN) e arranca com:

  ```bash
  CLOUDFLARE_TURN_KEY_ID=… CLOUDFLARE_TURN_API_TOKEN=… npm run online
  ```

## 3. Compensação de atraso

Quem joga de fora vê o ecrã ~100–300 ms atrasado e os gestos chegam com atraso de rede.
- O ecrã grande mede a ida-e-volta de cada telemóvel a cada 2 s (`ping`/`pong`).
- Quem vê o vídeo pelo 📺 do comando envia o atraso estimado do vídeo (estatísticas WebRTC).
- Nos desportos de tempo, o gesto é avaliado **no momento em que o jogador o viu**:
  - **Ténis:** a pancada usa a posição da bola de há `atraso` segundos (histórico de 1,5 s); o serviço
    usa o lançamento da bola recuado o mesmo tanto.
  - **Basebol:** o momento do swing é recuado o atraso medido.
- Bowling, golfe e boxe não dependem de reação ao milissegundo e não precisam de compensação.
- Quem vê o vídeo na página `/ver` (não no comando) ainda não reporta o atraso do vídeo: conta só o da rede.

## 4. Alojado no Fly.io (opcional, link fixo)

Para um endereço fixo sempre disponível (~2 $/mês, 256 MB sempre ligado):

```bash
fly launch --no-deploy   # usa o Dockerfile e o fly.toml do projeto (muda o nome da app)
fly deploy
```

Depois, o PC abre `https://<app>.fly.dev` (ecrã do jogo) e os telemóveis usam o QR. Pode também levar as
variáveis do TURN (`fly secrets set CLOUDFLARE_TURN_KEY_ID=… CLOUDFLARE_TURN_API_TOKEN=…`).
Nota: com alojamento, também os jogadores de casa passam pela internet (+20–60 ms).
