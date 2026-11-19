# FellowMage (pacote): inicia o gateway com o Java embutido e abre o navegador.
# O servidor XMage local só sobe quando o jogador escolhe jogar contra a IA (scripts\servidor-local.ps1).
param([switch]$SemNavegador, [switch]$SemVerificar)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Java = Join-Path $Root 'runtime\bin\java.exe'
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
$host.UI.RawUI.WindowTitle = 'FellowMage'

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

function Wait-Port([string]$Name, [int]$Port, [int]$TimeoutSecs, [string]$Log) {
    $deadline = (Get-Date).AddSeconds($TimeoutSecs)
    while (-not (Test-Port $Port)) {
        if ((Get-Date) -gt $deadline) {
            throw "$Name nao respondeu em $TimeoutSecs s. Veja o log: $Log"
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
    # atualizacao so com o jogo fechado (os arquivos em uso nao podem ser trocados)
    if (-not $SemVerificar -and -not (Test-Port 8090)) {
        . (Join-Path $PSScriptRoot 'atualizacao.ps1')
        if (Update-FellowMage) {
            # reinicia com os scripts da versao nova
            $novoArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'scripts\iniciar.ps1'), '-SemVerificar')
            if ($SemNavegador) { $novoArgs += '-SemNavegador' }
            & powershell.exe @novoArgs
            return
        }
    }

    $common = @('--add-opens=java.base/java.io=ALL-UNNAMED')

    if (Test-Port 8090) {
        Write-Host '  Gateway ja esta rodando.' -ForegroundColor DarkGray
    } else {
        Write-Host '  Iniciando o FellowMage' -NoNewline
        $cp = (Join-Path $Root 'gateway\fellowmage-gateway.jar') + ';' + (Join-Path $Root 'gateway\lib\*')
        Start-Process -FilePath $Java -WorkingDirectory $Root -WindowStyle Hidden `
            -ArgumentList ($common + @('-Xmx768m', '-cp', "`"$cp`"", 'fellowmage.gateway.GatewayMain',
                '--port=8090', '--samples=sample-decks', '--decks=decks', '--cards-db=server\db\cards.h2',
                '--web=web', '--http-port=5173', '--local-server=scripts\servidor-local.ps1')) `
            -RedirectStandardOutput (Join-Path $Logs 'gateway.log') -RedirectStandardError (Join-Path $Logs 'gateway-erros.log')
        Wait-Port 'O FellowMage' 5173 120 (Join-Path $Logs 'gateway-erros.log')
    }

    Write-Host ''
    Write-Host '  Pronto! Abrindo http://localhost:5173' -ForegroundColor Green
    Write-Host '  (para desligar depois: "Parar FellowMage")' -ForegroundColor DarkGray
    if (-not $SemNavegador) { Start-Process 'http://localhost:5173' }
    Start-Sleep -Seconds 4
} catch {
    Write-Host ''
    Write-Host "  $_" -ForegroundColor Red
    Read-Host '  Pressione Enter para fechar'
}
