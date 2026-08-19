@echo off
REM Inicia Lanchonete com Cloudflare Tunnel
REM Requer: cloudflared instalado (winget install Cloudflare.cloudflared)

powershell -ExecutionPolicy Bypass -File "%~dp0start-tunnel.ps1"
pause