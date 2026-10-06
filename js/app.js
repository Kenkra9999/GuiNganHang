// Main Application Controller for DigiBank Prime 4.0 & Central Payment Gateway Hub
class BankApp {
    constructor() {
        this.user = this.loadUser();
        this.currentTab = 'dashboard';
        this.transferMode = 'CROSS_WEB'; // 'CROSS_WEB' hoặc 'NAPAS_BANK'
        this.selectedBankForDeposit = null;
        this.selectedBankForTransfer = null;
        this.activeFilter = 'ALL';
        this.txFilter = 'ALL';
        this.searchQuery = '';
        this.isSoundEnabled = true;
        this.socket = null;
        this.lookupDebounceTimer = null;
        this.withdrawLookupTimer = null;
        this.verifiedReceiver = null;
        this.verifiedWithdrawAccount = null;

        this.init();
    }

    loadUser() {
        const saved = localStorage.getItem('digibank_user');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (!parsed.accountNumber || parsed.accountNumber.length !== 12 || !parsed.accountNumber.startsWith('W')) {
                    parsed.accountNumber = DEFAULT_USER.accountNumber;
                    parsed.webCode = DEFAULT_USER.webCode;
                    parsed.originWeb = DEFAULT_USER.originWeb;
                }
                return parsed;
            } catch (e) {
                console.error("Lỗi đọc dữ liệu người dùng:", e);
            }
        }
        this.saveUser(DEFAULT_USER);
        return { ...DEFAULT_USER };
    }

    saveUser(user = this.user) {
        localStorage.setItem('digibank_user', JSON.stringify(user));
    }

    resetAllData() {
        if (confirm("Bạn có chắc chắn muốn đặt lại dữ liệu ứng dụng về mặc định (100.000.000 đ)?")) {
            localStorage.removeItem('digibank_user');
            localStorage.removeItem('digibank_deposits');
            localStorage.removeItem('digibank_transactions');
            this.showToast("Đã khởi tạo lại dữ liệu thành công!", "success");
            
            try {
                fetch(`${CORE_WALLET_CONFIG.apiUrl}/accounts/reset`, { method: 'POST' }).catch(() => {});
            } catch (e) {}

            setTimeout(() => {
                window.location.reload();
            }, 600);
        }
    }

    init() {
        this.bindEvents();
        this.renderBankList();
        this.renderTransferBankSelect();
        this.renderEcosystemQuickPicker();
        this.updateHeaderBalances();
        this.renderTransactions();
        this.startClock();
        this.initSocket();

        // 2) Khởi tạo kết nối Universal SDK với Central Payment Gateway Hub (port 9000)
        if (window.PaymentSDK) {
            PaymentSDK.init({
                hubUrl: 'http://localhost:9000',
                appId: 'DIGIBANK_PRIME_W03'
            });
        }

        // Subscribe to Savings Engine realtime ticks
        savingsManager.subscribe((deposits, stats) => {
            this.onRealtimeTick(deposits, stats);
        });

        // Init Chart.js after DOM load
        setTimeout(() => {
            if (window.analyticsManager) {
                const stats = savingsManager.calculateGlobalStats();
                analyticsManager.initCharts(this.user, stats);
            }
        }, 300);
    }

    // ========================================================================
    // 3) TÍNH NĂNG NẠP TIỀN VIETQR REALTIME 24/7 (PAYMENT GATEWAY HUB SDK)
    // ========================================================================

    openDepositModalPrompt() {
        const modal = document.getElementById('depositPromptModal');
        if (modal) {
            modal.classList.remove('hidden');
            const customInput = document.getElementById('depositPromptCustomInput');
            if (customInput) customInput.value = (500000).toLocaleString('vi-VN');
            soundManager.playClick();
        }
    }

    closeDepositPromptModal() {
        const modal = document.getElementById('depositPromptModal');
        if (modal) modal.classList.add('hidden');
    }

    setDepositPromptAmount(amount) {
        const input = document.getElementById('depositPromptCustomInput');
        if (input) input.value = amount.toLocaleString('vi-VN');
    }

    confirmOpenDepositSdk() {
        const input = document.getElementById('depositPromptCustomInput');
        const rawAmount = input ? input.value.replace(/\D/g, '') : '500000';
        const amount = parseFloat(rawAmount) || 500000;

        this.closeDepositPromptModal();

        // Gọi PaymentSDK.openDepositModal theo đúng đặc tả mục 3
        if (window.PaymentSDK) {
            PaymentSDK.openDepositModal({
                amount: amount,
                userId: this.user.accountNumber,
                onPaid: (res) => {
                    this.handleDepositSuccess(res);
                }
            });
        } else {
            this.showToast("SDK Cổng thanh toán chưa sẵn sàng!", "error");
        }
    }

    handleDepositSuccess(res) {
        const amount = Number(res.amount || 0);
        this.user.availableBalance += amount;
        this.saveUser();

        // Thêm vào lịch sử giao dịch
        transferManager.addTransaction({
            type: 'TOPUP',
            title: `Nạp tiền VietQR (${res.transferCode || 'VIETQR 24/7'})`,
            description: `Nạp thành công qua Cổng Thanh Toán Trung Tâm VietQR EMVCo`,
            amount: amount,
            fee: 0,
            sender: `CỔNG VIETQR HUB (${res.bankName || 'NAPAS 24/7'})`,
            recipient: this.user.accountName,
            referenceCode: res.transactionId || ('PAY_' + Date.now())
        });

        transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);
        this.updateHeaderBalances();
        this.renderTransactions();

        soundManager.playTingTing();
        this.triggerConfetti();

        this.showToast(`🎉 Nạp tiền thành công! +${amount.toLocaleString('vi-VN')} đ đã được cộng vào tài khoản qua VietQR Realtime.`, 'success', 6000);
    }

    // ========================================================================
    // 4) TÍNH NĂNG RÚT TIỀN NGÂN HÀNG VIỆT NAM (NAPAS 247 LOOKUP & PAYOUT)
    // ========================================================================

    openWithdrawModal() {
        const modal = document.getElementById('withdrawBankModal');
        if (modal) {
            modal.classList.remove('hidden');
            const amountInput = document.getElementById('withdrawAmountInput');
            if (amountInput) amountInput.value = '';
            this.handleWithdrawAccountLookup();
            soundManager.playClick();
        }
    }

    closeWithdrawModal() {
        const modal = document.getElementById('withdrawBankModal');
        if (modal) modal.classList.add('hidden');
    }

    // Tra cứu thông tin số tài khoản Napas 24/7 khi người dùng nhập STK
    handleWithdrawAccountLookup() {
        if (this.withdrawLookupTimer) clearTimeout(this.withdrawLookupTimer);

        this.withdrawLookupTimer = setTimeout(async () => {
            const bankSelect = document.getElementById('withdrawBankSelect');
            const accInput = document.getElementById('withdrawAccInput');
            const spinner = document.getElementById('withdrawLookupSpinner');
            const resultBox = document.getElementById('withdrawLookupResult');
            const submitBtn = document.getElementById('btnSubmitWithdraw');

            const bankCode = bankSelect ? bankSelect.value : '';
            const accNo = accInput ? accInput.value.trim() : '';

            if (!bankCode || accNo.length < 5) {
                if (resultBox) resultBox.classList.add('hidden');
                this.verifiedWithdrawAccount = null;
                return;
            }

            if (spinner) spinner.classList.remove('hidden');

            try {
                // Gọi API tra cứu Napas 24/7 qua PaymentSDK.lookupBank (Mục 4 Đặc tả)
                const data = await PaymentSDK.lookupBank(bankCode, accNo);
                this.verifiedWithdrawAccount = data;

                if (spinner) spinner.classList.add('hidden');
                if (resultBox) {
                    resultBox.classList.remove('hidden');
                    resultBox.innerHTML = `
                        <div class="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between gap-3 animate-pulse-subtle">
                            <div class="flex items-center gap-2.5">
                                <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                    <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                                </div>
                                <div>
                                    <div class="text-[10px] text-slate-400 uppercase font-semibold">Tên Chủ Tài Khoản Thụ Hưởng (Napas 24/7):</div>
                                    <div class="text-sm font-black text-emerald-400 uppercase">${data.ownerName}</div>
                                </div>
                            </div>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-slate-950 uppercase">Đã xác thực</span>
                        </div>
                    `;
                    lucide.createIcons();
                }
                if (submitBtn) submitBtn.disabled = false;
            } catch (err) {
                this.verifiedWithdrawAccount = null;
                if (spinner) spinner.classList.add('hidden');
                if (resultBox) {
                    resultBox.classList.remove('hidden');
                    resultBox.innerHTML = `
                        <div class="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-xs text-red-400 font-semibold flex items-center gap-2">
                            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                            <span>${err.message || 'Không tìm thấy số tài khoản này!'}</span>
                        </div>
                    `;
                    lucide.createIcons();
                }
                if (submitBtn) submitBtn.disabled = true;
            }
        }, 300);
    }

    // Thực hiện gửi lệnh rút tiền qua Napas 24/7
    async executeWithdrawPayout() {
        const bankSelect = document.getElementById('withdrawBankSelect');
        const accInput = document.getElementById('withdrawAccInput');
        const amountInput = document.getElementById('withdrawAmountInput');
        const submitBtn = document.getElementById('btnSubmitWithdraw');
        const btnText = document.getElementById('btnSubmitWithdrawText');

        const bankCode = bankSelect ? bankSelect.value : '';
        const accNo = accInput ? accInput.value.trim() : '';
        const rawAmount = amountInput ? amountInput.value.replace(/\D/g, '') : '';
        const amount = parseFloat(rawAmount);

        if (!bankCode || !accNo) {
            this.showToast("Vui lòng chọn ngân hàng và nhập số tài khoản!", "warning");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            this.showToast("Vui lòng nhập số tiền rút hợp lệ!", "warning");
            return;
        }

        if (amount > this.user.availableBalance) {
            this.showToast(`Số dư khả dụng không đủ! Bạn chỉ còn ${this.user.availableBalance.toLocaleString('vi-VN')} đ.`, "error");
            soundManager.playError();
            return;
        }

        const ownerName = this.verifiedWithdrawAccount?.ownerName || 'CHỦ TÀI KHOẢN';

        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.textContent = "Đang gửi lệnh rút tiền qua Napas 24/7...";

        try {
            // Gọi PaymentSDK.requestPayout (Mục 4 Đặc tả)
            const res = await PaymentSDK.requestPayout({
                bankCode: bankCode,
                accountNumber: accNo,
                accountName: ownerName,
                amount: amount,
                note: `Rut tien tu DigiBank Prime`,
                userId: this.user.accountNumber
            });

            // Trừ tiền khỏi số dư người dùng
            this.user.availableBalance -= amount;
            this.saveUser();

            // Ghi nhận giao dịch
            const tx = transferManager.addTransaction({
                type: 'TRANSFER_OUT',
                title: `Rút tiền về ${bankCode} - ${accNo}`,
                description: `Rút tiền về tài khoản ${ownerName} qua Napas 24/7`,
                bankName: `${bankCode} Bank`,
                accountNumber: accNo,
                recipient: ownerName,
                sender: this.user.accountName,
                amount: -amount,
                fee: 0,
                referenceCode: res.transactionId || ('PO_' + Date.now())
            });

            transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);
            this.updateHeaderBalances();
            this.renderTransactions();
            this.closeWithdrawModal();

            // Hiển thị Biên lai rút tiền thành công
            this.showReceiptModal(tx);

            soundManager.playWithdraw();
            this.triggerConfetti();
            this.showToast(`✅ Rút tiền thành công! -${amount.toLocaleString('vi-VN')} đ đã được chuyển về ngân hàng ${bankCode} (${ownerName})`, 'success', 6000);

        } catch (err) {
            this.showToast(`Lỗi rút tiền: ${err.message}`, 'error');
            soundManager.playError();
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (btnText) btnText.textContent = "Xác Nhận Rút Tiền Realtime 24/7";
        }
    }

    // ========================================================================
    // SOCKET.IO REALTIME & CHUYỂN TIỀN LIÊN WEB
    // ========================================================================

    initSocket() {
        if (typeof io !== 'function') {
            this.updateSocketStatus(false, "Socket.io Chưa Sẵn Sàng");
            return;
        }

        try {
            const socketUrl = CORE_WALLET_CONFIG.socketUrl;
            this.socket = io(socketUrl, {
                auth: { token: CORE_WALLET_CONFIG.appSecretToken },
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 10,
                reconnectionDelay: 2000
            });

            this.socket.on('connect', () => {
                const mySTK = this.user.accountNumber;
                this.socket.emit('JOIN_ACCOUNT_ROOM', mySTK);
                this.updateSocketStatus(true, `Online • Room: ${mySTK}`);
            });

            this.socket.on('ROOM_JOINED', (res) => {
                console.log(`[Socket.io] Đã vào phòng: ${res.stk}`);
            });

            this.socket.on('EVENT_MONEY_RECEIVED', (payload) => {
                this.onMoneyReceived(payload);
            });

            this.socket.on('EVENT_MONEY_DEDUCTED', (payload) => {
                this.onMoneyDeducted(payload);
            });

            this.socket.on('disconnect', (reason) => {
                this.updateSocketStatus(false, "Mất kết nối");
            });

            this.socket.on('connect_error', (err) => {
                this.updateSocketStatus(false, "Đang kết nối lại...");
            });

        } catch (e) {
            this.updateSocketStatus(false, "Lỗi kết nối");
        }
    }

    updateSocketStatus(isConnected, text) {
        const badge = document.getElementById('socketStatusBadge');
        const textEl = document.getElementById('socketStatusText');
        if (!badge || !textEl) return;

        if (isConnected) {
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[11px]";
            textEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-1"></span>Socket.io: ${text}`;
        } else {
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-[11px]";
            textEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 mr-1"></span>Socket.io: ${text}`;
        }
    }

    onMoneyReceived(payload) {
        transferManager.handleIncomingMoney(this.user, payload);
        this.saveUser();
        this.updateHeaderBalances();
        this.renderTransactions();

        soundManager.playTingTing();
        this.triggerConfetti();

        this.showReceivedMoneyModal(payload);
        this.showToast(`🔔 Nhận được +${Number(payload.amount).toLocaleString('vi-VN')} đ từ ${payload.sender_name} (${payload.sender_stk})`, 'success', 6000);
    }

    onMoneyDeducted(payload) {
        if (payload.new_balance !== undefined) {
            this.user.availableBalance = Number(payload.new_balance);
            this.saveUser();
        }
        this.updateHeaderBalances();
        this.renderTransactions();
        this.showToast(`💸 Tài khoản đã bị trừ -${Number(payload.amount).toLocaleString('vi-VN')} đ đến ${payload.receiver_name || payload.receiver_stk}`, 'info', 5000);
    }

    showReceivedMoneyModal(payload) {
        const modal = document.getElementById('receivedMoneyModal');
        if (!modal) return;

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        const amount = Number(payload.amount || 0);
        setText('recvAmountText', `+${amount.toLocaleString('vi-VN')} đ`);
        setText('recvSenderName', payload.sender_name || 'HỆ THỐNG');
        setText('recvSenderStk', payload.sender_stk || 'N/A');
        setText('recvSenderWeb', payload.sender_web || 'Website Hệ Sinh Thái');
        setText('recvNote', payload.note || payload.message || 'Chuyển tiền liên website');
        setText('recvNewBalance', `${this.user.availableBalance.toLocaleString('vi-VN')} đ`);

        modal.classList.remove('hidden');
        lucide.createIcons();
    }

    closeReceivedMoneyModal() {
        const modal = document.getElementById('receivedMoneyModal');
        if (modal) modal.classList.add('hidden');
    }

    copyMyStk() {
        const stk = this.user.accountNumber || 'W03889968688';
        navigator.clipboard.writeText(stk).then(() => {
            this.showToast(`Đã sao chép STK: ${stk}`, 'success', 2500);
        }).catch(() => {
            this.showToast(`STK của bạn: ${stk}`, 'info', 3000);
        });
    }

    renderEcosystemQuickPicker() {
        const container = document.getElementById('ecosystemQuickPickerContainer');
        if (!container) return;

        const otherAccounts = ECOSYSTEM_ACCOUNTS.filter(a => a.stk !== this.user.accountNumber);

        container.innerHTML = otherAccounts.map(acc => `
            <div onclick="app.fillQuickTransfer('${acc.stk}')" class="cursor-pointer p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 flex items-center justify-between gap-2 transition group">
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center ${acc.badgeColor} text-xs font-bold">
                        <i data-lucide="${acc.icon || 'globe'}" class="w-3.5 h-3.5"></i>
                    </div>
                    <div>
                        <div class="text-xs font-bold text-white group-hover:text-emerald-400 transition">${acc.owner_name}</div>
                        <div class="text-[10px] text-slate-400">${acc.origin_web}</div>
                    </div>
                </div>
                <span class="text-[11px] font-mono text-amber-400 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                    ${acc.stk}
                </span>
            </div>
        `).join('');

        lucide.createIcons();
    }

    fillQuickTransfer(stk) {
        this.switchTab('transfer');
        this.switchTransferMode('CROSS_WEB');

        const input = document.getElementById('crossWebStkInput');
        if (input) {
            input.value = stk;
            this.handleStkInputChange(stk);
            soundManager.playClick();
        }
    }

    handleStkInputChange(value) {
        const cleaned = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
        const input = document.getElementById('crossWebStkInput');
        if (input && input.value !== cleaned) {
            input.value = cleaned;
        }

        const counter = document.getElementById('stkCharCounter');
        if (counter) {
            counter.textContent = `${cleaned.length}/12`;
            counter.className = cleaned.length === 12 
                ? 'text-[11px] font-mono text-emerald-400 font-bold' 
                : 'text-[11px] font-mono text-slate-400 font-bold';
        }

        const resultContainer = document.getElementById('lookupResultContainer');

        if (cleaned.length < 12) {
            this.verifiedReceiver = null;
            if (resultContainer) resultContainer.classList.add('hidden');
            return;
        }

        if (cleaned.length === 12) {
            this.triggerStkLookup(cleaned);
        }
    }

    async triggerStkLookup(stk) {
        const spinner = document.getElementById('stkLookupSpinner');
        const resultContainer = document.getElementById('lookupResultContainer');
        const submitBtn = document.getElementById('btnSubmitCrossWebTransfer');

        if (spinner) spinner.classList.remove('hidden');

        try {
            const data = await transferManager.lookupAccount(stk);
            this.verifiedReceiver = data;

            if (spinner) spinner.classList.add('hidden');
            if (resultContainer) {
                resultContainer.classList.remove('hidden');
                resultContainer.innerHTML = `
                    <div class="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between gap-3 animate-pulse-subtle">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold">
                                <i data-lucide="check-circle" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-xs text-slate-400">Người nhận đã định danh:</div>
                                <div class="text-sm font-black text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                                    <span>${data.owner_name}</span>
                                    <span class="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">${data.origin_web}</span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 uppercase">
                                Hợp lệ
                            </span>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }

            if (submitBtn) submitBtn.disabled = false;
            soundManager.playClick();

        } catch (err) {
            this.verifiedReceiver = null;
            if (spinner) spinner.classList.add('hidden');
            if (resultContainer) {
                resultContainer.classList.remove('hidden');
                resultContainer.innerHTML = `
                    <div class="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/50 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center font-bold">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <div class="text-xs text-slate-400">Kết quả tra cứu:</div>
                            <div class="text-xs font-bold text-red-400">
                                ❌ ${err.message || 'Số tài khoản không tồn tại trên hệ thống Ví Trung Tâm'}
                            </div>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }
            if (submitBtn) submitBtn.disabled = true;
            soundManager.playError();
        }
    }

    setCrossWebAmount(amount) {
        const input = document.getElementById('crossWebAmountInput');
        if (input) input.value = amount.toLocaleString('vi-VN');
    }

    async executeCrossWebTransfer() {
        const stkInput = document.getElementById('crossWebStkInput');
        const amountInput = document.getElementById('crossWebAmountInput');
        const noteInput = document.getElementById('crossWebNoteInput');
        const submitBtn = document.getElementById('btnSubmitCrossWebTransfer');
        const btnText = document.getElementById('btnSubmitCrossWebText');

        const receiverStk = stkInput ? stkInput.value.trim().toUpperCase() : '';
        const rawAmount = amountInput ? amountInput.value.replace(/\D/g, '') : '';
        const amount = parseFloat(rawAmount);
        const note = noteInput ? noteInput.value.trim() : '';

        if (!receiverStk || receiverStk.length !== 12) {
            this.showToast("Số tài khoản người nhận phải đúng 12 ký tự!", "warning");
            return;
        }

        if (receiverStk === this.user.accountNumber) {
            this.showToast("Không thể tự chuyển tiền cho chính tài khoản của mình!", "warning");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            this.showToast("Vui lòng nhập số tiền cần chuyển hợp lệ!", "warning");
            return;
        }

        if (amount > this.user.availableBalance) {
            this.showToast(`Số dư khả dụng không đủ! Bạn chỉ còn ${this.user.availableBalance.toLocaleString('vi-VN')} đ.`, "error");
            soundManager.playError();
            return;
        }

        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.textContent = "Đang xử lý chuyển tiền qua Core Wallet...";

        try {
            const res = await transferManager.executeCrossWebTransfer(
                this.user,
                receiverStk,
                amount,
                note || `${this.user.accountName} chuyen tien`
            );

            this.saveUser();
            this.updateHeaderBalances();
            this.renderTransactions();

            if (stkInput) stkInput.value = '';
            if (amountInput) amountInput.value = '';
            if (noteInput) noteInput.value = '';
            this.handleStkInputChange('');

            this.showReceiptModal({
                id: res.transaction_id,
                referenceCode: res.transaction_id,
                amount: amount,
                bankName: (this.verifiedReceiver ? this.verifiedReceiver.origin_web : 'Website Hệ Sinh Thái'),
                accountNumber: res.receiver_stk,
                recipient: res.receiver_name || (this.verifiedReceiver ? this.verifiedReceiver.owner_name : res.receiver_stk),
                sender: this.user.accountName,
                timestamp: Date.now(),
                description: note || `${this.user.accountName} chuyen tien lien website`,
                senderBalanceAfter: res.sender_balance_after !== undefined ? res.sender_balance_after : this.user.availableBalance
            });

            soundManager.playTingTing();
            this.triggerConfetti();

            this.showToast(`✅ Chuyển tiền thành công! Đã trừ: -${amount.toLocaleString('vi-VN')} đ | Đến: ${res.receiver_name} (${res.receiver_stk})`, 'success', 6000);

        } catch (err) {
            this.showToast(`Lỗi: ${err.message}`, 'error', 7000);
            soundManager.playError();
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (btnText) btnText.textContent = "Xác Nhận Chuyển Tiền Liên Website";
        }
    }

    async simulateIncomingTransfer(amount = 50000) {
        const select = document.getElementById('simSenderSelect');
        const senderStk = select ? select.value : 'W01829102948';

        try {
            const res = await fetch(`${CORE_WALLET_CONFIG.apiUrl}/simulate-incoming-transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_stk: senderStk,
                    receiver_stk: this.user.accountNumber,
                    amount: amount,
                    note: 'Thuong thang / Ban do Game qua Core Wallet'
                })
            });

            const data = await res.json();
            if (data.status === 'SUCCESS') {
                this.showToast("⚡ Đã gửi yêu cầu mô phỏng! Socket.io đang phát tín hiệu realtime...", "info", 2000);
            } else {
                throw new Error(data.message);
            }
        } catch (e) {
            const senderAcc = ECOSYSTEM_ACCOUNTS.find(a => a.stk === senderStk) || { owner_name: 'Tran Thi Shop', origin_web: 'Web Shop E-Commerce' };
            this.onMoneyReceived({
                amount: amount,
                sender_stk: senderStk,
                sender_name: senderAcc.owner_name,
                sender_web: senderAcc.origin_web,
                new_balance: this.user.availableBalance + amount,
                message: `Bạn vừa nhận được ${amount.toLocaleString('vi-VN')} đ từ ${senderAcc.owner_name} (STK: ${senderStk})`,
                note: 'Thuong thang / Ban do Game qua Core Wallet',
                transaction_id: 'TX_LOCAL_SIM_' + Date.now(),
                timestamp: Date.now()
            });
        }
    }

    switchTransferMode(mode) {
        this.transferMode = mode;

        const crossSec = document.getElementById('crossWebTransferSection');
        const napasSec = document.getElementById('napasTransferSection');
        const btnCross = document.getElementById('btnTransferModeCrossWeb');
        const btnNapas = document.getElementById('btnTransferModeNapas');

        if (mode === 'CROSS_WEB') {
            if (crossSec) crossSec.classList.remove('hidden');
            if (napasSec) napasSec.classList.add('hidden');
            if (btnCross) {
                btnCross.className = "px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40";
            }
            if (btnNapas) {
                btnNapas.className = "px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-slate-900 text-slate-400 hover:text-white border border-slate-800";
            }
        } else {
            if (crossSec) crossSec.classList.add('hidden');
            if (napasSec) napasSec.classList.remove('hidden');
            if (btnNapas) {
                btnNapas.className = "px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40";
            }
            if (btnCross) {
                btnCross.className = "px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-slate-900 text-slate-400 hover:text-white border border-slate-800";
            }
        }

        soundManager.playClick();
    }

    // ========================================================================
    // CÁC HÀM TIỆN ÍCH & GIAO DIỆN TỔNG QUAN
    // ========================================================================

    onRealtimeTick(deposits, stats) {
        this.updateHeaderBalances(stats);
        this.renderActiveSavings(deposits);
        
        if (window.analyticsManager) {
            analyticsManager.updateData(this.user, stats);
        }
    }

    startClock() {
        const update = () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const clockEl = document.getElementById('liveClock');
            if (clockEl) {
                clockEl.innerHTML = `<span class="text-slate-400 capitalize">${dateStr}</span> <span class="text-amber-400 font-mono font-bold ml-2">${timeStr}</span>`;
            }
        };
        update();
        setInterval(update, 1000);
    }

    updateHeaderBalances(stats = savingsManager.calculateGlobalStats()) {
        const available = this.user.availableBalance || 0;
        const locked = stats.totalPrincipalLocked || 0;
        const liveInterest = stats.totalLiveInterest || 0;
        const totalNetWorth = available + locked + liveInterest;
        const totalProfitSettled = this.user.totalInterestEarned || 0;

        const availEls = document.querySelectorAll('.val-available-balance');
        availEls.forEach(el => el.textContent = available.toLocaleString('vi-VN') + ' đ');

        const lockedEls = document.querySelectorAll('.val-locked-balance');
        lockedEls.forEach(el => el.textContent = locked.toLocaleString('vi-VN') + ' đ');

        const liveEls = document.querySelectorAll('.val-live-interest');
        liveEls.forEach(el => {
            el.textContent = '+' + Math.floor(liveInterest).toLocaleString('vi-VN') + ' đ';
        });

        const profitEls = document.querySelectorAll('.val-total-interest');
        profitEls.forEach(el => el.textContent = Math.floor(totalProfitSettled).toLocaleString('vi-VN') + ' đ');

        const totalEls = document.querySelectorAll('.val-total-networth');
        totalEls.forEach(el => el.textContent = Math.floor(totalNetWorth).toLocaleString('vi-VN') + ' đ');

        const countBadge = document.getElementById('activeSavingsCountBadge');
        if (countBadge) {
            countBadge.textContent = stats.activeCount;
            countBadge.className = stats.activeCount > 0 
                ? 'px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'px-2 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-400';
        }
    }

    switchTab(tabId) {
        this.currentTab = tabId;
        
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            const isTarget = btn.dataset.tab === tabId;
            btn.classList.toggle('active-nav-tab', isTarget);
            btn.classList.toggle('text-white', isTarget);
            btn.classList.toggle('bg-gradient-to-r', isTarget);
            btn.classList.toggle('from-blue-600', isTarget);
            btn.classList.toggle('to-indigo-600', isTarget);
            btn.classList.toggle('text-slate-400', !isTarget);
        });

        document.querySelectorAll('.tab-view-container').forEach(container => {
            container.classList.toggle('hidden', container.id !== `view-${tabId}`);
        });

        if (tabId === 'analytics' && window.analyticsManager) {
            const stats = savingsManager.calculateGlobalStats();
            analyticsManager.initCharts(this.user, stats);
        }

        soundManager.playClick();
    }

    renderBankList() {
        const grid = document.getElementById('banksGridContainer');
        if (!grid) return;

        let filtered = [...BANKS_DATA];
        if (this.activeFilter === 'TOP_RATE') {
            filtered = filtered.filter(b => b.rate >= 1.10).sort((a, b) => b.rate - a.rate);
        } else if (this.activeFilter === 'BIG4') {
            filtered = filtered.filter(b => b.tag === 'Big 4');
        } else if (this.activeFilter === 'HOT') {
            filtered = filtered.filter(b => b.tag === 'Hot' || b.tag === 'Khuyên Dùng' || b.tag === 'Phổ biến');
        }

        if (this.searchQuery) {
            filtered = filtered.filter(b => 
                b.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                b.shortName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                b.code.toLowerCase().includes(this.searchQuery.toLowerCase())
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400">
                    <i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                    <p class="text-base font-medium">Không tìm thấy ngân hàng phù hợp với "${this.searchQuery}"</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        grid.innerHTML = filtered.map(bank => {
            const isTop1 = bank.rate >= 1.20;
            return `
                <div class="bank-card rounded-2xl glass-panel p-5 flex flex-col justify-between border ${isTop1 ? 'border-amber-500/40 glow-gold' : 'border-slate-700/60'} hover:border-blue-500/50">
                    <div>
                        <div class="flex items-start justify-between gap-3 mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg" style="background: linear-gradient(135deg, ${bank.color} 0%, ${bank.accentColor || bank.color} 100%);">
                                    <i data-lucide="${bank.icon}" class="w-6 h-6"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-white text-base leading-tight">${bank.shortName}</h4>
                                    <span class="text-xs text-slate-400 line-clamp-1">${bank.name}</span>
                                </div>
                            </div>
                            <span class="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-md ${bank.badgeColor}">
                                ${bank.badge}
                            </span>
                        </div>

                        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-4">
                            <div class="flex items-baseline justify-between">
                                <span class="text-xs text-slate-400 font-medium">Lãi suất theo phút:</span>
                                <div class="text-right">
                                    <span class="text-2xl font-black text-amber-400 font-mono">${bank.rate.toFixed(2)}%</span>
                                    <span class="text-xs text-slate-400">/ 1 phút</span>
                                </div>
                            </div>
                            <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                                <span>Gửi 10.000.000 đ nhận:</span>
                                <span class="text-emerald-400 font-mono font-semibold">+${((10000000 * bank.rate) / 100).toLocaleString('vi-VN')} đ/phút</span>
                            </div>
                        </div>

                        <p class="text-xs text-slate-400 mb-4 line-clamp-2">${bank.description}</p>
                    </div>

                    <div class="pt-2">
                        <button onclick="app.openDepositModal('${bank.id}')" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 hover:from-amber-400 to-amber-600 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 flex items-center justify-center gap-2 transition-all transform active:scale-95">
                            <i data-lucide="piggy-bank" class="w-4 h-4"></i>
                            Gửi Tiết Kiệm Ngay
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    }

    renderActiveSavings(deposits = savingsManager.deposits) {
        const activeContainer = document.getElementById('activeSavingsContainer');
        const emptyState = document.getElementById('emptySavingsState');
        const tableBody1 = document.getElementById('activeSavingsTableBody');
        const tableBody2 = document.getElementById('activeSavingsTableBody2');
        const countHeader = document.getElementById('activeDepositCount');

        const activeList = deposits.filter(d => d.status === 'ACTIVE');

        if (countHeader) countHeader.textContent = activeList.length;

        if (activeList.length === 0) {
            if (activeContainer) activeContainer.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            if (tableBody1) tableBody1.innerHTML = '';
            if (tableBody2) {
                tableBody2.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-8 text-center text-xs text-slate-400">
                            Chưa có sổ tiết kiệm nào đang hoạt động. Hãy chọn 1 ngân hàng bên dưới để mở sổ ngay!
                        </td>
                    </tr>
                `;
            }
            return;
        }

        if (activeContainer) activeContainer.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        const rowsHtml = activeList.map(dep => {
            const calc = savingsManager.getDepositCalculations(dep);
            return `
                <tr class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <td class="py-4 px-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow" style="background: linear-gradient(135deg, ${dep.bankColor} 0%, ${dep.bankAccent || dep.bankColor} 100%);">
                                <i data-lucide="${dep.bankIcon || 'landmark'}" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="font-bold text-white text-sm">${dep.bankName}</div>
                                <div class="text-[11px] text-slate-500 font-mono">${dep.id}</div>
                            </div>
                        </div>
                    </td>

                    <td class="py-4 px-4 text-right">
                        <div class="font-bold text-white font-mono text-sm">${dep.principal.toLocaleString('vi-VN')} đ</div>
                        <div class="text-[11px] text-amber-400/80 flex items-center justify-end gap-1">
                            <i data-lucide="lock" class="w-3 h-3"></i> Đang khóa gửi
                        </div>
                    </td>

                    <td class="py-4 px-4 text-center">
                        <span class="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-bold text-xs">
                            ${dep.rate.toFixed(2)}%/phút
                        </span>
                        <div class="text-[11px] text-slate-400 mt-1 font-mono">
                            +${Math.floor(calc.interestPerMinute).toLocaleString('vi-VN')} đ/phút
                        </div>
                    </td>

                    <td class="py-4 px-4 text-right">
                        <div class="font-bold text-emerald-400 font-mono text-base live-interest-ticker">
                            +${Math.floor(calc.currentUnclaimedInterest).toLocaleString('vi-VN')} đ
                        </div>
                        <div class="text-[11px] text-slate-400 flex items-center justify-end gap-1">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            <span>Đã tích lũy ${calc.timeFormatted}</span>
                        </div>
                    </td>

                    <td class="py-4 px-4 text-right hidden md:table-cell">
                        <div class="font-bold text-sky-400 font-mono text-sm">
                            ${Math.floor(calc.totalEstimatedPayout).toLocaleString('vi-VN')} đ
                        </div>
                        <div class="text-[10px] text-slate-400">Gốc + Lãi tức thời</div>
                    </td>

                    <td class="py-4 px-4 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="app.claimInterestOnly('${dep.id}')" title="Rút tiền lãi về tài khoản, gốc tiếp tục sinh lời" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition flex items-center gap-1">
                                <i data-lucide="coins" class="w-3.5 h-3.5"></i>
                                Rút Lãi
                            </button>

                            <button onclick="app.confirmWithdrawDeposit('${dep.id}')" title="Rút toàn bộ tiền gốc và lãi về tài khoản khả dụng" class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 hover:from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition flex items-center gap-1.5 transform active:scale-95">
                                <i data-lucide="arrow-down-to-dot" class="w-3.5 h-3.5"></i>
                                Rút Tất Cả
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (tableBody1) tableBody1.innerHTML = rowsHtml;
        if (tableBody2) tableBody2.innerHTML = rowsHtml;

        lucide.createIcons();
    }

    openDepositModal(bankId) {
        const bank = BANKS_DATA.find(b => b.id === bankId);
        if (!bank) return;

        this.selectedBankForDeposit = bank;

        const modal = document.getElementById('depositModal');
        const bankNameEl = document.getElementById('depModalBankName');
        const bankRateEl = document.getElementById('depModalBankRate');
        const bankLogoEl = document.getElementById('depModalBankLogo');
        const availBalEl = document.getElementById('depModalAvailBalance');
        const amountInput = document.getElementById('depositAmountInput');

        if (bankNameEl) bankNameEl.textContent = bank.shortName + ' - ' + bank.name;
        if (bankRateEl) bankRateEl.textContent = `${bank.rate.toFixed(2)}% / phút`;
        if (availBalEl) availBalEl.textContent = this.user.availableBalance.toLocaleString('vi-VN') + ' đ';

        if (bankLogoEl) {
            bankLogoEl.style.background = `linear-gradient(135deg, ${bank.color} 0%, ${bank.accentColor || bank.color} 100%)`;
            bankLogoEl.innerHTML = `<i data-lucide="${bank.icon}" class="w-6 h-6 text-white"></i>`;
        }

        if (amountInput) {
            amountInput.value = '';
            this.calculateDepositProfit(0);
        }

        modal.classList.remove('hidden');
        lucide.createIcons();
        soundManager.playClick();
    }

    closeDepositModal() {
        document.getElementById('depositModal').classList.add('hidden');
        this.selectedBankForDeposit = null;
    }

    calculateDepositProfit(amount) {
        if (!this.selectedBankForDeposit) return;

        const rate = this.selectedBankForDeposit.rate; // %/phút
        const rateDecimal = rate / 100;
        
        const p1m = amount * rateDecimal;
        const p5m = amount * rateDecimal * 5;
        const p15m = amount * rateDecimal * 15;
        const p60m = amount * rateDecimal * 60;
        const p24h = amount * rateDecimal * 60 * 24;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = '+' + Math.floor(val).toLocaleString('vi-VN') + ' đ';
        };

        setVal('proj1m', p1m);
        setVal('proj5m', p5m);
        setVal('proj15m', p15m);
        setVal('proj60m', p60m);
        setVal('proj24h', p24h);
    }

    setDepositAmountQuick(percentage) {
        const amount = Math.floor(this.user.availableBalance * (percentage / 100));
        const input = document.getElementById('depositAmountInput');
        if (input) {
            input.value = amount.toLocaleString('vi-VN');
            this.calculateDepositProfit(amount);
        }
    }

    executeDeposit() {
        if (!this.selectedBankForDeposit) return;

        const input = document.getElementById('depositAmountInput');
        const amount = parseFloat(input.value.replace(/\D/g, ''));

        if (isNaN(amount) || amount <= 0) {
            this.showToast('Vui lòng nhập số tiền gửi hợp lệ!', 'error');
            soundManager.playError();
            return;
        }

        if (amount > this.user.availableBalance) {
            this.showToast(`Số dư khả dụng không đủ! Bạn chỉ còn ${this.user.availableBalance.toLocaleString('vi-VN')} đ.`, 'error');
            soundManager.playError();
            return;
        }

        if (amount < (this.selectedBankForDeposit.minDeposit || 100000)) {
            this.showToast(`Số tiền gửi tối thiểu là ${(this.selectedBankForDeposit.minDeposit || 100000).toLocaleString('vi-VN')} đ`, 'warning');
            soundManager.playError();
            return;
        }

        try {
            const newDep = savingsManager.openDeposit(this.selectedBankForDeposit.id, amount);
            this.user.availableBalance -= amount;
            this.saveUser();

            transferManager.addTransaction({
                type: 'SAVINGS_OPEN',
                title: `Gửi tiết kiệm ${this.selectedBankForDeposit.shortName}`,
                description: `Mở sổ tiết kiệm lãi suất ${this.selectedBankForDeposit.rate.toFixed(2)}%/phút`,
                bankName: this.selectedBankForDeposit.shortName,
                amount: -amount,
                fee: 0,
                sender: this.user.accountName,
                recipient: `SỔ TIẾT KIỆM ${newDep.id}`,
                referenceCode: newDep.id
            });

            transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);

            this.closeDepositModal();
            this.updateHeaderBalances();
            this.renderTransactions();
            
            soundManager.playCashRegister();
            this.triggerConfetti();

            this.showToast(`Gửi tiết kiệm thành công ${amount.toLocaleString('vi-VN')} đ tại ${this.selectedBankForDeposit.shortName}! Tiền lãi ${this.selectedBankForDeposit.rate.toFixed(2)}%/phút đang nhảy liên tục.`, 'success');
        } catch (e) {
            this.showToast(e.message, 'error');
            soundManager.playError();
        }
    }

    claimInterestOnly(depositId) {
        try {
            const res = savingsManager.claimInterestOnly(depositId);
            const claimed = res.interestAmount;

            this.user.availableBalance += claimed;
            this.user.totalInterestEarned = (this.user.totalInterestEarned || 0) + claimed;
            this.saveUser();

            transferManager.addTransaction({
                type: 'INTEREST_CLAIM',
                title: `Nhận tiền lãi từ ${res.deposit.bankName}`,
                description: `Rút tiền lãi tích lũy sổ ${res.deposit.id}`,
                bankName: res.deposit.bankName,
                amount: claimed,
                fee: 0,
                sender: res.deposit.bankName,
                recipient: this.user.accountName,
                referenceCode: 'INT' + Date.now().toString().substring(4)
            });

            transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);

            this.updateHeaderBalances();
            this.renderTransactions();

            soundManager.playTingTing();
            this.showToast(`Đã rút thành công +${Math.floor(claimed).toLocaleString('vi-VN')} đ tiền lãi về tài khoản khả dụng!`, 'success');
        } catch (e) {
            this.showToast(e.message, 'error');
            soundManager.playError();
        }
    }

    confirmWithdrawDeposit(depositId) {
        const dep = savingsManager.deposits.find(d => d.id === depositId);
        if (!dep) return;

        const calc = savingsManager.getDepositCalculations(dep);
        const confirmMsg = `Bạn có chắc muốn rút toàn bộ sổ tiết kiệm tại ${dep.bankName}?\n\n- Tiền gốc hoàn trả: ${dep.principal.toLocaleString('vi-VN')} đ\n- Tiền lãi nhận được: +${Math.floor(calc.currentUnclaimedInterest).toLocaleString('vi-VN')} đ\n👉 TỔNG TIỀN VỀ TÀI KHOẢN: ${Math.floor(calc.totalEstimatedPayout).toLocaleString('vi-VN')} đ`;

        if (confirm(confirmMsg)) {
            try {
                const res = savingsManager.withdrawDeposit(depositId);
                
                this.user.availableBalance += res.totalPayout;
                this.user.totalInterestEarned = (this.user.totalInterestEarned || 0) + res.interestReturned;
                this.saveUser();

                transferManager.addTransaction({
                    type: 'SAVINGS_WITHDRAW',
                    title: `Tất toán sổ tiết kiệm ${res.deposit.bankName}`,
                    description: `Rút toàn bộ gốc (${res.principalReturned.toLocaleString('vi-VN')} đ) + lãi (${Math.floor(res.interestReturned).toLocaleString('vi-VN')} đ)`,
                    bankName: res.deposit.bankName,
                    amount: res.totalPayout,
                    fee: 0,
                    sender: `SỔ TIẾT KIỆM ${res.deposit.id}`,
                    recipient: this.user.accountName,
                    referenceCode: 'WD' + Date.now().toString().substring(4)
                });

                transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);

                this.updateHeaderBalances();
                this.renderTransactions();

                soundManager.playWithdraw();
                this.triggerConfetti();

                this.showToast(`Rút toàn bộ thành công! +${Math.floor(res.totalPayout).toLocaleString('vi-VN')} đ đã về số dư khả dụng!`, 'success');
            } catch (e) {
                this.showToast(e.message, 'error');
                soundManager.playError();
            }
        }
    }

    withdrawAllDeposits() {
        const stats = savingsManager.calculateGlobalStats();
        if (stats.activeCount === 0) {
            this.showToast("Bạn không có sổ tiết kiệm nào đang hoạt động!", "info");
            return;
        }

        const confirmMsg = `Bạn muốn rút TOÀN BỘ ${stats.activeCount} sổ tiết kiệm?\n\n- Tổng tiền gốc: ${stats.totalPrincipalLocked.toLocaleString('vi-VN')} đ\n- Tổng tiền lãi: +${Math.floor(stats.totalLiveInterest).toLocaleString('vi-VN')} đ\n👉 TỔNG TIỀN VỀ SỐ DƯ: ${(stats.totalPrincipalLocked + Math.floor(stats.totalLiveInterest)).toLocaleString('vi-VN')} đ`;

        if (confirm(confirmMsg)) {
            try {
                const res = savingsManager.withdrawAll();
                
                this.user.availableBalance += res.totalPayout;
                this.user.totalInterestEarned = (this.user.totalInterestEarned || 0) + res.totalInterest;
                this.saveUser();

                transferManager.addTransaction({
                    type: 'SAVINGS_WITHDRAW',
                    title: `Tất toán toàn bộ ${res.count} sổ tiết kiệm`,
                    description: `Thu hồi toàn bộ ${res.count} sổ tiết kiệm về tài khoản chính`,
                    amount: res.totalPayout,
                    fee: 0,
                    sender: 'DIGIBANK SAVINGS CENTER',
                    recipient: this.user.accountName,
                    referenceCode: 'WDALL' + Date.now().toString().substring(4)
                });

                transferManager.syncBalanceToCoreWallet(this.user.accountNumber, this.user.availableBalance);

                this.updateHeaderBalances();
                this.renderTransactions();

                soundManager.playWithdraw();
                this.triggerConfetti();

                this.showToast(`Đã thu hồi toàn bộ ${res.count} sổ tiết kiệm với tổng số tiền +${Math.floor(res.totalPayout).toLocaleString('vi-VN')} đ!`, 'success');
            } catch (e) {
                this.showToast(e.message, 'error');
                soundManager.playError();
            }
        }
    }

    renderTransferBankSelect() {
        const select = document.getElementById('transferBankSelect');
        if (!select) return;

        select.innerHTML = `
            <option value="" disabled selected>-- Chọn ngân hàng thụ hưởng (20 Ngân Hàng) --</option>
            ${BANKS_DATA.map(bank => `
                <option value="${bank.id}">${bank.shortName} - ${bank.name}</option>
            `).join('')}
        `;
    }

    executeTransfer() {
        const bankSelect = document.getElementById('transferBankSelect');
        const accInput = document.getElementById('transferAccInput');
        const nameInput = document.getElementById('transferNameInput');
        const amountInput = document.getElementById('transferAmountInput');
        const msgInput = document.getElementById('transferMsgInput');

        const targetBankId = bankSelect ? bankSelect.value : '';
        const accountNumber = accInput ? accInput.value.trim() : '';
        const recipientName = nameInput ? nameInput.value.trim() : '';
        const rawAmount = amountInput ? amountInput.value.replace(/\D/g, '') : '';
        const amount = parseFloat(rawAmount);
        const message = msgInput ? msgInput.value.trim() : '';

        if (!targetBankId) {
            this.showToast("Vui lòng chọn ngân hàng thụ hưởng!", "warning");
            return;
        }

        if (!accountNumber || accountNumber.length < 5) {
            this.showToast("Vui lòng nhập số tài khoản hợp lệ!", "warning");
            return;
        }

        if (!recipientName) {
            this.showToast("Vui lòng nhập tên người nhận!", "warning");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            this.showToast("Vui lòng nhập số tiền chuyển hợp lệ!", "warning");
            return;
        }

        try {
            const tx = transferManager.executeTransfer(
                this.user,
                targetBankId,
                accountNumber,
                recipientName,
                amount,
                message
            );

            this.saveUser();
            this.updateHeaderBalances();
            this.renderTransactions();

            if (accInput) accInput.value = '';
            if (nameInput) nameInput.value = '';
            if (amountInput) amountInput.value = '';
            if (msgInput) msgInput.value = '';

            this.showReceiptModal(tx);

            soundManager.playTingTing();
            this.showToast(`Chuyển tiền thành công ${amount.toLocaleString('vi-VN')} đ tới ${recipientName.toUpperCase()}!`, 'success');
        } catch (e) {
            this.showToast(e.message, 'error', 7000);
            soundManager.playError();
        }
    }

    showReceiptModal(tx) {
        const modal = document.getElementById('receiptModal');
        if (!modal) return;

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setText('rcptTxId', tx.id || tx.referenceCode);
        setText('rcptAmount', Math.abs(tx.amount).toLocaleString('vi-VN') + ' VNĐ');
        setText('rcptBank', tx.bankName || 'Website Hệ Sinh Thái');
        setText('rcptAccount', tx.accountNumber || tx.receiver_stk);
        setText('rcptRecipient', tx.recipient || tx.receiver_name);
        setText('rcptSender', tx.sender || this.user.accountName);
        setText('rcptTime', new Date(tx.timestamp || Date.now()).toLocaleString('vi-VN'));
        setText('rcptMsg', tx.description || tx.note || 'Giao dich thanh cong');
        setText('rcptBalanceAfter', `${(tx.senderBalanceAfter !== undefined ? tx.senderBalanceAfter : this.user.availableBalance).toLocaleString('vi-VN')} đ`);

        modal.classList.remove('hidden');
        lucide.createIcons();
    }

    closeReceiptModal() {
        document.getElementById('receiptModal').classList.add('hidden');
    }

    renderTransactions() {
        const tbody = document.getElementById('transactionTableBody');
        const emptyEl = document.getElementById('emptyTransactionState');
        if (!tbody) return;

        const txs = transferManager.getTransactions(this.txFilter, this.txSearchQuery || '');

        if (txs.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');

        tbody.innerHTML = txs.map(tx => {
            const isPositive = tx.amount > 0;
            const typeBadge = this.getTxTypeBadge(tx.type);
            const dateStr = new Date(tx.timestamp).toLocaleString('vi-VN');

            return `
                <tr class="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td class="py-3 px-4">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl flex items-center justify-center ${isPositive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">
                                <i data-lucide="${isPositive ? 'arrow-down-left' : 'arrow-up-right'}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <div class="font-bold text-white text-sm">${tx.title}</div>
                                <div class="text-[11px] text-slate-400 line-clamp-1">${tx.description}</div>
                            </div>
                        </div>
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${typeBadge}
                    </td>
                    <td class="py-3 px-4 text-right font-mono font-bold text-sm ${isPositive ? 'text-emerald-400' : 'text-slate-300'}">
                        ${isPositive ? '+' : ''}${tx.amount.toLocaleString('vi-VN')} đ
                    </td>
                    <td class="py-3 px-4 text-center text-xs text-slate-400 font-mono hidden sm:table-cell">
                        ${dateStr}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Thành công
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();
    }

    getTxTypeBadge(type) {
        switch (type) {
            case 'TRANSFER_IN':
                return '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">Nhận Liên Web (+)</span>';
            case 'TRANSFER_OUT':
                return '<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[11px] font-bold">Chuyển / Rút (-)</span>';
            case 'SAVINGS_OPEN':
                return '<span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-semibold">Gửi Tiết Kiệm</span>';
            case 'SAVINGS_WITHDRAW':
                return '<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">Tất Toán Gốc+Lãi</span>';
            case 'INTEREST_CLAIM':
                return '<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">Nhận Tiền Lãi</span>';
            case 'TOPUP':
                return '<span class="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[11px] font-semibold">Nạp VietQR</span>';
            default:
                return '<span class="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-[11px]">Giao Dịch</span>';
        }
    }

    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item flex items-start gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-xl max-w-md ${
            type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-white' :
            type === 'error' ? 'bg-red-950/90 border-red-500/50 text-white' :
            type === 'warning' ? 'bg-amber-950/90 border-amber-500/50 text-white' :
            'bg-slate-900/90 border-slate-700 text-white'
        }`;

        const iconMap = {
            success: 'check-circle-2',
            error: 'alert-triangle',
            warning: 'alert-circle',
            info: 'info'
        };

        toast.innerHTML = `
            <i data-lucide="${iconMap[type] || 'bell'}" class="w-5 h-5 flex-shrink-0 mt-0.5 ${
                type === 'success' ? 'text-emerald-400' :
                type === 'error' ? 'text-red-400' :
                type === 'warning' ? 'text-amber-400' : 'text-blue-400'
            }"></i>
            <div class="flex-1 text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-line">${message}</div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        `;

        container.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    triggerConfetti() {
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 80,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10b981', '#f59e0b', '#3b82f6', '#ec4899']
            });
        }
    }

    toggleSound() {
        this.isSoundEnabled = soundManager.toggleSound();
        const icon = document.getElementById('soundToggleIcon');
        if (icon) {
            icon.setAttribute('data-lucide', this.isSoundEnabled ? 'volume-2' : 'volume-x');
            lucide.createIcons();
        }
        this.showToast(this.isSoundEnabled ? 'Đã bật âm thanh ngân hàng' : 'Đã tắt âm thanh', 'info', 2000);
    }

    bindEvents() {
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        const searchInput = document.getElementById('bankSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim();
                this.renderBankList();
            });
        }

        document.querySelectorAll('.bank-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.bank-filter-btn').forEach(b => {
                    b.classList.remove('bg-amber-500', 'text-slate-950', 'font-bold');
                    b.classList.add('bg-slate-800', 'text-slate-300');
                });
                btn.classList.remove('bg-slate-800', 'text-slate-300');
                btn.classList.add('bg-amber-500', 'text-slate-950', 'font-bold');

                this.activeFilter = btn.dataset.filter;
                this.renderBankList();
            });
        });

        const depInput = document.getElementById('depositAmountInput');
        if (depInput) {
            depInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value.replace(/\D/g, '')) || 0;
                this.calculateDepositProfit(val);
            });
        }

        const crossStkInput = document.getElementById('crossWebStkInput');
        if (crossStkInput) {
            crossStkInput.addEventListener('input', (e) => {
                this.handleStkInputChange(e.target.value);
            });
        }

        document.querySelectorAll('.tx-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tx-filter-btn').forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white');
                    b.classList.add('bg-slate-800', 'text-slate-400');
                });
                btn.classList.remove('bg-slate-800', 'text-slate-400');
                btn.classList.add('bg-blue-600', 'text-white');

                this.txFilter = btn.dataset.txFilter;
                this.renderTransactions();
            });
        });

        const txSearchInput = document.getElementById('txSearchInput');
        if (txSearchInput) {
            txSearchInput.addEventListener('input', (e) => {
                this.txSearchQuery = e.target.value.trim();
                this.renderTransactions();
            });
        }
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new BankApp();
    lucide.createIcons();
});
