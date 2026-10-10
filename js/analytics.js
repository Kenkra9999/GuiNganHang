/**
 * DigiBank Prime 4.0 - Advanced Realtime Wealth Intelligence & Portfolio Analytics
 * Hệ thống phân tích tài sản chuyên sâu, theo dõi tăng trưởng lợi nhuận và mô phỏng tương lai.
 */

class AnalyticsManager {
    constructor() {
        this.user = null;
        this.savingsStats = null;
        this.assetChart = null;
        this.growthChart = null;
        this.rateChart = null;
        
        this.growthHistory = [];
        this.lastGrowthTime = 0;
        this.baselineProfit = null;
        this.peakProfit = 0;
        
        this.isPrivacyMode = false;
        this.assetChartMode = 'ASSET'; // 'ASSET' | 'BANK'
        this.growthChartMode = 'REALTIME'; // 'REALTIME' | 'TREND24H' | 'VSCAPITAL'
        this.rateFilterMode = 'TOP10'; // 'TOP10' | 'ALL20' | 'MYBANKS'
        
        this.simAmount = 50000000;
        this.simBankId = 'bvb';
    }

    // =========================================================================
    // 1. KHỞI TẠO & ĐIỀU PHỐI DỮ LIỆU CHÍNH
    // =========================================================================

