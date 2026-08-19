<# 
.SYNOPSIS
    Inicia a Lanchonete com Cloudflare Tunnel (sem domínio próprio)
.DESCRIPTION
    1. Inicia o servidor Node.js na porta local
    2. Inicia cloudflared tunnel para localhost:4000
    3. Captura a URL gerada (https://xxx.trycloudflare.com)
    4. Reinicia Node.js com CORS_ORIGIN correto
.NOTES
    Requer: cloudflared.exe na pasta do projeto ou no PATH
#>

param(
    [string]$ProjectPath = "C:\Users\Jadiel\Documents\Projetos\Lanchonete",
    [int]$Port = 4000
)

$ErrorActionPreference = "Stop"

Write-Host "=== Lanchonete + Cloudflare Tunnel ===" -ForegroundColor Cyan
Write-Host "Projeto: $ProjectPath" -ForegroundColor Gray
Write-Host "Porta local: $Port" -ForegroundColor Gray
Write-Host ""

# Verificar cloudflared
$cloudflared = "cloudflared"
if (Test-Path ".\cloudflared.exe") { $cloudflared = ".\cloudflared.exe" }
elseif (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared não encontrado. Baixe: https://github.com/cloudflare/cloudflared/releases"; exit 1
}

# Gerar JWT_SECRET
$jwtSecret = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" }
Write-Host "JWT_SECRET: ${jwtSecret.Substring(0,8)}..." -ForegroundColor Gray

# Função para iniciar Node.js
function Start-NodeServer {
    param($corsOrigin)
    $env:NODE_ENV = "production"
    $env:JWT_SECRET = $jwtSecret
    $env:DB_PATH = "lanchonete.db"
    $env:PORT = $Port
    $env:RATE_LIMIT_WINDOW_MS = "900000"
    $env:RATE_LIMIT_MAX_REQUESTS = "100"
    $env:LOG_LEVEL = "info"
    if ($corsOrigin) { $env:CORS_ORIGIN = $corsOrigin }
    
    Set-Location $ProjectPath
    Write-Host "Iniciando Node.js (CORS_ORIGIN: $($env:CORS_ORIGIN))..." -ForegroundColor Green
    $proc = Start-Process "node" -ArgumentList "server.js" -PassThru -RedirectStandardOutput "node.log" -RedirectStandardError "node.err.log"
    return $proc
}

# Função para aguardar health check
function Wait-HealthCheck {
    param($port, $timeout = 20)
    Write-Host "Aguardando health check..." -NoNewline
    for ($i=0; $i -lt $timeout; $i++) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline -ForegroundColor Gray
        try { $r = Invoke-WebRequest "http://localhost:$port/health" -TimeoutSec 2 -ErrorAction Stop; if ($r.StatusCode -eq 200) { Write-Host " OK"; return $true } }
        catch { }
    }
    Write-Host " FALHOU"
    return $false
}

# ===== PASSO 1: Iniciar Node.js (sem CORS_ORIGIN específico) =====
$nodeProc = Start-NodeServer
if (-not (Wait-HealthCheck $Port)) {
    Write-Error "Servidor não subiu"; $nodeProc | Stop-Process -Force; exit 1
}
Write-Host "Servidor ativo em http://localhost:$Port" -ForegroundColor Green

# ===== PASSO 2: Iniciar túnel =====
Write-Host "Iniciando Cloudflare Tunnel..." -ForegroundColor Green
$tunnelProc = Start-Process $cloudflared -ArgumentList "tunnel --url http://localhost:$Port" -PassThru -RedirectStandardOutput "tunnel.log" -RedirectStandardError "tunnel.err.log"

# Aguardar URL
$tunnelUrl = $null
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline -ForegroundColor Gray
    if (Test-Path "tunnel.log") {
        $log = Get-Content "tunnel.log" -Raw
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $tunnelUrl = $matches[0]; break }
    }
}
Write-Host ""

if (-not $tunnelUrl) {
    Write-Error "URL do túnel não encontrada. Verifique tunnel.err.log"
    $tunnelProc | Stop-Process -Force; $nodeProc | Stop-Process -Force; exit 1
}

Write-Host "Túnel: $tunnelUrl" -ForegroundColor Green

# ===== PASSO 3: Reiniciar Node.js COM CORS_ORIGIN correto =====
Write-Host "Reiniciando Node.js com CORS_ORIGIN=$tunnelUrl..." -ForegroundColor Yellow
$nodeProc | Stop-Process -Force
Start-Sleep -Seconds 2
$nodeProc = Start-NodeServer -corsOrigin $tunnelUrl
if (-not (Wait-HealthCheck $Port)) {
    Write-Error "Reinicialização falhou"; $tunnelProc | Stop-Process -Force; exit 1
}

Write-Host ""
Write-Host "=== PRONTO ===" -ForegroundColor Cyan
Write-Host "Acesse: $tunnelUrl" -ForegroundColor Cyan
Write-Host "Admin:  $tunnelUrl/admin" -ForegroundColor Cyan
Write-Host "Garçom: $tunnelUrl/garcom" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow

# Manter vivo
try {
    while ($true) { Start-Sleep -Seconds 10 }
}
finally {
    Write-Host "`nParando..." -ForegroundColor Yellow
    $tunnelProc | Stop-Process -Force -ErrorAction SilentlyContinue
    $nodeProc | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item "tunnel.log", "tunnel.err.log", "node.log", "node.err.log" -ErrorAction SilentlyContinue
}