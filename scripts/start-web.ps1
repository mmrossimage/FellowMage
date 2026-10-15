# Sobe o cliente web (Vite) em http://localhost:5173.
. "$PSScriptRoot\dev-env.ps1"
$host.UI.RawUI.WindowTitle = 'FellowMage - cliente web'
Set-Location "$Root\web"
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund }
npm run dev
