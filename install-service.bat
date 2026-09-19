@echo off
title Install ZenReader Background Service
cd /d "%~dp0"

echo ========================================================
echo   ZenReader Web Server - Install Windows Service
echo ========================================================
echo.

:: Cek Hak Akses Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [*] Meminta izin Administrator untuk mendaftarkan service...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

echo [1/3] Memastikan file web (dist) siap...
if not exist "dist\index.html" (
    echo [*] Membangun client web terlebih dahulu...
    call pnpm run build
)

echo [2/3] Menghentikan instansi lama jika sedang berjalan...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; if ($conn) { $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"

echo [3/3] Mendaftarkan Service ke Windows Task Scheduler (Pola AlistServer)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$nodePath = (Get-Command node).Source; " ^
  "$workDir = '%~dp0'.TrimEnd('\'); " ^
  "$action = New-ScheduledTaskAction -Execute $nodePath -Argument 'server.js' -WorkingDirectory $workDir; " ^
  "$trigger = New-ScheduledTaskTrigger -AtStartup; " ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1); " ^
  "Register-ScheduledTask -TaskName 'ZenReaderServer' -Action $action -Trigger $trigger -Settings $settings -User 'NT AUTHORITY\SYSTEM' -Force; " ^
  "Start-ScheduledTask -TaskName 'ZenReaderServer'"

echo.
echo Menunggu service aktif...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Sleep -Seconds 3; " ^
  "$ok = $false; " ^
  "for ($i=0; $i -lt 10; $i++) { " ^
  "    try { " ^
  "        $res = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/me' -TimeoutSec 2 -UseBasicParsing; " ^
  "        if ($res.StatusCode -eq 200) { $ok = $true; break } " ^
  "    } catch {}; " ^
  "    Start-Sleep -Seconds 1 " ^
  "}; " ^
  "if ($ok) { " ^
  "    Write-Host ' [OK] Service ZenReaderServer BERHASIL aktif dan berjalan di background!' -ForegroundColor Green; " ^
  "    Write-Host ' Local URL: http://localhost:3000' -ForegroundColor Cyan; " ^
  "} else { " ^
  "    Write-Host ' [*] Service didaftarkan. Silakan cek service-status.bat' -ForegroundColor Yellow; " ^
  "}"

echo.
echo ========================================================
echo   INSTALASI SELESAI!
echo ========================================================
echo - ZenReader Web Server sekarang berjalan otomatis di background (Session 0).
echo - Server akan OTOMATIS AKTIF setiap kali PC dihidupkan / restart,
echo   sama seperti service AlistServer Anda.
echo - Cloudflare Tunnel Anda akan otomatis tersambung ke port 3000.
echo.
echo Kontrol Service:
echo   - Cek Status:  service-status.bat
echo   - Hentikan:    service-stop.bat
echo   - Nyalakan:    service-start.bat
echo   - Uninstall:   service-uninstall.bat
echo ========================================================
echo.
pause
