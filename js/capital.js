// ============================================================================
// DIGIBANK PRIME - QUẢN LÝ KHO VỐN & SÀN TÍN DỤNG P2P (CAPITAL DESK 4.0)
// ============================================================================
// Hỗ trợ:
// 1. Luân chuyển vốn siêu tốc giữa Ví Chính và Kho Tín Dụng Cho Vay.
// 2. Tiếp nhận hồ sơ vay vốn từ Doanh nghiệp & Cá nhân thời gian thực (Lãi 1.5% - 4.0%/phút).
// 3. Khách hàng trả nợ theo chu kỳ 20 giây / 1 kỳ (từ 6 đến 20 kỳ).
// 4. Thu nợ từng kỳ hoặc thu nợ tất cả kỳ đã đến hạn.
// 5. Tiếp nhận khách gửi thêm vốn vào ngân hàng (Lãi 0.5% - 2.0%/phút), trả lãi theo kỳ hoặc tất toán ngay.
// 6. AI Auto-Pilot Banker: Tự động phân tích, duyệt vay, nhận vốn và thu hồi nợ tự động theo hạn mức.
// ============================================================================

class CapitalManager {
    constructor() {
        this.treasuryBalance = 0; // Vốn khả dụng trong kho tín dụng
        this.pendingLoanRequests = []; // Hồ sơ xin vay chờ duyệt
        this.activeLoans = []; // Khoản vay đang hoạt động trả nợ mỗi 20s
        this.completedLoans = []; // Lịch sử khoản vay đã tất toán
        this.pendingDepositOffers = []; // Đơn khách muốn gửi vốn vào ngân hàng
        this.activeDeposits = []; // Các khoản tiền gửi khách đang để tại ngân hàng
        this.completedDeposits = []; // Lịch sử tiền gửi đã thanh toán

        this.totalLendingProfit = 0; // Tổng lợi nhuận từ lãi cho vay đã thu
        this.totalDepositInterestPaid = 0; // Tổng tiền lãi đã trả cho khách gửi vốn

        this.aiConfig = {
            enabled: false,
            loanRate: 2.80, // Lãi suất AI áp dụng khi cho vay (%/phút, 1.5 - 4.0)
            maxLoanAmount: 150000000, // Hạn mức tối đa 1 khoản vay AI được duyệt (VNĐ)
            depositRate: 0.80, // Lãi suất AI trả cho khách gửi vốn (%/phút, 0.5 - 2.0)
            autoCollect: true // Tự động thu nợ khi đến hạn kỳ 20s
        };

        this.aiLogs = []; // Nhật ký hoạt động thời gian thực của AI
        this.marketTimer = null;
        this.clockTimer = null;
        this.lastSpawnTime = Date.now();

        this.listeners = [];
        this.loadState();
        this.startEngine();
    }

    // Đăng ký listener để cập nhật giao diện thời gian thực
    subscribe(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        const stats = this.getSummaryStats();
        this.listeners.forEach(cb => {
            try { cb(stats); } catch (e) { console.error('Capital listener error:', e); }
        });
    }

    loadState() {
        try {
            const raw = localStorage.getItem('digibank_capital_state');
            if (raw) {
                const data = JSON.parse(raw);
                this.treasuryBalance = Number(data.treasuryBalance || 0);
                this.pendingLoanRequests = Array.isArray(data.pendingLoanRequests) ? data.pendingLoanRequests : [];
                this.activeLoans = Array.isArray(data.activeLoans) ? data.activeLoans : [];
                this.completedLoans = Array.isArray(data.completedLoans) ? data.completedLoans : [];
                this.pendingDepositOffers = Array.isArray(data.pendingDepositOffers) ? data.pendingDepositOffers : [];
                this.activeDeposits = Array.isArray(data.activeDeposits) ? data.activeDeposits : [];
                this.completedDeposits = Array.isArray(data.completedDeposits) ? data.completedDeposits : [];
                this.totalLendingProfit = Number(data.totalLendingProfit || 0);
                this.totalDepositInterestPaid = Number(data.totalDepositInterestPaid || 0);
                if (data.aiConfig) {
                    this.aiConfig = { ...this.aiConfig, ...data.aiConfig };
                }
                this.aiLogs = Array.isArray(data.aiLogs) ? data.aiLogs : [];
            }
        } catch (e) {
            console.error('Lỗi nạp trạng thái CapitalManager:', e);
        }

        // Tạo sẵn các hồ sơ mẫu ban đầu nếu danh sách đang trống để trải nghiệm ngay
        if (this.pendingLoanRequests.length === 0) {
            this.generateInitialMarketData();
        }
    }

    saveState() {
        try {
            const data = {
                treasuryBalance: this.treasuryBalance,
                pendingLoanRequests: this.pendingLoanRequests,
                activeLoans: this.activeLoans,
                completedLoans: this.completedLoans,
                pendingDepositOffers: this.pendingDepositOffers,
                activeDeposits: this.activeDeposits,
                completedDeposits: this.completedDeposits,
                totalLendingProfit: this.totalLendingProfit,
                totalDepositInterestPaid: this.totalDepositInterestPaid,
                aiConfig: this.aiConfig,
                aiLogs: this.aiLogs.slice(0, 30)
            };
            localStorage.setItem('digibank_capital_state', JSON.stringify(data));
        } catch (e) {
            console.error('Lỗi lưu trạng thái CapitalManager:', e);
        }
    }

    // ========================================================================
    // TÍNH TOÁN CHỈ SỐ TOÀN CẢNH KHO TÍN DỤNG (CAPITAL TREASURY KPIS)
    // ========================================================================

