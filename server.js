const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8989;
const DB_FILE = path.join(__dirname, 'database.json');

// Cấu hình Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(__dirname));

// ============================================================================
// CORE WALLET DATABASE (TÍCH HỢP HỆ SINH THÁI LIÊN WEBSITE)
// ============================================================================
const DEFAULT_ACCOUNTS = [
    {
        stk: 'W03889968688',
        owner_name: 'NGUYEN VAN A',
        origin_web: 'DigiBank Prime (Web Ngân Hàng)',
        balance: 100000000,
        currency: 'VND',
        status: 'ACTIVE'
    },
    {
        stk: 'W01829102948',
        owner_name: 'Tran Thi Shop',
        origin_web: 'Web Shop E-Commerce',
        balance: 50000000,
        currency: 'VND',
        status: 'ACTIVE'
    },
    {
        stk: 'W02746192834',
        owner_name: 'Nguyen Van Game',
        origin_web: 'Web Game PlayZone',
        balance: 25000000,
        currency: 'VND',
        status: 'ACTIVE'
    },
    {
        stk: 'W04918237461',
        owner_name: 'Le Van Crypto',
        origin_web: 'Web Crypto Exchange',
        balance: 80000000,
        currency: 'VND',
        status: 'ACTIVE'
    },
    {
        stk: 'W05123456789',
        owner_name: 'Pham Thi Service',
        origin_web: 'Web Dịch Vụ Số',
        balance: 15000000,
        currency: 'VND',
        status: 'ACTIVE'
    }
];

let db = {
    accounts: [...DEFAULT_ACCOUNTS],
    transactions: [],
    processedRequests: {} // request_id => response_data (Idempotency Cache)
};

// Đọc Database từ file nếu có
function loadDb() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data.accounts && Array.isArray(data.accounts)) {
                db.accounts = data.accounts;
            }
            if (data.transactions && Array.isArray(data.transactions)) {
                db.transactions = data.transactions;
            }
            if (data.processedRequests) {
                db.processedRequests = data.processedRequests;
            }
            console.log(`[Core Wallet] Đã nạp ${db.accounts.length} tài khoản từ database.json`);
        } catch (e) {
            console.error('[Core Wallet] Lỗi nạp database:', e.message);
        }
    } else {
        saveDb();
    }
}

// Lưu Database ra file
function saveDb() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('[Core Wallet] Lỗi ghi database:', e.message);
    }
}

loadDb();

// Mutex Lock giả lập Row-Level Locking để chống race condition
const accountLocks = new Map();

async function acquireLock(stk1, stk2) {
    const keys = [stk1, stk2].sort();
    while (accountLocks.get(keys[0]) || accountLocks.get(keys[1])) {
        await new Promise(res => setTimeout(res, 20));
    }
    accountLocks.set(keys[0], true);
    accountLocks.set(keys[1], true);
}

function releaseLock(stk1, stk2) {
    const keys = [stk1, stk2].sort();
    accountLocks.delete(keys[0]);
    accountLocks.delete(keys[1]);
}

