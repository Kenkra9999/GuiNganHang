// Quản lý nghiệp vụ Tiết kiệm Realtime, tính lãi theo phút (0.7% - 1.2%/phút)
class SavingsManager {
    constructor() {
        this.deposits = [];
        this.timer = null;
        this.listeners = [];
        this.loadState();
        this.startEngine();
    }

    loadState() {
        const saved = localStorage.getItem('digibank_deposits');
        if (saved) {
            try {
                this.deposits = JSON.parse(saved);
            } catch (e) {
                console.error("Lỗi đọc dữ liệu sổ tiết kiệm:", e);
                this.deposits = [];
            }
        }
    }

    saveState() {
        localStorage.setItem('digibank_deposits', JSON.stringify(this.deposits));
    }

    // Đăng ký listener để nhận cập nhật lãi suất từng giây
    subscribe(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        const stats = this.calculateGlobalStats();
        this.listeners.forEach(cb => cb(this.deposits, stats));
    }

    // Bắt đầu cỗ máy tính lãi suất Realtime chạy mỗi giây
    startEngine() {
        if (this.timer) clearInterval(this.timer);
        
        this.timer = setInterval(() => {
            let hasMinuteTriggered = false;
            let hasCompoundTriggered = false;
            const now = Date.now();

            this.deposits.forEach(dep => {
                if (dep.status === 'ACTIVE') {
                    const elapsedSeconds = Math.max(0, (now - dep.createdAt) / 1000);

                    if (dep.isCompound) {
                        const cycles = Math.floor(elapsedSeconds / 2);
                        if (dep.lastCycle === undefined) dep.lastCycle = 0;
                        if (cycles > dep.lastCycle) {
                            dep.lastCycle = cycles;
                            // Cập nhật gốc lũy kế sau chu kỳ 2s
                            dep.principal = Math.round(dep.initialPrincipal * Math.pow(1 + 1/3000, cycles));
                            hasCompoundTriggered = true;
                        }
                    } else {
                        const completedMinutes = Math.floor(elapsedSeconds / 60);
                        if (!dep.lastNotifiedMinute) dep.lastNotifiedMinute = 0;

                        if (completedMinutes > dep.lastNotifiedMinute) {
                            dep.lastNotifiedMinute = completedMinutes;
                            hasMinuteTriggered = true;
                        }
                    }
                }
            });

            if ((hasMinuteTriggered || hasCompoundTriggered) && typeof soundManager !== 'undefined' && soundManager) {
                // Chỉ kích hoạt âm thanh khi hoàn thành phút thường hoặc chu kỳ đặc biệt
                if (hasMinuteTriggered) soundManager.playInterestChime();
            }

            this.notifyListeners();
        }, 1000);
    }

    // Tính toán số liệu thống kê tổng thể
    calculateGlobalStats() {
        const now = Date.now();
        let totalPrincipalLocked = 0;
        let totalLiveInterest = 0;
        let activeCount = 0;
        let compoundCount = 0;

        this.deposits.forEach(dep => {
            if (dep.status === 'ACTIVE') {
                activeCount++;
                if (dep.isCompound) {
                    compoundCount++;
                    const calc = this.getDepositCalculations(dep);
                    totalPrincipalLocked += (dep.initialPrincipal || dep.principal);
                    totalLiveInterest += calc.currentUnclaimedInterest;
                } else {
                    totalPrincipalLocked += dep.principal;
                    const elapsedSeconds = Math.max(0, (now - dep.createdAt) / 1000);
                    const ratePerSecond = (dep.rate / 100) / 60;
                    const grossInterest = dep.principal * ratePerSecond * elapsedSeconds;
                    const netInterest = Math.max(0, grossInterest - (dep.claimedInterest || 0));
                    totalLiveInterest += netInterest;
                }
            }
        });

        return {
            totalPrincipalLocked,
            totalLiveInterest,
            activeCount,
            compoundCount
        };
    }

