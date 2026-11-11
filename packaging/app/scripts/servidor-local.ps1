# FellowMage (pacote): chamado pelo gateway quando o jogador escolhe jogar contra a IA.
# Inicia o servidor XMage local com o Java embutido, em segundo plano, com log na pasta "logs".
$Root = Split-Path -Parent $PSScriptRoot
$Java = Join-Path $Root 'runtime\bin\java.exe'
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
# o nome do jar muda a cada versao do XMage (mage-server-1.4.63.jar...)
$Jar = Get-ChildItem (Join-Path $Root 'server\lib') -Filter 'mage-server-*.jar' | Sort-Object Name | Select-Object -Last 1
Start-Process -FilePath $Java -WorkingDirectory (Join-Path $Root 'server') -WindowStyle Hidden `
    -ArgumentList @('--add-opens=java.base/java.io=ALL-UNNAMED', '-Xmx1536m', '-jar', "lib\$($Jar.Name)") `
    -RedirectStandardOutput (Join-Path $Logs 'servidor.log') -RedirectStandardError (Join-Path $Logs 'servidor-erros.log')
