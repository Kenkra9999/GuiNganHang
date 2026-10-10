const { exec } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8989;
const URL = `http://localhost:${PORT}`;

// Kiem tra xem server co dang chay khong
function checkServerRunning() {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(600, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Mo trinh duyet mac dinh
function openBrowser() {
    exec(`start "" "${URL}"`, (err) => {
        if (err) {
            exec(`explorer "${URL}"`);
        }
    });
}

async function main() {
    const isRunning = await checkServerRunning();
    
    if (isRunning) {
        console.log(`================================================================`);
        console.log(`✅ Core Wallet Server da dang hoat dong tai: ${URL}`);
        console.log(`🌐 Dang mo giao dien DigiBank Prime tren trinh duyet...`);
        console.log(`================================================================`);
        openBrowser();
    } else {
        console.log(`================================================================`);
        console.log(`🚀 Dang khoi dong Core Wallet Server tai port ${PORT}...`);
        console.log(`================================================================`);
        
        // Load server.js truc tiep trong tien trinh nay
        require(path.join(__dirname, 'server.js'));
        
        // Cho 500ms de server bind port roi mo trinh duyet
        setTimeout(() => {
            console.log(`\n🌐 DA MO TRINH DUYET THANH CONG: ${URL}`);
            console.log(`👉 Vui long giu hoac thu nho cua so nay de web luon hoat dong!`);
            openBrowser();
        }, 500);
    }
}

main().catch(err => {
    console.error('Loi launcher:', err);
    openBrowser();
});
