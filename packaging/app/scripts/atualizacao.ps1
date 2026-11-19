# FellowMage (pacote): procura e instala atualizacoes publicadas nos releases do GitHub
# (gerados por scripts\empacotar.ps1 -Publicar no repositorio). Carregado por iniciar.ps1 com ". ".
# Precisa de $Root. Para testar com outro endereco: $env:FELLOWMAGE_ATUALIZACAO_URL (aceita file:///).
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

# Pastas trocadas inteiras. As de $PastasBase so vem no pacote completo, baixado quando muda a "base"
# (o Java embutido). O servidor XMage e os decks de exemplo vem do site oficial (Update-Xmage);
# decks\, logs\ e o banco de cartas (server\db) nunca sao apagados.
$PastasApp = @('web', 'gateway', 'scripts')
$PastasBase = @('runtime')
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
        # instalacao sem servidor (nao deveria acontecer): usa o que veio no pacote completo
        foreach ($p in 'server', 'sample-decks') {
            if (-not (Test-Path (Join-Path $Root $p)) -and (Test-Path (Join-Path $novo $p))) { Move-Item (Join-Path $novo $p) (Join-Path $Root $p) }
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

# Atualiza o servidor XMage pelo pacote oficial (xmage.today), so dentro da versao com que o gateway
# deste release foi testado (xmageCompativel no versao.json, ex.: 1.4.63). Builds novos dessa versao
# (cartas e correcoes) entram; uma versao nova (1.4.64) espera um release do FellowMage compativel.
function Update-Xmage {
    $localFile = Join-Path $Root 'versao.json'
    if (-not (Test-Path $localFile)) { return $false }
    $local = [IO.File]::ReadAllText($localFile, $Utf8).TrimStart([char]0xFEFF) | ConvertFrom-Json
    $compat = [string]$local.xmageCompativel
    if (-not $compat) { return $false }
    . (Join-Path $PSScriptRoot 'xmage.ps1')

    $server = Join-Path $Root 'server'
    $numLocal = Get-XmageNumeroInstalado $server
    $labelLocal = Get-XmageLabelInstalado $server
    try { $oficial = Get-XmageOficial 5000 } catch { return $false }

    if ($oficial.Numero -ne $compat) {
        # o FellowMage ainda nao acompanha esta versao (ou o site voltou para uma anterior)
        if ($numLocal -ne $compat) {
            Write-Host "  Este FellowMage precisa do XMage $compat, mas o site oficial tem o $($oficial.Numero). Jogar contra a IA pode falhar." -ForegroundColor Red
            Write-Host ''
        }
        return $false
    }
    if ($numLocal -eq $compat -and $oficial.Label -eq $labelLocal) { return $false }

    $tmp = Join-Path $Root '.atualizacao-xmage'
    $backup = Join-Path $Root '.xmage-anterior'
    foreach ($d in $tmp, $backup) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
    $z = $null
    $movidas = @()
    try {
        $z = Open-XmageZip $oficial.Url (Join-Path $tmp 'download')
        $mb = Get-XmageTamanhoMB $z.Zip
        Write-Host "  Nova versao do XMage: $($oficial.Label) (cartas novas e correcoes)." -ForegroundColor Yellow
        if ($labelLocal) { Write-Host "    voce tem: $labelLocal" -ForegroundColor DarkGray }
        if ($numLocal -ne $compat) { Write-Host "    Esta versao do FellowMage precisa dela para jogar contra a IA." -ForegroundColor Yellow }
        $r = Read-Host "  Atualizar o XMage agora? Baixa cerca de $mb MB (S/n)"
        if ($r -match '^\s*n') { Write-Host ''; return $false }

        Expand-XmageServidor $z.Zip $tmp $oficial.Label $z.Stream
        Close-XmageZip $z; $z = $null
        if ((Get-XmageNumeroInstalado (Join-Path $tmp 'server')) -ne $compat) { throw "o pacote baixado nao e do XMage $compat." }

        Stop-JavaEmbutido
        New-Item -ItemType Directory -Force $backup | Out-Null
        foreach ($p in 'server', 'sample-decks') {
            $dest = Join-Path $Root $p
            if (Test-Path $dest) { Move-Item $dest (Join-Path $backup $p) }
            $movidas += $p
            Move-Item (Join-Path $tmp $p) $dest
        }
        # banco de cartas: o servidor novo acrescenta as cartas que faltarem ao iniciar
        $db = Join-Path $backup 'server\db'
        if (Test-Path $db) { Copy-Item -Recurse $db (Join-Path $server 'db') }
    } catch {
        foreach ($p in $movidas) {
            $dest = Join-Path $Root $p
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            if (Test-Path (Join-Path $backup $p)) { Move-Item (Join-Path $backup $p) $dest }
        }
        Write-Host ''
        Write-Host "  Nao foi possivel atualizar o XMage: $_" -ForegroundColor Red
        Write-Host '  Continuando com a versao atual.' -ForegroundColor DarkGray
        Write-Host ''
        return $false
    } finally {
        if ($z) { Close-XmageZip $z }
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
    Remove-Item -Recurse -Force $backup -ErrorAction SilentlyContinue
    Write-Host "  XMage atualizado para $($oficial.Label)." -ForegroundColor Green
    Write-Host ''
    return $true
}
