# Ambiente comum para os scripts de desenvolvimento do FellowMage.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
# JAVA_HOME pode estar so nas variaveis do usuario ou so nas do sistema (instalador do JDK)
foreach ($scope in 'User', 'Machine') {
    $javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', $scope)
    if ($javaHome) { $env:JAVA_HOME = $javaHome; break }
}
if ($env:JAVA_HOME) { $env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path }
# jboss-remoting/serialization do XMage precisam de acesso reflexivo a java.io no Java 17+
$env:MAVEN_OPTS = '-Xmx2g --add-opens=java.base/java.io=ALL-UNNAMED'

$Root = Split-Path -Parent $PSScriptRoot

# Decks de exemplo: instalacao do XMage em Xmage\, se houver; senao, os do proprio codigo-fonte.
# Relativo a raiz (sem espacos, para ir ao Maven sem aspas).
$SampleDecks = 'Xmage/xmage/mage-client/sample-decks'
if (-not (Test-Path (Join-Path $Root $SampleDecks))) { $SampleDecks = 'mage-src/Mage.Client/release/sample-decks' }
