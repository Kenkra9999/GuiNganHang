// Gói Đặc Quyền Riêng Biệt: Lãi Suất Kép Liên Tục 2 Giây (Auto-Compounding)
const COMPOUND_PACKAGE = {
    id: 'digibank-compound',
    code: 'DIGIBANK_VIP',
    name: 'DigiBank Prime - Lãi Suất Kép Liên Tục (Auto-Compounding)',
    shortName: 'DigiBank Lãi Kép 2S',
    rate: 1.00, // 1.00% / phút
    compoundIntervalSec: 2, // 2s tự cộng dồn vào gốc
    color: '#f59e0b',
    accentColor: '#10b981',
    badge: '👑 ĐẶC QUYỀN LÃI KÉP 2S',
    badgeColor: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black',
    icon: 'crown',
    minDeposit: 100000,
    description: 'Tự động nhập lãi vào gốc mỗi 2 giây! Chu kỳ tiếp theo dùng chính gốc mới tính tiếp 1.00%/phút, lãi mẹ đẻ lãi con liên tục!',
    tag: 'Đặc Quyền VIP'
};

// Danh sách 20 Ngân hàng uy tín tại Việt Nam với lãi suất gửi tiết kiệm theo phút (0.70% - 1.20%/phút)
const BANKS_DATA = [
    {
        id: 'bvb',
        code: 'BVBank',
        name: 'Ngân hàng TMCP Bản Việt',
        shortName: 'BVBank',
        rate: 1.20, // 1.20%/phút (Cao nhất)
        color: '#00529b',
        accentColor: '#f39200',
        badge: 'TOP 1 LÃI SUẤT',
        badgeColor: 'bg-amber-500 text-slate-950 font-bold',
        icon: 'landmark',
        minDeposit: 100000,
        description: 'Lợi nhuận siêu tốc 1.20%/phút - Nhận tiền về tài khoản tức thì',
        tag: 'Khuyên Dùng'
    },
    {
        id: 'shb',
        code: 'SHB',
        name: 'Ngân hàng TMCP Sài Gòn - Hà Nội',
        shortName: 'SHB Bank',
        rate: 1.18, // 1.18%/phút
        color: '#f58220',
        accentColor: '#004a99',
        badge: 'LÃI CỰC CAO',
        badgeColor: 'bg-orange-500 text-white font-bold',
        icon: 'building-2',
        minDeposit: 100000,
        description: 'Tăng trưởng tài sản vượt trội với 1.18%/phút',
        tag: 'Hot'
    },
    {
        id: 'nab',
        code: 'NamABank',
        name: 'Ngân hàng TMCP Nam Á',
        shortName: 'Nam A Bank',
        rate: 1.16, // 1.16%/phút
        color: '#fdb813',
        accentColor: '#006837',
        badge: 'ƯU ĐÃI VIP',
        badgeColor: 'bg-yellow-500 text-slate-900 font-bold',
        icon: 'coins',
        minDeposit: 100000,
        description: 'Tích lũy linh hoạt, sinh lời từng giây',
        tag: 'Hot'
    },
    {
        id: 'vpb',
        code: 'VPBank',
        name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
        shortName: 'VPBank',
        rate: 1.15, // 1.15%/phút
        color: '#00b050',
        accentColor: '#ed1c24',
        badge: 'PHỔ BIẾN NHẤT',
        badgeColor: 'bg-emerald-500 text-white font-bold',
        icon: 'zap',
        minDeposit: 100000,
        description: 'Công nghệ tài chính số dẫn đầu - Lãi 1.15%/phút',
        tag: 'Phổ biến'
    },
    {
        id: 'ocb',
        code: 'OCB',
        name: 'Ngân hàng TMCP Phương Đông',
        shortName: 'OCB OMNI',
        rate: 1.14, // 1.14%/phút
        color: '#008744',
        accentColor: '#f9a01b',
        badge: 'TIỆN ÍCH CAO',
        badgeColor: 'bg-green-600 text-white font-bold',
        icon: 'wallet',
        minDeposit: 100000,
        description: 'Ngân hàng số không giới hạn - Sinh lời 1.14%/phút',
        tag: 'Nổi bật'
    },
    {
        id: 'vib',
        code: 'VIB',
        name: 'Ngân hàng TMCP Quốc Tế Việt Nam',
        shortName: 'VIB Bank',
        rate: 1.12, // 1.12%/phút
        color: '#0054a6',
        accentColor: '#ee6c00',
        badge: 'TRẢI NGHIỆM ĐỈNH',
        badgeColor: 'bg-blue-600 text-white font-bold',
        icon: 'sparkles',
        minDeposit: 100000,
        description: 'Tiên phong thẻ & tiết kiệm số - 1.12%/phút',
        tag: 'Nổi bật'
    },
    {
        id: 'tpb',
        code: 'TPBank',
        name: 'Ngân hàng TMCP Tiên Phong',
        shortName: 'TPBank LiveBank',
        rate: 1.10, // 1.10%/phút
        color: '#6e2b8b',
        accentColor: '#ea5420',
        badge: 'SỐ HÓA 24/7',
        badgeColor: 'bg-purple-600 text-white font-bold',
        icon: 'cpu',
        minDeposit: 100000,
        description: 'LiveBank giao dịch siêu tốc, sinh lời 1.10%/phút',
        tag: 'Yêu thích'
    },
    {
        id: 'hdb',
        code: 'HDBank',
        name: 'Ngân hàng TMCP Phát triển TP.HCM',
        shortName: 'HDBank',
        rate: 1.08, // 1.08%/phút
        color: '#da251c',
        accentColor: '#fdb813',
        badge: 'CAM KẾT LỢI NHUẬN',
        badgeColor: 'bg-red-600 text-white font-bold',
        icon: 'trending-up',
        minDeposit: 100000,
        description: 'Cam kết vàng cho tài sản của bạn với 1.08%/phút',
        tag: 'Ưu đãi'
    },
    {
        id: 'mb',
        code: 'MBBank',
        name: 'Ngân hàng TMCP Quân Đội',
        shortName: 'MB Bank',
        rate: 1.05, // 1.05%/phút
        color: '#002f6c',
        accentColor: '#e60012',
        badge: 'UY TÍN QUÂN ĐỘI',
        badgeColor: 'bg-blue-900 text-white font-bold border border-blue-400',
        icon: 'shield-check',
        minDeposit: 100000,
        description: 'An tâm tuyệt đối - Sinh lời ổn định 1.05%/phút',
        tag: 'An toàn'
    },
    {
        id: 'lpb',
        code: 'LPBank',
        name: 'Ngân hàng TMCP Lộc Phát Việt Nam',
        shortName: 'LPBank',
        rate: 1.02, // 1.02%/phút
        color: '#f37021',
        accentColor: '#005baa',
        badge: 'LỘC PHÁT',
        badgeColor: 'bg-orange-600 text-white font-bold',
        icon: 'gem',
        minDeposit: 100000,
        description: 'Trao lộc đón tài - Sinh lời mỗi phút 1.02%',
        tag: 'Ưu đãi'
    },
    {
        id: 'msb',
        code: 'MSB',
        name: 'Ngân hàng TMCP Hàng Hải Việt Nam',
        shortName: 'MSB Maritime',
        rate: 1.00, // 1.00%/phút
        color: '#ea5404',
        accentColor: '#2b2927',
        badge: 'CHUẨN 1.0%/PHÚT',
        badgeColor: 'bg-amber-600 text-white font-bold',
        icon: 'circle-dollar-sign',
        minDeposit: 100000,
        description: 'Cùng vươn tầm thế hệ mới - Tròn 1.00%/phút',
        tag: 'Tiêu chuẩn'
    },
    {
        id: 'stb',
        code: 'Sacombank',
        name: 'Ngân hàng TMCP Sài Gòn Thương Tín',
        shortName: 'Sacombank',
        rate: 0.95, // 0.95%/phút
        color: '#004b87',
        accentColor: '#ea5404',
        badge: 'VỮNG BƯỚC THÀNH CÔNG',
        badgeColor: 'bg-blue-800 text-white font-bold',
        icon: 'award',
        minDeposit: 100000,
        description: 'Mạng lưới sâu rộng, lãi suất 0.95%/phút',
        tag: 'Phổ biến'
    },
    {
        id: 'ssb',
        code: 'SeABank',
        name: 'Ngân hàng TMCP Đông Nam Á',
        shortName: 'SeABank',
        rate: 0.92, // 0.92%/phút
        color: '#c8102e',
        accentColor: '#2d2926',
        badge: 'KẾT NỐI TƯƠNG LAI',
        badgeColor: 'bg-rose-700 text-white font-bold',
        icon: 'layers',
        minDeposit: 100000,
        description: 'Đồng hành phát triển bền vững 0.92%/phút',
        tag: 'Ổn định'
    },
    {
        id: 'tcb',
        code: 'Techcombank',
        name: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
        shortName: 'Techcombank',
        rate: 0.90, // 0.90%/phút
        color: '#e41f26',
        accentColor: '#1c1d1f',
        badge: 'VƯỢT TRỘI MỖI NGÀY',
        badgeColor: 'bg-red-700 text-white font-bold',
        icon: 'diamond',
        minDeposit: 100000,
        description: 'Nền tảng sinh lời tự động - 0.90%/phút',
        tag: 'Top Brand'
    },
    {
        id: 'eib',
        code: 'Eximbank',
        name: 'Ngân hàng TMCP Xuất Nhập Khẩu VN',
        shortName: 'Eximbank',
        rate: 0.88, // 0.88%/phút
        color: '#005ba4',
        accentColor: '#72bf44',
        badge: 'GIAO THƯƠNG QUỐC TẾ',
        badgeColor: 'bg-cyan-700 text-white font-bold',
        icon: 'globe',
        minDeposit: 100000,
        description: 'An tâm đầu tư, bảo mật tiêu chuẩn quốc tế',
        tag: 'Ổn định'
    },
    {
        id: 'acb',
        code: 'ACB',
        name: 'Ngân hàng TMCP Á Châu',
        shortName: 'ACB Bank',
        rate: 0.85, // 0.85%/phút
        color: '#0072bc',
        accentColor: '#80c342',
        badge: 'NGÂN HÀNG ĐÁNG TIN CẬY',
        badgeColor: 'bg-sky-600 text-white font-bold',
        icon: 'check-circle-2',
        minDeposit: 100000,
        description: 'Quản trị chuẩn mực, lãi suất 0.85%/phút',
        tag: 'Uy tín'
    },
    {
        id: 'bab',
        code: 'BacABank',
        name: 'Ngân hàng TMCP Bắc Á',
        shortName: 'Bac A Bank',
        rate: 0.80, // 0.80%/phút
        color: '#a67c52',
        accentColor: '#002d62',
        badge: 'GIA TRỊ BỀN VỮNG',
        badgeColor: 'bg-stone-600 text-white font-bold',
        icon: 'scale',
        minDeposit: 100000,
        description: 'Vì hạnh phúc đích thực của khách hàng',
        tag: 'Bền vững'
    },
    {
        id: 'ctg',
        code: 'VietinBank',
        name: 'Ngân hàng TMCP Công Thương VN',
        shortName: 'VietinBank',
        rate: 0.78, // 0.78%/phút
        color: '#005baa',
        accentColor: '#ed1c24',
        badge: 'BIG 4 QUỐC DOANH',
        badgeColor: 'bg-indigo-700 text-white font-bold',
        icon: 'shield',
        minDeposit: 100000,
        description: 'Nâng giá trị cuộc sống - Bảo chứng quốc gia',
        tag: 'Big 4'
    },
    {
        id: 'vcb',
        code: 'Vietcombank',
        name: 'Ngân hàng TMCP Ngoại Thương VN',
        shortName: 'Vietcombank',
        rate: 0.75, // 0.75%/phút
        color: '#00693e',
        accentColor: '#7aba27',
        badge: 'BIG 4 DẪN ĐẦU',
        badgeColor: 'bg-emerald-800 text-white font-bold border border-emerald-400',
        icon: 'crown',
        minDeposit: 100000,
        description: 'Ngân hàng số 1 Việt Nam - An toàn tuyệt đối',
        tag: 'Big 4'
    },
    {
        id: 'bidv',
        code: 'BIDV',
        name: 'Ngân hàng TMCP Đầu tư & Phát triển VN',
        shortName: 'BIDV SmartBanking',
        rate: 0.72, // 0.72%/phút
        color: '#0054a6',
        accentColor: '#72bf44',
        badge: 'BIG 4 LÂU ĐỜI NHẤT',
        badgeColor: 'bg-blue-800 text-white font-bold',
        icon: 'landmark',
        minDeposit: 100000,
        description: 'Vững bước tương lai cùng ngân hàng lâu đời nhất',
        tag: 'Big 4'
    }
];