    getSummaryStats() {
        let totalActiveLoansCapital = 0;
        let totalRemainingPrincipalToCollect = 0;
        let totalMaturedDueAmount = 0; // Tiền gốc + lãi của các kỳ đã đến hạn mà chưa thu
        let dueInstallmentsCount = 0;
        let projectedPendingInterest = 0; // Lãi sắp thu từ các kỳ pending
        let businessLoansProfit = 0;
        let personalLoansProfit = 0;
        let businessLoansCount = 0;
        let personalLoansCount = 0;
        let totalDisbursedAmount = 0; // Tổng vốn đã giải ngân

        const now = Date.now();

        this.activeLoans.forEach(loan => {
            totalActiveLoansCapital += loan.amount;
            totalDisbursedAmount += loan.amount;
            if (loan.borrowerType === 'BUSINESS') {
                businessLoansCount++;
            } else {
                personalLoansCount++;
            }
            loan.installments.forEach(inst => {
                if (inst.status !== 'COLLECTED') {
                    totalRemainingPrincipalToCollect += inst.principal;
                    projectedPendingInterest += inst.interest;
                }
                if (inst.status === 'COLLECTED') {
                    if (loan.borrowerType === 'BUSINESS') {
                        businessLoansProfit += inst.interest;
                    } else {
                        personalLoansProfit += inst.interest;
                    }
                }
                if (inst.status === 'DUE') {
                    totalMaturedDueAmount += inst.totalAmount;
                    dueInstallmentsCount++;
                }
            });
        });

        this.completedLoans.forEach(loan => {
            totalDisbursedAmount += loan.amount;
            if (loan.borrowerType === 'BUSINESS') {
                businessLoansCount++;
            } else {
                personalLoansCount++;
            }
            loan.installments.forEach(inst => {
                if (inst.status === 'COLLECTED') {
                    if (loan.borrowerType === 'BUSINESS') {
                        businessLoansProfit += inst.interest;
                    } else {
                        personalLoansProfit += inst.interest;
                    }
                }
            });
        });

        let totalDepositsCapitalHeld = 0;
        let projectedPendingDepositInterest = 0;
        let totalDepositsMobilized = 0;

        this.activeDeposits.forEach(dep => {
            const held = (dep.amount - (dep.principalReturned || 0));
            totalDepositsCapitalHeld += held;
            totalDepositsMobilized += dep.amount;
            dep.installments.forEach(inst => {
                if (inst.status !== 'PAID') {
                    projectedPendingDepositInterest += inst.interest;
                }
            });
        });

        this.completedDeposits.forEach(dep => {
            totalDepositsMobilized += dep.amount;
        });

        // Lợi nhuận ròng (Net Interest Margin = Tổng Lãi Vay Đã Thu - Tổng Lãi Đã Trả Khách)
        const netInterestMargin = this.totalLendingProfit - this.totalDepositInterestPaid;

        // Số dư ví chính
        const mainWalletBal = (typeof app !== 'undefined' && app.user) ? (Number(app.user.availableBalance) || 0) : 0;
        // Tổng tài sản hợp nhất sàn vốn + ví chính
        const totalConsolidatedNetWorth = mainWalletBal + this.treasuryBalance + totalActiveLoansCapital - totalDepositsCapitalHeld;
        const totalCapitalDeskAssets = this.treasuryBalance + totalActiveLoansCapital;

        // Tỷ suất sinh lời ROI (%)
        const roi = totalDisbursedAmount > 0 ? ((this.totalLendingProfit / totalDisbursedAmount) * 100).toFixed(2) : '0.00';

        return {
            treasuryBalance: this.treasuryBalance,
            mainWalletBalance: mainWalletBal,
            totalCapitalDeskAssets,
            totalConsolidatedNetWorth,
            totalActiveLoansCapital,
            totalRemainingPrincipalToCollect,
            totalMaturedDueAmount,
            dueInstallmentsCount,
            totalDepositsCapitalHeld,
            totalLendingProfit: this.totalLendingProfit,
            totalDepositInterestPaid: this.totalDepositInterestPaid,
            netInterestMargin,
            projectedPendingInterest,
            projectedPendingDepositInterest,
            projectedNetProfit: projectedPendingInterest - projectedPendingDepositInterest,
            totalDisbursedAmount,
            totalDepositsMobilized,
            businessLoansProfit,
            personalLoansProfit,
            businessLoansCount,
            personalLoansCount,
            roi,
            pendingLoanCount: this.pendingLoanRequests.length,
            pendingDepositCount: this.pendingDepositOffers.length,
            activeLoanCount: this.activeLoans.length,
            activeDepositCount: this.activeDeposits.length,
            completedLoanCount: this.completedLoans.length,
            completedDepositCount: this.completedDeposits.length,
            aiEnabled: this.aiConfig.enabled
        };
    }

    // ========================================================================
    // CỖ MÁY THỜI GIAN THỰC (REALTIME 1-SECOND ENGINE & 20S CYCLE EVALUATION)
    // ========================================================================

