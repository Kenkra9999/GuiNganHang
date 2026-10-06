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
            const now = Date.now();

            this.deposits.forEach(dep => {
                if (dep.status === 'ACTIVE') {
                    const elapsedSeconds = Math.max(0, (now - dep.createdAt) / 1000);
                    const completedMinutes = Math.floor(elapsedSeconds / 60);

                    if (!dep.lastNotifiedMinute) dep.lastNotifiedMinute = 0;

                    if (completedMinutes > dep.lastNotifiedMinute) {
                        dep.lastNotifiedMinute = completedMinutes;
                        hasMinuteTriggered = true;
                    }
                }
            });

            if (hasMinuteTriggered && soundManager) {
                soundManager.playInterestChime();
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

        this.deposits.forEach(dep => {
            if (dep.status === 'ACTIVE') {
                activeCount++;
                totalPrincipalLocked += dep.principal;
                const elapsedSeconds = Math.max(0, (now - dep.createdAt) / 1000);
                const ratePerSecond = (dep.rate / 100) / 60;
                const grossInterest = dep.principal * ratePerSecond * elapsedSeconds;
                const netInterest = Math.max(0, grossInterest - (dep.claimedInterest || 0));
                totalLiveInterest += netInterest;
            }
        });

        return {
            totalPrincipalLocked,
            totalLiveInterest,
            activeCount
        };
    }

    // Tính lãi suất chi tiết cho 1 sổ cụ thể
    getDepositCalculations(dep) {
        const now = Date.now();
        const elapsedSeconds = dep.status === 'ACTIVE' 
            ? Math.max(0, (now - dep.createdAt) / 1000) 
            : Math.max(0, ((dep.closedAt || now) - dep.createdAt) / 1000);
        
        const ratePerSecond = (dep.rate / 100) / 60;
        const grossInterest = dep.principal * ratePerSecond * elapsedSeconds;
        const currentUnclaimedInterest = Math.max(0, grossInterest - (dep.claimedInterest || 0));
        const totalEstimatedPayout = dep.principal + currentUnclaimedInterest;
        const interestPerMinute = dep.principal * (dep.rate / 100);

        const mins = Math.floor(elapsedSeconds / 60);
        const secs = Math.floor(elapsedSeconds % 60);
        const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        return {
            elapsedSeconds,
            mins,
            secs,
            timeFormatted,
            grossInterest,
            currentUnclaimedInterest,
            totalEstimatedPayout,
            interestPerMinute
        };
    }

    // Mở sổ tiết kiệm mới
    openDeposit(bankId, amount) {
        const bank = BANKS_DATA.find(b => b.id === bankId);
        if (!bank) throw new Error("Ngân hàng không tồn tại!");
        if (amount < (bank.minDeposit || 100000)) {
            throw new Error(`Số tiền gửi tối thiểu tại ${bank.shortName} là ${bank.minDeposit.toLocaleString('vi-VN')} đ`);
        }

        const newDeposit = {
            id: 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
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
        const principalReturned = dep.principal;
        const interestReturned = calc.currentUnclaimedInterest;
        const totalPayout = principalReturned + interestReturned;

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

        dep.claimedInterest = (dep.claimedInterest || 0) + interestAmount;

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
