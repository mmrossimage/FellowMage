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

## Como rodar (Windows)

**Dia a dia:** dê dois cliques em **`Iniciar FellowMage.cmd`**. Ele sobe o servidor XMage, o gateway e o
cliente web (cada um numa janela minimizada) e abre http://localhost:5173 no navegador. Leva ~1 minuto.
Para desligar tudo: **`Parar FellowMage.cmd`**.

Partes, se quiser subir separadamente (`scripts\`):

| Parte | Script | Porta |
|---|---|---|
| Servidor XMage (de `mage-src`) | `start-server.ps1` | 17171 |
| Gateway WebSocket | `start-gateway.ps1` | 8090 |
| Cliente web (Vite) | `start-web.ps1` | 5173 |

**Primeira vez numa máquina nova:** instalar JDK 21 64 bits (Temurin), Maven 3.9, Git e Node 20+;
clonar o XMage em `mage-src` e compilar uma vez (≈10 min): `cd mage-src; mvn install -DskipTests`.
A primeira subida do servidor também demora mais (cria o banco de cartas).

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
- o cliente precisa chamar `Session.ping()` a cada ~20 s, senão o servidor derruba o usuário;
- mesas abandonadas continuam rodando com as IAs e ocupam o limite `maxAiOpponents` (15): o gateway remove a
  mesa ao sair/desconectar;
- quem abandona muitas partidas é barrado com "incompatible quit ratio": o gateway cria mesas com
  `quitRatio = 100`;
- duas conexões simultâneas do mesmo usuário fazem o servidor derrubar uma delas.

Reconexão: se o navegador cair ou a página for recarregada, o gateway mantém a sessão XMage por 2 min; o cliente
reconecta sozinho e recebe de volta a mesa, o pedido pendente e o histórico.

Editor de decks: busca no catálogo de cartas implementadas no XMage (lido do banco do servidor, só leitura),
filtros de Commander, validação (100 cartas, singleton, identidade de cor), troca de arte, importar/exportar
listas (Moxfield, Archidekt, Arena/MTGO, .dck). Os decks ficam em `decks/` no formato `.dck` do XMage.

Ainda não: multiplayer humano/lobby de mesas, draft/torneios, sons, configurações.