    // Tính lãi suất chi tiết cho 1 sổ cụ thể (hỗ trợ cả lãi suất đơn và Lãi Suất Kép 2S)
    getDepositCalculations(dep) {
        const now = Date.now();
        const elapsedSeconds = dep.status === 'ACTIVE' 
            ? Math.max(0, (now - dep.createdAt) / 1000) 
            : Math.max(0, ((dep.closedAt || now) - dep.createdAt) / 1000);

        const mins = Math.floor(elapsedSeconds / 60);
        const secs = Math.floor(elapsedSeconds % 60);
        const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // TRƯỜNG HỢP 1: LÃI SUẤT KÉP LIÊN TỤC 2 GIÂY (AUTO-COMPOUNDING)
        if (dep.isCompound) {
            const cycles = Math.floor(elapsedSeconds / 2);
            const cycleProgress = (elapsedSeconds % 2) / 2; // tiến độ chu kỳ 2s hiện tại
            const ratePerCycle = 1 / 3000; // 1% / phút chia cho 30 chu kỳ 2s
            const initialPrincipal = dep.initialPrincipal || dep.principal;

            // Công thức lãi kép luỹ kế đóng: P(N) = P0 * (1 + 1/3000)^N
            const compoundedPrincipal = Math.round(initialPrincipal * Math.pow(1 + ratePerCycle, cycles));
            const grossInterest = Math.max(0, compoundedPrincipal - initialPrincipal);
            const currentUnclaimedInterest = grossInterest;
            const totalEstimatedPayout = compoundedPrincipal;
            const interestPerMinute = compoundedPrincipal * 0.01;
            const interestNextCycle = Math.round(compoundedPrincipal * ratePerCycle);

            return {
                isCompound: true,
                elapsedSeconds,
                cycles,
                cycleProgress,
                mins,
                secs,
                timeFormatted,
                initialPrincipal,
                currentPrincipal: compoundedPrincipal,
                grossInterest,
                currentUnclaimedInterest,
                totalEstimatedPayout,
                interestPerMinute,
                interestNextCycle
            };
        }

        // TRƯỜNG HỢP 2: LÃI SUẤT THEO PHÚT TIÊU CHUẨN CÁC NGÂN HÀNG
        const ratePerSecond = (dep.rate / 100) / 60;
        const grossInterest = dep.principal * ratePerSecond * elapsedSeconds;
        const currentUnclaimedInterest = Math.max(0, grossInterest - (dep.claimedInterest || 0));
        const totalEstimatedPayout = dep.principal + currentUnclaimedInterest;
        const interestPerMinute = dep.principal * (dep.rate / 100);

        return {
            isCompound: false,
            elapsedSeconds,
            mins,
            secs,
            timeFormatted,
            initialPrincipal: dep.principal,
            currentPrincipal: dep.principal,
            grossInterest,
            currentUnclaimedInterest,
            totalEstimatedPayout,
            interestPerMinute
        };
    }

    // Mở sổ đặc quyền Lãi Suất Kép Liên Tục 2S (Có thể mở nhiều lần)
    openCompoundDeposit(amount) {
        const pkg = typeof COMPOUND_PACKAGE !== 'undefined' ? COMPOUND_PACKAGE : {
            id: 'digibank-compound',
            code: 'DIGIBANK_VIP',
            name: 'DigiBank Prime - Lãi Suất Kép Liên Tục',
            shortName: 'DigiBank Lãi Kép 2S',
            rate: 1.00,
            color: '#f59e0b',
            accentColor: '#10b981',
            minDeposit: 100000
        };

        const min = pkg.minDeposit || 100000;
        if (amount < min) {
            throw new Error(`Số tiền gửi tối thiểu cho Lãi Suất Kép 2S là ${min.toLocaleString('vi-VN')} đ`);
        }

        const newDeposit = {
            id: 'TK-VIP-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            isCompound: true,
            compoundIntervalSec: 2,
            bankId: pkg.id,
            bankCode: pkg.code,
            bankName: pkg.shortName,
            bankFullName: pkg.name,
            bankColor: pkg.color,
            bankAccent: pkg.accentColor,
            bankIcon: 'crown',
            rate: pkg.rate, // 1.00%/phút
            initialPrincipal: amount,
            principal: amount,
            createdAt: Date.now(),
            claimedInterest: 0,
            lastCycle: 0,
            status: 'ACTIVE'
        };

        this.deposits.unshift(newDeposit);
        this.saveState();
        this.notifyListeners();
        return newDeposit;
    }

