@echo off
cd /d "%~dp0"
echo Fechando servidor anterior (se houver)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Iniciando servidor da Lanchonete...
node server.js
pause
