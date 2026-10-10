Add-Type -AssemblyName System.Drawing

$projectDir = "C:\Users\kenkr\OneDrive\Desktop\testfile\GuiNganHang"
$srcPng = Join-Path $projectDir "assets\logo.png"
$destIco = Join-Path $projectDir "assets\app_icon.ico"

if (Test-Path $srcPng) {
    $bitmap = [System.Drawing.Bitmap]::FromFile($srcPng)
    $thumb = New-Object System.Drawing.Bitmap($bitmap, 256, 256)
    $iconHandle = $thumb.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)

    $fs = New-Object System.IO.FileStream($destIco, [System.IO.FileMode]::Create)
    $icon.Save($fs)
    $fs.Close()
    $icon.Dispose()
    $thumb.Dispose()
    $bitmap.Dispose()

    Write-Host "✅ Da tao file icon app_icon.ico chuan Windows thanh cong tai: $destIco"
} else {
    Write-Host "❌ Khong tim thay file logo.png"
}