    // Mở sổ tiết kiệm thông thường (hoặc chuyển hướng sang lãi kép nếu chọn gói VIP)
    openDeposit(bankId, amount) {
        if (bankId === 'digibank-compound') {
            return this.openCompoundDeposit(amount);
        }

        const bank = BANKS_DATA.find(b => b.id === bankId);
        if (!bank) throw new Error("Ngân hàng không tồn tại!");
        if (amount < (bank.minDeposit || 100000)) {
            throw new Error(`Số tiền gửi tối thiểu tại ${bank.shortName} là ${bank.minDeposit.toLocaleString('vi-VN')} đ`);
        }

        const newDeposit = {
            id: 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            isCompound: false,
            bankId: bank.id,
            bankCode: bank.code,
            bankName: bank.shortName,
            bankFullName: bank.name,
            bankColor: bank.color,
            bankAccent: bank.accentColor,
            bankIcon: bank.icon,
            rate: bank.rate,
            principal: amount,
            createdAt: Date.now(),
            claimedInterest: 0,
            lastNotifiedMinute: 0,
            status: 'ACTIVE'
        };

        this.deposits.unshift(newDeposit);
        this.saveState();
        this.notifyListeners();
        return newDeposit;
    }

    // Rút toàn bộ tiền gốc + tiền lãi của 1 sổ
    withdrawDeposit(depositId) {
        const dep = this.deposits.find(d => d.id === depositId);
        if (!dep) throw new Error("Không tìm thấy sổ tiết kiệm!");
        if (dep.status !== 'ACTIVE') throw new Error("Sổ tiết kiệm này đã được tất toán trước đó!");

        const calc = this.getDepositCalculations(dep);
        
        let principalReturned = 0;
        let interestReturned = 0;
        let totalPayout = 0;

        if (dep.isCompound) {
            principalReturned = dep.initialPrincipal || dep.principal;
            interestReturned = calc.currentUnclaimedInterest;
            totalPayout = calc.currentPrincipal;
            dep.finalPrincipal = calc.currentPrincipal;
        } else {
            principalReturned = dep.principal;
            interestReturned = calc.currentUnclaimedInterest;
            totalPayout = principalReturned + interestReturned;
        }

        dep.status = 'WITHDRAWN';
        dep.closedAt = Date.now();
        dep.finalInterest = calc.grossInterest;

        this.saveState();
        this.notifyListeners();

        return {
            deposit: dep,
            principalReturned,
            interestReturned,
            totalPayout
        };
    }

    // Rút riêng tiền lãi đang có, giữ nguyên tiền gốc tiếp tục sinh lời
    claimInterestOnly(depositId) {
        const dep = this.deposits.find(d => d.id === depositId);
        if (!dep) throw new Error("Không tìm thấy sổ tiết kiệm!");
        if (dep.status !== 'ACTIVE') throw new Error("Sổ đã tất toán!");

        const calc = this.getDepositCalculations(dep);
        const interestAmount = calc.currentUnclaimedInterest;

        if (interestAmount <= 0) {
            throw new Error("Chưa có tiền lãi khả dụng để rút!");
        }

        if (dep.isCompound) {
            dep.claimedInterest = (dep.claimedInterest || 0) + interestAmount;
            dep.principal = dep.initialPrincipal;
            dep.createdAt = Date.now();
            dep.lastCycle = 0;
        } else {
            dep.claimedInterest = (dep.claimedInterest || 0) + interestAmount;
        }

        this.saveState();
        this.notifyListeners();

        return {
            deposit: dep,
            interestAmount
        };
    }

    // Rút tất cả các sổ tiết kiệm đang hoạt động
    withdrawAll() {
        const activeDeps = this.deposits.filter(d => d.status === 'ACTIVE');
        if (activeDeps.length === 0) {
            throw new Error("Không có sổ tiết kiệm nào đang hoạt động!");
        }

        let totalPrincipal = 0;
        let totalInterest = 0;
        const results = [];

        activeDeps.forEach(dep => {
            const res = this.withdrawDeposit(dep.id);
            totalPrincipal += res.principalReturned;
            totalInterest += res.interestReturned;
            results.push(res);
        });

        return {
            count: results.length,
            totalPrincipal,
            totalInterest,
            totalPayout: totalPrincipal + totalInterest
        };
    }
}

const savingsManager = new SavingsManager();
