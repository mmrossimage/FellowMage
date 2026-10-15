# Gera dist\FellowMage-AAAA-MM-DD.zip: pacote para Windows que roda sem instalar nada
# (Java embutido via jlink, servidor XMage compilado, gateway, cliente web compilado, decks de exemplo).
# Pré-requisito: mage-src compilado (mvn install) — ver README.
param([switch]$PularServidor)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\dev-env.ps1"

$Dist = Join-Path $Root 'dist'
$Out = Join-Path $Dist 'FellowMage'
$Zip = Join-Path $Dist ("FellowMage-{0:yyyy-MM-dd}.zip" -f (Get-Date))

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what falhou (codigo $LASTEXITCODE)" } }

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force $Out | Out-Null

Step 'Cliente web (vite build)'
Push-Location (Join-Path $Root 'web')
npm run build | Out-Host; Check 'npm run build'
Pop-Location
Copy-Item -Recurse (Join-Path $Root 'web\dist') (Join-Path $Out 'web')

Step 'Gateway (jar + dependencias)'
Push-Location (Join-Path $Root 'gateway')
mvn -B -q package dependency:copy-dependencies "-DoutputDirectory=target/lib" -DincludeScope=runtime | Out-Host; Check 'mvn package (gateway)'
Pop-Location
New-Item -ItemType Directory -Force (Join-Path $Out 'gateway') | Out-Null
Copy-Item (Join-Path $Root 'gateway\target\fellowmage-gateway-0.1.0.jar') (Join-Path $Out 'gateway\fellowmage-gateway.jar')
Copy-Item -Recurse (Join-Path $Root 'gateway\target\lib') (Join-Path $Out 'gateway\lib')

Step 'Servidor XMage (assembly)'
$serverZip = Join-Path $Root 'mage-src\Mage.Server\target\mage-server.zip'
if (-not $PularServidor -or -not (Test-Path $serverZip)) {
    Push-Location (Join-Path $Root 'mage-src\Mage.Server')
    mvn -B -q package assembly:single -DskipTests | Out-Host; Check 'mvn assembly (servidor)'
    Pop-Location
}
Expand-Archive $serverZip (Join-Path $Out 'server')
# só local: escutar em 127.0.0.1 (evita o aviso do firewall do Windows)
$cfg = Join-Path $Out 'server\config\config.xml'
(Get-Content $cfg -Raw -Encoding UTF8) -replace 'serverAddress="0\.0\.0\.0"', 'serverAddress="127.0.0.1"' | Set-Content $cfg -Encoding UTF8 -NoNewline
Remove-Item (Join-Path $Out 'server\*.bat'), (Join-Path $Out 'server\*.sh'), (Join-Path $Out 'server\*.command') -ErrorAction SilentlyContinue

Step 'Java embutido (jlink)'
& "$env:JAVA_HOME\bin\jlink.exe" --add-modules 'java.se,jdk.httpserver,jdk.unsupported,jdk.crypto.ec,jdk.zipfs,jdk.charsets,jdk.localedata,jdk.management' `
    --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output (Join-Path $Out 'runtime')
Check 'jlink'

Step 'Decks de exemplo, atalhos e LEIA-ME'
Copy-Item -Recurse (Join-Path $Root 'Xmage\xmage\mage-client\sample-decks') (Join-Path $Out 'sample-decks')
New-Item -ItemType Directory -Force (Join-Path $Out 'decks') | Out-Null
Copy-Item -Recurse (Join-Path $Root 'packaging\app\*') $Out
Copy-Item (Join-Path $Root 'mage-src\LICENSE.txt') (Join-Path $Out 'LICENSE-XMage.txt')

Step "Compactando $Zip"
if (Test-Path $Zip) { Remove-Item $Zip }
tar -a -c -f $Zip -C $Dist FellowMage; Check 'tar'

$mb = [int]((Get-Item $Zip).Length / 1MB)
Write-Host "Pronto: $Zip ($mb MB)" -ForegroundColor Green