    initCharts(user, savingsStats) {
        this.user = user || (typeof app !== 'undefined' ? app.user : null);
        this.savingsStats = savingsStats || (typeof savingsManager !== 'undefined' ? savingsManager.calculateGlobalStats() : { totalPrincipalLocked: 0, totalLiveInterest: 0, activeCount: 0 });

        const metrics = this.calculateMetrics();

        // 1. Khởi tạo / cập nhật các thẻ số liệu tài chính KPI
        this.renderKPIs(metrics);

        // 2. Cập nhật các bảng số liệu chi tiết & dự phóng
        this.renderBreakdownTable(metrics);
        this.renderProjections(metrics);
        this.renderWhatIfCalculator();
        this.renderHoldingsTable();
        this.renderAIAdvisory(metrics);

        // 3. Khởi tạo 3 biểu đồ Chart.js
        this.initAssetChart(metrics);
        this.initGrowthChart(metrics);
        this.initRateChart();

        // Cập nhật lại các icon lucide mới được tạo
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Cập nhật nhịp đập Realtime (gọi mỗi 1 giây từ Savings Engine)
    updateData(user, savingsStats) {
        this.user = user || this.user;
        this.savingsStats = savingsStats || this.savingsStats;

        const metrics = this.calculateMetrics();

        // Cập nhật các giá trị hiển thị trên giao diện
        this.renderKPIs(metrics);
        this.renderBreakdownTable(metrics);
        this.renderProjections(metrics);
        
        // Nếu số lượng sổ tiết kiệm thay đổi (vừa mở sổ hoặc vừa tất toán), re-render lại bảng danh mục
        if (metrics.activeCount !== this.lastActiveCount) {
            this.lastActiveCount = metrics.activeCount;
            this.renderHoldingsTable();
            if (this.assetChartMode === 'BANK') {
                this.initAssetChart(metrics);
            }
        } else {
            this.updateHoldingsTableRealtime();
        }

        // Cập nhật Asset Chart mượt mà
        if (this.assetChart) {
            if (this.assetChartMode === 'ASSET') {
                this.assetChart.data.datasets[0].data = [
                    metrics.available,
                    metrics.locked,
                    metrics.unclaimed,
                    metrics.claimed
                ];
            } else {
                const bankDist = this.getBankDistributionData();
                this.assetChart.data.labels = bankDist.labels;
                this.assetChart.data.datasets[0].data = bankDist.data;
                this.assetChart.data.datasets[0].backgroundColor = bankDist.colors;
            }
            this.assetChart.update('none');
        }

        // Cập nhật Growth Chart mỗi 5 giây
        const now = Date.now();
        if (this.growthChart && this.growthChartMode === 'REALTIME') {
            if (this.growthHistory.length === 0 || (now - this.lastGrowthTime) >= 5000) {
                this.lastGrowthTime = now;
                const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                this.growthHistory.push({
                    time: timeStr,
                    profit: metrics.cumulativeProfit,
                    networth: metrics.networth
                });

                if (this.growthHistory.length > 20) {
                    this.growthHistory.shift();
                }

                this.growthChart.data.labels = this.growthHistory.map(h => h.time);
                this.growthChart.data.datasets[0].data = this.growthHistory.map(h => h.profit);
                this.growthChart.update('none');

                this.updateGrowthTrackerStats(metrics);
            }
        }
    }

    // =========================================================================
    // 2. TÍNH TOÁN CÁC CHỈ SỐ TÀI CHÍNH CHUYÊN SÂU (FINANCIAL METRICS ENGINE)
    // =========================================================================

    calculateMetrics() {
        const available = Math.max(0, Number(this.user?.availableBalance || 0));
        const locked = Math.max(0, Number(this.savingsStats?.totalPrincipalLocked || 0));
        const unclaimed = Math.max(0, Number(this.savingsStats?.totalLiveInterest || 0));
        const claimed = Math.max(0, Number(this.user?.totalInterestEarned || 0));

        const networth = available + locked + unclaimed;
        const cumulativeProfit = claimed + unclaimed;

        // Vốn cơ sở ban đầu để tính ROI (mặc định 100.000.000 đ)
        const initialCapital = 100000000;
        const netGrowth = networth - initialCapital;
        const roiPercent = initialCapital > 0 ? (netGrowth / initialCapital) * 100 : 0;

        // Lấy danh sách sổ tiết kiệm active
        const deposits = (typeof savingsManager !== 'undefined' && savingsManager.deposits) ? savingsManager.deposits : [];
        const activeDeps = deposits.filter(d => d.status === 'ACTIVE');

        // Tính tốc độ sinh lời tức thời
        let velocityMin = 0;
        activeDeps.forEach(dep => {
            if (dep.isCompound && typeof savingsManager !== 'undefined') {
                const calc = savingsManager.getDepositCalculations(dep);
                velocityMin += calc.interestPerMinute;
            } else {
                velocityMin += (dep.principal * (dep.rate / 100));
            }
        });

        const velocitySec = velocityMin / 60;
        const velocityHour = velocityMin * 60;
        const velocityDay = velocityMin * 1440;

        // Lãi suất bình quân gia quyền theo phút
        const weightedRate = locked > 0 ? (velocityMin / locked) * 100 : 0;

        // Hiệu suất tận dụng vốn (% vốn đang sinh lời / tổng tài sản)
        const capitalUtilization = networth > 0 ? (locked / networth) * 100 : 0;

        // Đánh giá điểm sức khỏe tài chính (Financial Health Score 0 - 100)
        let healthScore = 75;
        if (activeDeps.length >= 1) healthScore += 10;
        if (activeDeps.length >= 2) healthScore += 5;
        if (weightedRate >= 1.10) healthScore += 6;
        if (capitalUtilization >= 40 && capitalUtilization <= 90) healthScore += 3;
        healthScore = Math.min(99, Math.max(70, healthScore));

        return {
            available,
            locked,
            unclaimed,
            claimed,
            networth,
            cumulativeProfit,
            roiPercent,
            netGrowth,
            activeCount: activeDeps.length,
            velocitySec,
            velocityMin,
            velocityHour,
            velocityDay,
            weightedRate,
            capitalUtilization,
            healthScore,
            activeDeps
        };
    }

    // =========================================================================
    // 3. HIỂN THỊ CÁC THẺ KPI & SỐ LIỆU TÀI CHÍNH
    // =========================================================================

    formatMoney(amount) {
        if (this.isPrivacyMode) return '•••••••• đ';
        return Math.floor(amount).toLocaleString('vi-VN') + ' đ';
    }

    renderKPIs(m) {
        // 1. Tổng Tài Sản Ròng
        const networthEl = document.getElementById('analyticsTotalNetworth');
        if (networthEl) networthEl.textContent = this.formatMoney(m.networth);

        const roiBadgeEl = document.getElementById('analyticsRoiBadge');
        if (roiBadgeEl) {
            const isPositive = m.roiPercent >= 0;
            roiBadgeEl.textContent = `${isPositive ? '+' : ''}${m.roiPercent.toFixed(2)}% ROI`;
            roiBadgeEl.className = isPositive
                ? 'text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20'
                : 'text-[11px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20';
        }

        const growthDescEl = document.getElementById('analyticsNetworthGrowth');
        if (growthDescEl) {
            const isPos = m.netGrowth >= 0;
            const sign = isPos ? '+' : '-';
            growthDescEl.innerHTML = `Chênh lệch: <span class="font-mono ${isPos ? 'text-emerald-400' : 'text-rose-400'} font-semibold">${sign}${this.formatMoney(Math.abs(m.netGrowth))}</span> so với gốc`;
        }

        // Thanh tiến độ phân bổ tài sản 3 màu
        const total = Math.max(1, m.available + m.locked + m.unclaimed);
        const availPct = Math.round((m.available / total) * 100);
        const lockedPct = Math.round((m.locked / total) * 100);
        const unclaimedPct = Math.max(0, 100 - availPct - lockedPct);

        const barAvail = document.getElementById('barAvailWidth');
        const barLocked = document.getElementById('barLockedWidth');
        const barUnclaimed = document.getElementById('barUnclaimedWidth');
        if (barAvail) barAvail.style.width = availPct + '%';
        if (barLocked) barLocked.style.width = lockedPct + '%';
        if (barUnclaimed) barUnclaimed.style.width = unclaimedPct + '%';

        const barAvailText = document.getElementById('barAvailText');
        const barLockedText = document.getElementById('barLockedText');
        const barUnclaimedText = document.getElementById('barUnclaimedText');
        if (barAvailText) barAvailText.textContent = availPct + '%';
        if (barLockedText) barLockedText.textContent = lockedPct + '%';
        if (barUnclaimedText) barUnclaimedText.textContent = unclaimedPct + '%';

        const barSummary = document.getElementById('barBreakdownSummary');
        if (barSummary) barSummary.textContent = `Khả dụng ${availPct}% • Tiết kiệm ${lockedPct}%`;

        // 2. Tốc Độ Sinh Lời Hiện Tại
        const velMinEl = document.getElementById('analyticsVelocityMin');
        if (velMinEl) velMinEl.textContent = '+' + this.formatMoney(m.velocityMin) + '/phút';

        const velSecEl = document.getElementById('analyticsVelocitySec');
        if (velSecEl) velSecEl.textContent = '+' + this.formatMoney(m.velocitySec) + '/giây';

        const velHourEl = document.getElementById('analyticsVelocityHour');
        if (velHourEl) velHourEl.textContent = '+' + this.formatMoney(m.velocityHour);

        const velDayEl = document.getElementById('analyticsVelocityDay');
        if (velDayEl) velDayEl.textContent = '+' + this.formatMoney(m.velocityDay);

        // 3. Tổng Tiền Lãi Tích Lũy
        const cumProfitEl = document.getElementById('analyticsCumulativeProfit');
        if (cumProfitEl) cumProfitEl.textContent = this.formatMoney(m.cumulativeProfit);

        const activeCountBadge = document.getElementById('analyticsActiveDepCountBadge');
        if (activeCountBadge) activeCountBadge.textContent = `${m.activeCount} Sổ Đang Chạy`;

        const claimedEl = document.getElementById('analyticsClaimedProfit');
        if (claimedEl) claimedEl.textContent = this.formatMoney(m.claimed);

        const floatEl = document.getElementById('analyticsFloatingProfit');
        if (floatEl) floatEl.textContent = '+' + this.formatMoney(m.unclaimed);

        // 4. Hiệu Suất Tận Dụng Vốn
        const capUtilEl = document.getElementById('analyticsCapitalUtilization');
        if (capUtilEl) capUtilEl.textContent = m.capitalUtilization.toFixed(1) + '%';

        const scoreBadgeEl = document.getElementById('analyticsHealthScoreBadge');
        if (scoreBadgeEl) scoreBadgeEl.textContent = `${m.healthScore}/100 Điểm`;

        const weightRateEl = document.getElementById('analyticsWeightedRate');
        if (weightRateEl) weightRateEl.textContent = m.weightedRate.toFixed(2) + '%/phút';

        const statusLabelEl = document.getElementById('analyticsStatusLabel');
        if (statusLabelEl) {
            if (m.capitalUtilization >= 60) {
                statusLabelEl.textContent = 'Tối Ưu Hóa Cao';
                statusLabelEl.className = 'font-semibold text-emerald-400';
            } else if (m.capitalUtilization >= 20) {
                statusLabelEl.textContent = 'Cân Bằng Dòng Tiền';
                statusLabelEl.className = 'font-semibold text-blue-400';
            } else {
                statusLabelEl.textContent = 'Nhiều Tiền Nhàn Rỗi';
                statusLabelEl.className = 'font-semibold text-amber-400';
            }
        }

        // Center Overlay của Asset Doughnut Chart
        const centerNetworth = document.getElementById('assetCenterTotal');
        if (centerNetworth) centerNetworth.textContent = this.formatMoney(m.networth);
    }

    renderBreakdownTable(m) {
        const total = Math.max(1, m.networth);

        const setRow = (valId, pctId, value) => {
            const valEl = document.getElementById(valId);
            const pctEl = document.getElementById(pctId);
            if (valEl) valEl.textContent = this.formatMoney(value);
            if (pctEl) pctEl.textContent = ((value / total) * 100).toFixed(1) + '%';
        };

        setRow('statRowAvailVal', 'statRowAvailPct', m.available);
        setRow('statRowLockedVal', 'statRowLockedPct', m.locked);
        setRow('statRowUnclaimedVal', 'statRowUnclaimedPct', m.unclaimed);

        const claimedValEl = document.getElementById('statRowClaimedVal');
        const claimedPctEl = document.getElementById('statRowClaimedPct');
        if (claimedValEl) claimedValEl.textContent = this.formatMoney(m.claimed);
        if (claimedPctEl) claimedPctEl.textContent = m.claimed > 0 ? `Đã chốt ${((m.claimed / total) * 100).toFixed(1)}%` : 'Chưa rút';
    }

    renderProjections(m) {
        const p15 = m.unclaimed + (m.velocityMin * 15);
        const p1h = m.unclaimed + (m.velocityMin * 60);
        const p6h = m.unclaimed + (m.velocityMin * 360);
        const p24h = m.unclaimed + (m.velocityMin * 1440);
        const p7d = m.unclaimed + (m.velocityMin * 1440 * 7);
        // Ước tính 30 ngày có kèm hệ số tái đầu tư lãi kép
        const p30d = m.unclaimed + (m.velocityMin * 1440 * 30 * 1.05);

        const updateSim = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = '+' + this.formatMoney(val);
        };

        updateSim('analyticsSim15m', p15);
        updateSim('analyticsSim1h', p1h);
        updateSim('analyticsSim6h', p6h);
        updateSim('analyticsSim24h', p24h);
        updateSim('analyticsSim7d', p7d);
        updateSim('analyticsSim30d', p30d);
    }

