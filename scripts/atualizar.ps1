# Atualiza o FellowMage sem precisar clonar de novo:
#  1. baixa as novidades do proprio FellowMage (git pull);
#  2. confere a versao atual do XMage oficial (a mesma que o launcher do XMage instala, lida de
#     xmage.today/config.json) e, se for mais nova, passa a usar a revisao correspondente do
#     codigo-fonte (scripts\preparar.ps1 e gateway\pom.xml);
#  3. roda a preparacao (atualiza mage-src\, compila o XMage, npm install, compila o gateway).
# Se a versao nova do XMage nao compilar com o gateway, volta para a anterior.
# -SemXMage: so o git pull; -Forcar: nao para quando ha um FellowMage/XMage aberto
param([switch]$SemPausa, [switch]$SemXMage, [switch]$Forcar)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\dev-env.ps1"
$host.UI.RawUI.WindowTitle = 'FellowMage - atualizacao'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$XmageConfigUrl = 'https://xmage.today/config.json'
$GithubApi = 'https://api.github.com/repos/magefree/mage'
$Headers = @{ 'User-Agent' = 'FellowMage-updater'; 'Accept' = 'application/vnd.github+json' }
$Utf8 = New-Object Text.UTF8Encoding($false)
$PrepararPs1 = Join-Path $PSScriptRoot 'preparar.ps1'
$GatewayPom = Join-Path $Root 'gateway\pom.xml'

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Read-Text($path) { [IO.File]::ReadAllText($path, $Utf8) }
function Write-Text($path, $text) { [IO.File]::WriteAllText($path, $text, $Utf8) }
function Short($sha) { $sha.Substring(0, 8) }

function Test-Port([int]$Port) {
    foreach ($addr in '127.0.0.1', '::1') {
        try {
            $c = New-Object Net.Sockets.TcpClient($(if ($addr -eq '::1') { 'InterNetworkV6' } else { 'InterNetwork' }))
            $c.Connect($addr, $Port)
            $c.Close()
            return $true
        } catch {
        }
    }
    return $false
}

function Get-PinnedXmage {
    $text = Read-Text $PrepararPs1
    if ($text -notmatch "\`$XmageCommit = '([0-9a-f]{40})'") { throw 'Nao achei $XmageCommit em scripts\preparar.ps1' }
    $commit = $Matches[1]
    $version = ([xml](Read-Text $GatewayPom)).project.properties.'mage.version'
    [pscustomobject]@{ Commit = $commit; Version = $version }
}

function Set-PinnedXmage($commit, $version, $label) {
    $text = Read-Text $PrepararPs1
    $text = [regex]::Replace($text, "\`$XmageCommit = '[0-9a-f]{40}'", "`$XmageCommit = '$commit'")
    $text = [regex]::Replace($text, '(com a qual o gateway foi testado; versao ).*', "`${1}$label.")
    Write-Text $PrepararPs1 $text
    $pom = Read-Text $GatewayPom
    $pom = [regex]::Replace($pom, '<mage.version>[^<]+</mage.version>', "<mage.version>$version</mage.version>")
    Write-Text $GatewayPom $pom
}

function Get-CommitDate($sha) {
    [datetime](Invoke-RestMethod -Headers $Headers -Uri "$GithubApi/commits/$sha").commit.committer.date
}

# Versao publicada do XMage e a revisao do codigo-fonte com que ela foi gerada
function Get-LatestXmage {
    $cfg = Invoke-RestMethod -Uri $XmageConfigUrl -TimeoutSec 30
    $label = $cfg.XMage.version   # ex.: 1.4.63-dev (2026-10-31 09-42)
    if ($label -notmatch '^(\d+\.\d+\.\d+)\S*\s*\((\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})\)') {
        throw "Formato de versao inesperado em ${XmageConfigUrl}: '$label'"
    }
    # o horario do pacote e UTC; o pacote e gerado logo depois do ultimo commit incluido nele
    $until = "$($Matches[2])T$($Matches[3]):$($Matches[4]):00Z"
    $commits = @(Invoke-RestMethod -Headers $Headers -Uri "$GithubApi/commits?sha=master&until=$until&per_page=1")
    if (-not $commits) { throw "Nenhum commit do XMage ate $until" }
    $sha = $commits[0].sha
    # numero de versao do proprio codigo-fonte (o pom raiz), que e o que o gateway usa
    $pom = [xml](Invoke-WebRequest -UseBasicParsing -Headers $Headers -Uri "https://raw.githubusercontent.com/magefree/mage/$sha/pom.xml").Content
    [pscustomobject]@{
        Label   = $label
        Commit  = $sha
        Date    = [datetime]$commits[0].commit.committer.date
        Version = $pom.project.version
    }
}

function Invoke-Preparar {
    & $PrepararPs1 -SemPausa
    return ($LASTEXITCODE -eq 0)
}

