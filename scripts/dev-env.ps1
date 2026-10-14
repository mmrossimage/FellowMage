# Ambiente comum para os scripts de desenvolvimento do FellowMage.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
# jboss-remoting/serialization do XMage precisam de acesso reflexivo a java.io no Java 17+
$env:MAVEN_OPTS = '-Xmx2g --add-opens=java.base/java.io=ALL-UNNAMED'

$Root = Split-Path -Parent $PSScriptRoot