    startEngine() {
        if (this.clockTimer) clearInterval(this.clockTimer);

        this.clockTimer = setInterval(() => {
            const now = Date.now();
            let stateChanged = false;
            let newlyMaturedFound = false;

            // 1. Cập nhật các kỳ trả nợ của Khoản Vay (Chu kỳ 20 giây / 1 kỳ)
            this.activeLoans.forEach(loan => {
                loan.installments.forEach(inst => {
                    if (inst.status === 'PENDING' && now >= inst.dueAt) {
                        inst.status = 'DUE'; // Đã đến hạn thu hồi!
                        stateChanged = true;
                        newlyMaturedFound = true;
                    }
                });
            });

            // 2. Cập nhật các kỳ của Khách Gửi Tiết Kiệm (Chu kỳ 20 giây / 1 kỳ)
            this.activeDeposits.forEach(dep => {
                dep.installments.forEach(inst => {
                    if (inst.status === 'PENDING' && now >= inst.dueAt) {
                        inst.status = 'DUE';
                        stateChanged = true;
                    }
                });
            });

            // 3. AI Banker Auto-Pilot tự động xử lý nếu được BẬT
            if (this.aiConfig.enabled) {
                this.runAiBankerCycle();
                stateChanged = true;
            }

            // 4. Sinh ngẫu nhiên hồ sơ thị trường theo chu kỳ thời gian thực (12s - 20s)
            if (now - this.lastSpawnTime >= 15000) {
                this.lastSpawnTime = now;
                this.spawnMarketOpportunity();
                stateChanged = true;
            }

            // 5. Làm sạch hồ sơ quá hạn (hết hạn sau 3 phút)
            const prevLoansLen = this.pendingLoanRequests.length;
            this.pendingLoanRequests = this.pendingLoanRequests.filter(r => (now - r.createdAt) < 180000);
            const prevDepLen = this.pendingDepositOffers.length;
            this.pendingDepositOffers = this.pendingDepositOffers.filter(d => (now - d.createdAt) < 180000);
            if (this.pendingLoanRequests.length !== prevLoansLen || this.pendingDepositOffers.length !== prevDepLen) {
                stateChanged = true;
            }

            if (newlyMaturedFound && typeof soundManager !== 'undefined' && soundManager && !this.aiConfig.enabled) {
                soundManager.playInterestChime();
            }

            if (stateChanged) {
                this.saveState();
            }

            this.notifyListeners();
        }, 1000);
    }

    // ========================================================================
    // AI BANKER AUTO-PILOT EXECUTION
    // ========================================================================

    runAiBankerCycle() {
        let aiActionExecuted = false;

        // 1. AI tự động thu nợ tất cả các kỳ đến hạn (Auto Collect)
        if (this.aiConfig.autoCollect) {
            let totalAutoCollected = 0;
            let countCollected = 0;

            this.activeLoans.forEach(loan => {
                loan.installments.forEach(inst => {
                    if (inst.status === 'DUE') {
                        inst.status = 'COLLECTED';
                        inst.collectedAt = Date.now();
                        this.treasuryBalance += inst.totalAmount;
                        this.totalLendingProfit += inst.interest;
                        totalAutoCollected += inst.totalAmount;
                        countCollected++;
                        aiActionExecuted = true;
                    }
                });

                // Kiểm tra hoàn thành khoản vay
                const remaining = loan.installments.filter(i => i.status !== 'COLLECTED').length;
                if (remaining === 0 && loan.status !== 'COMPLETED') {
                    loan.status = 'COMPLETED';
                    loan.completedAt = Date.now();
                    this.completedLoans.unshift(loan);
                    this.addAiLog(`🏁 Hoàn tất thu hồi toàn bộ vốn & lãi khoản vay của [${loan.borrowerName}] (+${loan.totalAmountToRepay.toLocaleString('vi-VN')} đ)`);
                }
            });

            // Loại bỏ các khoản vay đã xong khỏi active
            this.activeLoans = this.activeLoans.filter(l => l.status === 'ACTIVE');

            if (countCollected > 0) {
                this.addAiLog(`⚡ AI Tự Động Thu Nợ: Thu hồi ${countCollected} kỳ đã đến hạn, nhập kho vốn +${Math.round(totalAutoCollected).toLocaleString('vi-VN')} đ`);
            }
        }

        // 2. AI tự động duyệt hồ sơ vay nếu quỹ đủ tiền và trong hạn mức
        const eligibleLoan = this.pendingLoanRequests.find(r => 
            r.requestedAmount <= this.aiConfig.maxLoanAmount && 
            r.requestedAmount <= this.treasuryBalance
        );

        if (eligibleLoan) {
            try {
                this.approveLoan(eligibleLoan.id, this.aiConfig.loanRate, true);
                aiActionExecuted = true;
            } catch (e) {
                // Quỹ không đủ hoặc lỗi
            }
        }

        // 3. AI tự động nhận đơn gửi vốn của khách để tăng thanh khoản cho ngân hàng
        if (this.pendingDepositOffers.length > 0) {
            const offer = this.pendingDepositOffers[0];
            try {
                this.acceptDeposit(offer.id, this.aiConfig.depositRate, true);
                aiActionExecuted = true;
            } catch (e) {
                // lỗi
            }
        }

        if (aiActionExecuted) {
            this.saveState();
        }
    }

    addAiLog(message) {
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.aiLogs.unshift({
            time: timeStr,
            message: message
        });
        if (this.aiLogs.length > 30) {
            this.aiLogs.pop();
        }
    }

    // ========================================================================
    // LUÂN CHUYỂN TIỀN GIỮA VÍ CHÍNH VÀ KHO TÍN DỤNG
    // ========================================================================

