@echo off
cd /d "%~dp0"
title Cai Dat Tu Dong Khoi Dong DigiBank Prime

echo ==============================================================================
echo   CAI DAT DIGIBANK PRIME TU DONG KHOI DONG KHI BAT MAY TINH (WINDOWS)
echo ==============================================================================
echo.

powershell -NoProfile -Command "$startup = [Environment]::GetFolderPath('Startup'); $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut((Join-Path $startup 'DigiBank Prime Background.lnk')); $s.TargetPath = (Join-Path $env:SystemRoot 'System32\wscript.exe'); $s.Arguments = '\"' + (Join-Path '%~dp0' 'DigiBank-Launcher.vbs') + '\"'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Save(); Write-Host '✅ Da cai dat thanh cong vao thu muc Khoi dong Windows: ' $startup"

echo.
echo ==============================================================================
echo  Tu bay gio moi khi bat may, he thong se tu dong san sang!
echo ==============================================================================
pause