    updateGrowthTrackerStats(m) {
        if (this.growthHistory.length > 0) {
            if (this.baselineProfit === null) {
                this.baselineProfit = this.growthHistory[0].profit;
            }
            this.peakProfit = Math.max(this.peakProfit, ...this.growthHistory.map(h => h.profit));
            const delta = Math.max(0, m.cumulativeProfit - this.baselineProfit);

            const startEl = document.getElementById('statGrowthStart');
            const peakEl = document.getElementById('statGrowthPeak');
            const deltaEl = document.getElementById('statGrowthDelta');

            if (startEl) startEl.textContent = this.formatMoney(this.baselineProfit);
            if (peakEl) peakEl.textContent = this.formatMoney(this.peakProfit);
            if (deltaEl) deltaEl.textContent = '+' + this.formatMoney(delta);
        }
    }

    // =========================================================================
    // 4. BIỂU ĐỒ 1: CƠ CẤU TÀI SẢN & TỶ TRỌNG NGÂN HÀNG (DOUGHNUT)
    // =========================================================================

    initAssetChart(m) {
        const ctx = document.getElementById('assetAllocationChart');
        if (!ctx) return;

        if (this.assetChart) {
            this.assetChart.destroy();
        }

        const self = this;
        let labels = ['Số dư khả dụng', 'Đang gửi tiết kiệm', 'Lãi chưa rút', 'Lãi đã chốt'];
        let data = [m.available, m.locked, m.unclaimed, m.claimed];
        let bgColors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];

        if (this.assetChartMode === 'BANK') {
            const bankDist = this.getBankDistributionData();
            labels = bankDist.labels;
            data = bankDist.data;
            bgColors = bankDist.colors;
        }

