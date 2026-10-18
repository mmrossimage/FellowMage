# Chamado pelo gateway quando o jogador escolhe jogar contra a IA: abre o servidor XMage local
# numa janela minimizada própria (feche com "Parar FellowMage").
Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\start-server.ps1"
