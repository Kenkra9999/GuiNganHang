@echo off
cd /d "%~dp0"
title Dung DigiBank Prime Server

echo ==============================================================================
echo   DANG DUNG TOAN BO SERVER DIGIBANK PRIME & CENTRAL HUB...
echo ==============================================================================
echo.

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8989,9000 -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('Da tat process PID ' + $_.OwningProcess + ' tai port ' + $_.LocalPort) } catch {} }"

echo.
echo Da dung xong!
timeout /t 3