        this.assetChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 2,
                    borderColor: '#0f172a',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94A3B8',
                            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#F8FAFC',
                        bodyColor: '#94A3B8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0) || 1;
                                const pct = ((val / total) * 100).toFixed(1);
                                return ` ${context.label}: ${self.formatMoney(val)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    getBankDistributionData() {
        const deposits = (typeof savingsManager !== 'undefined' && savingsManager.deposits) ? savingsManager.deposits : [];
        const active = deposits.filter(d => d.status === 'ACTIVE');

        if (active.length === 0) {
            return {
                labels: ['Chưa có sổ tiết kiệm'],
                data: [1],
                colors: ['#475569']
            };
        }

        const map = {};
        active.forEach(dep => {
            if (!map[dep.bankName]) {
                map[dep.bankName] = {
                    principal: 0,
                    color: dep.bankColor || '#3B82F6'
                };
            }
            map[dep.bankName].principal += dep.principal;
        });

        const labels = Object.keys(map);
        const data = labels.map(k => map[k].principal);
        const colors = labels.map(k => map[k].color);

        return { labels, data, colors };
    }

    setAssetChartMode(mode) {
        this.assetChartMode = mode;

        const btnAsset = document.getElementById('btnAssetViewMode');
        const btnBank = document.getElementById('btnBankDistViewMode');
        if (btnAsset) btnAsset.classList.toggle('active', mode === 'ASSET');
        if (btnBank) btnBank.classList.toggle('active', mode === 'BANK');

        const metrics = this.calculateMetrics();
        this.initAssetChart(metrics);
    }

    // =========================================================================
    // 5. BIỂU ĐỒ 2: QUỸ ĐẠO TĂNG TRƯỞNG LỢI NHUẬN (LINE CHART)
    // =========================================================================

    initGrowthChart(m) {
        const ctx = document.getElementById('profitGrowthChart');
        if (!ctx) return;

        if (this.growthChart) {
            this.growthChart.destroy();
        }

        const self = this;
        let chartLabels = [];
        let chartData = [];
        let datasetLabel = 'Lợi Nhuận Tích Lũy Realtime (VNĐ)';

        if (this.growthChartMode === 'REALTIME') {
            if (this.growthHistory.length === 0) {
                const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                this.growthHistory = [
                    { time: nowStr, profit: m.cumulativeProfit, networth: m.networth }
                ];
                this.baselineProfit = m.cumulativeProfit;
                this.peakProfit = m.cumulativeProfit;
            }
            chartLabels = this.growthHistory.map(h => h.time);
            chartData = this.growthHistory.map(h => h.profit);
            datasetLabel = 'Lãi Tích Lũy Realtime (VNĐ)';
        } else if (this.growthChartMode === 'TREND24H') {
            // Mô phỏng xu hướng trong 24 giờ tới (12 mốc 2h)
            datasetLabel = 'Dự Báo Lợi Nhuận 24 Giờ Tới (VNĐ)';
            chartLabels = ['Hiện tại', '+2h', '+4h', '+6h', '+8h', '+10h', '+12h', '+14h', '+16h', '+18h', '+20h', '+24h'];
            const currentP = m.cumulativeProfit;
            const hourVel = m.velocityHour;
            chartData = [
                currentP,
                currentP + hourVel * 2,
                currentP + hourVel * 4,
                currentP + hourVel * 6,
                currentP + hourVel * 8,
                currentP + hourVel * 10,
                currentP + hourVel * 12,
                currentP + hourVel * 14,
                currentP + hourVel * 16,
                currentP + hourVel * 18,
                currentP + hourVel * 20,
                currentP + hourVel * 24
            ];
        } else if (this.growthChartMode === 'VSCAPITAL') {
            datasetLabel = 'Tổng Tài Sản vs Vốn Gốc (VNĐ)';
            chartLabels = ['Vốn Khởi Tạo', 'Vốn Đang Khóa', 'Lãi Đã Chốt', 'Tổng Tài Sản Hiện Tại'];
            chartData = [100000000, m.locked, m.claimed, m.networth];
        }

        this.growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: datasetLabel,
                    data: chartData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.42,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#10B981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            color: '#94A3B8',
                            font: { family: "'JetBrains Mono', monospace", size: 10 },
                            callback: value => self.formatMoney(value)
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: {
                            color: '#94A3B8',
                            font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
                            maxTicksLimit: 8
                        },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#F8FAFC',
                        bodyColor: '#34D399',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: context => ` ${datasetLabel}: ${self.formatMoney(context.parsed.y)}`
                        }
                    }
                }
            }
        });

        this.updateGrowthTrackerStats(m);
    }

    setGrowthChartMode(mode) {
        this.growthChartMode = mode;

        const btnRt = document.getElementById('btnGrowthRealtime');
        const btnTrend = document.getElementById('btnGrowthTrend24h');
        const btnVs = document.getElementById('btnGrowthVsCapital');
        if (btnRt) btnRt.classList.toggle('active', mode === 'REALTIME');
        if (btnTrend) btnTrend.classList.toggle('active', mode === 'TREND24H');
        if (btnVs) btnVs.classList.toggle('active', mode === 'VSCAPITAL');

        const metrics = this.calculateMetrics();
        this.initGrowthChart(metrics);
    }

    // =========================================================================
    // 6. BIỂU ĐỒ 3: SO SÁNH LÃI SUẤT THỊ TRƯỜNG & MA TRẬN NGÂN HÀNG (BAR CHART)
    // =========================================================================

    initRateChart() {
        const ctx = document.getElementById('bankRatesComparisonChart');
        if (!ctx) return;

        if (this.rateChart) {
            this.rateChart.destroy();
        }

        let sortedBanks = [...BANKS_DATA].sort((a, b) => b.rate - a.rate);

        if (this.rateFilterMode === 'TOP10') {
            sortedBanks = sortedBanks.slice(0, 10);
        } else if (this.rateFilterMode === 'MYBANKS') {
            const deposits = (typeof savingsManager !== 'undefined' && savingsManager.deposits) ? savingsManager.deposits : [];
            const myBankIds = new Set(deposits.filter(d => d.status === 'ACTIVE').map(d => d.bankId));
            
            // Giữ lại ngân hàng người dùng đang gửi + thêm top ngân hàng dẫn đầu
            sortedBanks = sortedBanks.filter(b => myBankIds.has(b.id) || b.rate >= 1.15);
            if (sortedBanks.length === 0) {
                sortedBanks = [...BANKS_DATA].slice(0, 8);
            }
        }

        const labels = sortedBanks.map(b => b.shortName);
        const rates = sortedBanks.map(b => b.rate);
        
        // Màu sắc phân cấp thương hiệu: Vàng Gold cho Top 1, Xanh Ngọc cho Top 2-3, Xanh dương cho nhóm còn lại
        const colors = sortedBanks.map((b, idx) => {
            if (b.rate >= 1.20) return '#F59E0B'; // Gold VIP BVBank
            if (b.rate >= 1.15) return '#10B981'; // Emerald
            if (b.rate >= 1.05) return '#3B82F6'; // Sapphire
            return '#64748B'; // Slate
        });

        this.rateChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Lãi suất (% / phút)',
                    data: rates,
                    backgroundColor: colors,
                    borderRadius: 8,
                    maxBarThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 0.6,
                        max: 1.3,
                        ticks: {
                            color: '#94A3B8',
                            font: { family: "'JetBrains Mono', monospace", size: 10 },
                            callback: value => value.toFixed(2) + '%'
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: {
                            color: '#CBD5E1',
                            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' }
                        },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#F8FAFC',
                        bodyColor: '#FBBF24',
                        borderColor: 'rgba(245, 158, 11, 0.3)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            title: context => `Ngân hàng: ${context[0].label}`,
                            label: function(context) {
                                const rate = context.parsed.y;
                                const yield10m = (10000000 * rate) / 100;
                                const yieldHour = yield10m * 60;
                                return [
                                    `⚡ Lãi suất: ${rate.toFixed(2)}% / phút`,
                                    `💰 Gửi 10M nhận: +${yield10m.toLocaleString('vi-VN')} đ/phút`,
                                    `📈 Tích lũy sau 1h: +${yieldHour.toLocaleString('vi-VN')} đ`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    setRateFilter(filter) {
        this.rateFilterMode = filter;

        const btnTop10 = document.getElementById('btnRateTop10');
        const btnAll20 = document.getElementById('btnRateAll20');
        const btnMyBanks = document.getElementById('btnRateMyBanks');
        if (btnTop10) btnTop10.classList.toggle('active', filter === 'TOP10');
        if (btnAll20) btnAll20.classList.toggle('active', filter === 'ALL20');
        if (btnMyBanks) btnMyBanks.classList.toggle('active', filter === 'MYBANKS');

        this.initRateChart();
    }

    // =========================================================================
    // 7. MÁY TÍNH THỬ NGHIỆM GỬI THÊM VỐN (WHAT-IF CALCULATOR)
    // =========================================================================

    setSimAmount(amount) {
        this.simAmount = amount;
        this.renderWhatIfCalculator();
    }

    onSimParamChange() {
        const select = document.getElementById('simBankSelect');
        if (select) {
            this.simBankId = select.value;
        }
        this.renderWhatIfCalculator();
    }

    renderWhatIfCalculator() {
        const bank = BANKS_DATA.find(b => b.id === this.simBankId) || BANKS_DATA[0];
        const addedVelocityMin = this.simAmount * (bank.rate / 100);
        const addedVelocityHour = addedVelocityMin * 60;
        const addedVelocityDay = addedVelocityMin * 1440;

        const resMin = document.getElementById('simResultMin');
        const resHour = document.getElementById('simResultHour');
        const resDay = document.getElementById('simResultDay');

        if (resMin) resMin.textContent = '+' + this.formatMoney(addedVelocityMin) + '/phút';
        if (resHour) resHour.textContent = '+' + this.formatMoney(addedVelocityHour) + '/giờ';
        if (resDay) resDay.textContent = '+' + this.formatMoney(addedVelocityDay) + '/ngày';
    }

    executeSimDeposit() {
        if (typeof app !== 'undefined' && app.openDepositModal) {
            app.openDepositModal(this.simBankId);
            setTimeout(() => {
                const input = document.getElementById('depositAmountInput');
                if (input) {
                    input.value = this.simAmount.toLocaleString('vi-VN');
                    if (app.calculateDepositProfit) {
                        app.calculateDepositProfit(this.simAmount);
                    }
                }
            }, 100);
        }
    }

    // =========================================================================
    // 8. BẢNG DANH MỤC SỔ TIẾT KIỆM REALTIME (LIVE HOLDINGS TABLE)
    // =========================================================================

    renderHoldingsTable() {
        const tbody = document.getElementById('analyticsHoldingsTableBody');
        const emptyState = document.getElementById('analyticsHoldingsEmptyState');
        if (!tbody) return;

        const deposits = (typeof savingsManager !== 'undefined' && savingsManager.deposits) ? savingsManager.deposits : [];
        const activeList = deposits.filter(d => d.status === 'ACTIVE');

        if (activeList.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tbody.innerHTML = activeList.map(dep => {
            const calc = savingsManager.getDepositCalculations(dep);
            const initialP = (dep.initialPrincipal || dep.principal);
            const currentP = calc.currentPrincipal;
            const currentRoi = initialP > 0 ? (calc.currentUnclaimedInterest / initialP) * 100 : 0;

            if (dep.isCompound) {
                return `
                    <tr class="hover:bg-amber-500/[0.06] bg-amber-500/[0.02] border-b border-amber-500/20 transition-colors" id="holdingRow_${dep.id}">
                        <td class="py-3.5 px-4">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20 bg-gradient-to-tr from-amber-500 to-yellow-400">
                                    <i data-lucide="crown" class="w-4 h-4"></i>
                                </div>
                                <div>
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-bold text-amber-300 text-xs sm:text-sm">${dep.bankName}</span>
                                        <span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-slate-950">2S KÉP</span>
                                    </div>
                                    <div class="text-[10px] text-slate-500 font-mono">${dep.id}</div>
                                </div>
                            </div>
                        </td>

