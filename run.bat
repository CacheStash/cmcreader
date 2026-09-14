@echo off
title ZenReader - Comic Studio
cd /d "%~dp0"

echo ========================================
echo   ZenReader Desktop Comic Reader
echo ========================================
echo.

if not exist node_modules (
    echo [*] Memasang dependencies (pertama kali)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Gagal memasang dependencies.
        pause
        exit /b 1
    )
)

if not exist dist\index.html (
    echo [*] Melakukan compile aplikasi (build)...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build gagal.
        pause
        exit /b 1
    )
)

echo [*] Membuka ZenReader Desktop...
start "" npx electron .
exit
