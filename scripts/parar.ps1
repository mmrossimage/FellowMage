# Encerra servidor XMage, gateway e cliente web do FellowMage.
$Root = Split-Path -Parent $PSScriptRoot
$pattern = [regex]::Escape($Root)
$procs = Get-CimInstance Win32_Process | Where-Object {
    # java/node do FellowMage + as janelas do PowerShell que os iniciaram (menos esta)
    ($_.Name -in 'java.exe', 'node.exe', 'powershell.exe') -and $_.CommandLine -match $pattern -and
    $_.ProcessId -ne $PID -and $_.CommandLine -notmatch 'parar\.ps1'
}
if (-not $procs) {
    Write-Host 'Nada do FellowMage estava rodando.'
} else {
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Encerrado: $($p.Name) ($($p.ProcessId))"
    }
}
Start-Sleep -Seconds 2
