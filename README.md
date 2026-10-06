# 🏦 DigiBank Prime 4.0 - Hệ Thống Ngân Hàng Số & Chuyển Tiền Liên Website Realtime

Ứng dụng web ngân hàng số cao cấp được thiết kế hiện đại, tích hợp **Hệ Thống Chuyển Tiền Liên Website Hệ Sinh Thái (Core Wallet & Socket.io Realtime)** và **Gửi Tiết Kiệm Nhận Lãi Siêu Tốc Theo Phút (0.70% - 1.20%/phút)** tại **20 Ngân Hàng Hàng Đầu Việt Nam**.

---

## 🌐 TÀI LIỆU ĐẶC TẢ KỸ THUẬT: HỆ THỐNG CHUYỂN TIỀN LIÊN WEBSITE

### 1. QUY CHUẨN SỐ TÀI KHOẢN (STK)
- **Độ dài bắt buộc**: Đúng 12 ký tự (chữ in hoa và số, không khoảng trắng, không ký tự đặc biệt).
- **Quy tắc định dạng**: `[3 ký tự mã Web][9 ký tự số ngẫu nhiên]`.
  - **Web Shop (W01)**: `W01829102948` (Tran Thi Shop)
  - **Web Game (W02)**: `W02746192834` (Nguyen Van Game)
  - **Web Ngân Hàng DigiBank (W03)**: `W03889968688` (NGUYEN VAN A)
  - **Web Crypto (W04)**: `W04918237461` (Le Van Crypto)
  - **Web Dịch Vụ (W05)**: `W05123456789` (Pham Thi Service)
- **Tính duy nhất**: Mỗi tài khoản khi đăng ký trên bất kỳ website nào đều được cấp duy nhất một STK 12 ký tự đã được định danh trên Hệ thống Ví Trung tâm (Core Wallet).

---

### 2. KIẾN TRÚC GIAO TIẾP VÀ CÁC ĐẦU MÚT API

Tất cả các website con giao tiếp qua **Core Wallet Server** và **Realtime Socket Server**.

#### 2.1. API Tra cứu số tài khoản (Kiểm tra trước khi chuyển)
- **Phương thức**: `GET`
- **Endpoint**: `http://localhost:8989/api/v1/accounts/lookup?stk={STK_NGUOI_NHAN}`
- **Header**: `Authorization: Bearer {APP_SECRET_TOKEN}`
- **Dữ liệu trả về (JSON)**:
```json
{
  "status": "SUCCESS",
  "data": {
    "stk": "W02746192834",
    "owner_name": "Nguyen Van Game",
    "origin_web": "Web Game PlayZone"
  }
}
```

#### 2.2. API Thực thi chuyển tiền (Bắt buộc Idempotency & Row Locking)
- **Phương thức**: `POST`
- **Endpoint**: `http://localhost:8989/api/v1/transfer`
- **Header**:
  - `Authorization: Bearer {APP_SECRET_TOKEN}`
  - `Content-Type: application/json`
- **Body**:
```json
{
  "request_id": "REQ_20261006_W03_991823", 
  "sender_stk": "W03889968688",
  "receiver_stk": "W02746192834",
  "amount": 50000,
  "note": "Chuyen tien thu nghiem"
}
```
- **Dữ liệu trả về khi thành công**:
```json
{
  "status": "SUCCESS",
  "message": "Chuyển tiền thành công",
  "data": {
    "transaction_id": "TX_88392019482",
    "amount": 50000,
    "sender_balance_after": 99950000,
    "receiver_stk": "W02746192834",
    "receiver_name": "Nguyen Van Game",
    "note": "Chuyen tien thu nghiem",
    "timestamp": 1791257071458
  }
}
```

---

### 3. CƠ CHẾ REALTIME HIỂN THỊ THÔNG BÁO (SOCKET.IO)