    // Chuyển tiền từ Ví Chính sang Kho Tín Dụng để lấy vốn cho vay
    transferFromMainToTreasury(amount) {
        amount = Math.floor(Number(amount));
        if (isNaN(amount) || amount <= 0) {
            throw new Error("Số tiền nạp vào kho vốn không hợp lệ!");
        }

        if (typeof app === 'undefined' || !app.user) {
            throw new Error("Không tìm thấy thông tin tài khoản ví chính!");
        }

        if (amount > app.user.availableBalance) {
            throw new Error(`Số dư khả dụng ví chính không đủ! Bạn chỉ còn ${app.user.availableBalance.toLocaleString('vi-VN')} đ`);
        }

        // 1. Trừ số dư ví chính
        app.user.availableBalance -= amount;
        app.saveUser();

        // 2. Cộng vào kho tín dụng
        this.treasuryBalance += amount;
        this.saveState();

        // 3. Ghi vào lịch sử giao dịch
        if (typeof transferManager !== 'undefined') {
            transferManager.addTransaction({
                type: 'TREASURY_INJECTION',
                title: 'Nạp Vốn Vào Kho Tín Dụng',
                description: `Bơm thêm ${amount.toLocaleString('vi-VN')} đ vốn cho vay ngân hàng`,
                bankName: 'DigiBank Treasury Pool',
                amount: -amount,
                fee: 0,
                sender: app.user.accountName,
                recipient: 'KHO VỐN CHO VAY (P2P DESK)',
                referenceCode: 'TRS-IN-' + Date.now().toString(36).toUpperCase(),
                status: 'SUCCESS'
            });
            transferManager.syncBalanceToCoreWallet(app.user.accountNumber, app.user.availableBalance);
        }

        if (typeof app !== 'undefined') {
            app.updateHeaderBalances();
            app.renderTransactions();
        }

        this.addAiLog(`💼 Bơm vốn thành công: +${amount.toLocaleString('vi-VN')} đ từ ví chính vào kho quỹ tín dụng.`);
        this.notifyListeners();
        return this.treasuryBalance;
    }

    // Rút tiền khả dụng từ Kho Tín Dụng về lại Ví Chính
    transferFromTreasuryToMain(amount) {
        amount = Math.floor(Number(amount));
        if (isNaN(amount) || amount <= 0) {
            throw new Error("Số tiền rút về ví chính không hợp lệ!");
        }

        if (amount > this.treasuryBalance) {
            throw new Error(`Vốn khả dụng trong kho không đủ! Bạn chỉ còn ${this.treasuryBalance.toLocaleString('vi-VN')} đ`);
        }

        if (typeof app === 'undefined' || !app.user) {
            throw new Error("Không tìm thấy thông tin tài khoản ví chính!");
        }

        // 1. Trừ kho tín dụng
        this.treasuryBalance -= amount;
        this.saveState();

        // 2. Cộng ví chính
        app.user.availableBalance += amount;
        app.saveUser();

        // 3. Ghi vào lịch sử
        if (typeof transferManager !== 'undefined') {
            transferManager.addTransaction({
                type: 'TREASURY_WITHDRAW',
                title: 'Rút Vốn Từ Kho Tín Dụng Về Ví',
                description: `Thu hồi ${amount.toLocaleString('vi-VN')} đ tiền vốn khả dụng về ví cá nhân`,
                bankName: 'DigiBank Treasury Pool',
                amount: amount,
                fee: 0,
                sender: 'KHO VỐN CHO VAY (P2P DESK)',
                recipient: app.user.accountName,
                referenceCode: 'TRS-OUT-' + Date.now().toString(36).toUpperCase(),
                status: 'SUCCESS'
            });
            transferManager.syncBalanceToCoreWallet(app.user.accountNumber, app.user.availableBalance);
        }

        if (typeof app !== 'undefined') {
            app.updateHeaderBalances();
            app.renderTransactions();
        }

        this.addAiLog(`💸 Rút vốn thành công: -${amount.toLocaleString('vi-VN')} đ từ kho quỹ về ví cá nhân.`);
        this.notifyListeners();
        return this.treasuryBalance;
    }

    // ========================================================================
    // NGHIỆP VỤ CHO VAY VỐN (LENDING MANAGEMENT)
    // ========================================================================

    // Duyệt hồ sơ xin vay vốn (Điều chỉnh lãi suất từ 1.5% đến 4.0%/phút)
    approveLoan(requestId, customRate, isByAi = false) {
        const req = this.pendingLoanRequests.find(r => r.id === requestId);
        if (!req) throw new Error("Hồ sơ xin vay không tồn tại hoặc đã hết hạn!");

        const rate = Math.max(1.50, Math.min(4.00, Number(customRate) || req.suggestedRate));

        if (req.requestedAmount > this.treasuryBalance) {
            throw new Error(`Kho vốn không đủ tiền cho vay! Cần ${req.requestedAmount.toLocaleString('vi-VN')} đ, hiện có ${this.treasuryBalance.toLocaleString('vi-VN')} đ. Hãy bơm thêm vốn từ ví chính!`);
        }

        // Trừ vốn kho tín dụng
        this.treasuryBalance -= req.requestedAmount;

        // Xây dựng hợp đồng vay với các kỳ 20 giây
        const term = Math.max(6, Math.min(20, Number(req.termInstallments) || 10));
        const ratePerCycle = (rate / 100) * (20 / 60); // Lãi suất cho chu kỳ 20 giây
        const principalPerInstallment = Math.round(req.requestedAmount / term);
        const interestPerInstallment = Math.round(req.requestedAmount * ratePerCycle);
        const totalInstallmentAmount = principalPerInstallment + interestPerInstallment;
        const totalInterest = interestPerInstallment * term;
        const totalAmountToRepay = req.requestedAmount + totalInterest;

        const now = Date.now();
        const installments = [];
        for (let i = 1; i <= term; i++) {
            installments.push({
                index: i,
                dueAt: now + (i * 20000), // Mỗi 20s trả 1 kỳ
                principal: principalPerInstallment,
                interest: interestPerInstallment,
                totalAmount: totalInstallmentAmount,
                status: 'PENDING',
                collectedAt: null
            });
        }

        const loanContract = {
            id: 'LN-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            borrowerName: req.applicantName,
            borrowerType: req.applicantType,
            businessSector: req.businessSector,
            avatarIcon: req.avatarIcon || 'building-2',
            purpose: req.purpose,
            creditScore: req.creditScore,
            amount: req.requestedAmount,
            rate: rate, // %/phút
            termInstallments: term,
            intervalSec: 20,
            principalPerInstallment,
            interestPerInstallment,
            totalInstallmentAmount,
            totalInterest,
            totalAmountToRepay,
            approvedAt: now,
            status: 'ACTIVE',
            installments: installments
        };

        // Bỏ khỏi hàng chờ, thêm vào active
        this.pendingLoanRequests = this.pendingLoanRequests.filter(r => r.id !== requestId);
        this.activeLoans.unshift(loanContract);

        this.addAiLog(`${isByAi ? '🤖 [AI] ' : '👤 '}Đã duyệt cho vay ${req.requestedAmount.toLocaleString('vi-VN')} đ tới [${req.borrowerName || req.applicantName}] - Lãi: ${rate.toFixed(2)}%/phút (${term} kỳ trả mỗi 20s)`);
        
        this.saveState();
        this.notifyListeners();
        return loanContract;
    }

