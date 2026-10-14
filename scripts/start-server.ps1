# Sobe o servidor XMage compilado a partir de mage-src (porta 17171).
. "$PSScriptRoot\dev-env.ps1"
Set-Location "$Root\mage-src\Mage.Server"
mvn -B exec:java
