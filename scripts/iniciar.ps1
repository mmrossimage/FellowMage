# Inicia o FellowMage: gateway e cliente web; depois abre o navegador.
# O servidor XMage local só sobe quando o jogador escolhe jogar contra a IA (o gateway o inicia).
# Cada parte roda numa janela minimizada própria (feche com scripts\parar.ps1).
param([switch]$SemNavegador)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$host.UI.RawUI.WindowTitle = 'FellowMage'

function Test-Port([int]$Port) {
    # IPv4 e IPv6: o Vite (Node 17+) escuta só em ::1, o gateway só em 127.0.0.1
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

function Start-Part([string]$Name, [string]$Script, [int]$Port, [int]$TimeoutSecs) {
    if (Test-Port $Port) {
        Write-Host "  $Name ja esta rodando (porta $Port)." -ForegroundColor DarkGray
        return
    }
    Write-Host "  Iniciando $Name..." -NoNewline
    Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\$Script"
    $deadline = (Get-Date).AddSeconds($TimeoutSecs)
    while (-not (Test-Port $Port)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host " nao respondeu em $TimeoutSecs s. Veja a janela minimizada '$Name'." -ForegroundColor Red
            throw "Falha ao iniciar $Name"
        }
        Start-Sleep -Seconds 2
        Write-Host '.' -NoNewline
    }
    Write-Host ' ok' -ForegroundColor Green
}

function Test-Preparado {
    # Clone novo: falta o XMage compilado (mage-src\ fica fora do Git) e o node_modules do cliente
    $versao = ([xml](Get-Content (Join-Path $Root 'gateway\pom.xml'))).project.properties.'mage.version'
    $m2 = Join-Path $env:USERPROFILE ".m2\repository\org\mage\mage-common\$versao\mage-common-$versao.jar"
    (Test-Path $m2) -and (Test-Path (Join-Path $Root 'mage-src\Mage.Server\target\classes')) -and
        (Test-Path (Join-Path $Root 'web\node_modules'))
}

Write-Host ''
Write-Host '  FellowMage' -ForegroundColor Yellow
Write-Host ''
if (-not (Test-Preparado)) {
    Write-Host '  O FellowMage ainda nao foi preparado neste computador (falta o XMage compilado).' -ForegroundColor Yellow
    if ((Read-Host '  Preparar agora? Leva de 10 a 30 minutos na primeira vez (S/N)') -notmatch '^[sS]') { exit 1 }
    & "$PSScriptRoot\preparar.ps1" -SemPausa
    if ($LASTEXITCODE -ne 0) {
        Read-Host '  Pressione Enter para fechar'
        exit 1
    }
    Write-Host ''
}
try {
    Start-Part 'gateway' 'start-gateway.ps1' 8090 180
    Start-Part 'cliente web' 'start-web.ps1' 5173 180
    Write-Host ''
    Write-Host '  Tudo pronto! Abrindo http://localhost:5173' -ForegroundColor Green
    if (-not $SemNavegador) { Start-Process 'http://localhost:5173' }
    Start-Sleep -Seconds 3
} catch {
    Write-Host ''
    Write-Host "  $_" -ForegroundColor Red
    Read-Host '  Pressione Enter para fechar'
}
