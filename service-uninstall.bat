@echo off
title Uninstall ZenReader Background Service
cd /d "%~dp0"

echo ========================================================
echo   Uninstall ZenReader Background Service
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Meminta izin Administrator...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

echo [1/2] Menghentikan service dan proses...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Stop-ScheduledTask -TaskName 'ZenReaderServer' -ErrorAction SilentlyContinue; " ^
  "Stop-ScheduledTask -TaskName 'ZenReader-WebServer' -ErrorAction SilentlyContinue; " ^
  "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; " ^
  "if ($conn) { " ^
  "    $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; " ^
  "}"

echo [2/2] Menghapus Scheduled Task dari Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Unregister-ScheduledTask -TaskName 'ZenReaderServer' -Confirm:$false -ErrorAction SilentlyContinue; " ^
  "Unregister-ScheduledTask -TaskName 'ZenReader-WebServer' -Confirm:$false -ErrorAction SilentlyContinue; " ^
  "Write-Host '[OK] Scheduled Task ZenReaderServer berhasil dihapus.' -ForegroundColor Green;"

echo.
echo ========================================================
echo   ZenReader Service telah berhasil dicopot.
echo ========================================================
echo.
pause
