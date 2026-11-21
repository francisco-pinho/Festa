# Graph Report - Festa  (2026-11-20)

## Corpus Check
- 317 files · ~235,923 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3830 file(s) not represented in the graph (top: .bin 1889, .gltf 1889, .glb 43)
- WARNING: 3830 of 4147 files seen (92%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 2435 nodes · 7529 edges · 109 communities (68 shown, 41 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 575 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Música e Efeitos Sonoros
- Regras da Festa (party/board)
- Basebol
- Golfe
- Minijogos Diversos e Veículos
- Registo de Desportos
- Fluxo da Festa (PartyFlow)
- Animações do Tabuleiro
- Director e Menus do Host
- Narrador
- Hub de Jogadores e Ligação
- Boxe
- Ferramentas de Build/Online
- Ténis
- Config App Desktop
- Configs TypeScript
- Extras do Tabuleiro
- Temas do Tabuleiro
- Salas do Servidor
- Socket Server e Protocolo
- Comando do Telemóvel
- Showcase e Créditos
- Dependências do Servidor
- Dependências Web/Vite
- Personagens e Cenário
- Vistas do Comando
- Director e Seats
- Joystick e Movimento
- Visualizador WebRTC
- Chuva de Moedas e Explosões
- Construção do Tabuleiro
- Sala de Estar (Lobby)
- Package Raiz
- Retrato do Narrador e Maestro
- Martelo e Parede
- Objetos de Minijogos
- Temas Realistas
- Palco de Bowling
- Base de Arena
- Motor e Resultados
- Base de Duelo
- Ícones
- Ecrã CRT
- Contar Ovelhas
- Física da Pista
- Cabo de Guerra
- Objetos do Tabuleiro
- Corrida Chuva de Moedas
- Base de Remo
- Constantes de Bowling
- Registos de Salas
- Motor de Som
- Menus de Ecrã
- IA dos Bots em Arena
- BotPad e Seats
- Pinball e Batata Quente
- Vólei de Praia
- Vitrais
- Menu do Jogo
- Testes de Socket
- Controlo de Lugar
- Props e Assets
- Cartas de Memória
- Placar de Bowling
- Dados
- Package Shared
- Bomber
- Bombas na Passadeira
- Olhar para o Lado
- Sensores do Telemóvel
- Chão de Cores
- Corrida no Gelo
- Futebol de Carapaças
- Bolas de Neve
- Física Rapier
- Package Game
- URL de Entrada (QR)
- Pesca
- Atirador
- Meteoros
- Partilha de Ecrã
- Docs: Online e Gestos
- Balões
- Canoa
- Ladrilhos que Caem
- Sessão de Fotos
- Força Certa
- Retratos
- Detalhe do Chão
- Docs: Assets e Licenças
- Bobsled
- Saltar à Corda
- Texturas das Cartas
- Sumo
- Docs: Catálogo de Jogos
- Docs: Túnel e Alojamento
- Docs: Páginas e Autoridade
- Docs: Director e Regras
- Docs: Plano e Tabuleiros
- Portagens
- Ideias do Lobby
- Compra de Estrela
- BoardExtras
- Jingles Kenney
- Ficheiro de Ideias
- TV CRT (asset)
- Idle no Lobby
- Nome Escolhido

## God Nodes (most connected - your core abstractions)
1. `mesh()` - 170 edges
2. `toon()` - 149 edges
3. `toonUnique()` - 119 edges
4. `disposeObject()` - 94 edges
5. `textSprite()` - 92 edges
6. `MinigameContext` - 80 edges
7. `CharacterModel` - 79 edges
8. `BoardStage` - 70 edges
9. `three` - 69 edges
10. `MinigameScore` - 69 edges

## Surprising Connections (you probably didn't know these)
- `npm run online (túnel rápido Cloudflare)` --references--> `cloudflared (Apache 2.0, bundled)`  [INFERRED]
  docs/ONLINE.md → apps/desktop/resources/bin/CLOUDFLARED-LICENCA.txt
- `PlayerRecord` --references--> `ControllerLayout`  [EXTRACTED]
  apps/server/src/rooms.ts → packages/shared/src/protocol.ts
- `PlayerRecord` --references--> `PlayerId`  [EXTRACTED]
  apps/server/src/rooms.ts → packages/shared/src/protocol.ts
- `Room` --references--> `PlayerId`  [EXTRACTED]
  apps/server/src/rooms.ts → packages/shared/src/protocol.ts
- `HostEvents` --references--> `ControllerInput`  [EXTRACTED]
  apps/web/src/host/HostConnection.ts → packages/shared/src/protocol.ts

## Import Cycles
- 2-file cycle: `apps/web/src/host/stages/boardExtras.ts -> apps/web/src/host/stages/boardThemes.ts -> apps/web/src/host/stages/boardExtras.ts`

## Hyperedges (group relationships)
- **Três clientes web (host, comando, espectador) ligados ao servidor** — apps_web_index_host_page, apps_web_play_controller_page, apps_web_ver_viewer_page, docs_arquitetura_host_authority [INFERRED 0.85]
- **Stack de jogo online (túnel, WebRTC, compensação de atraso, Fly.io)** — docs_online_cloudflare_tunnel, docs_online_webrtc_screen_share, docs_online_latency_compensation, docs_online_fly_io [EXTRACTED 1.00]
- **Recursos externos com licença livre** — docs_assets_kaykit_packs, docs_assets_kenney_pirate_kit, apps_web_public_jingles_licenca_kenney_music_jingles, docs_creditos_kevin_macleod, docs_assets_crt_tv [INFERRED 0.85]

## Communities (109 total, 41 thin omitted)

### Community 0 - "Música e Efeitos Sonoros"
Cohesion: 0.07
Nodes (76): BOARD_MUSIC, JINGLES, MINIGAME_MUSIC, Sfx, Song, SONGS, sound, Track (+68 more)

### Community 1 - "Regras da Festa (party/board)"
Cohesion: 0.05
Nodes (88): PartyDeps, PATH_COLORS, RollPlan, rankWinners(), botSwing(), SPACE_STYLE, cannonAt(), distancesTo() (+80 more)

### Community 2 - "Basebol"
Cohesion: 0.06
Nodes (46): HostLayout, Seat, BaseballStage, COVER, HUMAN_ORDER, PITCH_IDS, POSITIONS, RELEASE (+38 more)

### Community 3 - "Golfe"
Cohesion: 0.07
Nodes (39): ARROWS, GolferState, GolfStage, LIE_NAME, GolfMiniMap, MiniMapState, P, Golf (+31 more)

### Community 4 - "Minijogos Diversos e Veículos"
Cohesion: 0.07
Nodes (21): R(), ropeTexture(), Arrow, barrel(), fallbackTree(), makeArrow(), Marksman, banana() (+13 more)

### Community 5 - "Registo de Desportos"
Cohesion: 0.07
Nodes (38): drawIcon(), Bowling, Spark, Boxing, Stats, Tennis, Phase, TEAM_COLORS (+30 more)

### Community 6 - "Fluxo da Festa (PartyFlow)"
Cohesion: 0.12
Nodes (12): PartyFlow, loadProps(), esc(), createBoard(), leverAt(), ItemId, clearSlowDice(), MinigameMode (+4 more)

### Community 8 - "Director e Menus do Host"
Cohesion: 0.06
Nodes (35): narrator, BOARD_ICON, LobbyChoice, BOT_LEVELS, BotLevel, DEFAULTS, GRAPHICS_LEVELS, Settings (+27 more)

### Community 9 - "Narrador"
Cohesion: 0.07
Nodes (10): NarratorEngine, typeLine(), wait(), NarratorPortrait, Duelist, MaestroRun, Shooter, QuickDrawRun (+2 more)

### Community 10 - "Hub de Jogadores e Ligação"
Cohesion: 0.08
Nodes (14): Emitter, ConnectionStatus, HostConnection, HostEvents, loadSaved(), emptyButtons(), HubPlayer, InputSource (+6 more)

### Community 11 - "Boxe"
Cohesion: 0.08
Nodes (20): ActivePunch, BoxingStage, esc(), Fighter, BOXING, boxingRanking(), FighterRecord, getUpCount() (+12 more)

### Community 12 - "Ferramentas de Build/Online"
Cohesion: 0.07
Nodes (20): candidates, common, dest, found, here, FestaServerHandle, StartOptions, startServer() (+12 more)

### Community 13 - "Ténis"
Cohesion: 0.10
Nodes (20): Player, Sample, TennisStage, BallState, bounceBall(), CALL, firstBounce(), inServiceBox() (+12 more)

### Community 14 - "Config App Desktop"
Cohesion: 0.05
Nodes (38): author, build, appId, directories, electronVersion, extraResources, files, npmRebuild (+30 more)

### Community 15 - "Configs TypeScript"
Cohesion: 0.05
Nodes (31): compilerOptions, types, extends, include, compilerOptions, types, extends, include (+23 more)

### Community 16 - "Extras do Tabuleiro"
Cohesion: 0.17
Nodes (28): swayBunting(), addBoardExtras(), birds(), blobShape(), bumpy(), castle(), city(), edging() (+20 more)

### Community 17 - "Temas do Tabuleiro"
Cohesion: 0.16
Nodes (28): stoneTexture(), volcanicGround(), addPathStrips(), CASTLE_STALL, CASTLE_TOWER, castleHall(), CastleTheme, deco() (+20 more)

### Community 18 - "Salas do Servidor"
Cohesion: 0.14
Nodes (6): Room, RoomManager, sanitizeName(), registerSocketHandlers(), createRoom(), CloseReason

### Community 19 - "Socket Server e Protocolo"
Cohesion: 0.09
Nodes (30): RoomManagerOptions, createRateLimiter(), FestaSocket, SocketServerOptions, Ack, AckResult, HostResumeRequest, HostSendRequest (+22 more)

### Community 20 - "Comando do Telemóvel"
Cohesion: 0.12
Nodes (27): clearSession(), CLOSE_REASONS, ERRORS, escapeHtml(), goLandscape(), join(), keepAwake(), maybeOfferSensors() (+19 more)

### Community 21 - "Showcase e Créditos"
Cohesion: 0.11
Nodes (7): Clouds, LivingRoom, ShowcaseStage, creditsHtml(), creditsLines(), esc(), MUSIC_CREDITS

### Community 22 - "Dependências do Servidor"
Cohesion: 0.09
Nodes (29): dependencies, express@^5.3.0, selfsigned@^5.5.0, socket.io@^4.8.4, devDependencies, cross-env@^10.1.0, socket.io-client@^4.8.4, tsx@^4.23.15 (+21 more)

### Community 23 - "Dependências Web/Vite"
Cohesion: 0.09
Nodes (27): dependencies, @dimforge/rapier3d-compat@^0.21.0, @festa/game@^0.1.0, qrcode@^1.5.4, socket.io-client@^4.8.4, three@^0.187.0, devDependencies, @types/qrcode@^1.5.6 (+19 more)

### Community 24 - "Personagens e Cenário"
Cohesion: 0.12
Nodes (11): look(), noItems(), themeGround(), Fielder, Runner, Neighbor, setupSky(), getCharacterTexture() (+3 more)

### Community 25 - "Vistas do Comando"
Cohesion: 0.14
Nodes (25): iconFor(), iconPaths(), boardKey(), BoardLayout, esc(), playersHtml(), renderActions(), renderBoard() (+17 more)

### Community 26 - "Director e Seats"
Cohesion: 0.14
Nodes (5): Director, main, SportDef, Hud, seatCount()

### Community 27 - "Joystick e Movimento"
Cohesion: 0.14
Nodes (18): capture(), createJoystick(), JoystickOptions, clamp(), GestureTracker, swipeToSwing(), touchPunch(), clamp() (+10 more)

### Community 28 - "Visualizador WebRTC"
Cohesion: 0.13
Nodes (14): getIceServers(), ScreenViewer, ViewerStatus, connectSocket(), FestaSocket, setWatching(), ShareEvents, start() (+6 more)

### Community 29 - "Chuva de Moedas e Explosões"
Cohesion: 0.10
Nodes (21): CoinShower, Falling, Blast, Layout, LAYOUTS, Mine, Patch, Pillar (+13 more)

### Community 30 - "Construção do Tabuleiro"
Cohesion: 0.23
Nodes (22): Barrier, addRing(), bezier(), BoardBuilder, BoardMechanic, Cannon, circle(), createCastleBoard() (+14 more)

### Community 31 - "Sala de Estar (Lobby)"
Cohesion: 0.16
Nodes (25): againstWall(), bricks(), buildDrawnWalls(), buildLivingRoom(), buildSofa(), fabric(), fitSeat(), flowersPainting() (+17 more)

### Community 32 - "Package Raiz"
Cohesion: 0.08
Nodes (26): description, devDependencies, concurrently@^10.0.7, cross-env@^10.1.0, typescript@^7.0.2, engines, node, cross-env (+18 more)

### Community 33 - "Retrato do Narrador e Maestro"
Cohesion: 0.10
Nodes (22): ARROW, COLOR, Dir, DIRS, Maestro, Player, bananaSplat(), QuickDraw (+14 more)

### Community 34 - "Martelo e Parede"
Cohesion: 0.14
Nodes (4): Actor, HammerRun, HotPotatoRun, WallHoleRun

### Community 35 - "Objetos de Minijogos"
Cohesion: 0.11
Nodes (15): BalloonObj, Sled, Boat, Lane, Angler, ARROW_COLOR, ARROW_ROT, arrowMesh() (+7 more)

### Community 36 - "Temas Realistas"
Cohesion: 0.12
Nodes (14): BoardTheme, CityTheme, createBoardTheme(), IslandTheme, ParkTheme, VolcanoTheme, addGrassField(), distToSegment() (+6 more)

### Community 37 - "Palco de Bowling"
Cohesion: 0.17
Nodes (5): BowlingStage, makePin(), RecordedFrame, pinSpots(), Pose

### Community 39 - "Motor e Resultados"
Cohesion: 0.15
Nodes (4): GraphicsLevel, ResultsStage, Engine, Tweens

### Community 41 - "Ícones"
Cohesion: 0.11
Nodes (16): ARROW, DECORATIVE_EMOJI, EMOJI, EMOJI_RE, ICONS, iconSvg(), installIconSwap(), KEYS (+8 more)

### Community 42 - "Ecrã CRT"
Cohesion: 0.16
Nodes (10): removeDecorativeEmojis(), clamp01(), CrtScreen, easeOut(), fitText(), lerp(), Phase, roundRect() (+2 more)

### Community 43 - "Contar Ovelhas"
Cohesion: 0.13
Nodes (8): CountSheepRun, makeSheep(), Kind, KIND_NAME, makeSubject(), PhotoShoot, Subject, disposeObject()

### Community 44 - "Física da Pista"
Cohesion: 0.17
Nodes (3): LanePhysics, rankBy(), run()

### Community 46 - "Objetos do Tabuleiro"
Cohesion: 0.22
Nodes (7): Seg3, BoardObjects, distToSegment(), frame(), stripes(), getSpace(), Space

### Community 49 - "Constantes de Bowling"
Cohesion: 0.14
Nodes (15): BALL_R, DECK_END, GUTTER, LANE_HALF, LANE_LEN, OIL_END, PIN_DENSITY, PIN_HEIGHT (+7 more)

### Community 50 - "Registos de Salas"
Cohesion: 0.16
Nodes (13): Fail, PlayerRecord, RoomHooks, SocketBinding, Timer, setup(), CONTROLLER_PATH, MAX_PLAYERS (+5 more)

### Community 51 - "Motor de Som"
Cohesion: 0.24
Nodes (3): asset(), NOTE(), SoundEngine

### Community 54 - "BotPad e Seats"
Cohesion: 0.19
Nodes (11): BotPad, ChoicesLayout, DecideOptions, DiceLayout, GamepadLayout, IDLE_PAD, PadInput, HubEvents (+3 more)

### Community 57 - "Vitrais"
Cohesion: 0.20
Nodes (15): archPath(), archShape(), finish(), GlassArt, GROUNDS, lancetArt(), lancetWindow(), ROBES (+7 more)

### Community 59 - "Testes de Socket"
Cohesion: 0.16
Nodes (9): FestaServer, Client, client(), clients, hostWithRoom(), ACK_TIMEOUT_MS, url(), ClientToServerEvents (+1 more)

### Community 61 - "Props e Assets"
Cohesion: 0.13
Nodes (11): assets, BOARD_COMMON, F, GLB_PACKS, loader, loading, MINIGAME_PROPS, PropAsset (+3 more)

### Community 63 - "Placar de Bowling"
Cohesion: 0.33
Nodes (7): BowlingFrame, isFrameDone(), PINS, rollSymbols(), runningTotal(), scoreFrames(), shouldResetPins()

### Community 65 - "Package Shared"
Cohesion: 0.18
Nodes (11): dependencies, zod@^4.6.7, exports, ./schemas, name, private, scripts, typecheck (+3 more)

### Community 71 - "Corrida no Gelo"
Cohesion: 0.24
Nodes (3): ellipse(), IceRaceRun, trackAngle()

### Community 74 - "Física Rapier"
Cohesion: 0.24
Nodes (4): loadRapier(), Physics, Rapier, @dimforge/rapier3d-compat

### Community 75 - "Package Game"
Cohesion: 0.20
Nodes (9): exports, ./sports/*, name, private, scripts, test, typecheck, type (+1 more)

### Community 76 - "URL de Entrada (QR)"
Cohesion: 0.42
Nodes (7): cycleLanAddress(), getJoinBaseUrl(), getJoinUrl(), getServerInfo(), isLocalhost(), isOnline(), ServerInfo

### Community 81 - "Docs: Online e Gestos"
Cohesion: 0.22
Nodes (8): ver.html (ver o ecrã à distância), Espectadores online por snapshots host:state (proposto), SportDef/SportStage, descoberta por import.meta.glob, Gesto swing {power, dir, spin, hand}, Compensação de atraso (ping/pong, ténis e basebol), Partilha de ecrã WebRTC (/ver, STUN/TURN Cloudflare), Sensores de movimento fiáveis e calibração (3.4), Modo Desportos (bowling, ténis, golfe, boxe, basebol)

### Community 87 - "Retratos"
Cohesion: 0.29
Nodes (5): cache, camera, portrait(), portraitSmall(), small

### Community 88 - "Detalhe do Chão"
Cohesion: 0.57
Nodes (7): canvas(), detailGround(), grassTexture(), kindOf(), rand(), sandTexture(), skyTexture()

### Community 89 - "Docs: Assets e Licenças"
Cohesion: 0.29
Nodes (7): CharacterModel (API estável setAnim/faceTowards/root), Packs KayKit (Kay Lousberg, CC0), Kenney Pirate Kit 2.1 (CC0), THEME_PROPS / LOOKS / ANIMS (uso dos modelos), Música Kevin MacLeod (CC BY 4.0), Personagens glTF com esqueleto (3.1), Sons gerados com Web Audio (host/audio/Sound.ts)

### Community 92 - "Texturas das Cartas"
Cohesion: 0.33
Nodes (5): backTexture(), Card, CARDS, faceTexture(), MemoryCards

### Community 94 - "Docs: Catálogo de Jogos"
Cohesion: 0.29
Nodes (7): ArenaMinigame + MinigameDef (como adicionar minijogo), Catálogo de jogos para imitar (Mario Party, Wii Sports, Buzz!), Recomendação por levas (minijogos, quiz, desportos novos), Modo Quiz estilo Buzz! (8 rondas), Lista de 31 minijogos com ids, Lista de minijogos Mario Party para adaptar (lotes 0–4), Ferramentas dev (?sport=, ?minigame=, tecla T, window.festa)

### Community 95 - "Docs: Túnel e Alojamento"
Cohesion: 0.40
Nodes (5): cloudflared (Apache 2.0, bundled), npm run online (túnel rápido Cloudflare), Alojamento Fly.io (Dockerfile + fly.toml), App de computador Festa.exe (Electron), Modos de ligação (LAN, Online/misto, Alojado)

### Community 96 - "Docs: Páginas e Autoridade"
Cohesion: 0.47
Nodes (5): index.html (ecrã principal host), play.html (comando do telemóvel), ControllerLayout (wait, gamepad, choices, dice, motion), Protocolo zod (packages/shared, schemas.ts / protocol.ts), Festa (3D party game, phones as controllers)

### Community 98 - "Docs: Director e Regras"
Cohesion: 0.33
Nodes (6): Director (realizador async da festa), Regras puras (packages/game: board, party, characters, rng, RULES), Reconexão com sessionToken/hostToken e bots substitutos, Seats (telemóvel, teclado, bot; decide()), Regras da festa (dados, casas, estrela, minijogo por cores), Correção do bloqueio dos botões após inatividade

### Community 99 - "Docs: Plano e Tabuleiros"
Cohesion: 0.33
Nodes (6): Android 17: permissão Dispositivos próximos (ERR_TOO_MANY_RETRIES), Itens, lojas e duelos na casa ocupada, 5 tabuleiros com mecânicas próprias (Ilha, Cidade Néon, Vulcão, Castelo, Parque), Narrador «Zé Microfone», Plano de melhorias (fases 0–11), Motor de física Rapier (3.2)

### Community 101 - "Ideias do Lobby"
Cohesion: 0.40
Nodes (5): Botões do lobby (A, B, X, Y, +, −, engrenagem), Definições individuais no telemóvel (⚙️), Mudar VIP no telemóvel, QR num quadro de madeira no lobby, Comando estilo Switch (layout pad, ScreenMenus) — Fase 8

### Community 102 - "Compra de Estrela"
Cohesion: 0.83
Nodes (3): botWantsStar(), buyStar(), canBuyStar()

## Ambiguous Edges - Review These
- `Música Kevin MacLeod (CC BY 4.0)` → `Sons gerados com Web Audio (host/audio/Sound.ts)`  [AMBIGUOUS]
  docs/CREDITOS.md · relation: conceptually_related_to

## Knowledge Gaps
- **23 isolated node(s):** `App de computador Festa.exe (Electron)`, `Ferramentas dev (?sport=, ?minigame=, tecla T, window.festa)`, `ver.html (ver o ecrã à distância)`, `Kenney Music Jingles (CC0)`, `Espectadores online por snapshots host:state (proposto)` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 549 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mesh()` connect `Minijogos Diversos e Veículos` to `Música e Efeitos Sonoros`, `Basebol`, `Golfe`, `Registo de Desportos`, `Animações do Tabuleiro`, `Extras do Tabuleiro`, `Temas do Tabuleiro`, `Showcase e Créditos`, `Personagens e Cenário`, `Chuva de Moedas e Explosões`, `Sala de Estar (Lobby)`, `Retrato do Narrador e Maestro`, `Martelo e Parede`, `Objetos de Minijogos`, `Temas Realistas`, `Palco de Bowling`, `Contar Ovelhas`, `Objetos do Tabuleiro`, `Corrida Chuva de Moedas`, `Vitrais`, `Bomber`, `Bombas na Passadeira`, `Olhar para o Lado`, `Futebol de Carapaças`, `Bolas de Neve`, `Texturas das Cartas`, `Cruzamentos do Tabuleiro`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `App de computador Festa.exe (Electron)`, `Ferramentas dev (?sport=, ?minigame=, tecla T, window.festa)`, `ver.html (ver o ecrã à distância)` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Música e Efeitos Sonoros` be split into smaller, more focused modules?**
  _Cohesion score 0.07016649677200136 - nodes in this community are weakly interconnected._
- **Why does `CharacterModel` connect `Personagens e Cenário` to `Música e Efeitos Sonoros`, `Retrato do Narrador e Maestro`, `Martelo e Parede`, `Objetos de Minijogos`, `Minijogos Diversos e Veículos`, `Palco de Bowling`, `Basebol`, `Registo de Desportos`, `Golfe`, `Narrador`, `Animações do Tabuleiro`, `Boxe`, `Motor e Resultados`, `Ténis`, `Showcase e Créditos`, `Retratos`, `Chuva de Moedas e Explosões`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Regras da Festa (party/board)` be split into smaller, more focused modules?**
  _Cohesion score 0.054343434343434346 - nodes in this community are weakly interconnected._
- **Why does `toon()` connect `Minijogos Diversos e Veículos` to `Música e Efeitos Sonoros`, `Basebol`, `Golfe`, `Registo de Desportos`, `Animações do Tabuleiro`, `Extras do Tabuleiro`, `Temas do Tabuleiro`, `Showcase e Créditos`, `Personagens e Cenário`, `Chuva de Moedas e Explosões`, `Sala de Estar (Lobby)`, `Retrato do Narrador e Maestro`, `Objetos de Minijogos`, `Palco de Bowling`, `Contar Ovelhas`, `Objetos do Tabuleiro`, `Corrida Chuva de Moedas`, `Vitrais`, `Bomber`, `Bombas na Passadeira`, `Olhar para o Lado`, `Texturas das Cartas`, `Cruzamentos do Tabuleiro`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Música Kevin MacLeod (CC BY 4.0)` and `Sons gerados com Web Audio (host/audio/Sound.ts)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._