    // Từ chối hồ sơ xin vay
    rejectLoan(requestId) {
        const req = this.pendingLoanRequests.find(r => r.id === requestId);
        if (req) {
            this.pendingLoanRequests = this.pendingLoanRequests.filter(r => r.id !== requestId);
            this.addAiLog(`❌ Đã từ chối hồ sơ vay ${req.requestedAmount.toLocaleString('vi-VN')} đ của [${req.applicantName}]`);
            this.saveState();
            this.notifyListeners();
        }
    }

    // Thu nợ 1 kỳ cụ thể đã đến hạn của 1 khoản vay
    collectInstallment(loanId, installmentIndex) {
        const loan = this.activeLoans.find(l => l.id === loanId);
        if (!loan) throw new Error("Khoản vay không tồn tại!");

        const inst = loan.installments.find(i => i.index === installmentIndex);
        if (!inst) throw new Error("Kỳ trả nợ không tồn tại!");

        if (inst.status === 'COLLECTED') {
            throw new Error("Kỳ này đã được thu hồi trước đó!");
        }

        if (inst.status !== 'DUE' && Date.now() < inst.dueAt) {
            const waitSec = Math.ceil((inst.dueAt - Date.now()) / 1000);
            throw new Error(`Kỳ #${installmentIndex} chưa đến hạn! Vui lòng chờ thêm ${waitSec} giây.`);
        }

        inst.status = 'COLLECTED';
        inst.collectedAt = Date.now();

        // Tiền gốc + lãi thu về nạp vào kho tín dụng
        this.treasuryBalance += inst.totalAmount;
        this.totalLendingProfit += inst.interest;

        // Kiểm tra xem đã thu hết các kỳ chưa
        const remaining = loan.installments.filter(i => i.status !== 'COLLECTED').length;
        if (remaining === 0) {
            loan.status = 'COMPLETED';
            loan.completedAt = Date.now();
            this.completedLoans.unshift(loan);
            this.activeLoans = this.activeLoans.filter(l => l.id !== loanId);
            this.addAiLog(`🎉 Đã tất toán toàn bộ hợp đồng vay của [${loan.borrowerName}]! Tổng thu: +${loan.totalAmountToRepay.toLocaleString('vi-VN')} đ.`);
        } else {
            this.addAiLog(`💰 Đã thu nợ Kỳ #${installmentIndex}/${loan.termInstallments} từ [${loan.borrowerName}]: +${inst.totalAmount.toLocaleString('vi-VN')} đ (Gốc: ${inst.principal.toLocaleString('vi-VN')} đ, Lãi: +${inst.interest.toLocaleString('vi-VN')} đ)`);
        }

        if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playCashRegister();
        }

        this.saveState();
        this.notifyListeners();

