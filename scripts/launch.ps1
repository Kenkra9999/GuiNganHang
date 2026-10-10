# ==============================================================================
# DigiBank Prime 4.0 - Smart Auto-Launcher
# Tu dong kiem tra, bat Server chay ngam va mo trinh duyet
# ==============================================================================

$projectDir = "C:\Users\kenkr\OneDrive\Desktop\testfile\GuiNganHang"
$hubDir = "C:\Users\kenkr\OneDrive\Desktop\testfile\ApiNhanVaChuyen"
$port = 8989
$hubPort = 9000

Set-Location $projectDir

function Test-Port {
    param([int]$p)
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect("127.0.0.1", $p, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(350, $false)
        if ($wait -and $client.Connected) {
            $client.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($client -ne $null) {
            $client.Close()
            $client.Dispose()
        }
    }
}

# 1. Kiem tra va bat Hub API (Port 9000) neu co
if ((Test-Path (Join-Path $hubDir "server.js")) -and (-not (Test-Port $hubPort))) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$hubDir`" && node server.js" -WorkingDirectory $hubDir -WindowStyle Hidden
}

# 2. Kiem tra va bat DigiBank Core Server (Port 8989) neu chua chay
if (-not (Test-Port $port)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$projectDir`" && node server.js" -WorkingDirectory $projectDir -WindowStyle Hidden
    
    # Doi server san sang (Toi da 10s)
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        if (Test-Port $port) {
            break
        }
    }
}

# 3. Cho nhe roi mo trinh duyet bang explorer.exe de dam bao cua so hien len man hinh
Start-Sleep -Milliseconds 300
Start-Process -FilePath "explorer.exe" -ArgumentList "http://localhost:$port"
