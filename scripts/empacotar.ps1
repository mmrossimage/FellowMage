# Gera o pacote para Windows que roda sem instalar nada
# (Java embutido via jlink, servidor XMage compilado, gateway, cliente web compilado, decks de exemplo):
#   dist\FellowMage-completo.zip     instalacao completa (mande este para quem ainda nao tem o jogo)
#   dist\FellowMage-atualizacao.zip  so cliente web, gateway e scripts (o que muda a cada versao)
#   dist\versao.json                 versao publicada, lida pelo atualizador do pacote
# Com -Publicar, cria um release no GitHub com os tres arquivos; o pacote instalado procura
# atualizacoes nele ao iniciar (packaging\app\scripts\atualizacao.ps1).
# Pre-requisito: mage-src compilado (mvn install) — ver README. Para publicar: gh autenticado (gh auth login).
param([switch]$PularServidor, [switch]$Publicar)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\dev-env.ps1"

# Aumente quando mudar algo do runtime ou do servidor que nao muda a revisao do XMage nem a do Java
# (modulos do jlink, ajustes no config.xml...): forca quem atualizar a baixar o pacote completo.
$RevisaoBase = 1
$Modulos = 'java.se,jdk.httpserver,jdk.unsupported,jdk.crypto.ec,jdk.zipfs,jdk.charsets,jdk.localedata,jdk.management'

$Dist = Join-Path $Root 'dist'
$Out = Join-Path $Dist 'FellowMage'
$ZipCompleto = Join-Path $Dist 'FellowMage-completo.zip'
$ZipAtualizacao = Join-Path $Dist 'FellowMage-atualizacao.zip'
$VersaoDist = Join-Path $Dist 'versao.json'
$Utf8 = New-Object Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what falhou (codigo $LASTEXITCODE)" } }
function Write-Json($path, $obj) { [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 4), $Utf8) }

# --- versao ---------------------------------------------------------------------------------
$commit = (git -C $Root rev-parse HEAD).Trim(); Check 'git rev-parse'
$modificado = [bool](git -C $Root status --porcelain --untracked-files=no)
if ($Publicar) {
    if ($modificado) { throw 'Ha alteracoes sem commit. Faca o commit antes de publicar.' }
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) { throw 'O gh nao esta autenticado. Rode "gh auth login" e tente de novo.' }
    git -C $Root fetch -q origin; Check 'git fetch'
    $branch = (git -C $Root rev-parse --abbrev-ref HEAD).Trim()
    git -C $Root merge-base --is-ancestor HEAD "origin/$branch"
    if ($LASTEXITCODE -ne 0) { throw "O commit atual nao esta no GitHub. Faca o push de '$branch' antes de publicar." }
}
$origin = (git -C $Root remote get-url origin).Trim()
if ($origin -notmatch 'github\.com[:/]([^/]+/[^/]+?)(\.git)?$') { throw "Remote origin nao e do GitHub: $origin" }
$Repo = $Matches[1]
$xmage = (git -C (Join-Path $Root 'mage-src') rev-parse HEAD).Trim(); Check 'git rev-parse (mage-src)'
$javaRelease = Get-Content (Join-Path $env:JAVA_HOME 'release') -Raw
if ($javaRelease -notmatch 'JAVA_RUNTIME_VERSION="([^"]+)"') { throw "Nao achei a versao do Java em $env:JAVA_HOME\release" }
$java = $Matches[1]
$versao = Get-Date -Format 'yyyy.MM.dd.HHmm'
$info = [ordered]@{
    versao = $versao
    commit = $commit
    repo   = $Repo
    # pacote completo necessario quando muda: XMage, Java ou $RevisaoBase
    base   = "xmage-$($xmage.Substring(0, 8))+java-$java+r$RevisaoBase"
}
Write-Host "Versao $versao (commit $($commit.Substring(0, 8))$(if ($modificado) { ', com alteracoes sem commit' }))"

# --- montagem -------------------------------------------------------------------------------
if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force $Out | Out-Null

Step 'Cliente web (vite build)'
Push-Location (Join-Path $Root 'web')
npm run build | Out-Host; Check 'npm run build'
Pop-Location
Copy-Item -Recurse (Join-Path $Root 'web\dist') (Join-Path $Out 'web')