                        <td class="py-3.5 px-4 text-right">
                            <div class="font-black text-amber-300 font-mono text-xs sm:text-sm holding-principal" data-dep-id="${dep.id}">
                                ${this.formatMoney(currentP)}
                            </div>
                            <div class="text-[10px] text-slate-400">Gốc đầu: ${this.formatMoney(initialP)}</div>
                        </td>

                        <td class="py-3.5 px-4 text-center">
                            <span class="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-black text-xs">
                                1.00%/p
                            </span>
                            <div class="text-[10px] text-emerald-400 mt-0.5 font-mono font-semibold flex items-center justify-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                <span>2s/lần (#${calc.cycles})</span>
                            </div>
                        </td>

                        <td class="py-3.5 px-4 text-center">
                            <div class="font-mono text-slate-300 font-medium text-xs holding-time" data-dep-id="${dep.id}">
                                ${calc.timeFormatted}
                            </div>
                            <div class="text-[10px] text-amber-400/80">
                                ${calc.cycles} chu kỳ
                            </div>
                        </td>

                        <td class="py-3.5 px-4 text-right">
                            <div class="font-black text-emerald-400 font-mono text-sm sm:text-base live-interest-ticker holding-interest" data-dep-id="${dep.id}">
                                +${this.formatMoney(calc.currentUnclaimedInterest)}
                            </div>
                            <div class="text-[10px] text-slate-400">Lãi kép nhập gốc</div>
                        </td>

