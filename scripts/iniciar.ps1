# Inicia o FellowMage completo: servidor XMage, gateway e cliente web; depois abre o navegador.
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

Write-Host ''
Write-Host '  FellowMage' -ForegroundColor Yellow
Write-Host ''
try {
    # o servidor XMage demora ~40 s (bem mais na primeira vez, quando cria o banco de cartas)
    Start-Part 'servidor XMage' 'start-server.ps1' 17171 600
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
