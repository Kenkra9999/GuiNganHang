const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const userProfile = process.env.USERPROFILE || 'C:\\Users\\kenkr';
const oneDriveDesktop = path.join(userProfile, 'OneDrive', 'Desktop');
const standardDesktop = path.join(userProfile, 'Desktop');

const desktopDirs = [];
if (fs.existsSync(oneDriveDesktop)) desktopDirs.push(oneDriveDesktop);
if (fs.existsSync(standardDesktop) && standardDesktop !== oneDriveDesktop) desktopDirs.push(standardDesktop);

const projectDir = path.resolve(__dirname, '..');
const vbsPath = path.join(projectDir, 'DigiBank-Launcher.vbs');
const icoPath = path.join(projectDir, 'assets', 'app_icon.ico');
const wscriptExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');

desktopDirs.forEach(desktopPath => {
    // 1. Xóa file .url gây lỗi cũ
    const urlFilePath = path.join(desktopPath, 'DigiBank Prime (Web).url');
    if (fs.existsSync(urlFilePath)) {
        try { fs.unlinkSync(urlFilePath); } catch (e) {}
    }

    // 2. Tạo Windows App Shortcut (.lnk) thông minh trỏ vào VBScript
    const lnkFilePath = path.join(desktopPath, 'DigiBank Prime 4.0.lnk');
    const psCommand = `
        $ws = New-Object -ComObject WScript.Shell;
        $s = $ws.CreateShortcut('${lnkFilePath.replace(/'/g, "''")}');
        $s.TargetPath = '${wscriptExe.replace(/'/g, "''")}';
        $s.Arguments = '"${vbsPath.replace(/'/g, "''")}"';
        $s.WorkingDirectory = '${projectDir.replace(/'/g, "''")}';
        $s.IconLocation = '${icoPath.replace(/'/g, "''")}, 0';
        $s.Description = 'DigiBank Prime 4.0 (Tu dong bat server va mo web)';
        $s.WindowStyle = 1;
        $s.Save();
    `;

    const encoded = Buffer.from(psCommand, 'utf16le').toString('base64');
    try {
        execSync(`powershell -NoProfile -EncodedCommand ${encoded}`);
        console.log(`✅ Đã tạo Smart Shortcut: ${lnkFilePath}`);
    } catch (e) {
        console.error('Lỗi tạo .lnk:', e.message);
    }
});

console.log('\n🎉 Đã hoàn tất cài đặt biểu tượng thông minh DigiBank Prime 4.0 lên Desktop!');