// Cấu hình Hệ thống Ví Trung Tâm (Core Wallet) & Socket Server
const isHttp = typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http');
const CORE_WALLET_CONFIG = {
    // Tự động nhận diện host hiện tại hoặc dùng URL tùy chỉnh
    apiUrl: isHttp ? `${window.location.origin}/api/v1` : 'http://localhost:8989/api/v1',
    socketUrl: isHttp ? window.location.origin : 'http://localhost:8989',
    appSecretToken: 'APP_SECRET_TOKEN_DIGIBANK_VIP_2026'
};

// Danh sách tài khoản mẫu trong Hệ Sinh Thái Liên Website & Liên Ứng Dụng
const ECOSYSTEM_ACCOUNTS = [
    {
        stk: 'OKX520061041',
        owner_name: 'OKX Futures Pro Trader',
        origin_web: 'OKX Futures Trading (Crypto)',
        web_code: 'OKX',
        icon: 'trending-up',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    },
    {
        stk: 'BINANCE888',
        owner_name: 'Binance VIP Wallet',
        origin_web: 'Binance Exchange (Crypto)',
        web_code: 'BNB',
        icon: 'coins',
        badgeColor: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    },
    {
        stk: 'W01829102948',
        owner_name: 'Tran Thi Shop',
        origin_web: 'Web Shop E-Commerce',
        web_code: 'W01',
        icon: 'shopping-bag',
        badgeColor: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
    },
    {
        stk: 'W02746192834',
        owner_name: 'Nguyen Van Game',
        origin_web: 'Web Game PlayZone',
        web_code: 'W02',
        icon: 'gamepad-2',
        badgeColor: 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
    },
    {
        stk: 'W03889968688',
        owner_name: 'NGUYEN VAN A',
        origin_web: 'DigiBank Prime (Web Ngân Hàng)',
        web_code: 'W03',
        icon: 'landmark',
        badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    },
    {
        stk: 'W04918237461',
        owner_name: 'Le Van Crypto',
        origin_web: 'Web Crypto Exchange',
        web_code: 'W04',
        icon: 'bitcoin',
        badgeColor: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    },
    {
        stk: 'W05123456789',
        owner_name: 'Pham Thi Service',
        origin_web: 'Web Dịch Vụ Số',
        web_code: 'W05',
        icon: 'server',
        badgeColor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    }
];

// Thông tin người dùng mặc định (Chuẩn 12 ký tự: [Mã Web 3 ký tự][9 số ngẫu nhiên])
const DEFAULT_USER = {
    accountNumber: 'W03889968688', // STK chuẩn 12 ký tự của DigiBank Prime
    webCode: 'W03',
    originWeb: 'DigiBank Prime (Web Ngân Hàng)',
    accountName: 'NGUYEN VAN A',
    phoneNumber: '0988 888 888',
    tier: 'DIAMOND VIP',
    availableBalance: 100000000, // 100 triệu VNĐ mặc định khởi tạo
    totalInterestEarned: 0,
    joinDate: new Date().toISOString()
};

