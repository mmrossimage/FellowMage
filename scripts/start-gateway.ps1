# Sobe o gateway WebSocket do FellowMage (porta 8090).
param([int]$Port = 8090)
. "$PSScriptRoot\dev-env.ps1"
Set-Location "$Root\gateway"
mvn -B -q compile exec:java "-Dexec.args=$Port ../Xmage/xmage/mage-client/sample-decks"
