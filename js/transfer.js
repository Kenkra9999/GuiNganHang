// Quản lý chuyển tiền Liên Website (Core Wallet API), Napas 247, lịch sử giao dịch và nạp tiền
class TransferManager {
    constructor() {
        this.transactions = [];
        this.loadTransactions();
    }

    loadTransactions() {
        const saved = localStorage.getItem('digibank_transactions');
        if (saved) {
            try {
                this.transactions = JSON.parse(saved);
            } catch (e) {
                console.error("Lỗi đọc lịch sử giao dịch:", e);
                this.transactions = [];
            }
        } else {
            // Khởi tạo giao dịch mẫu ban đầu
            this.transactions = [
                {
                    id: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
                    type: 'TOPUP',
                    title: 'Nạp tiền vào tài khoản khởi tạo',
                    description: 'Hệ thống cấp vốn trải nghiệm VIP',
                    amount: 100000000,
                    fee: 0,
                    sender: 'DIGIBANK SYSTEM',
                    recipient: 'NGUYEN VAN A',
                    timestamp: Date.now() - 3600000,
                    status: 'SUCCESS'
                }
            ];
            this.saveTransactions();
        }
    }

    saveTransactions() {
        localStorage.setItem('digibank_transactions', JSON.stringify(this.transactions));
    }

    addTransaction(tx) {
        const newTx = {
            id: tx.id || ('TXN-' + Math.floor(10000000 + Math.random() * 90000000)),
            timestamp: tx.timestamp || Date.now(),
            status: tx.status || 'SUCCESS',
            ...tx
        };
        this.transactions.unshift(newTx);
        this.saveTransactions();
        return newTx;
    }

    getTransactions(filter = 'ALL', search = '') {
        return this.transactions.filter(tx => {
            const matchesFilter = (filter === 'ALL') 
                || (filter === 'SAVINGS' && (tx.type === 'SAVINGS_OPEN' || tx.type === 'SAVINGS_WITHDRAW' || tx.type === 'INTEREST_CLAIM'))
                || (filter === 'TRANSFER' && (tx.type === 'TRANSFER_OUT' || tx.type === 'TRANSFER_IN'))
                || (filter === 'TOPUP' && tx.type === 'TOPUP');

            const matchesSearch = !search || (
                (tx.title && tx.title.toLowerCase().includes(search.toLowerCase())) ||
                (tx.description && tx.description.toLowerCase().includes(search.toLowerCase())) ||
                (tx.recipient && tx.recipient.toLowerCase().includes(search.toLowerCase())) ||
                (tx.sender && tx.sender.toLowerCase().includes(search.toLowerCase())) ||
                (tx.id && tx.id.toLowerCase().includes(search.toLowerCase())) ||
                (tx.referenceCode && tx.referenceCode.toLowerCase().includes(search.toLowerCase()))
            );

            return matchesFilter && matchesSearch;
        });
    }