- **Địa chỉ Socket**: `ws://localhost:8989` (hoặc domain cấu hình)
- **Kết nối & Join Room**:
```javascript
const socket = io("http://localhost:8989", {
  auth: { token: APP_SECRET_TOKEN }
});

const mySTK = "W03889968688";
socket.emit("JOIN_ACCOUNT_ROOM", mySTK);

// 1. Lắng nghe thông báo NHẬN ĐƯỢC TIỀN
socket.on("EVENT_MONEY_RECEIVED", (payload) => {
  /*
    payload: {
      amount: 50000,
      sender_stk: "W01829102948",
      sender_name: "Tran Thi Shop",
      sender_web: "Web Shop E-Commerce",
      new_balance: 100050000,
      message: "Bạn vừa nhận được 50,000 đ từ Tran Thi Shop (STK: W01829102948)"
    }
  */
  showReceivedMoneyPopup(payload);
  updateHeaderBalance(payload.new_balance);
});

// 2. Lắng nghe thông báo ĐÃ TRỪ TIỀN
socket.on("EVENT_MONEY_DEDUCTED", (payload) => {
  showDeductedMoneyToast(payload);
  updateHeaderBalance(payload.new_balance);
});
```

---

### 4. QUY TRÌNH UI/UX TẠI GIAO DIỆN
1. **Ô nhập STK người nhận**:
   - Giới hạn đúng 12 ký tự (chữ hoa + số).
   - Khi gõ đủ 12 ký tự $\rightarrow$ Tự động gọi API 2.1 (Lookup) lấy tên người nhận & tên web nguồn hiển thị thẻ màu XANH LÁ.
   - Nếu STK không tồn tại $\rightarrow$ Báo ĐỎ: *"Số tài khoản không tồn tại trên hệ thống Ví Trung Tâm"*.
2. **Nút "Chuyển tiền"**:
   - Vô hiệu hóa nút (Disable) ngay khi bấm để chống click liên tiếp.
   - Tự động sinh `request_id` ngẫu nhiên cho mỗi lượt bấm.
   - Khi thành công $\rightarrow$ Hiển thị **Biên Lai Giao Dịch VIP** chuẩn ngân hàng.
3. **Bên nhận**:
   - Khi nhận `EVENT_MONEY_RECEIVED` qua Socket $\rightarrow$ Chuông Ting-Ting reo + Bắn pháo hoa Confetti + Hiện Modal *"🔔 Biến động số dư (+)"* nổi bật + Tự nhảy số dư và ghi sổ lịch sử.
4. **Bộ giả lập Simulator**:
   - Có sẵn widget bên phải giao diện để 1-click bắn tiền từ Web Shop / Web Game về DigiBank để test Socket.io realtime ngay lập tức!

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG

### Cách 1: Nhấp đúp file khởi động nhanh (Khuyên dùng trên Windows)
Nhấp đúp vào file:
👉 `CHAY-NGAN-HANG.bat`

Trình duyệt sẽ tự động mở tại `http://localhost:8989` và Node.js Server chạy nền hỗ trợ đầy đủ REST API & Socket.io Realtime.

### Cách 2: Khởi chạy bằng lệnh dòng lệnh
```bash
node server.js
```
Sau đó truy cập: `http://localhost:8989` trên trình duyệt.

---

## 📁 CẤU TRÚC THƯ MỤC
```
GuiNganHang/
├── index.html              # Giao diện chính Single Page Application Neobank VIP
├── server.js               # Core Wallet Server (Express + Socket.io + REST API + Idempotency)
├── database.json           # Cơ sở dữ liệu tài khoản & giao dịch Core Wallet
├── CHAY-NGAN-HANG.bat      # Script khởi chạy hệ thống 1-click
├── css/
│   └── style.css           # Hiệu ứng Glassmorphism, animations, gradient neobank
├── js/
│   ├── data.js             # Dữ liệu tài khoản hệ sinh thái, 20 ngân hàng, cấu hình API
│   ├── audio.js            # Âm thanh ngân hàng bằng Web Audio API
│   ├── savings.js          # Cỗ máy tính lãi suất Realtime theo phút (0.7% - 1.2%)
│   ├── transfer.js         # Core Wallet API lookup & transfer, Napas 24/7 & lịch sử
│   ├── analytics.js        # Biểu đồ phân tích tài sản Chart.js
│   └── app.js              # Bộ điều khiển trung tâm kết nối toàn bộ hệ thống & Socket.io
└── README.md               # Tài liệu đặc tả kỹ thuật & hướng dẫn chi tiết
```
