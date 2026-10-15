# FellowMage

Cliente web moderno para servidores [XMage](https://github.com/magefree/mage), com interface inspirada no
[Phase.rs](https://github.com/phase-rs/phase) (React + Tailwind + Framer Motion).

O motor de regras continua sendo o do XMage (dezenas de milhares de cartas implementadas). O FellowMage
troca só a interface.

## Arquitetura

```
Navegador (web/: React + TS + Tailwind + Framer Motion + Zustand)
   ⇅  WebSocket / JSON   (porta 5173 → proxy /ws → 8090)
Gateway (gateway/: Java 17+, um cliente XMage "headless" por conexão)
   ⇅  jboss-remoting / serialização Java (protocolo original do XMage)
Servidor XMage (mage-src/Mage.Server, sem modificações, porta 17171)
```

- `gateway/` — `ClientBridge` traduz comandos JSON em chamadas de `mage.remote.Session` e callbacks do
  servidor em JSON; `ViewMapper` converte `GameView`/`CardView`/... em JSON enxuto; `DeckLibrary` lê `.dck`.
- `web/` — mesa de jogo (`src/game/`), telas de conexão e lobby (`src/screens/`), estado em `src/store.ts`.
- `mage-src/` — clone do repositório oficial (não versionado aqui).
- `Xmage/` — instalação original (usada só pelos decks de exemplo).

Imagens das cartas: [Scryfall](https://scryfall.com) (set + número; fallback por nome).

## Como rodar (Windows / PowerShell)

Pré-requisitos já instalados: JDK 21 (Temurin, 64 bits), Maven 3.9 (`C:\tools`), Git, Node 24.

1. Compilar o XMage uma vez (≈10 min): `cd mage-src; mvn install -DskipTests`
2. Servidor XMage: `scripts\start-server.ps1` (espera "Started MAGE server")
3. Gateway: `scripts\start-gateway.ps1`
4. Cliente web: `cd web; npm run dev` → http://localhost:5173

O XMage precisa de `--add-opens=java.base/java.io=ALL-UNNAMED` no Java 17+ — os scripts já configuram isso
via `MAVEN_OPTS` (`scripts\dev-env.ps1`).

## Estado atual (protótipo)

Foco: **Commander com até 4 jogadores** (1 humano + até 3 IAs; "Freeform Commander" do XMage para aceitar
todos os decks de exemplo). Duelo 1×1 continua disponível.

Funciona: conectar, escolher formato/decks/nº de oponentes, mulligan, jogar terrenos e mágicas, passar
prioridade (inclusive atalhos), alvos, pilha, histórico, diálogos de escolha/quantidade/montes/habilidades,
cemitério/exílio, reserva de mana, fim de jogo; zona de comando (comandante clicável + imposto), dano de
comandante recebido, ordem de turno; trilha com todos os passos do turno e paradas de prioridade
configuráveis por passo (seu turno / turno dos oponentes), salvas no servidor.

Notas do protocolo XMage descobertas no caminho:
- a ordem de turno é a **inversa** da lista `GameView.getPlayers()` (`CircularList.add` insere no início);
- imposto e dano de comandante só existem como texto nas regras da carta (`CommanderInfoWatcher`);
- o cliente precisa chamar `Session.ping()` a cada ~20 s, senão o servidor derruba o usuário.

Ainda não: editor de decks, multiplayer humano/lobby de mesas, draft/torneios, setas de alvo, arrastar cartas,
sons, configurações.