// ============================================================================
// SOCKET.IO REALTIME SERVER
// ============================================================================
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    const authToken = socket.handshake.auth?.token || socket.handshake.query?.token;
    console.log(`[Socket.io] Client kết nối: ${socket.id} (Token: ${authToken || 'N/A'})`);

    // Client tham gia Room theo STK của chính mình (Đúng đặc tả mục 3.1)
    socket.on('JOIN_ACCOUNT_ROOM', (stk) => {
        if (!stk || typeof stk !== 'string') return;
        const normalizedStk = stk.trim().toUpperCase();
        socket.join(normalizedStk);
        console.log(`[Socket.io] Socket ${socket.id} đã tham gia Room STK: ${normalizedStk}`);

        socket.emit('ROOM_JOINED', {
            status: 'SUCCESS',
            stk: normalizedStk,
            message: `Đã kết nối phòng thông báo cho STK ${normalizedStk}`
        });
    });

    socket.on('LEAVE_ACCOUNT_ROOM', (stk) => {
        if (!stk || typeof stk !== 'string') return;
        const normalizedStk = stk.trim().toUpperCase();
        socket.leave(normalizedStk);
        console.log(`[Socket.io] Socket ${socket.id} rời khỏi Room STK: ${normalizedStk}`);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] Client ngắt kết nối: ${socket.id}`);
    });
});

// ============================================================================
// REST API ENDPOINTS ĐẶC TẢ KỸ THUẬT CORE WALLET
// ============================================================================

// Middleware kiểm tra Authorization Header
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    // Cho phép gọi trong môi trường phát triển / demo nếu không truyền Bearer token
    if (!authHeader) {
        // Cho phép để tương thích nhanh, nhưng ghi log
        return next();
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        return res.status(401).json({ status: 'ERROR', message: 'Thiếu Authorization Bearer Token' });
    }
    next();
}

/**
 * 2.1. API Tra cứu số tài khoản (Kiểm tra trước khi chuyển)
 * Phương thức: GET
 * Endpoint: /api/v1/accounts/lookup?stk={STK_NGUOI_NHAN}
 */
app.get('/api/v1/accounts/lookup', authMiddleware, (req, res) => {
    try {
        const rawStk = req.query.stk;
        if (!rawStk) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Vui lòng cung cấp tham số stk'
            });
        }

        const stk = String(rawStk).trim().toUpperCase();

        // Kiểm tra độ dài 12 ký tự theo quy chuẩn mục 1
        if (stk.length !== 12) {
            return res.status(400).json({
                status: 'ERROR',
                message: 'Số tài khoản phải đúng 12 ký tự (VD: W01829102948)'
            });
        }

        const account = db.accounts.find(a => a.stk === stk);
        if (!account) {
            return res.status(404).json({
                status: 'ERROR',
                message: 'Số tài khoản không tồn tại trên hệ thống Ví Trung Tâm'
            });
        }

        return res.json({
            status: 'SUCCESS',
            data: {
                stk: account.stk,
                owner_name: account.owner_name,
                origin_web: account.origin_web
            }
        });
    } catch (err) {
        return res.status(500).json({
            status: 'ERROR',
            message: 'Lỗi máy chủ nội bộ: ' + err.message
        });
    }
});

/**
 * 2.2. API Thực thi chuyển tiền (Bắt buộc Idempotency & Row Locking)
 * Phương thức: POST
 * Endpoint: /api/v1/transfer
 */
app.post('/api/v1/transfer', authMiddleware, async (req, res) => {
    let { request_id, sender_stk, receiver_stk, amount, note } = req.body;

    // 1. Kiểm tra tham số đầu vào
    if (!request_id || !sender_stk || !receiver_stk || amount === undefined) {
        return res.status(400).json({
            status: 'ERROR',
            message: 'Thiếu các trường bắt buộc: request_id, sender_stk, receiver_stk, amount'
        });
    }

    sender_stk = String(sender_stk).trim().toUpperCase();
    receiver_stk = String(receiver_stk).trim().toUpperCase();
    amount = Number(amount);
    note = note ? String(note).trim() : 'Chuyen tien lien website';

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
            status: 'ERROR',
            message: 'Số tiền chuyển phải lớn hơn 0'
        });
    }

    if (sender_stk === receiver_stk) {
        return res.status(400).json({
            status: 'ERROR',
            message: 'Không thể tự chuyển tiền cho chính tài khoản của mình'
        });
    }

    // 2. Chống lặp (Idempotent Check - Mục 5 Đặc tả)
    if (db.processedRequests[request_id]) {
        console.log(`[Core Wallet] Idempotency Hit: request_id ${request_id} đã tồn tại -> Trả về kết quả trước đó`);
        return res.json(db.processedRequests[request_id]);
    }

    // 3. Khóa bản ghi (Row-Level Locking Simulation - Mục 5 Đặc tả)
    await acquireLock(sender_stk, receiver_stk);

    try {
        // Tìm tài khoản người gửi và người nhận
        let sender = db.accounts.find(a => a.stk === sender_stk);
        let receiver = db.accounts.find(a => a.stk === receiver_stk);

        if (!sender) {
            releaseLock(sender_stk, receiver_stk);
            return res.status(404).json({
                status: 'ERROR',
                message: `Tài khoản người gửi (${sender_stk}) không tồn tại`
            });
        }

        if (!receiver) {
            releaseLock(sender_stk, receiver_stk);
            return res.status(404).json({
                status: 'ERROR',
                message: `Tài khoản người nhận (${receiver_stk}) không tồn tại`
            });
        }

        // 4. Kiểm tra số dư (Mục 5: Nghiêm cấm để số dư nhỏ hơn số tiền cần chuyển)
        if (sender.balance < amount) {
            releaseLock(sender_stk, receiver_stk);
            return res.status(400).json({
                status: 'ERROR',
                code: 'ERR_INSUFFICIENT_FUNDS',
                message: `Số dư khả dụng (${sender.balance.toLocaleString('vi-VN')} đ) không đủ để chuyển ${amount.toLocaleString('vi-VN')} đ`
            });
        }

        // 5. Trừ tiền người gửi & cộng tiền người nhận
        sender.balance -= amount;
        receiver.balance += amount;

        const transactionId = 'TX_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
        const timestamp = Date.now();

        const txRecord = {
            transaction_id: transactionId,
            request_id: request_id,
            sender_stk: sender_stk,
            sender_name: sender.owner_name,
            sender_web: sender.origin_web,
            receiver_stk: receiver_stk,
            receiver_name: receiver.owner_name,
            receiver_web: receiver.origin_web,
            amount: amount,
            note: note,
            sender_balance_after: sender.balance,
            receiver_balance_after: receiver.balance,
            timestamp: timestamp
        };

        db.transactions.unshift(txRecord);

        // Chuẩn bị response theo đúng cấu trúc JSON đặc tả mục 2.2
        const responseData = {
            status: 'SUCCESS',
            message: 'Chuyển tiền thành công',
            data: {
                transaction_id: transactionId,
                amount: amount,
                sender_balance_after: sender.balance,
                receiver_stk: receiver_stk,
                receiver_name: receiver.owner_name,
                note: note,
                timestamp: timestamp
            }
        };

        // Ghi nhớ request_id chống trùng lặp
        db.processedRequests[request_id] = responseData;
        saveDb();

        // 6. Phát sự kiện Realtime qua Socket.io (Mục 3 Đặc tả)
        // 6.1. Phát tới Room người nhận: EVENT_MONEY_RECEIVED
        io.to(receiver_stk).emit('EVENT_MONEY_RECEIVED', {
            amount: amount,
            sender_stk: sender_stk,
            sender_name: sender.owner_name,
            sender_web: sender.origin_web,
            new_balance: receiver.balance,
            message: `Bạn vừa nhận được ${amount.toLocaleString('vi-VN')} đ từ ${sender.owner_name} (STK: ${sender_stk})`,
            note: note,
            transaction_id: transactionId,
            timestamp: timestamp
        });
        console.log(`[Socket.io] Emitted EVENT_MONEY_RECEIVED tới Room ${receiver_stk}`);

        // 6.2. Phát tới Room người gửi: EVENT_MONEY_DEDUCTED (nếu mở nhiều tab/thiết bị)
        io.to(sender_stk).emit('EVENT_MONEY_DEDUCTED', {
            amount: amount,
            receiver_stk: receiver_stk,
            receiver_name: receiver.owner_name,
            receiver_web: receiver.origin_web,
            new_balance: sender.balance,
            message: `Tài khoản đã trừ ${amount.toLocaleString('vi-VN')} đ chuyển đến ${receiver.owner_name} (STK: ${receiver_stk})`,
            note: note,
            transaction_id: transactionId,
            timestamp: timestamp
        });
        console.log(`[Socket.io] Emitted EVENT_MONEY_DEDUCTED tới Room ${sender_stk}`);

        releaseLock(sender_stk, receiver_stk);
        return res.json(responseData);

    } catch (err) {
        releaseLock(sender_stk, receiver_stk);
        return res.status(500).json({
            status: 'ERROR',
            message: 'Lỗi xử lý giao dịch: ' + err.message
        });
    }
});

// ============================================================================
// HELPER APIS CHO DEMO & HỆ THỐNG
// ============================================================================

// Lấy danh sách toàn bộ tài khoản hệ sinh thái (để người dùng dễ chọn test)
app.get('/api/v1/accounts/all', (req, res) => {
    res.json({
        status: 'SUCCESS',
        data: db.accounts
    });
});

// Đồng bộ số dư khi người dùng gửi/rút tiết kiệm trên website DigiBank
app.post('/api/v1/accounts/sync-balance', (req, res) => {
    const { stk, balance } = req.body;
    if (!stk || balance === undefined) {
        return res.status(400).json({ status: 'ERROR', message: 'Thiếu stk hoặc balance' });
    }
    const acc = db.accounts.find(a => a.stk === stk.toUpperCase());
    if (acc) {
        acc.balance = Number(balance);
        saveDb();
        return res.json({ status: 'SUCCESS', balance: acc.balance });
    }
    res.status(404).json({ status: 'ERROR', message: 'Không tìm thấy tài khoản' });
});

// Giả lập một website con (ví dụ Web Shop W01 hoặc Web Game W02) gửi tiền vào DigiBank
app.post('/api/v1/simulate-incoming-transfer', (req, res) => {
    const { sender_stk = 'W01829102948', receiver_stk = 'W03889968688', amount = 50000, note = 'Thuong thang / Ban do Game' } = req.body;
    
    const sender = db.accounts.find(a => a.stk === sender_stk);
    const receiver = db.accounts.find(a => a.stk === receiver_stk);

    if (!sender || !receiver) {
        return res.status(404).json({ status: 'ERROR', message: 'Tài khoản không tồn tại' });
    }

    const numAmount = Number(amount);
    receiver.balance += numAmount;
    if (sender.balance >= numAmount) sender.balance -= numAmount;

    const transactionId = 'TX_SIM_' + Date.now();
    const timestamp = Date.now();

    saveDb();

    // Bắn socket realtime tới phòng STK người nhận
    io.to(receiver_stk).emit('EVENT_MONEY_RECEIVED', {
        amount: numAmount,
        sender_stk: sender.stk,
        sender_name: sender.owner_name,
        sender_web: sender.origin_web,
        new_balance: receiver.balance,
        message: `Bạn vừa nhận được ${numAmount.toLocaleString('vi-VN')} đ từ ${sender.owner_name} (STK: ${sender.stk})`,
        note: note,
        transaction_id: transactionId,
        timestamp: timestamp
    });

    res.json({
        status: 'SUCCESS',
        message: `Đã mô phỏng chuyển tiền từ ${sender.owner_name} (${sender.origin_web}) tới ${receiver.owner_name}`,
        data: {
            transaction_id: transactionId,
            amount: numAmount,
            receiver_new_balance: receiver.balance
        }
    });
});

// Reset toàn bộ tài khoản về trạng thái ban đầu
app.post('/api/v1/accounts/reset', (req, res) => {
    db.accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
    db.transactions = [];
    db.processedRequests = {};
    saveDb();
    res.json({ status: 'SUCCESS', message: 'Đã reset toàn bộ database về mặc định' });
});

// Xử lý lỗi không đồng bộ & giữ tiến trình sống ổn định
process.on('uncaughtException', (err) => {
    console.error('[Server Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server Error] Unhandled Rejection:', reason);
});

setInterval(() => {}, 1000 * 60 * 60);

// Start Server
server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🏦 CORE WALLET & DIGIBANK PRIME ĐANG CHẠY TẠI:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`👉 WebSocket (Socket.io): wss/ws tại port ${PORT}`);
    console.log(`👉 API Tra cứu: GET http://localhost:${PORT}/api/v1/accounts/lookup?stk=W01829102948`);
    console.log(`👉 API Chuyển tiền: POST http://localhost:${PORT}/api/v1/transfer`);
    console.log(`================================================================`);
});
