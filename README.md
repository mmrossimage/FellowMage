# 🧙 FellowMage — cliente web para XMage

[![Estado: protótipo](https://img.shields.io/badge/estado-prot%C3%B3tipo-orange)](#estado-do-projeto)
[![React 18](https://img.shields.io/badge/React-18.3.1-149eca?logo=react)](web/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178c6?logo=typescript&logoColor=white)](web/package.json)
[![Java](https://img.shields.io/badge/Java-17%2B-ed8b00?logo=openjdk&logoColor=white)](gateway/pom.xml)
[![XMage](https://img.shields.io/badge/motor-XMage-7952b3)](https://github.com/magefree/mage)

## 📋 Sobre

O FellowMage oferece uma interface no navegador para jogar em um servidor [XMage](https://github.com/magefree/mage). O motor de regras, as cartas implementadas e as decisões da partida continuam no XMage. O FellowMage cuida da apresentação, da interação e da comunicação com o servidor por meio de um gateway Java.

### ✨ Funcionalidades

- 🎮 **Partidas** — Commander com um jogador humano e até três IAs, além de duelo 1×1.
- 🃏 **Mesa de jogo** — mão, campo, pilha, alvos, zonas, histórico, reserva de mana e diálogos de decisão.
- ⏱️ **Prioridade** — trilha das fases do turno, atalhos para passar prioridade e paradas configuráveis.
- 👑 **Commander** — zona de comando, imposto, dano de comandante recebido e ordem de turno.
- 🔁 **Reconexão** — o gateway mantém a sessão por até dois minutos após a queda do navegador.
- 📚 **Decks** — editor com busca no catálogo do XMage, validação de Commander, escolha de arte, importação e exportação de listas; os decks do usuário são salvos como `.dck`.

## 🛠️ Tecnologias

- **React 18, TypeScript 5 e Vite 5** — interface web e build do cliente.
- **Tailwind CSS 3 e Framer Motion 11** — estilos e animações.
- **Zustand 4** — estado da conexão, da partida e da navegação.
- **Java 17+ e Maven** — gateway WebSocket/JSON e integração com a sessão XMage. O fluxo de preparação local usa **JDK 21**.
- **XMage** — servidor e motor de regras, mantidos no [repositório oficial](https://github.com/magefree/mage).
- **Scryfall** — imagens e símbolos das cartas.

## 🏗️ Estrutura do projeto

```text
FellowMage/
├── web/                         # Cliente React, TypeScript e Vite
│   └── src/
│       ├── screens/             # Conexão, início, lobby e lista de decks
│       ├── game/                # Mesa, cartas, ações e diálogos da partida
│       ├── deck/                # Editor, busca e regras de Commander
│       ├── store.ts             # WebSocket e estado compartilhado
│       └── types.ts             # Contratos de mensagens e dados da interface
├── gateway/                     # Ponte Java entre o navegador e o XMage
│   └── src/main/java/fellowmage/gateway/
│       ├── GatewayServer.java   # Conexões WebSocket e retomada de sessão
│       ├── ClientBridge.java    # Comandos, callbacks e sessão XMage
│       ├── ViewMapper.java      # Visões XMage convertidas para JSON
│       ├── CardCatalog.java     # Busca no catálogo de cartas do servidor
│       ├── DeckService.java     # Operações do editor de decks
│       └── DeckLibrary.java     # Leitura e gravação de arquivos .dck
├── scripts/                     # Inicialização, parada e empacotamento
├── packaging/app/               # Atalhos e instruções do pacote Windows
├── .claude/agents/              # Agente de diagnóstico com referência no XMage
├── AGENTS.md                    # Orientação do agente para este repositório
├── Preparar FellowMage.cmd     # Baixa e compila o XMage (uma vez por máquina)
├── Iniciar FellowMage.cmd       # Inicia o ambiente de desenvolvimento
└── Parar FellowMage.cmd         # Encerra os processos iniciados
```

`mage-src/` (clone do XMage, criado pela preparação), `Xmage/` (instalação opcional, fonte alternativa dos decks de exemplo) e `decks/` (decks do usuário) são pastas locais ignoradas pelo Git; não fazem parte deste repositório.

<a id="primeiros-passos"></a>

## 🚀 Primeiros passos

### Ambiente de desenvolvimento no Windows

> ⚠️ Este repositório **não inclui o XMage**: o gateway e o servidor local dependem dele compilado na sua máquina. Só clonar e abrir `Iniciar FellowMage.cmd` não basta — faça a preparação abaixo uma vez.

1. Instale **JDK 21 64 bits** ([Adoptium](https://adoptium.net); marque a opção que define `JAVA_HOME`), **[Maven 3.9](https://maven.apache.org/download.cgi)** (descompacte e coloque a pasta `bin` no `PATH`), **[Git](https://git-scm.com)** e **[Node.js 20+](https://nodejs.org)**.
2. Execute `Preparar FellowMage.cmd`. O [script de preparação](scripts/preparar.ps1) confere os programas, baixa o [XMage oficial](https://github.com/magefree/mage) em `mage-src/` na revisão testada com o gateway, compila e instala o XMage no Maven local (`mvn install`, de 10 a 30 minutos na primeira vez) e instala as dependências do cliente web.
3. Execute `Iniciar FellowMage.cmd`. O script inicia o gateway na porta **8090** e o Vite na **5173**; depois abre <http://localhost:5173>. Na tela inicial, escolha **Jogar online** (servidor público, como `beta.xmage.today:17171`) ou **Jogar contra a IA**. Nesse caso, o gateway liga o servidor XMage local na porta **17171** com [`servidor-local.ps1`](scripts/servidor-local.ps1). Se a preparação ainda não foi feita, ele oferece fazê-la.
4. Para encerrar, execute `Parar FellowMage.cmd`.

Os decks de exemplo vêm de `mage-src/Mage.Client/release/sample-decks`; se houver uma instalação do XMage em `Xmage/`, os scripts usam os decks dela.

Na primeira vez em que o servidor local é iniciado, ele pode levar mais tempo para criar o banco de cartas. Os scripts configuram o acesso reflexivo exigido pelo protocolo XMage em Java 17+.

**Execução por componente:** [servidor XMage](scripts/start-server.ps1), [gateway](scripts/start-gateway.ps1) e [cliente web](scripts/start-web.ps1).

### Pacote Windows

O [script de empacotamento](scripts/empacotar.ps1) compila o cliente e o gateway e reúne o servidor XMage, um runtime Java embutido, decks de exemplo e os atalhos de inicialização. Ele depende dos arquivos locais do XMage já preparados. As instruções para quem recebe o pacote estão em [LEIA-ME.txt](packaging/app/LEIA-ME.txt).

<a id="arquitetura"></a>

## 🏛️ Arquitetura

```text
Navegador (React)
    ⇅ WebSocket / JSON — /ws no Vite, encaminhado à porta 8090
Gateway (Java; uma sessão XMage por conexão)
    ⇅ protocolo remoto e serialização Java do XMage
Servidor XMage (local na porta 17171 ou público; regras e estado da partida)
```

O cliente envia comandos por [`store.ts`](web/src/store.ts). O [`GatewayServer`](gateway/src/main/java/fellowmage/gateway/GatewayServer.java) os entrega ao [`ClientBridge`](gateway/src/main/java/fellowmage/gateway/ClientBridge.java), que conversa com o XMage e devolve eventos e visões convertidos pelo [`ViewMapper`](gateway/src/main/java/fellowmage/gateway/ViewMapper.java). O editor de decks usa [`CardCatalog`](gateway/src/main/java/fellowmage/gateway/CardCatalog.java), [`DeckService`](gateway/src/main/java/fellowmage/gateway/DeckService.java) e [`DeckLibrary`](gateway/src/main/java/fellowmage/gateway/DeckLibrary.java).

## 🧪 Testes

O cliente dispõe de `npm run build` em `web/` para verificar TypeScript e gerar a versão de produção. O gateway usa Maven; `mvn package` em `gateway/` depende dos artefatos do XMage instalados localmente. Este repositório ainda não contém uma suíte própria de testes automatizados.

<a id="estado-do-projeto"></a>

## 📊 Estado do projeto

**Protótipo.** Estão implementados os fluxos principais de jogo contra IA e edição de decks. Multiplayer humano com lobby de mesas, draft, torneios, sons e configurações ainda não foram implementados no FellowMage.

## 📚 Documentação por público

**Para quem vai jogar**

- **[Primeiros passos](#primeiros-passos)** — preparação e inicialização no Windows.
- **[Instruções do pacote](packaging/app/LEIA-ME.txt)** — uso da distribuição com Java embutido.

**Para quem vai contribuir**

- **[Arquitetura](#arquitetura)** — fluxo entre navegador, gateway e XMage.
- **[Orientação para agentes](AGENTS.md)** — diagnóstico de código com consulta à implementação oficial.
- **[Agente XMage](.claude/agents/xmage-reference.md)** — procedimento especializado para investigar falhas.

## 🔍 Links rápidos

- **[Cliente web](web/src/App.tsx)** — ponto de entrada das telas.
- **[Estado e protocolo](web/src/store.ts)** — mensagens WebSocket, partida e reconexão.
- **[Gateway](gateway/src/main/java/fellowmage/gateway/ClientBridge.java)** — integração com a API do XMage.
- **[Editor de decks](web/src/deck/DeckEditor.tsx)** — interface de edição e importação.
- **[XMage oficial](https://github.com/magefree/mage)** — referência do motor e do protocolo.

## 🤝 Contribuindo

Para corrigir um comportamento, reproduza o problema e identifique se ele está na interface, no gateway ou no XMage. Quando a dúvida envolver regras, callbacks, sessão ou formato de dados do XMage, consulte o [código oficial](https://github.com/magefree/mage) na versão compatível com a instalação local. Registre o arquivo e a revisão usados como referência e valide a adaptação no FellowMage. O procedimento está em [AGENTS.md](AGENTS.md).

## 📖 Recursos externos

- [XMage — código e documentação oficiais](https://github.com/magefree/mage)
- [Scryfall — imagens das cartas](https://scryfall.com)

Magic: The Gathering pertence à Wizards of the Coast. FellowMage não é afiliado nem endossado pela Wizards of the Coast.