                        <td class="py-3.5 px-4 text-right">
                            <div class="font-black text-amber-300 font-mono text-xs sm:text-sm holding-roi" data-dep-id="${dep.id}">
                                +${currentRoi.toFixed(2)}%
                            </div>
                            <div class="text-[10px] text-slate-400">Tăng trưởng kép</div>
                        </td>

                        <td class="py-3.5 px-4 text-center">
                            <div class="flex items-center justify-center gap-1.5">
                                <button onclick="app.claimInterestOnly('${dep.id}')" title="Rút lãi kép về số dư ví, gốc tiếp tục chạy" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-amber-500/30 transition">
                                    Rút Lãi
                                </button>
                                <button onclick="app.confirmWithdrawDeposit('${dep.id}')" title="Rút toàn bộ gốc + lãi kép" class="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black transition shadow-sm">
                                    Tất Toán
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }

            return `
                <tr class="hover:bg-slate-800/40 transition-colors" id="holdingRow_${dep.id}">
                    <td class="py-3.5 px-4">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow" style="background: linear-gradient(135deg, ${dep.bankColor} 0%, ${dep.bankAccent || dep.bankColor} 100%);">
                                <i data-lucide="${dep.bankIcon || 'landmark'}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <div class="font-bold text-white text-xs sm:text-sm">${dep.bankName}</div>
                                <div class="text-[10px] text-slate-500 font-mono">${dep.id}</div>
                            </div>
                        </div>
                    </td>

                    <td class="py-3.5 px-4 text-right">
                        <div class="font-bold text-white font-mono text-xs sm:text-sm">${this.formatMoney(dep.principal)}</div>
                        <div class="text-[10px] text-blue-400">Đang khóa sinh lời</div>
                    </td>

                    <td class="py-3.5 px-4 text-center">
                        <span class="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-bold text-xs">
                            ${dep.rate.toFixed(2)}%/phút
                        </span>
                        <div class="text-[10px] text-slate-400 mt-0.5 font-mono">
                            +${this.formatMoney(calc.interestPerMinute)}/p
                        </div>
                    </td>

                    <td class="py-3.5 px-4 text-center">
                        <div class="font-mono text-slate-300 font-medium text-xs holding-time" data-dep-id="${dep.id}">
                            ${calc.timeFormatted}
                        </div>
                        <div class="text-[10px] text-emerald-400 flex items-center justify-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                            <span>Đang đếm giây</span>
                        </div>
                    </td>

                    <td class="py-3.5 px-4 text-right">
                        <div class="font-bold text-emerald-400 font-mono text-sm sm:text-base live-interest-ticker holding-interest" data-dep-id="${dep.id}">
                            +${this.formatMoney(calc.currentUnclaimedInterest)}
                        </div>
                        <div class="text-[10px] text-slate-400">Lãi thả nổi</div>
                    </td>

                    <td class="py-3.5 px-4 text-right">
                        <div class="font-bold text-sky-400 font-mono text-xs sm:text-sm holding-roi" data-dep-id="${dep.id}">
                            +${currentRoi.toFixed(2)}%
                        </div>
                        <div class="text-[10px] text-slate-400">ROI tích lũy</div>
                    </td>

                    <td class="py-3.5 px-4 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="app.claimInterestOnly('${dep.id}')" title="Rút lãi về số dư ví, gốc tiếp tục chạy" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition">
                                Rút Lãi
                            </button>
                            <button onclick="app.confirmWithdrawDeposit('${dep.id}')" title="Rút toàn bộ gốc + lãi" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm">
                                Rút Tất Cả
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    updateHoldingsTableRealtime() {
        const deposits = (typeof savingsManager !== 'undefined' && savingsManager.deposits) ? savingsManager.deposits : [];
        const activeList = deposits.filter(d => d.status === 'ACTIVE');

        if (activeList.length === 0) return;

        activeList.forEach(dep => {
            const calc = savingsManager.getDepositCalculations(dep);
            const initialP = (dep.initialPrincipal || dep.principal);
            const currentRoi = initialP > 0 ? (calc.currentUnclaimedInterest / initialP) * 100 : 0;

            const timeEl = document.querySelector(`.holding-time[data-dep-id="${dep.id}"]`);
            if (timeEl) timeEl.textContent = calc.timeFormatted;

            const pEl = document.querySelector(`.holding-principal[data-dep-id="${dep.id}"]`);
            if (pEl) pEl.textContent = this.formatMoney(calc.currentPrincipal);

            const interestEl = document.querySelector(`.holding-interest[data-dep-id="${dep.id}"]`);
            if (interestEl) interestEl.textContent = '+' + this.formatMoney(calc.currentUnclaimedInterest);

            const roiEl = document.querySelector(`.holding-roi[data-dep-id="${dep.id}"]`);
            if (roiEl) roiEl.textContent = '+' + currentRoi.toFixed(2) + '%';
        });
    }

    // =========================================================================
    // 9. TRÍ TUỆ TÀI CHÍNH & KHUYẾN NGHỊ THÔNG MINH (AI WEALTH ADVISORY)
    // =========================================================================

    renderAIAdvisory(m) {
        const idleEl = document.getElementById('aiAdviceIdleCash');
        const divEl = document.getElementById('aiAdviceDiversification');
        const compEl = document.getElementById('aiAdviceCompounding');

        if (idleEl) {
            if (m.available > 10000000) {
                const recDep = Math.floor(m.available * 0.7);
                const extraYieldHour = Math.floor(recDep * 0.012 * 60);
                idleEl.innerHTML = `Bạn đang có <b class="text-white">${this.formatMoney(m.available)}</b> ở số dư khả dụng. Nếu trích 70% (<b class="text-emerald-400">${this.formatMoney(recDep)}</b>) gửi vào BVBank (1.20%/phút), bạn sẽ nhận thêm tới <b class="text-amber-400">+${this.formatMoney(extraYieldHour)}/giờ</b>!`;
            } else {
                idleEl.textContent = `Dòng tiền khả dụng đang ở mức an toàn cho thanh khoản và rút tiền Napas 24/7.`;
            }
        }

        if (divEl) {
            if (m.activeCount <= 1) {
                divEl.textContent = `Hiện tại danh mục đang tập trung ở 1 ngân hàng. Khuyến nghị phân bổ vốn sang 2-3 ngân hàng lãi cao (BVBank 1.20%, SHB 1.18%, Nam A Bank 1.16%) để tối ưu hóa an toàn vốn.`;
            } else {
                divEl.innerHTML = `Danh mục đã được phân tán tốt qua <b class="text-white">${m.activeCount} sổ tiết kiệm</b>, giúp kiểm soát thanh khoản và tối đa hóa biên độ sinh lời!`;
            }
        }

        if (compEl) {
            if (m.unclaimed > 5000000) {
                compEl.innerHTML = `Bạn đang có <b class="text-emerald-400">+${this.formatMoney(m.unclaimed)}</b> tiền lãi chưa rút. Hãy ấn "Rút Lãi" rồi mở thêm một sổ tiết kiệm mới để kích hoạt hiệu ứng <b>Lãi Kép Realtime</b>!`;
            } else {
                compEl.textContent = `Rút tiền lãi sau mỗi chu kỳ 60 phút và tái đầu tư vào sổ mới sẽ tạo hiệu ứng Lãi Kép Realtime, tăng tốc độ nhân đôi tài sản.`;
            }
        }
    }

    // =========================================================================
    // 10. BẢO MẬT (PRIVACY MODE) & BÁO CÁO TÀI CHÍNH (EXPORT REPORT)
    // =========================================================================

    togglePrivacy() {
        this.isPrivacyMode = !this.isPrivacyMode;

        const btnText = document.getElementById('privacyBtnText');
        if (btnText) {
            btnText.textContent = this.isPrivacyMode ? 'Hiện Số Tiền' : 'Bảo Mật';
        }

        const metrics = this.calculateMetrics();
        this.renderKPIs(metrics);
        this.renderBreakdownTable(metrics);
        this.renderProjections(metrics);
        this.renderWhatIfCalculator();
        this.renderHoldingsTable();

        if (typeof app !== 'undefined' && app.showToast) {
            app.showToast(this.isPrivacyMode ? 'Đã bật chế độ bảo mật số dư!' : 'Đã hiển thị số dư đầy đủ!', 'info', 2000);
        }
    }

    refreshData(manual = false) {
        const icon = document.getElementById('btnRefreshIcon');
        if (icon) {
            icon.classList.add('animate-spin');
            setTimeout(() => icon.classList.remove('animate-spin'), 600);
        }

        const metrics = this.calculateMetrics();
        this.renderKPIs(metrics);
        this.renderBreakdownTable(metrics);
        this.renderProjections(metrics);
        this.renderHoldingsTable();
        this.renderAIAdvisory(metrics);

        if (this.assetChart) this.initAssetChart(metrics);
        if (this.growthChart) this.initGrowthChart(metrics);
        if (this.rateChart) this.initRateChart();

        if (manual && typeof app !== 'undefined' && app.showToast) {
            app.showToast('Đã làm mới dữ liệu phân tích tài sản Realtime!', 'success', 2000);
        }
    }

    openReportModal() {
        const modal = document.getElementById('financialReportModal');
        const content = document.getElementById('reportModalContent');
        if (!modal || !content) return;

        const m = this.calculateMetrics();
        const nowStr = new Date().toLocaleString('vi-VN');
        const userSTK = this.user?.accountNumber || 'W03889968688';
        const userName = this.user?.accountName || 'NGUYEN VAN A';

        content.innerHTML = `
            <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">Thời gian tạo báo cáo:</span>
                    <span class="font-mono text-white font-bold">${nowStr}</span>
                </div>
                <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">Chủ tài khoản:</span>
                    <span class="text-white font-bold uppercase">${userName}</span>
                </div>
                <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span class="text-slate-400">Số tài khoản DigiBank:</span>
                    <span class="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">${userSTK}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-400">Điểm sức khỏe danh mục:</span>
                    <span class="text-sky-400 font-bold font-mono">${m.healthScore}/100 - Tối Ưu Hóa Cao</span>
                </div>
            </div>

            <div class="space-y-2">
                <h4 class="font-bold text-white text-xs uppercase tracking-wider">Tổng Quan Danh Mục & Nguồn Vốn</h4>
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span class="text-slate-400 block text-[11px]">Tổng Tài Sản Ròng:</span>
                        <span class="text-base font-black font-mono text-white mt-1 block">${this.formatMoney(m.networth)}</span>
                        <span class="text-[10px] text-emerald-400 font-semibold">${m.roiPercent >= 0 ? '+' : ''}${m.roiPercent.toFixed(2)}% ROI so với gốc</span>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span class="text-slate-400 block text-[11px]">Tốc Độ Sinh Lời / Phút:</span>
                        <span class="text-base font-black font-mono text-amber-400 mt-1 block">+${this.formatMoney(m.velocityMin)}/phút</span>
                        <span class="text-[10px] text-slate-400 font-semibold">Tương đương +${this.formatMoney(m.velocityHour)}/giờ</span>
                    </div>
                </div>
            </div>

            <div class="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-slate-400">1. Số dư ví khả dụng:</span>
                    <span class="font-mono font-bold text-emerald-400">${this.formatMoney(m.available)}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-400">2. Tiền gốc đang gửi tiết kiệm:</span>
                    <span class="font-mono font-bold text-blue-400">${this.formatMoney(m.locked)} (${m.activeCount} sổ)</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-slate-400">3. Tiền lãi thả nổi (chờ rút):</span>
                    <span class="font-mono font-bold text-amber-400">+${this.formatMoney(m.unclaimed)}</span>
                </div>
                <div class="flex items-center justify-between border-t border-slate-800 pt-2 font-semibold">
                    <span class="text-slate-300">4. Lợi nhuận lũy kế đã chốt về ví:</span>
                    <span class="font-mono font-bold text-purple-400">${this.formatMoney(m.claimed)}</span>
                </div>
            </div>

            <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] leading-relaxed">
                ✓ Báo cáo được xác thực tự động bởi DigiBank Wealth Engine v4.2. Dữ liệu lãi suất tính theo chuẩn Realtime Per-Minute (0.70% - 1.20%/phút).
            </div>
        `;

        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    }

    closeReportModal() {
        const modal = document.getElementById('financialReportModal');
        if (modal) modal.classList.add('hidden');
    }

    copyReportText() {
        const m = this.calculateMetrics();
        const nowStr = new Date().toLocaleString('vi-VN');
        const userSTK = this.user?.accountNumber || 'W03889968688';
        const userName = this.user?.accountName || 'NGUYEN VAN A';

        const reportText = `=== BÁO CÁO PHÂN TÍCH TÀI SẢN & LỢI NHUẬN DIGIBANK PRIME ===
