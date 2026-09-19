@echo off
title ZenReader Service Status
cd /d "%~dp0"

echo ========================================================
echo   Status ZenReader Background Service
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { " ^
  "    $task = Get-ScheduledTask -TaskName 'ZenReaderServer' -ErrorAction Stop; " ^
  "    Write-Host ('[Task Scheduler] : ' + $task.State) -ForegroundColor Cyan; " ^
  "} catch { " ^
  "    Write-Host '[Task Scheduler] : Terdaftar sebagai SYSTEM / Belum terdaftar' -ForegroundColor Yellow; " ^
  "}; " ^
  "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; " ^
  "if ($conn) { " ^
  "    $pidVal = ($conn | Select-Object -ExpandProperty OwningProcess -Unique)[0]; " ^
  "    $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue; " ^
  "    Write-Host ('[Port 3000]      : AKTIF (PID: ' + $pidVal + ' - ' + $proc.ProcessName + ')' ) -ForegroundColor Green; " ^
  "    try { " ^
  "        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/me' -TimeoutSec 2 -UseBasicParsing; " ^
  "        Write-Host ('[HTTP Response]  : HTTP ' + $res.StatusCode + ' OK') -ForegroundColor Green; " ^
  "    } catch { " ^
  "        Write-Host ('[HTTP Response]  : ' + $_.Exception.Message) -ForegroundColor Yellow; " ^
  "    }; " ^
  "} else { " ^
  "    Write-Host '[Port 3000]      : TIDAK AKTIF' -ForegroundColor Red; " ^
  "}"

echo.
if exist "logs\server.log" (
    echo [Log Terakhir logs\server.log]:
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content 'logs\server.log' -Tail 10 -ErrorAction SilentlyContinue"
)
echo.
pause
