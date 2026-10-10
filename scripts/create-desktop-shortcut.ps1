$userProfile = [Environment]::GetFolderPath('UserProfile')
$desktopCandidates = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $userProfile "OneDrive\Desktop"),
    (Join-Path $userProfile "Desktop")
) | Select-Object -Unique

$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
$batPath = Join-Path $projectDir "CHAY-NGAN-HANG.bat"
$icoPath = Join-Path $projectDir "assets\app_icon.ico"

$WshShell = New-Object -ComObject WScript.Shell

foreach ($d in $desktopCandidates) {
    if (Test-Path $d) {
        # Xoa cac file shortcut cu
        Get-ChildItem -Path $d -Filter "*DigiBank*.url" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $d -Filter "*DigiBank*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

        # Tao Shortcut .LNK voi Icon app_icon.ico
        $lnkPath = Join-Path $d "DigiBank Prime 4.0.lnk"
        $shortcut = $WshShell.CreateShortcut($lnkPath)
        $shortcut.TargetPath = $batPath
        $shortcut.WorkingDirectory = $projectDir
        $shortcut.IconLocation = "$icoPath,0"
        $shortcut.Description = "DigiBank Prime 4.0 - He Thong Ngan Hang So Realtime"
        $shortcut.WindowStyle = 1
        $shortcut.Save()

        Write-Host "Da tao Shortcut tren Desktop: $lnkPath"
    }
}

Write-Host "Hoan tat cai dat shortcut Desktop!"
