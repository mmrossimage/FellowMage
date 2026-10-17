# Agentes do FellowMage

Este é um projeto pessoal. Não publique informações dele na Wiki da Squad Neocob nem em sistemas da Global.

## Diagnóstico de código

Ao investigar qualquer código do FellowMage que não funciona, use o procedimento do agente [xmage-reference](.claude/agents/xmage-reference.md) e consulte o [repositório oficial do XMage](https://github.com/magefree/mage) para procurar o comportamento equivalente. Essa consulta é especialmente importante quando a falha envolve regras, protocolo remoto, sessão, callbacks, `GameView`, `CardView`, decks ou comportamento do servidor.

Reproduza a falha, localize o caminho correspondente no FellowMage e compare com a implementação oficial do XMage na revisão compatível com o `mage-src/` usado localmente. Adapte o comportamento necessário ao React/Java do FellowMage; não substitua arquivos inteiros nem presuma que o cliente Swing e o navegador têm o mesmo ciclo de vida. Registre as referências consultadas e valide a correção. Se a causa estiver no próprio XMage, identifique isso antes de modificar o gateway.

`mage-src/`, `Xmage/` e `decks/` são dados locais ignorados pelo Git. Não adicione ao repositório código, artefatos ou decks dessas pastas por engano.
