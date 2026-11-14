# Prepara um clone novo do FellowMage para rodar: confere Java/Maven/Git/Node, baixa o XMage
# na revisao compativel para mage-src\, compila e instala os artefatos no Maven local e
# instala as dependencias do cliente web. Pode ser executado de novo sem problema.
param([switch]$SemPausa)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\dev-env.ps1"
$host.UI.RawUI.WindowTitle = 'FellowMage - preparacao'

# Revisao do XMage (magefree/mage) com a qual o gateway foi testado; versao 1.4.63 (release de 2026-10-31).
$XmageRepo = 'https://github.com/magefree/mage.git'
$XmageCommit = '79aec614fc29d0c3eebd10fff0d5c1b40852bd52'

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what falhou (codigo $LASTEXITCODE)" } }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

try {
    Step 'Conferindo programas necessarios'
    $faltando = @()
    if (-not (Has 'git')) { $faltando += 'Git (https://git-scm.com)' }
    if (-not (Has 'mvn')) { $faltando += 'Maven 3.9 (https://maven.apache.org/download.cgi) - descompacte e coloque a pasta bin no PATH' }
    if (-not (Has 'npm')) { $faltando += 'Node.js 20+ (https://nodejs.org)' }

    $java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
    $javaVersao = $null
    if ($env:JAVA_HOME -and -not (Test-Path $java)) {
        $faltando += "Java: JAVA_HOME aponta para '$env:JAVA_HOME', que nao tem bin\java.exe"
    } elseif (-not $env:JAVA_HOME -and -not (Has 'java')) {
        $faltando += 'JDK 21 64 bits (https://adoptium.net) - marque a opcao que define JAVA_HOME'
    } else {
        $saida = (cmd /c "`"$java`" -version 2>&1") -join "`n"
        if ($saida -match 'version "(\d+)(\.(\d+))?') {
            $javaVersao = if ($Matches[1] -eq '1') { [int]$Matches[3] } else { [int]$Matches[1] }
        }
        if (-not $javaVersao -or $javaVersao -lt 17) {
            $faltando += "JDK 21 64 bits (https://adoptium.net) - o Java encontrado e '$java' versao $javaVersao; o XMage precisa de 17+"
        } elseif ($saida -notmatch '64-Bit') {
            $faltando += "JDK 21 64 bits (https://adoptium.net) - o Java encontrado ('$java') e 32 bits"
        } elseif (-not $env:JAVA_HOME) {
            $faltando += 'Variavel JAVA_HOME (o Maven precisa dela): aponte para a pasta do JDK 21'
        }
    }
    if ($faltando) {
        Write-Host '  Instale/configure e rode de novo:' -ForegroundColor Yellow
        $faltando | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
        Write-Host '  Depois de instalar, feche e abra de novo esta janela para o PATH ser atualizado.' -ForegroundColor DarkGray
        throw 'Faltam pre-requisitos'
    }
    Write-Host "  ok (Java $javaVersao, $((mvn -v | Select-Object -First 1)), Node $(node -v))" -ForegroundColor Green

    Step 'XMage em mage-src\'
    $mageSrc = Join-Path $Root 'mage-src'
    if (-not (Test-Path (Join-Path $mageSrc '.git'))) {
        if (Test-Path $mageSrc) { throw "mage-src\ existe mas nao e um clone do Git; apague a pasta e rode de novo" }
        Write-Host '  Baixando a revisao compativel (so ela, sem o historico)...'
        git init -q $mageSrc; Check 'git init'
        # alguns decks de exemplo passam do limite de 260 caracteres de caminho do Windows
        git -C $mageSrc config core.longpaths true; Check 'git config'
        git -C $mageSrc remote add origin $XmageRepo; Check 'git remote add'
        git -C $mageSrc fetch --depth 1 origin $XmageCommit; Check 'git fetch do XMage'
        git -C $mageSrc -c advice.detachedHead=false checkout -q FETCH_HEAD; Check 'git checkout do XMage'
    } else {
        # clone de uma preparacao anterior que nao conseguiu criar arquivos de caminho longo
        git -C $mageSrc config core.longpaths true
        $faltam = @(git -C $mageSrc ls-files --deleted)
        if ($faltam) {
            Write-Host "  restaurando $($faltam.Count) arquivos ausentes..."
            git -C $mageSrc checkout -- $faltam; Check 'git checkout dos arquivos ausentes'
        }
        $atual = (git -C $mageSrc rev-parse HEAD).Trim()
        if ($atual -ne $XmageCommit) {
            $alterado = @(git -C $mageSrc status --porcelain --untracked-files=no)
            if ($alterado) {
                Write-Host "  mage-src\ ja existe em outra revisao ($atual) e tem alteracoes locais; mantendo como esta." -ForegroundColor Yellow
                Write-Host "  A revisao testada e $XmageCommit." -ForegroundColor Yellow
            } else {
                Write-Host "  atualizando de $atual para a revisao testada..."
                git -C $mageSrc fetch --depth 1 origin $XmageCommit; Check 'git fetch do XMage'
                git -C $mageSrc -c advice.detachedHead=false checkout -q $XmageCommit; Check 'git checkout do XMage'
            }
        } else {
            Write-Host '  ja baixado.' -ForegroundColor Green
        }
    }

    # Ao trocar de revisao, a compilacao incremental do Maven so recompila os .java alterados e reaproveita
    # classes antigas que chamam metodos cuja assinatura mudou (NoSuchMethodError no meio da partida, como
    # CreateTokenEffect x Token.putOntoBattlefield na 1.4.63). Por isso compila do zero (clean) sempre que a
    # revisao for diferente da ultima compilada com sucesso.
    $marcador = Join-Path $mageSrc '.fellowmage-compilado'
    $revisao = (git -C $mageSrc rev-parse HEAD).Trim()
    $compilada = if (Test-Path $marcador) { (Get-Content $marcador -Raw).Trim() } else { '' }
    $metas = if ($compilada -eq $revisao) { @('install') } else { @('clean', 'install') }
    Step "Compilando o XMage (mvn $($metas -join ' '); de 10 a 30 minutos quando compila do zero)"
    Push-Location $mageSrc
    try {
        mvn -B @metas -DskipTests "-Dmaven.javadoc.skip=true"; Check 'Compilacao do XMage'
        Set-Content -Path $marcador -Value $revisao -Encoding ascii
    } finally { Pop-Location }

    Step 'Dependencias do cliente web (npm install)'
    Push-Location (Join-Path $Root 'web')
    try { npm install --no-audit --no-fund; Check 'npm install' } finally { Pop-Location }

    Step 'Testando a compilacao do gateway'
    Push-Location (Join-Path $Root 'gateway')
    try { mvn -B -q compile; Check 'Compilacao do gateway' } finally { Pop-Location }

    Write-Host ''
    Write-Host '  Pronto! Agora e so abrir "Iniciar FellowMage.cmd".' -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host "  Erro: $_" -ForegroundColor Red
    if (-not $SemPausa) { Read-Host '  Pressione Enter para fechar' }
    exit 1
}
if (-not $SemPausa) { Read-Host '  Pressione Enter para fechar' }
