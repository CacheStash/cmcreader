@echo off
title ZenReader Web Server (Cloudflare Tunnel Ready)
cd /d "%~dp0"

echo ========================================================
echo   ZenReader Web Server (Cloudflare Tunnel Ready)
echo ========================================================
echo.

if not exist "node_modules" (
    echo [*] Memasang dependencies...
    call pnpm install
    if errorlevel 1 goto error
)

echo [1/2] Memeriksa dan membangun file web...
call pnpm run build
if errorlevel 1 goto error

echo.
echo [2/2] Menjalankan Server Node.js pada port 3000...
echo.
echo Akses lokal: http://localhost:3000
echo Untuk Cloudflare Tunnel, jalankan di terminal lain:
echo   cloudflared tunnel --url http://localhost:3000
echo.
node server.js
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo ========================================================
echo [ERROR] Terjadi kesalahan saat menjalankan web server.
echo ========================================================
echo.
pause
exit /b 1