    // ========================================================================
    // 2.1. API TRA CỨU SỐ TÀI KHOẢN LIÊN WEBSITE (GET /api/v1/accounts/lookup)
    // ========================================================================
    async lookupAccount(stk) {
        const normalizedStk = String(stk || '').trim().toUpperCase();
        if (normalizedStk.length !== 12) {
            throw new Error("Số tài khoản phải đúng 12 ký tự (Ví dụ: W01829102948)");
        }

        const url = `${CORE_WALLET_CONFIG.apiUrl}/accounts/lookup?stk=${encodeURIComponent(normalizedStk)}`;
        
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${CORE_WALLET_CONFIG.appSecretToken}`,
                    'Accept': 'application/json'
                }
            });

            const data = await res.json();
            if (!res.ok || data.status !== 'SUCCESS') {
                throw new Error(data.message || "Số tài khoản không tồn tại trên hệ thống Ví Trung Tâm");
            }

            return data.data; // { stk, owner_name, origin_web }
        } catch (err) {
            // Fallback nếu không có server chạy: tìm trong ECOSYSTEM_ACCOUNTS mock
            console.warn("[Core Wallet Lookup] Fetch error, checking local fallback:", err.message);
            const localAcc = ECOSYSTEM_ACCOUNTS.find(a => a.stk === normalizedStk);
            if (localAcc) {
                return {
                    stk: localAcc.stk,
                    owner_name: localAcc.owner_name,
                    origin_web: localAcc.origin_web
                };
            }
            throw err;
        }
    }

    // ========================================================================
    // 2.2. API THỰC THI CHUYỂN TIỀN LIÊN WEBSITE (POST /api/v1/transfer)
    // ========================================================================
    async executeCrossWebTransfer(user, receiverStk, amount, note) {
        const normalizedReceiverStk = String(receiverStk || '').trim().toUpperCase();
        const normalizedSenderStk = String(user.accountNumber || 'W03889968688').trim().toUpperCase();

        if (normalizedReceiverStk.length !== 12) {
            throw new Error("Số tài khoản người nhận phải đúng 12 ký tự!");
        }

        if (normalizedSenderStk === normalizedReceiverStk) {
            throw new Error("Không thể tự chuyển tiền cho chính tài khoản của mình!");
        }

        if (amount <= 0) {
            throw new Error("Số tiền chuyển khoản phải lớn hơn 0 đ!");
        }

        if (amount > user.availableBalance) {
            const savingsStats = savingsManager ? savingsManager.calculateGlobalStats() : { totalPrincipalLocked: 0 };
            let errMsg = `Số dư khả dụng của bạn (${user.availableBalance.toLocaleString('vi-VN')} đ) không đủ để chuyển ${amount.toLocaleString('vi-VN')} đ.`;
            if (savingsStats.totalPrincipalLocked > 0) {
                errMsg += `\n\n💡 Bạn hiện đang có ${savingsStats.totalPrincipalLocked.toLocaleString('vi-VN')} đ gửi trong sổ tiết kiệm. Hãy bấm "Rút tiền tiết kiệm" để chuyển số tiền đó về tài khoản khả dụng trước khi chuyển đi nhé!`;
            }
            throw new Error(errMsg);
        }

        // Sinh mã request_id duy nhất để đảm bảo Idempotency (chống trừ tiền 2 lần khi lag/click đúp)
        const requestId = `REQ_${Date.now()}_${user.webCode || 'W03'}_${Math.floor(100000 + Math.random() * 900000)}`;

        const url = `${CORE_WALLET_CONFIG.apiUrl}/transfer`;
        const bodyPayload = {
            request_id: requestId,
            sender_stk: normalizedSenderStk,
            receiver_stk: normalizedReceiverStk,
            amount: amount,
            note: note || `Chuyen tien lien website tu ${user.accountName}`
        };

        let resultData = null;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CORE_WALLET_CONFIG.appSecretToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyPayload)
            });

            const data = await res.json();
            if (!res.ok || data.status !== 'SUCCESS') {
                throw new Error(data.message || "Giao dịch không thành công");
            }

            resultData = data.data;
        } catch (err) {
            // Fallback nếu không kết nối được server trực tiếp: giả lập thành công trên local
            console.warn("[Core Wallet Transfer] API call failed, running local execution:", err.message);
            if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
                throw err;
            }

            // Mock response nếu offline
            resultData = {
                transaction_id: 'TX_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000),
                amount: amount,
                sender_balance_after: user.availableBalance - amount,
                receiver_stk: normalizedReceiverStk,
                receiver_name: 'Người nhận ' + normalizedReceiverStk,
                note: bodyPayload.note
            };
        }

        // Cập nhật số dư người gửi
        user.availableBalance -= amount;

        // Lưu vào lịch sử giao dịch
        const tx = this.addTransaction({
            id: resultData.transaction_id || ('TX_' + Date.now()),
            type: 'TRANSFER_OUT',
            title: `Chuyển tiền tới ${resultData.receiver_name || normalizedReceiverStk}`,
            description: note || `Chuyển tiền liên website tới STK: ${normalizedReceiverStk}`,
            bankName: 'Ví Trung Tâm (Core Wallet)',
            accountNumber: normalizedReceiverStk,
            recipient: resultData.receiver_name || normalizedReceiverStk,
            sender: user.accountName,
            amount: -amount,
            fee: 0,
            referenceCode: resultData.transaction_id || ('TX_' + Date.now())
        });

        return {
            ...resultData,
            localTx: tx
        };
    }

    // ========================================================================
    // XỬ LÝ SỰ KIỆN REALTIME NHẬN ĐƯỢC TIỀN TỪ SOCKET.IO (EVENT_MONEY_RECEIVED)
    // ========================================================================
    handleIncomingMoney(user, payload) {
        const amount = Number(payload.amount || 0);
        if (amount <= 0) return null;

        // Cập nhật số dư người dùng
        if (payload.new_balance !== undefined) {
            user.availableBalance = Number(payload.new_balance);
        } else {
            user.availableBalance += amount;
        }

        // Lưu vào lịch sử giao dịch
        const tx = this.addTransaction({
            id: payload.transaction_id || ('TX_IN_' + Date.now()),
            type: 'TRANSFER_IN',
            title: `Nhận tiền từ ${payload.sender_name || payload.sender_stk}`,
            description: payload.note || payload.message || `Nhận tiền liên website từ ${payload.sender_stk}`,
            bankName: payload.sender_web || 'Ví Trung Tâm (Core Wallet)',
            accountNumber: payload.sender_stk,
            recipient: user.accountName,
            sender: `${payload.sender_name || 'Hệ Thống'} (${payload.sender_stk || 'N/A'})`,
            amount: amount,
            fee: 0,
            referenceCode: payload.transaction_id || ('TX_' + Date.now())
        });

        return tx;
    }

    // ========================================================================
    // CHUYỂN KHOẢN NAPAS 24/7 (20 NGÂN HÀNG TRUYỀN THỐNG)
    // ========================================================================
    executeTransfer(user, targetBankId, accountNumber, recipientName, amount, message) {
        const targetBank = BANKS_DATA.find(b => b.id === targetBankId) || {
            name: 'Ngân hàng thụ hưởng',
            shortName: targetBankId.toUpperCase(),
            code: targetBankId.toUpperCase()
        };

        if (amount <= 0) {
            throw new Error("Số tiền chuyển khoản phải lớn hơn 0 đ!");
        }

        if (amount > user.availableBalance) {
            const savingsStats = savingsManager ? savingsManager.calculateGlobalStats() : { totalPrincipalLocked: 0 };
            let errMsg = `Số dư khả dụng của bạn (${user.availableBalance.toLocaleString('vi-VN')} đ) không đủ để chuyển ${amount.toLocaleString('vi-VN')} đ.`;
            if (savingsStats.totalPrincipalLocked > 0) {
                errMsg += `\n\n💡 Bạn hiện đang có ${savingsStats.totalPrincipalLocked.toLocaleString('vi-VN')} đ gửi trong sổ tiết kiệm. Hãy bấm "Rút tiền tiết kiệm" để chuyển số tiền đó về tài khoản khả dụng trước khi chuyển đi nhé!`;
            }
            throw new Error(errMsg);
        }

        // Trừ tiền khỏi số dư khả dụng
        user.availableBalance -= amount;

        const tx = this.addTransaction({
            type: 'TRANSFER_OUT',
            title: `Chuyển tiền tới ${recipientName.toUpperCase()}`,
            description: message || `Chuyển tiền nhanh 247 tới ${targetBank.shortName} - STK: ${accountNumber}`,
            bankName: targetBank.shortName,
            bankFullName: targetBank.name,
            accountNumber: accountNumber,
            recipient: recipientName.toUpperCase(),
            sender: user.accountName,
            amount: -amount,
            fee: 0,
            referenceCode: 'FT' + Date.now().toString().substring(3)
        });

        // Đồng bộ số dư lên server Core Wallet nếu có
        this.syncBalanceToCoreWallet(user.accountNumber, user.availableBalance);

        return tx;
    }

    // Nạp tiền demo nhanh
    topUp(user, amount, note = 'Nạp tiền trải nghiệm nhanh') {
        if (amount <= 0) throw new Error("Số tiền nạp không hợp lệ!");
        user.availableBalance += amount;

        const tx = this.addTransaction({
            type: 'TOPUP',
            title: 'Nạp tiền vào tài khoản',
            description: note,
            amount: amount,
            fee: 0,
            sender: 'CỔNG THANH TOÁN TỰ ĐỘNG',
            recipient: user.accountName,
            referenceCode: 'TOP' + Date.now().toString().substring(4)
        });

        this.syncBalanceToCoreWallet(user.accountNumber, user.availableBalance);

        return tx;
    }

    // Đồng bộ số dư lên server Core Wallet
    async syncBalanceToCoreWallet(stk, balance) {
        try {
            await fetch(`${CORE_WALLET_CONFIG.apiUrl}/accounts/sync-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stk, balance })
            });
        } catch (e) {
            // silent fail
        }
    }
}

const transferManager = new TransferManager();
