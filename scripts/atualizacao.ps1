# Funcoes de atualizacao compartilhadas por atualizar.ps1 e iniciar.ps1 (carregue com ". ").
# Precisa de $Root (definido por dev-env.ps1).
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$XmageConfigUrl = 'https://xmage.today/config.json'
$GithubApi = 'https://api.github.com/repos/magefree/mage'
$Headers = @{ 'User-Agent' = 'FellowMage-updater'; 'Accept' = 'application/vnd.github+json' }
$Utf8 = New-Object Text.UTF8Encoding($false)
$PrepararPs1 = Join-Path $Root 'scripts\preparar.ps1'
$GatewayPom = Join-Path $Root 'gateway\pom.xml'
# ultima versao publicada ja resolvida para um commit (evita consultar a API do GitHub a cada inicio)
$CacheFile = Join-Path $Root '.atualizacao.json'

function Read-Text($path) { [IO.File]::ReadAllText($path, $Utf8) }
function Write-Text($path, $text) { [IO.File]::WriteAllText($path, $text, $Utf8) }
function Short($sha) { $sha.Substring(0, 8) }

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

# data do commit: do clone local em mage-src\, se ele tiver o commit; senao, da API do GitHub
function Get-CommitDate($sha, [int]$TimeoutSec = 30) {
    $mageSrc = Join-Path $Root 'mage-src'
    if (Test-Path (Join-Path $mageSrc '.git')) {
        $d = git -C $mageSrc log -1 --format=%cI $sha 2>$null
        if ($LASTEXITCODE -eq 0 -and $d) { return [datetime]$d }
    }
    [datetime](Invoke-RestMethod -Headers $Headers -TimeoutSec $TimeoutSec -Uri "$GithubApi/commits/$sha").commit.committer.date
}

# Versao publicada do XMage e a revisao do codigo-fonte com que ela foi gerada
function Get-LatestXmage([int]$TimeoutSec = 30) {
    $cfg = Invoke-RestMethod -Uri $XmageConfigUrl -TimeoutSec $TimeoutSec
    $label = $cfg.XMage.version   # ex.: 1.4.63-dev (2026-10-31 09-42)
    if ($label -notmatch '^(\d+\.\d+\.\d+)\S*\s*\((\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})\)') {
        throw "Formato de versao inesperado em ${XmageConfigUrl}: '$label'"
    }
    # o horario do pacote e UTC; o pacote e gerado logo depois do ultimo commit incluido nele
    $until = "$($Matches[2])T$($Matches[3]):$($Matches[4]):00Z"

    try {
        $cache = Get-Content -Raw -Encoding UTF8 $CacheFile -ErrorAction Stop | ConvertFrom-Json
        if ($cache.Label -eq $label -and $cache.Commit) {
            return [pscustomobject]@{ Label = $label; Commit = $cache.Commit; Date = [datetime]$cache.Date; Version = $cache.Version }
        }
    } catch {
    }

    $commits = @(Invoke-RestMethod -Headers $Headers -TimeoutSec $TimeoutSec -Uri "$GithubApi/commits?sha=master&until=$until&per_page=1")
    if (-not $commits) { throw "Nenhum commit do XMage ate $until" }
    $sha = $commits[0].sha
    # numero de versao do proprio codigo-fonte (o pom raiz), que e o que o gateway usa
    $pom = [xml](Invoke-WebRequest -UseBasicParsing -Headers $Headers -TimeoutSec $TimeoutSec -Uri "https://raw.githubusercontent.com/magefree/mage/$sha/pom.xml").Content
    $res = [pscustomobject]@{
        Label   = $label
        Commit  = $sha
        Date    = [datetime]$commits[0].commit.committer.date
        Version = $pom.project.version
    }
    try {
        Write-Text $CacheFile (@{ Label = $label; Commit = $sha; Date = $res.Date.ToUniversalTime().ToString('o'); Version = $res.Version } | ConvertTo-Json)
    } catch {
    }
    return $res
}

# $null se a versao em uso ja e a publicada (ou mais nova); senao, a versao publicada
function Find-XmageUpdate([int]$TimeoutSec = 30) {
    $atual = Get-PinnedXmage
    $novo = Get-LatestXmage $TimeoutSec
    if ($novo.Commit -eq $atual.Commit) { return $null }
    if ($novo.Date -le (Get-CommitDate $atual.Commit $TimeoutSec)) { return $null }
    return $novo
}

# quantos commits do GitHub esta copia do FellowMage ainda nao tem (0 sem .git ou sem rede)
function Find-FellowMageUpdate {
    if (-not (Test-Path (Join-Path $Root '.git'))) { return 0 }
    # sem rede o fetch falha rapido; com rede muito lenta, desiste depois de alguns segundos
    git -C $Root -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=5 fetch -q 2>$null
    if ($LASTEXITCODE -ne 0) { return 0 }
    $n = git -C $Root rev-list --count 'HEAD..@{u}' 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $n) { return 0 }
    return [int]$n
}
