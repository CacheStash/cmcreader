@echo off
title Menjalankan ZenReader Service
cd /d "%~dp0"

echo ========================================================
echo   Menjalankan ZenReader Background Service
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Meminta izin Administrator...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { " ^
  "    Start-ScheduledTask -TaskName 'ZenReaderServer'; " ^
  "    Write-Host '[OK] Memulai Scheduled Task ZenReaderServer...' -ForegroundColor Green; " ^
  "} catch { " ^
  "    Write-Host '[!] Gagal memulai task: ' $_.Exception.Message -ForegroundColor Red; " ^
  "}"

echo.
echo Menunggu status aktif...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Write-Host ' [OK] ZenReader Web Server aktif di http://localhost:3000' -ForegroundColor Green } else { Write-Host ' [*] Menunggu proses siap... Cek service-status.bat' -ForegroundColor Yellow }"

echo.
pause