try {
    Step 'Conferindo se o FellowMage esta fechado'
    # o XMage compilado fica no Maven local (~\.m2), compartilhado por todas as copias do FellowMage
    # neste computador: recompila-lo com um gateway aberto pode derruba-lo
    $abertos = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
            ForEach-Object { if ($_.CommandLine -match 'multiModuleProjectDirectory=([^"]+)') { $Matches[1] } } |
            Where-Object { $_ -match '\\(gateway|mage-src\\Mage\.Server)$' } |
            Sort-Object -Unique)
    if ((Test-Port 8090) -or $abertos) {
        $onde = if ($abertos) { " ($($abertos -join ', '))" } else { ' (porta 8090 em uso)' }
        if (-not $Forcar) {
            throw "O FellowMage esta aberto$onde. Feche com ""Parar FellowMage.cmd"" (em cada copia aberta) e rode a atualizacao de novo."
        }
        Write-Host "  aberto$onde; continuando por causa de -Forcar." -ForegroundColor Yellow
    } else {
        Write-Host '  ok' -ForegroundColor Green
    }

    Step 'Atualizando o FellowMage (git pull)'
    if (-not (Test-Path (Join-Path $Root '.git'))) {
        throw ('Esta copia nao veio do Git (foi baixada como ZIP?), entao nao da para atualiza-la. ' +
            'Baixe com "git clone https://github.com/mmrossimage/FellowMage.git" para poder usar a atualizacao.')
    }
    $antes = (git -C $Root rev-parse HEAD).Trim()
    $alterado = @(git -C $Root status --porcelain --untracked-files=no)
    if ($alterado) {
        Write-Host '  ha alteracoes locais nos arquivos do FellowMage; pulando o git pull.' -ForegroundColor Yellow
        $alterado | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    } else {
        git -C $Root pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw 'git pull falhou (a copia local tem commits que nao estao no GitHub?)' }
    }
    $depois = (git -C $Root rev-parse HEAD).Trim()
    $fellowMudou = $antes -ne $depois
    if ($fellowMudou) {
        Write-Host "  atualizado: $(Short $antes) -> $(Short $depois)" -ForegroundColor Green
        git -C $Root log --oneline "$antes..$depois" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    } else {
        Write-Host '  ja estava na versao mais recente.' -ForegroundColor Green
    }

    $atual = Get-PinnedXmage
    $xmageMudou = $false
    if (-not $SemXMage) {
        Step 'Conferindo a versao do XMage oficial'
        $novo = Get-LatestXmage
        Write-Host "  publicada: $($novo.Label) -> codigo-fonte $(Short $novo.Commit) (versao $($novo.Version))"
        Write-Host "  em uso:    versao $($atual.Version), codigo-fonte $(Short $atual.Commit)"
        if ($novo.Commit -eq $atual.Commit) {
            Write-Host '  ja e a mesma.' -ForegroundColor Green
        } elseif ($novo.Date -le (Get-CommitDate $atual.Commit)) {
            Write-Host '  a revisao em uso e mais nova que a publicada; mantendo.' -ForegroundColor Green
        } else {
            $label = "$($novo.Version) (release de $($novo.Date.ToUniversalTime().ToString('yyyy-MM-dd')))"
            $originalPreparar = Read-Text $PrepararPs1
            $originalPom = Read-Text $GatewayPom
            Set-PinnedXmage $novo.Commit $novo.Version $label
            $xmageMudou = $true
            Write-Host "  passando a usar $($novo.Version) ($(Short $novo.Commit))." -ForegroundColor Yellow
            Write-Host "  Mudancas no XMage: https://github.com/magefree/mage/compare/$($atual.Commit)...$($novo.Commit)" -ForegroundColor DarkGray
        }
    }

    if (-not $fellowMudou -and -not $xmageMudou) {
        Write-Host ''
        Write-Host '  Tudo atualizado; nada a fazer.' -ForegroundColor Green
    } else {
        Step 'Preparando a versao nova (XMage, cliente web e gateway)'
        if (Invoke-Preparar) {
            Write-Host ''
            Write-Host '  Atualizacao concluida! Abra "Iniciar FellowMage.cmd".' -ForegroundColor Green
            if ($xmageMudou) {
                Write-Host ''
                Write-Host "  O XMage passou da versao $($atual.Version) para $($novo.Version)." -ForegroundColor Yellow
                Write-Host '  As mudancas estao em scripts\preparar.ps1 e gateway\pom.xml: teste uma partida e' -ForegroundColor Yellow
                Write-Host '  faca o commit delas para os outros clones usarem a mesma versao.' -ForegroundColor Yellow
                Write-Host '  Recursos novos do XMage (telas, dados novos) ainda precisam ser adaptados no FellowMage.' -ForegroundColor DarkGray
            }
        } elseif ($xmageMudou) {
            Write-Host ''
            Write-Host "  A versao $($novo.Version) do XMage nao funcionou com o gateway atual; voltando para $($atual.Version)." -ForegroundColor Red
            Write-Text $PrepararPs1 $originalPreparar
            Write-Text $GatewayPom $originalPom
            Step 'Recompilando a versao anterior'
            if (-not (Invoke-Preparar)) { throw 'A preparacao da versao anterior tambem falhou' }
            throw "O FellowMage precisa ser adaptado ao XMage $($novo.Version) (veja os erros de compilacao acima)."
        } else {
            throw 'A preparacao falhou (veja as mensagens acima)'
        }
    }
} catch {
    Write-Host ''
    Write-Host "  Erro: $_" -ForegroundColor Red
    if (-not $SemPausa) { Read-Host '  Pressione Enter para fechar' }
    exit 1
}
if (-not $SemPausa) { Read-Host '  Pressione Enter para fechar' }
