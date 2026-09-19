@echo off
title Hentikan ZenReader Service
cd /d "%~dp0"

echo ========================================================
echo   Menghentikan ZenReader Background Service
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Meminta izin Administrator...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Stop-ScheduledTask -TaskName 'ZenReaderServer' -ErrorAction SilentlyContinue; " ^
  "Stop-ScheduledTask -TaskName 'ZenReader-WebServer' -ErrorAction SilentlyContinue; " ^
  "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; " ^
  "if ($conn) { " ^
  "    $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { " ^
  "        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; " ^
  "        Write-Host ('[OK] Menghentikan proses PID ' + $_) -ForegroundColor Yellow; " ^
  "    }; " ^
  "}; " ^
  "Write-Host '[OK] ZenReader Web Server berhasil dihentikan.' -ForegroundColor Green;"

echo.
pause
