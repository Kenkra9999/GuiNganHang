// Phân tích biểu đồ và thống kê tài chính bằng Chart.js
class AnalyticsManager {
    constructor() {
        this.assetChart = null;
        this.rateChart = null;
        this.growthChart = null;
        this.growthHistory = [];
    }

    initCharts(user, savingsStats) {
        this.initAssetChart(user, savingsStats);
        this.initRateChart();
        this.initGrowthChart(user, savingsStats);
    }

    initAssetChart(user, savingsStats) {
        const ctx = document.getElementById('assetAllocationChart');
        if (!ctx) return;

        if (this.assetChart) {
            this.assetChart.destroy();
        }

        const available = user.availableBalance || 0;
        const locked = savingsStats.totalPrincipalLocked || 0;
        const interest = savingsStats.totalLiveInterest || 0;

        this.assetChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Số dư khả dụng', 'Đang gửi tiết kiệm', 'Lãi sinh lời chưa rút'],
                datasets: [{
                    data: [available, locked, interest],
                    backgroundColor: [
                        '#10B981', // Emerald green
                        '#3B82F6', // Blue
                        '#F59E0B'  // Amber gold
                    ],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94A3B8',
                            font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed || 0;
                                return ` ${context.label}: ${val.toLocaleString('vi-VN')} VNĐ`;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }

    initRateChart() {
        const ctx = document.getElementById('bankRatesComparisonChart');
        if (!ctx) return;

        if (this.rateChart) {
            this.rateChart.destroy();
        }

        // Lấy top 10 ngân hàng lãi cao nhất
        const sortedBanks = [...BANKS_DATA].sort((a, b) => b.rate - a.rate).slice(0, 10);
        const labels = sortedBanks.map(b => b.shortName);
        const rates = sortedBanks.map(b => b.rate);
        const colors = sortedBanks.map((b, idx) => idx === 0 ? '#F59E0B' : (idx < 3 ? '#10B981' : '#3B82F6'));

        this.rateChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Lãi suất (% / phút)',
                    data: rates,
                    backgroundColor: colors,
                    borderRadius: 6,
                    maxBarThickness: 32
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
                            callback: value => value.toFixed(2) + '%'
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94A3B8', font: { size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => ` Lãi suất: ${context.parsed.y.toFixed(2)}% / phút`
                        }
                    }
                }
            }
        });
    }

    initGrowthChart(user, savingsStats) {
        const ctx = document.getElementById('profitGrowthChart');
        if (!ctx) return;

        if (this.growthChart) {
            this.growthChart.destroy();
        }

        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.growthHistory = [
            { time: nowStr, profit: user.totalInterestEarned + savingsStats.totalLiveInterest }
        ];

        this.growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.growthHistory.map(h => h.time),
                datasets: [{
                    label: 'Tổng tiền lãi tích lũy (VNĐ)',
                    data: this.growthHistory.map(h => h.profit),
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#10B981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#94A3B8',
                            callback: value => value.toLocaleString('vi-VN') + ' đ'
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    x: {
                        ticks: { color: '#94A3B8' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => ` Lãi tích lũy: ${context.parsed.y.toLocaleString('vi-VN')} VNĐ`
                        }
                    }
                }
            }
        });
    }

    updateData(user, savingsStats) {
        if (this.assetChart) {
            const available = user.availableBalance || 0;
            const locked = savingsStats.totalPrincipalLocked || 0;
            const interest = savingsStats.totalLiveInterest || 0;
            this.assetChart.data.datasets[0].data = [available, locked, interest];
            this.assetChart.update('none'); // Update smoothly without full animation restart
        }

        if (this.growthChart) {
            const currentTotalInterest = (user.totalInterestEarned || 0) + (savingsStats.totalLiveInterest || 0);
            const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Cập nhật mỗi 5 giây 1 điểm dữ liệu
            if (this.growthHistory.length === 0 || Date.now() - (this.lastGrowthTime || 0) > 5000) {
                this.lastGrowthTime = Date.now();
                this.growthHistory.push({ time: nowStr, profit: currentTotalInterest });
                if (this.growthHistory.length > 15) this.growthHistory.shift();

                this.growthChart.data.labels = this.growthHistory.map(h => h.time);
                this.growthChart.data.datasets[0].data = this.growthHistory.map(h => h.profit);
                this.growthChart.update('none');
            }
        }
    }
}

const analyticsManager = new AnalyticsManager();
