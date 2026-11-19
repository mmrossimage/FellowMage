# FellowMage (pacote): procura e instala atualizacoes publicadas nos releases do GitHub
# (gerados por scripts\empacotar.ps1 -Publicar no repositorio). Carregado por iniciar.ps1 com ". ".
# Precisa de $Root. Para testar com outro endereco: $env:FELLOWMAGE_ATUALIZACAO_URL (aceita file:///).
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

# Pastas trocadas inteiras. As de $PastasBase so vem no pacote completo, baixado quando muda a "base"
# (XMage ou Java). decks\, logs\ e o banco de cartas (server\db) nunca sao apagados.
$PastasApp = @('web', 'gateway', 'scripts')
$PastasBase = @('runtime', 'server', 'sample-decks')
$Utf8 = New-Object Text.UTF8Encoding($false)

function Read-Url([string]$Url, [int]$TimeoutMs) {
    $req = [Net.WebRequest]::Create($Url)
    $req.Timeout = $TimeoutMs
    if ($req -is [Net.HttpWebRequest]) { $req.UserAgent = 'FellowMage'; $req.ReadWriteTimeout = $TimeoutMs }
    $resp = $req.GetResponse()
    try {
        $reader = New-Object IO.StreamReader($resp.GetResponseStream(), $Utf8)
        $reader.ReadToEnd()
    } finally { $resp.Close() }
}

function Save-Url([string]$Url, [string]$Path) {
    $wc = New-Object Net.WebClient
    $wc.Headers['User-Agent'] = 'FellowMage'
    try { $wc.DownloadFile($Url, $Path) } finally { $wc.Dispose() }
}

function Stop-JavaEmbutido {
    $java = (Join-Path $Root 'runtime\bin\java.exe').ToLower()
    $procs = Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $java }
    if ($procs) {
        $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 2
    }
}

# Devolve $true se instalou uma versao nova (o chamador deve reiniciar com os scripts novos).
function Update-FellowMage {
    $localFile = Join-Path $Root 'versao.json'
    if (-not (Test-Path $localFile)) { return $false }
    $local = [IO.File]::ReadAllText($localFile, $Utf8).TrimStart([char]0xFEFF) | ConvertFrom-Json
    $baseUrl = if ($env:FELLOWMAGE_ATUALIZACAO_URL) { $env:FELLOWMAGE_ATUALIZACAO_URL.TrimEnd('/') } `
               else { "https://github.com/$($local.repo)/releases/latest/download" }

    # sem internet ou sem release publicado: segue sem avisar
    try {
        $remota = (Read-Url "$baseUrl/versao.json" 5000).TrimStart([char]0xFEFF) | ConvertFrom-Json
    } catch { return $false }
    # versao no formato aaaa.mm.dd.hhmm: a comparacao de texto basta
    if (-not $remota.versao -or [string]$remota.versao -le [string]$local.versao) { return $false }

    $completo = $remota.base -ne $local.base
    $arquivo = if ($completo) { 'FellowMage-completo.zip' } else { 'FellowMage-atualizacao.zip' }
    $mb = if ($completo) { $remota.tamanhoCompletoMB } else { $remota.tamanhoAtualizacaoMB }

    Write-Host "  Nova versao disponivel: $($remota.versao) (voce tem a $($local.versao))." -ForegroundColor Yellow
    foreach ($n in @($remota.novidades)) { if ($n) { Write-Host "    - $n" } }
    $r = Read-Host "  Atualizar agora? Baixa $mb MB (S/n)"
    if ($r -match '^\s*n') { Write-Host ''; return $false }

    $tmp = Join-Path $Root '.atualizacao'
    $backup = Join-Path $Root '.versao-anterior'
    foreach ($d in $tmp, $backup) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
    New-Item -ItemType Directory -Force $tmp, $backup | Out-Null
    $pastas = $PastasApp + $(if ($completo) { $PastasBase })
    $movidas = @()
    try {
        Write-Host "  Baixando $arquivo..." -ForegroundColor Cyan
        $zip = Join-Path $tmp $arquivo
        Save-Url "$baseUrl/$arquivo" $zip
        Write-Host '  Instalando...' -ForegroundColor Cyan
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
        $novo = Join-Path $tmp 'FellowMage'
        $baixada = [IO.File]::ReadAllText((Join-Path $novo 'versao.json'), $Utf8).TrimStart([char]0xFEFF) | ConvertFrom-Json
        # logo apos publicar, o GitHub pode demorar alguns minutos para apontar "latest" para o release novo
        if ($baixada.versao -ne $remota.versao) { throw "o pacote baixado e da versao $($baixada.versao), esperava $($remota.versao). Tente mais tarde." }
        foreach ($p in $pastas) { if (-not (Test-Path (Join-Path $novo $p))) { throw "Pacote incompleto: falta '$p'." } }

        Stop-JavaEmbutido
        # troca as pastas guardando as antigas em .versao-anterior (para desfazer se algo falhar)
        foreach ($p in $pastas) {
            $dest = Join-Path $Root $p
            if (Test-Path $dest) { Move-Item $dest (Join-Path $backup $p) }
            $movidas += $p
            Move-Item (Join-Path $novo $p) $dest
        }
        $db = Join-Path $backup 'server\db'
        if ($completo -and (Test-Path $db)) {
            $novoDb = Join-Path $Root 'server\db'
            if (Test-Path $novoDb) { Remove-Item -Recurse -Force $novoDb }
            Copy-Item -Recurse $db $novoDb
        }
        # atalhos, LEIA-ME e versao.json (por ultimo: so marca a versao nova depois de tudo trocado)
        Get-ChildItem $novo -File | Where-Object Name -ne 'versao.json' | Copy-Item -Destination $Root -Force
        Copy-Item (Join-Path $novo 'versao.json') $localFile -Force
    } catch {
        foreach ($p in $movidas) {
            $dest = Join-Path $Root $p
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            if (Test-Path (Join-Path $backup $p)) { Move-Item (Join-Path $backup $p) $dest }
        }
        Write-Host "  Nao foi possivel atualizar: $_" -ForegroundColor Red
        Write-Host '  Continuando com a versao atual.' -ForegroundColor DarkGray
        Write-Host ''
        return $false
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
    Remove-Item -Recurse -Force $backup -ErrorAction SilentlyContinue
    Write-Host "  Atualizado para a versao $($baixada.versao)." -ForegroundColor Green
    Write-Host ''
    return $true
}