Step 'Gateway (jar + dependencias)'
Push-Location (Join-Path $Root 'gateway')
# clean: copy-dependencies nao apaga jars antigos de target/lib; com duas versoes do XMage no
# classpath, o gateway pode se apresentar ao servidor com a versao velha ("Wrong client version")
mvn -B -q clean package dependency:copy-dependencies "-DoutputDirectory=target/lib" -DincludeScope=runtime | Out-Host; Check 'mvn package (gateway)'
Pop-Location
$mageJars = Get-ChildItem (Join-Path $Root 'gateway\target\lib') -Filter 'mage-*.jar' |
    Where-Object { $_.Name -match '^mage(-common)?-\d' } | ForEach-Object { $_.Name -replace '^mage(-common)?-|\.jar$', '' } | Sort-Object -Unique
if (@($mageJars).Count -ne 1) { throw "gateway\target\lib tem mais de uma versao do XMage: $($mageJars -join ', ')" }
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
& "$env:JAVA_HOME\bin\jlink.exe" --add-modules $Modulos `
    --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output (Join-Path $Out 'runtime')
Check 'jlink'

Step 'Decks de exemplo, atalhos e LEIA-ME'
Copy-Item -Recurse (Join-Path $Root $SampleDecks) (Join-Path $Out 'sample-decks')
New-Item -ItemType Directory -Force (Join-Path $Out 'decks') | Out-Null
Copy-Item -Recurse (Join-Path $Root 'packaging\app\*') $Out
Copy-Item (Join-Path $Root 'mage-src\LICENSE.txt') (Join-Path $Out 'LICENSE-XMage.txt')
Write-Json (Join-Path $Out 'versao.json') $info

# --- zips -----------------------------------------------------------------------------------
Step 'Compactando'
foreach ($z in $ZipCompleto, $ZipAtualizacao) { if (Test-Path $z) { Remove-Item $z } }
tar -a -c -f $ZipCompleto -C $Dist FellowMage; Check 'tar (completo)'
# o que o atualizador troca quando a base (runtime + servidor) e a mesma; ver atualizacao.ps1
$itensAtualizacao = @('web', 'gateway', 'scripts') + (Get-ChildItem $Out -File | ForEach-Object Name) | ForEach-Object { "FellowMage/$_" }
tar -a -c -f $ZipAtualizacao -C $Dist @itensAtualizacao; Check 'tar (atualizacao)'

# novidades desde o ultimo release publicado (pelo commit registrado no versao.json dele)
$novidades = @()
try {
    $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri "https://github.com/$Repo/releases/latest/download/versao.json"
    # asset do GitHub pode vir como application/octet-stream (bytes)
    $texto = if ($resp.Content -is [byte[]]) { $Utf8.GetString($resp.Content) } else { $resp.Content }
    $anterior = $texto.TrimStart([char]0xFEFF) | ConvertFrom-Json
    if ($anterior.commit) {
        $novidades = @(git -C $Root log --no-merges --format=%s "$($anterior.commit)..HEAD" 2>$null | Select-Object -First 15)
    }
} catch {
    Write-Host '  (nenhum release anterior encontrado)' -ForegroundColor DarkGray
}

$publicado = [ordered]@{}
$info.GetEnumerator() | ForEach-Object { $publicado[$_.Key] = $_.Value }
$publicado.tamanhoCompletoMB = [math]::Ceiling((Get-Item $ZipCompleto).Length / 1MB)
$publicado.tamanhoAtualizacaoMB = [math]::Ceiling((Get-Item $ZipAtualizacao).Length / 1MB)
$publicado.novidades = $novidades
Write-Json $VersaoDist $publicado

Write-Host "Pronto: $ZipCompleto ($($publicado.tamanhoCompletoMB) MB)" -ForegroundColor Green
Write-Host "       $ZipAtualizacao ($($publicado.tamanhoAtualizacaoMB) MB)" -ForegroundColor Green

# --- release --------------------------------------------------------------------------------
if ($Publicar) {
    Step "Publicando o release v$versao em $Repo"
    $notas = if ($novidades) { ($novidades | ForEach-Object { "- $_" }) -join "`n" } else { 'Primeira versao com atualizacao automatica.' }
    $notas += "`n`nPara instalar: baixe FellowMage-completo.zip, descompacte e abra ""Iniciar FellowMage"". Quem ja tem o jogo recebe a atualizacao ao abrir."
    # notas por arquivo: o PowerShell 5.1 quebra argumentos com aspas ao chamar programas externos
    $notasFile = Join-Path $Dist 'notas.md'
    [IO.File]::WriteAllText($notasFile, $notas, $Utf8)
    gh release create "v$versao" $ZipCompleto $ZipAtualizacao $VersaoDist --repo $Repo --target $commit `
        --title "FellowMage $versao" --notes-file $notasFile --latest
    Check 'gh release create'
    Write-Host "Publicado: https://github.com/$Repo/releases/tag/v$versao" -ForegroundColor Green
}