        return {
            amountCollected: inst.totalAmount,
            principal: inst.principal,
            interest: inst.interest,
            remainingInstallments: remaining
        };
    }

    // Thu nợ TẤT CẢ các kỳ đã đến hạn của TOÀN BỘ các khoản vay
    collectAllMaturedInstallments() {
        let totalCollected = 0;
        let totalInterest = 0;
        let collectedCount = 0;

        this.activeLoans.forEach(loan => {
            loan.installments.forEach(inst => {
                if (inst.status === 'DUE' || (inst.status === 'PENDING' && Date.now() >= inst.dueAt)) {
                    inst.status = 'COLLECTED';
                    inst.collectedAt = Date.now();
                    this.treasuryBalance += inst.totalAmount;
                    this.totalLendingProfit += inst.interest;
                    totalCollected += inst.totalAmount;
                    totalInterest += inst.interest;
                    collectedCount++;
                }
            });

            const remaining = loan.installments.filter(i => i.status !== 'COLLECTED').length;
            if (remaining === 0 && loan.status !== 'COMPLETED') {
                loan.status = 'COMPLETED';
                loan.completedAt = Date.now();
                this.completedLoans.unshift(loan);
            }
        });

        this.activeLoans = this.activeLoans.filter(l => l.status === 'ACTIVE');

        if (collectedCount === 0) {
            throw new Error("Hiện tại chưa có kỳ trả nợ nào đến hạn cần thu!");
        }

        this.addAiLog(`⚡ THU NỢ TẤT CẢ: Đã gom thành công ${collectedCount} kỳ đến hạn, tổng thu +${Math.round(totalCollected).toLocaleString('vi-VN')} đ (Lãi ròng: +${Math.round(totalInterest).toLocaleString('vi-VN')} đ)`);

        if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playCashRegister();
        }

        this.saveState();
        this.notifyListeners();

        return {
            collectedCount,
            totalCollected,
            totalInterest
        };
    }

    // ========================================================================
    // NGHIỆP VỤ NHẬN TIỀN GỬI VỐN TỪ KHÁCH HÀNG (CUSTOMER DEPOSITS)
    // ========================================================================

    // Tiếp nhận tiền khách gửi vào ngân hàng (Lãi suất trả khách 0.5% - 2.0%/phút)
    acceptDeposit(offerId, customRate, isByAi = false) {
        const offer = this.pendingDepositOffers.find(o => o.id === offerId);
        if (!offer) throw new Error("Đơn gửi vốn không tồn tại hoặc đã hết hạn!");

        const rate = Math.max(0.50, Math.min(2.00, Number(customRate) || offer.requestedRate));

        // Nhận vốn gửi -> Tăng kho tín dụng ngay lập tức
        this.treasuryBalance += offer.depositAmount;

        const term = Math.max(6, Math.min(20, Number(offer.termInstallments) || 10));
        const ratePerCycle = (rate / 100) * (20 / 60); // 20s
        const principalPerInstallment = Math.round(offer.depositAmount / term);
        const interestPerInstallment = Math.round(offer.depositAmount * ratePerCycle);
        const totalInstallmentAmount = principalPerInstallment + interestPerInstallment;
        const totalInterest = interestPerInstallment * term;

        const now = Date.now();
        const installments = [];
        for (let i = 1; i <= term; i++) {
            installments.push({
                index: i,
                dueAt: now + (i * 20000),
                principal: principalPerInstallment,
                interest: interestPerInstallment,
                totalAmount: totalInstallmentAmount,
                status: 'PENDING',
                paidAt: null
            });
        }

        const depositContract = {
            id: 'DEP-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            depositorName: offer.depositorName,
            depositorType: offer.depositorType,
            amount: offer.depositAmount,
            rate: rate,
            termInstallments: term,
            intervalSec: 20,
            principalPerInstallment,
            interestPerInstallment,
            totalInstallmentAmount,
            totalInterest,
            principalReturned: 0,
            acceptedAt: now,
            status: 'ACTIVE',
            installments: installments
        };

        this.pendingDepositOffers = this.pendingDepositOffers.filter(o => o.id !== offerId);
        this.activeDeposits.unshift(depositContract);

        this.addAiLog(`${isByAi ? '🤖 [AI] ' : '📥 '}Tiếp nhận thành công +${offer.depositAmount.toLocaleString('vi-VN')} đ vốn gửi từ [${offer.depositorName}] - Trả lãi: ${rate.toFixed(2)}%/phút (${term} kỳ)`);

        this.saveState();
        this.notifyListeners();
        return depositContract;
    }

    // Từ chối đơn gửi vốn
    rejectDeposit(offerId) {
        const offer = this.pendingDepositOffers.find(o => o.id === offerId);
        if (offer) {
            this.pendingDepositOffers = this.pendingDepositOffers.filter(o => o.id !== offerId);
            this.addAiLog(`❌ Từ chối nhận tiền gửi ${offer.depositAmount.toLocaleString('vi-VN')} đ từ [${offer.depositorName}]`);
            this.saveState();
            this.notifyListeners();
        }
    }

    // Thanh toán 1 kỳ tiền gốc + lãi cho khách gửi vốn khi đến hạn
    payDepositInstallment(contractId, installmentIndex) {
        const dep = this.activeDeposits.find(d => d.id === contractId);
        if (!dep) throw new Error("Khoản tiền gửi không tồn tại!");

        const inst = dep.installments.find(i => i.index === installmentIndex);
        if (!inst) throw new Error("Kỳ trả tiền không tồn tại!");

        if (inst.status === 'PAID') {
            throw new Error("Kỳ này đã được thanh toán cho khách trước đó!");
        }

        if (this.treasuryBalance < inst.totalAmount) {
            throw new Error(`Kho vốn không đủ tiền trả cho khách! Cần ${inst.totalAmount.toLocaleString('vi-VN')} đ, hiện có ${this.treasuryBalance.toLocaleString('vi-VN')} đ. Vui lòng nạp thêm vốn!`);
        }

        // Trừ kho tín dụng
        this.treasuryBalance -= inst.totalAmount;
        this.totalDepositInterestPaid += inst.interest;
        dep.principalReturned = (dep.principalReturned || 0) + inst.principal;

        inst.status = 'PAID';
        inst.paidAt = Date.now();

        const remaining = dep.installments.filter(i => i.status !== 'PAID').length;
        if (remaining === 0) {
            dep.status = 'COMPLETED';
            dep.completedAt = Date.now();
            this.completedDeposits.unshift(dep);
            this.activeDeposits = this.activeDeposits.filter(d => d.id !== contractId);
            this.addAiLog(`🏁 Hoàn tất thanh toán toàn bộ hợp đồng gửi vốn của [${dep.depositorName}]!`);
        } else {
            this.addAiLog(`📤 Đã thanh toán Kỳ #${installmentIndex}/${dep.termInstallments} cho khách [${dep.depositorName}]: -${inst.totalAmount.toLocaleString('vi-VN')} đ (Gốc: ${inst.principal.toLocaleString('vi-VN')} đ, Lãi: ${inst.interest.toLocaleString('vi-VN')} đ)`);
        }

        this.saveState();
        this.notifyListeners();

        return {
            paidAmount: inst.totalAmount,
            remainingInstallments: remaining
        };
    }

    // Tất toán ngay toàn bộ gốc + lãi cho khách gửi vốn bất cứ lúc nào
    settleDepositEarly(contractId) {
        const dep = this.activeDeposits.find(d => d.id === contractId);
        if (!dep) throw new Error("Khoản tiền gửi không tồn tại!");

        // Tính số tiền gốc còn lại chưa trả + lãi của các kỳ chưa thanh toán
        let remainingPrincipal = 0;
        let accruedInterest = 0;

        dep.installments.forEach(inst => {
            if (inst.status !== 'PAID') {
                remainingPrincipal += inst.principal;
                accruedInterest += inst.interest;
                inst.status = 'PAID';
                inst.paidAt = Date.now();
            }
        });

        const totalPayout = remainingPrincipal + accruedInterest;

        if (this.treasuryBalance < totalPayout) {
            throw new Error(`Kho vốn không đủ để tất toán ngay! Cần ${totalPayout.toLocaleString('vi-VN')} đ, hiện có ${this.treasuryBalance.toLocaleString('vi-VN')} đ.`);
        }

        this.treasuryBalance -= totalPayout;
        this.totalDepositInterestPaid += accruedInterest;
        dep.principalReturned = dep.amount;
        dep.status = 'COMPLETED';
        dep.completedAt = Date.now();

        this.completedDeposits.unshift(dep);
        this.activeDeposits = this.activeDeposits.filter(d => d.id !== contractId);

        this.addAiLog(`⚡ Tất toán ngay thành công cho khách [${dep.depositorName}]: Trả đủ -${totalPayout.toLocaleString('vi-VN')} đ (Gốc: ${remainingPrincipal.toLocaleString('vi-VN')} đ, Lãi: ${accruedInterest.toLocaleString('vi-VN')} đ)`);

        this.saveState();
        this.notifyListeners();

        return {
            totalPayout,
            remainingPrincipal,
            accruedInterest
        };
    }

    // ========================================================================
    // TẠO DỮ LIỆU THỊ TRƯỜNG THỜI GIAN THỰC (MARKET FEED GENERATOR)
    // ========================================================================

    generateInitialMarketData() {
        const sampleCompanies = [
            { name: "Công Ty Cổ Phần Công Nghệ NextTech", sector: "Công Nghệ AI & Phần Mềm", icon: "cpu", amount: 100000000, term: 10, rate: 2.50, purpose: "Mở rộng hệ thống máy chủ Cloud GPU" },
            { name: "Chuỗi Cửa Hàng Bán Lẻ WinMart+", sector: "Bán Lẻ & Tiêu Dùng", icon: "shopping-bag", amount: 50000000, term: 8, rate: 2.20, purpose: "Nhập nguồn hàng tiêu dùng thiết yếu" },
            { name: "Công Ty TNHH Logistics Vận Tải Toàn Cầu", sector: "Vận Tải & Kho Bãi", icon: "truck", amount: 150000000, term: 15, rate: 3.00, purpose: "Bổ sung xe container tuyến cao tốc Bắc Nam" },
            { name: "Hộ Kinh Doanh F&B Phở Thăng Long", sector: "Dịch Vụ Nhà Hàng F&B", icon: "utensils", amount: 30000000, term: 6, rate: 2.00, purpose: "Nâng cấp mặt bằng bếp trung tâm" }
        ];

        sampleCompanies.forEach((c, idx) => {
            this.pendingLoanRequests.push({
                id: 'LRQ-INIT-' + (idx + 1) + '-' + Date.now().toString(36),
                applicantName: c.name,
                applicantType: 'BUSINESS',
                businessSector: c.sector,
                avatarIcon: c.icon,
                requestedAmount: c.amount,
                termInstallments: c.term,
                intervalSeconds: 20,
                suggestedRate: c.rate,
                creditScore: 780 + Math.floor(Math.random() * 50),
                purpose: c.purpose,
                createdAt: Date.now() - (idx * 15000)
            });
        });

        // Tạo 2 đơn khách gửi vốn mẫu
        this.pendingDepositOffers.push(
            {
                id: 'DEP-INIT-1',
                depositorName: "Tập Đoàn Bất Động Sản An Gia",
                depositorType: "ENTERPRISE",
                depositAmount: 80000000,
                termInstallments: 10,
                intervalSeconds: 20,
                requestedRate: 0.80,
                purpose: "Tối ưu dòng tiền thanh khoản nhàn rỗi ngắn hạn",
                createdAt: Date.now() - 10000
            },
            {
                id: 'DEP-INIT-2',
                depositorName: "Trần Ngọc Mai (Chủ Chuỗi Thẩm Mỹ Viện)",
                depositorType: "VIP_INDIVIDUAL",
                depositAmount: 40000000,
                termInstallments: 6,
                intervalSeconds: 20,
                requestedRate: 0.60,
                purpose: "Gửi sinh lời dòng tiền doanh thu tuần",
                createdAt: Date.now() - 5000
            }
        );

        this.addAiLog("🚀 Hệ thống Sàn Tín Dụng & Quản Trị Vốn DigiBank khởi động thành công.");
    }

    spawnMarketOpportunity() {
        const isLoan = Math.random() > 0.35; // 65% sinh hồ sơ vay, 35% sinh khách gửi vốn

        const companyPool = [
            { name: "Công Ty CP Xây Dựng & Địa Ốc Phục Hưng", sector: "Bất Động Sản & Xây Dựng", icon: "building", minA: 60000000, maxA: 200000000, p: "Thanh toán vật liệu công trình dự án cao tầng" },
            { name: "Hãng Thời Trang Thiết Kế YODY Fast", sector: "May Mặc & Thời Trang", icon: "sparkles", minA: 40000000, maxA: 120000000, p: "Nhập vải may bộ sưu tập thu đông mới" },
            { name: "Công Ty Nông Nghiệp Công Nghệ Cao EcoFarm", sector: "Nông Nghiệp Sạch", icon: "leaf", minA: 30000000, maxA: 80000000, p: "Lắp đặt dàn tưới tự động nhà màng tiêu chuẩn GAP" },
            { name: "Chuỗi Cà Phê The Coffee House", sector: "Dịch Vụ Đồ Uống F&B", icon: "coffee", minA: 50000000, maxA: 150000000, p: "Khai trương điểm bán mới tại trung tâm thương mại" },
            { name: "Dược Phẩm & Y Tế Cộng Đồng Pharmacity", sector: "Dược Phẩm Y Tế", icon: "activity", minA: 70000000, maxA: 250000000, p: "Bổ sung cơ số thuốc mùa dịch cao điểm" },
            { name: "Lê Hoàng Long (Nhà Đầu Tư Bất Động Sản)", sector: "Cá Nhân VIP", icon: "user-check", minA: 20000000, maxA: 60000000, p: "Đặt cọc lướt sóng lô đất nền đấu giá" },
            { name: "Vũ Thị Hương (Chủ Xưởng May Gia Công)", sector: "Sản Xuất May Mặc", icon: "scissors", minA: 35000000, maxA: 90000000, p: "Trả lương công nhân hoàn thành đơn hàng xuất khẩu" }
        ];

        const pick = companyPool[Math.floor(Math.random() * companyPool.length)];
        const step = 5000000;
        const rawAmount = pick.minA + Math.floor(Math.random() * ((pick.maxA - pick.minA) / step)) * step;
        const terms = [6, 8, 10, 12, 15, 20];
        const term = terms[Math.floor(Math.random() * terms.length)];

        if (isLoan) {
            if (this.pendingLoanRequests.length >= 8) {
                this.pendingLoanRequests.pop();
            }
            const rate = Number((2.0 + Math.random() * 1.5).toFixed(2));
            const newReq = {
                id: 'LRQ-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 4).toUpperCase(),
                applicantName: pick.name,
                applicantType: pick.sector.includes('Cá Nhân') ? 'INDIVIDUAL' : 'BUSINESS',
                businessSector: pick.sector,
                avatarIcon: pick.icon,
                requestedAmount: rawAmount,
                termInstallments: term,
                intervalSeconds: 20,
                suggestedRate: rate,
                creditScore: 750 + Math.floor(Math.random() * 80),
                purpose: pick.p,
                createdAt: Date.now()
            };
            this.pendingLoanRequests.unshift(newReq);
            this.addAiLog(`📥 Hồ sơ xin vay mới: [${newReq.applicantName}] cần vay ${newReq.requestedAmount.toLocaleString('vi-VN')} đ (${newReq.termInstallments} kỳ @ 20s).`);
        } else {
            if (this.pendingDepositOffers.length >= 6) {
                this.pendingDepositOffers.pop();
            }
            const rate = Number((0.6 + Math.random() * 0.9).toFixed(2));
            const newDeposit = {
                id: 'DEP-OFFER-' + Date.now().toString(36).toUpperCase(),
                depositorName: pick.name,
                depositorType: pick.sector.includes('Cá Nhân') ? 'VIP_INDIVIDUAL' : 'ENTERPRISE',
                depositAmount: rawAmount,
                termInstallments: term,
                intervalSeconds: 20,
                requestedRate: rate,
                purpose: "Ủy thác tiền gửi sinh lời ngắn hạn",
                createdAt: Date.now()
            };
            this.pendingDepositOffers.unshift(newDeposit);
            this.addAiLog(`💎 Khách gửi vốn mới: [${newDeposit.depositorName}] muốn gửi +${newDeposit.depositAmount.toLocaleString('vi-VN')} đ (Lãi mong muốn: ${rate}%/phút).`);
        }
    }

    // Bật / tắt AI Banker Auto-Pilot
    toggleAi(enabled) {
        this.aiConfig.enabled = !!enabled;
        this.addAiLog(this.aiConfig.enabled 
            ? `🤖 AI Banker Auto-Pilot đã được KÍCH HOẠT. Tự động duyệt vay (Lãi: ${this.aiConfig.loanRate}%/p), nhận vốn (${this.aiConfig.depositRate}%/p) và tự động thu nợ!`
            : `⏸ AI Banker Auto-Pilot đã TẮT. Chuyển sang chế độ duyệt thủ công.`
        );
        this.saveState();
        this.notifyListeners();
        return this.aiConfig.enabled;
    }

    // Cập nhật cấu hình AI Banker
    updateAiConfig(newConfig) {
        if (!newConfig) return;
        if (newConfig.loanRate !== undefined) this.aiConfig.loanRate = Math.max(1.5, Math.min(4.0, Number(newConfig.loanRate)));
        if (newConfig.maxLoanAmount !== undefined) this.aiConfig.maxLoanAmount = Math.max(10000000, Number(newConfig.maxLoanAmount));
        if (newConfig.depositRate !== undefined) this.aiConfig.depositRate = Math.max(0.5, Math.min(2.0, Number(newConfig.depositRate)));
        if (newConfig.autoCollect !== undefined) this.aiConfig.autoCollect = !!newConfig.autoCollect;

        this.addAiLog(`⚙️ Cấu hình AI cập nhật: Lãi cho vay: ${this.aiConfig.loanRate}%/p, Hạn mức max: ${this.aiConfig.maxLoanAmount.toLocaleString('vi-VN')} đ, Lãi trả khách: ${this.aiConfig.depositRate}%/p`);
        this.saveState();
        this.notifyListeners();
    }
}

// Khởi tạo Singleton
const capitalManager = new CapitalManager();
