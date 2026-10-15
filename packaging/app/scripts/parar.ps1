# FellowMage (pacote): encerra o servidor XMage e o gateway (os processos do Java embutido).
$Root = Split-Path -Parent $PSScriptRoot
$Java = (Join-Path $Root 'runtime\bin\java.exe').ToLower()
$procs = Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $Java }
if (-not $procs) {
    Write-Host 'O FellowMage nao estava rodando.'
} else {
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'FellowMage encerrado.'
}
Start-Sleep -Seconds 2