Thời gian: ${nowStr}
Khách hàng: ${userName}
Số tài khoản: ${userSTK}
Điểm sức khỏe danh mục: ${m.healthScore}/100

1. TỔNG TÀI SẢN RÒNG: ${m.networth.toLocaleString('vi-VN')} VNĐ (${m.roiPercent.toFixed(2)}% ROI)
2. TỐC ĐỘ SINH LỜI HIỆN TẠI: +${m.velocityMin.toLocaleString('vi-VN')} VNĐ/phút (+${m.velocityHour.toLocaleString('vi-VN')} VNĐ/giờ)
3. CƠ CẤU PHÂN BỔ:
   - Số dư khả dụng: ${m.available.toLocaleString('vi-VN')} VNĐ
   - Tiền gốc tiết kiệm: ${m.locked.toLocaleString('vi-VN')} VNĐ (${m.activeCount} sổ)
   - Lãi thả nổi chưa rút: +${m.unclaimed.toLocaleString('vi-VN')} VNĐ
   - Lãi lũy kế đã chốt: ${m.claimed.toLocaleString('vi-VN')} VNĐ
4. LÃI SUẤT BQ GIA QUYỀN: ${m.weightedRate.toFixed(2)}%/phút
5. DỰ PHÓNG LỢI NHUẬN:
   - Sau 1 giờ: +${(m.unclaimed + m.velocityHour).toLocaleString('vi-VN')} VNĐ
   - Sau 24 giờ: +${(m.unclaimed + m.velocityDay).toLocaleString('vi-VN')} VNĐ
===========================================================`;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(reportText).then(() => {
                if (typeof app !== 'undefined' && app.showToast) {
                    app.showToast('Đã sao chép báo cáo tài chính vào bộ nhớ tạm!', 'success');
                }
            }).catch(() => {
                this.fallbackCopyText(reportText);
            });
        } else {
            this.fallbackCopyText(reportText);
        }
    }

    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof app !== 'undefined' && app.showToast) {
                app.showToast('Đã sao chép báo cáo tài chính!', 'success');
            }
        } catch (err) {
            alert('Không thể tự động sao chép. Vui lòng chọn và copy thủ công.');
        }
        document.body.removeChild(textArea);
    }
}

// Khởi tạo instance toàn cục
const analyticsManager = new AnalyticsManager();
window.analyticsManager = analyticsManager;
