@echo off
title ZenReader Desktop
cd /d "%~dp0"

echo ========================================
echo   ZenReader Desktop Comic Reader
echo ========================================
echo.

if not exist "node_modules" (
    echo [*] Memasang dependencies...
    call npm install
    if errorlevel 1 goto error
)

if not exist "dist\index.html" (
    echo [*] Melakukan build aplikasi...
    call npm run build
    if errorlevel 1 goto error
)

echo [*] Membuka ZenReader Desktop...
call npm start
if errorlevel 1 goto error

exit /b 0

:error
echo.
echo ========================================
echo [ERROR] Terjadi kesalahan saat menjalankan aplikasi.
echo ========================================
echo.
pause
exit /b 1
