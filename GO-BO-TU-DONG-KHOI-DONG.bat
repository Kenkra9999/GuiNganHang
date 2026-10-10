@echo off
cd /d "%~dp0"
title Go Bo Tu Dong Khoi Dong DigiBank Prime

echo ==============================================================================
echo   GO BO DIGIBANK PRIME KHOI MUC TU KHOI DONG CUNG WINDOWS
echo ==============================================================================
echo.

powershell -NoProfile -Command "$startup = [Environment]::GetFolderPath('Startup'); $lnk = Join-Path $startup 'DigiBank Prime Background.lnk'; if(Test-Path $lnk){ Remove-Item -Path $lnk -Force; Write-Host '✅ Da go bo thanh cong khoi Startup!' } else { Write-Host 'Chua cai dat trong Startup.' }"

echo.
pause
