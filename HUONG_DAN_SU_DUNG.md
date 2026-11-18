# Hướng Dẫn Sử Dụng — Mạch Điện Lab

Tài liệu hướng dẫn chi tiết cách vẽ sơ đồ, thiết lập thông số linh kiện, chạy 4 chế độ mô phỏng và trích xuất mạng tương đương trong **Mạch Điện Lab**.

---

## Mục Lục

1. [Làm quen giao diện làm việc](#1-làm-quen-giao-diện-làm-việc)
2. [Vẽ sơ đồ & nối dây chuẩn kỹ thuật](#2-vẽ-sơ-đồ--nối-dây-chuẩn-kỹ-thuật)
3. [Bảng phím tắt thao tác nhanh](#3-bảng-phím-tắt-thao-tác-nhanh)
4. [Danh mục 17+GND phần tử & ý nghĩa thông số](#4-danh-mục-17gnd-phần-tử--ý-nghĩa-thông-số)
5. [4 Chế độ mô phỏng & đọc kết quả](#5-4-chế-độ-mô-phỏng--đọc-kết-quả)
6. [Trình trích xuất Thévenin / Norton & Mạng 2 cửa](#6-trình-trích-xuất-thévenin--norton--mạng-2-cửa)
7. [Mô phỏng hệ thống Điện 3 Pha (Y / Δ & lệch trung tính)](#7-mô-phỏng-hệ-thống-điện-3-pha-y--δ--lệch-trung-tính)
8. [Lưu & mở lại mạch bằng tệp JSON](#8-lưu--mở-lại-mạch-bằng-tệp-json)
9. [Xử lý lỗi thường gặp (Diagnostics)](#9-xử-lý-lỗi-thường-gặp-diagnostics)

---

## 1. Làm quen giao diện làm việc

Giao diện của **Mạch Điện Lab** gồm 4 khu vực chính:

- **Thanh tiêu đề & chế độ (Trên cùng):** Chọn nhanh mạch mẫu (*RLC & Hỗ cảm M*, *Op-Amp & VCVS*, *Hệ thống 3 Pha*, *Nguồn hỗn hợp*, hoặc *Mạch trống*), chuyển đổi chế độ giải (*DC*, *DC Xác lập*, *AC Phasor*, *Quá độ*), nhập `Δt` / `T_end` khi ở chế độ Quá độ, các nút công cụ (*Chọn*, *Nối dây*, *Xoay*, *Xóa*, *Undo/Redo*, *Xuất/Nhập JSON*) và nút **Chạy mô phỏng**.
- **Thư viện linh kiện (Cột trái):** Chứa 17 phần tử chuyên ngành điện + ký hiệu Đất (`GND`), có ô tìm kiếm nhanh theo tên hoặc ký hiệu (`R`, `Z`, `C`, `op-amp`, `3 pha`, ...). Nhấp nút thu gọn ở góc trên bên trái thanh công cụ nếu muốn mở rộng không gian vẽ.
- **Bản vẽ sơ đồ (Giữa):** Lưới tọa độ `20 px` giúp căn thẳng hàng linh kiện và dây dẫn, kèm công tắc **Hiển thị số đo** (hiển thị điện áp nút `N...` và dòng nhánh `I=...` trực tiếp trên mạch) và cụm thu phóng (`+`, `−`, *Khớp khung nhìn*).
- **Bảng Thông số & Kết quả (Cột phải):** Gồm 4 thẻ:
  - **Thông số:** Chỉnh sửa thuộc tính của phần tử hoặc dây đang chọn.
  - **Kết quả:** Xem thẻ *Xếp chồng đa tần số* (khi mạch có nhiều tần số / sóng hài), *Cân bằng công suất* (`P`, `Q`), bảng *Điện thế các nút*, bảng *Dòng điện & Công suất phần tử*, và nhấp chọn từng dòng để xem thẻ **Phổ hài & Tức thời**.
  - **Đồ thị:** Biểu đồ dao động ký đa kênh theo thời gian `u(t)`, `i(t)` ở chế độ *Quá độ* (bao gồm cả dạng sóng điện áp nguồn `u(E...)`).
  - **Tương đương:** Công cụ trích xuất *Thévenin / Norton* và *Mạng 2 cửa `[Z]`, `[Y]`, `[A]`* kèm nút chọn nhanh theo các tần số đang có trong mạch.

---

## 2. Vẽ sơ đồ & nối dây chuẩn kỹ thuật

### Đặt & sắp xếp linh kiện
- **Kéo – thả** phần tử từ cột trái vào lưới bản vẽ, hoặc **nhấp một lần** vào thẻ phần tử trong thư viện rồi nhấp lên vị trí bất kỳ trên bản vẽ.
- Kéo thả phần tử đang có trên lưới để di chuyển; phần tử tự động bám lưới `20 px`.
- Nhấp vào phần tử rồi nhấn phím **`R`** (hoặc bấm nút **Xoay 90°** ở thanh pill nổi / thanh công cụ) để xoay góc `0° → 90° → 180° → 270°`.

### Vẽ dây dẫn trực giao (Wire Tool)
1. Nhấn phím **`W`** hoặc chọn biểu tượng **Nối dây** trên thanh công cụ (cũng có thể **nhấp trực tiếp vào một chân linh kiện** ở chế độ *Chọn* để bắt đầu đi dây ngay).
2. Di chuyển chuột tới điểm gấp khúc hoặc chân đích; dây dẫn tự động bẻ góc vuông `90°`.
3. Nhấn **`Space`** trong lúc đang vẽ dây để đổi chiều gập góc (ngang trước hoặc dọc trước).
4. Nhấp vào chân linh kiện đích hoặc **nhấp đúp** để kết thúc đoạn dây; nhấn **`Esc`** nếu muốn hủy dây đang vẽ.

> **Lưu ý về giao điểm dây dẫn:**
> - **Hai dây cắt chéo vuông góc qua nhau sẽ KHÔNG tự chập mạch** (đây là hai nhánh độc lập đi ngang qua nhau).
> - **Ngã ba chữ T** (đầu mút một dây chạm vào giữa thân dây khác hoặc hai chân linh kiện chạm cùng tọa độ) tự động tạo **điểm nối (Junction dot)** màu đen hợp nhất thành cùng một nút điện thế.

---

## 3. Bảng phím tắt thao tác nhanh

| Phím tắt | Chức năng |
| :--- | :--- |
| `V` | Chuyển về công cụ **Chọn / Di chuyển** |
| `W` | Chuyển sang công cụ **Nối dây** |
| `R` | Xoay phần tử đang chọn **90° theo chiều kim đồng hồ** |
| `Space` | Đảo hướng bẻ góc dây dẫn khi đang vẽ dây |
| `F` | Căn giữa và thu phóng toàn bộ sơ đồ vừa khít khung nhìn |
| `Delete` / `Backspace` | Xóa phần tử hoặc đoạn dây đang chọn |
| `Esc` | Hủy lệnh vẽ dây, hủy đặt linh kiện hoặc bỏ chọn |
| `Ctrl + Z` | Hoàn tác (Undo, lưu tối đa 40 bước) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Làm lại (Redo) |
| `Ctrl + Enter` | Thực thi **Chạy mô phỏng** ngay |
| Lăn chuột / Kéo khoảng trống | Phóng to / thu nhỏ tại tâm con trỏ & trượt khung nhìn |

---

## 4. Danh mục 17+GND phần tử & ý nghĩa thông số

### Nguồn & Điểm chuẩn
- **Đất (`GND`):** Điểm tham chiếu điện thế `0 V` (Nút `0`). Nếu sơ đồ chưa đặt `GND`, bộ giải sẽ tự chọn một điểm chuẩn mặc định và thông báo trong chẩn đoán.
- **Nguồn áp độc lập (`V_SRC`) & Nguồn dòng độc lập (`I_SRC`):**
  - **DC:** Nguồn một chiều cố định.
  - **AC Sin:** Nhập biên độ theo **RMS** (hiệu dụng) hoặc **Đỉnh** (Peak $U_m = \sqrt{2} U$), tần số (Hz) và góc pha đầu (độ). Quy ước tức thời: $u(t) = U_m \cos(2\pi f t + \varphi)$.
  - **Hỗn hợp (`MIXED`):** Kết hợp ngay trên **cùng một nguồn** giá trị **Thành phần DC** và bảng **Các sóng hài / tần số** (Tần số `Hz`, Biên độ theo kiểu **RMS** hoặc **Đỉnh**, và Pha đầu `°`). Khung xem trước hiển thị trực tiếp tổng trị hiệu dụng True RMS và biểu thức tức thời $u(t)$ / $i(t)$.
  - **Step:** Bậc nhảy từ giá trị *Trước đóng* sang *Sau đóng* tại thời điểm $t_{\text{step}}$ (hữu ích cho phân tích quá độ đóng/cắt).
  - *Chiều nguồn dòng:* Mũi tên hướng từ chân `−` (`n`) sang chân `+` (`p`) bên trong nguồn.
  - *Xuất / Nhập JSON:* Tệp `.json` lưu và kiểm tra hợp lệ cả dạng sóng `MIXED` (`mixedDcValue` và mảng `harmonics`).

### Phần tử thụ động & Hỗ cảm
- **Điện trở (`RESISTOR`):** Giá trị `R` ($\Omega$, tối thiểu $10^{-6}\ \Omega$).
- **Tụ điện (`CAPACITOR`):** Điện dung `C` (F) và sơ kiện điện áp ban đầu `u_C(0)` (V) giữa chân 1 (`+`) và chân 2 (`−`).
- **Cuộn cảm (`INDUCTOR`):** Độ tự cảm `L` (H) và sơ kiện dòng điện ban đầu `i_L(0)` (A) đi từ chân 1 vào chân 2.
- **Tổng trở phức (`IMPEDANCE` / `Z`):** Nhánh tổng trở phức $Z = R + jX$ ($\Omega$) gộp sẵn các thành phần R, L, C trong một nhánh bài tập; hỗ trợ nhập cả dạng đại số (`R + jX`) lẫn dạng cực (`|Z| ∠ φ°`), đồng thời tự hiển thị tổng dẫn $Y = 1/Z$ và tính chất nhánh (tính cảm $X > 0$, tính dung $X < 0$, thuần trở $X = 0$). Trong chế độ **Quá độ**, các nhánh có $X \neq 0$ được tự động quy đổi sang nhánh `R-L` hoặc `R-C` tương đương tại tần số tham chiếu của mạch.
- **Hỗ cảm (`MUTUAL`):** Ghép từ thông giữa hai cuộn dây `L1` và `L2` đã có trên sơ đồ với hệ số hỗ cảm `M` (H) và chấm cực cùng tính (`Cùng cực 1–1` hoặc `Ngược cực 1–2`). Hỗ trợ đầy đủ cả **AC Phasor** lẫn **Quá độ**.

### Nguồn phụ thuộc & Op-Amp lý tưởng
- **VCVS (`μU`):** Nguồn áp phụ thuộc áp — điện áp nhánh bằng $\mu \cdot (V_{c+} - V_{c-})$. Chọn `Nút điều khiển (+)` và `Nút điều khiển (−)` theo số nút hiển thị trên bản vẽ.
- **VCCS (`gU`):** Nguồn dòng phụ thuộc áp — dòng đi từ `−` sang `+` bằng $g \cdot (V_{c+} - V_{c-})$.
- **CCVS (`rI`):** Nguồn áp phụ thuộc dòng — điện áp bằng $r \cdot I_{\text{sense}}$. Chọn *Nhánh mang dòng điều khiển* (chiều dương cảm biến đi từ chân 1 → chân 2 của phần tử được tham chiếu).
- **CCCS (`βI`):** Nguồn dòng phụ thuộc dòng — dòng phụ thuộc $\beta \cdot I_{\text{sense}}$.
- **Op-Amp lý tưởng (`OPAMP`):** Ràng buộc $V_+ = V_-$ và dòng ngõ vào $I_+ = I_- = 0$. Hỗ trợ nút **Đảo vị trí hai cực ngõ vào** để dễ vẽ mạch khuếch đại đảo hoặc không đảo gọn gàng.

### Mạng 1 cửa & Mạng 2 cửa tổng quát
- **Mạng 1 cửa (`ONE_PORT`):** Đóng vai nguồn tương đương **Thévenin** ($V_{\text{th}}, Z_{\text{th}} = R + jX$) hoặc **Norton** ($I_N, Y_{\text{th}} = G + jB$) tại tần số làm việc.
- **Mạng 2 cửa (`TWO_PORT`):** Mô hình hóa hộp đen 4 chân (`1, 1', 2, 2'`) theo một trong 3 hệ ma trận phức:
  - **`[Z]` ($\Omega$):** Trở kháng hở mạch (`Z11, Z12, Z21, Z22`).
  - **`[Y]` (S):** Dẫn nạp ngắn mạch (`Y11, Y12, Y21, Y22`).
  - **`[A]` (ABCD):** Thông số truyền đạt (`A, B, C, D`).

### Hệ thống 3 Pha
- **Nguồn 3 pha (`THREE_PHASE_SRC`):** Chân `A, B, C` và trung tính `N`. Chọn đấu **Sao (`Y`)** hoặc **Tam giác (`Δ`)**, nhập theo điện áp pha hoặc điện áp dây, tần số và thứ tự pha thuận (`ABC`) / nghịch (`ACB`).
- **Đường dây 3 pha (`THREE_PHASE_LINE`):** Tổng trở dây pha phức $Z_d = R + jX$, tùy chọn bật/tắt dây trung tính với tổng trở dây trung tính $Z_n$.
- **Phụ tải 3 pha (`THREE_PHASE_LOAD`):** Đấu **Sao (`Y`)** (tùy chọn nối điểm trung tính tải $N'$ vào dây trung tính $N$ hay để nổi) hoặc **Tam giác (`Δ`)**; chọn tải đối xứng hoặc bất đối xứng với $Z_A, Z_B, Z_C$ nhập riêng.

---

## 5. 4 Chế độ mô phỏng & đọc kết quả

1. **DC:** Giải mạch một chiều thuần ($f = 0\ \text{Hz}$).
2. **DC Xác lập:** Trạng thái xác lập một chiều của mạch có `L`, `C` (tự động hở mạch tụ điện và ngắn mạch cuộn cảm lý tưởng).
3. **AC Phasor:** Phân tích xác lập điều hòa theo số phức (RMS ∠ °). Nếu mạch chứa nhiều tần số khác nhau (ví dụ `DC + 50 Hz + 150 Hz`), bộ giải tự động giải xếp chồng từng hài và tính tổng trị hiệu dụng (RMS) cùng biểu thức tức thời.
4. **Quá độ (Transient):** Tích phân miền thời gian bằng phương pháp **Backward Euler** với bước thời gian $\Delta t$ và thời gian mô phỏng $T_{\text{end}}$.

### Cách đọc Bảng kết quả
- **Mạch nguồn hỗn hợp (Xếp chồng đa tần số):** Khi mạch có nhiều nguồn khác tần số hoặc dùng nguồn **Hỗn hợp**, ở chế độ **AC Phasor** bộ giải tự động phân tích độc lập từng tần số ($0\ \text{Hz}$ và các $f_k > 0$), hiển thị thẻ **Xếp chồng đa tần số**, tính trị hiệu dụng tổng (True RMS) và công suất tác dụng tổng. Nhấp vào một dòng bất kỳ trong bảng *Điện thế các nút* hoặc *Dòng điện & Công suất phần tử* để mở thẻ **Phổ hài & Tức thời** (xem từng thành phần tần số $f_k$ và biểu thức tức thời đầy đủ). Ở chế độ **DC**, chỉ thành phần $0\ \text{Hz}$ được giải.
- **Cân bằng công suất:** Thẻ màu xanh **Khớp lý thuyết** xuất hiện khi tổng công suất phát và tổng công suất tiêu thụ thỏa mãn $|\sum P_{\text{phát}} - \sum P_{\text{tiêu thụ}}| < 0.05\ \text{W}$.
- **Quy ước dấu thụ động:** Trên từng phần tử, dòng điện đi từ **chân 1 (`+`) → chân 2 (`−`)**. Do đó `P > 0` nghĩa là phần tử **tiêu thụ** công suất, còn `P < 0` nghĩa là phần tử đang **phát** công suất vào mạch.
- **Đồ thị Quá độ:** Chuyển sang thẻ **Đồ thị** để bật/tắt từng kênh điện áp nút (`u(Nút ...)`), điện áp nguồn (`u(E...)`) hoặc dòng nhánh (`i(...)`), lọc nhanh theo loại tín hiệu và rê chuột trên biểu đồ để đọc giá trị tức thời chính xác tại từng mốc thời gian `ms`.

---

## 6. Trình trích xuất Thévenin / Norton & Mạng 2 cửa

Mở thẻ **Tương đương** ở cột bên phải:
1. Chọn **Thévenin / Norton** hoặc **Mạng 2 cửa [Z, Y, A]**.
2. Nhập **Tần số trích xuất** (`0 Hz` cho mạch DC, hoặc `50 Hz`, `100 Hz`, ... cho mạch AC) — hoặc nhấp nhanh các nút **Tần số trong mạch** (ví dụ `0 Hz (DC)`, `50 Hz`, `150 Hz`) hiển thị bên dưới ô nhập.
3. Chọn các nút cửa ra theo số nút hiển thị trên bản vẽ (ví dụ `Nút 2` và `Nút 0` làm cực `(a, b)` cho 1 cửa, hoặc cặp `(1, 1')` và `(2, 2')` cho 2 cửa).
4. Nhấn **Trích xuất thông số tương đương** — hệ thống tự động giữ nguyên nguồn độc lập khi tính $V_{\text{th}}$ hở mạch, triệt tiêu nguồn độc lập để bơm tín hiệu thử và trả về đầy đủ $V_{\text{th}}, Z_{\text{th}}, I_N, Y_{\text{th}}$ (hoặc cả 3 ma trận `[Z], [Y], [A]` dưới dạng số phức).

---

## 7. Mô phỏng hệ thống Điện 3 Pha (Y / Δ & lệch trung tính)

- Thử nạp mạch mẫu **Hệ thống 3 Pha** để quan sát trực tiếp trường hợp **tải đấu Sao không đối xứng không dây trung tính**.
- Khi ngắt dây trung tính trên *Đường dây 3 pha* hoặc bỏ tick *Nối điểm trung tính tải với dây N*, phần mềm tự động giải điện thế điểm trung tính tải $N'$ và hiển thị thêm giá trị **`Lệch N'N=... V`** ngay bên dưới dòng phụ tải trong bảng kết quả, kèm trị hiệu dụng và góc pha từng dây `IA, IB, IC, IN`.
- Khi mô phỏng hệ 3 pha ở chế độ **Quá độ**, các tổng trở phức $R + jX$ của đường dây và tải được tự động quy đổi sang nhánh `R-L` (khi $X > 0$) hoặc `R-C` (khi $X < 0$) tại tần số tham chiếu của nguồn kèm thông báo hướng dẫn trong thanh chẩn đoán.

---

## 8. Lưu & mở lại mạch bằng tệp JSON

- Nhấn **Xuất JSON** trên thanh công cụ để tải về toàn bộ cấu trúc linh kiện và dây dẫn dưới dạng tệp `mach-dien-<timestamp>.json`.
- Nhấn **Nhập JSON** để tải lại tệp đã lưu. Trình nhập sẽ kiểm tra cấu trúc tọa độ, loại linh kiện và tham số mô phỏng trước khi nạp vào khung vẽ; nếu tệp sai định dạng, hệ thống sẽ báo lỗi rõ ràng mà không làm mất sơ đồ hiện tại.

---

## 9. Xử lý lỗi thường gặp (Diagnostics)

| Thông báo | Nguyên nhân & Cách khắc phục |
| :--- | :--- |
| **Chưa có ký hiệu Đất (`GND`)** | Mạch thiếu nút chuẩn `0`. Phần mềm vẫn giải được bằng cách chọn tạm 1 nút làm gốc, nhưng hãy kéo thêm phần tử `GND` nối vào dây hồi về để cố định mốc `0 V`. |
| **Vòng ngắn mạch nguồn áp / ma trận suy biến** | Có 2 nguồn áp lý tưởng mắc song song trực tiếp, cuộn cảm song song hoàn toàn hoặc một phần tử bị cô lập hoàn toàn. Hãy thêm điện trở nối tiếp nhỏ hoặc nối kín vòng mạch. |
| **Hỗ cảm $|M| > \sqrt{L_1 L_2}$ (`k > 1`)** | Về mặt vật lý, hệ số ghép $k = M / \sqrt{L_1 L_2}$ phải thỏa mãn $k \le 1$. Hãy giảm $M$ hoặc tăng giá trị $L_1, L_2$ để tránh bất ổn khi mô phỏng Quá độ. |
| **Số bước mô phỏng vượt ngưỡng `4000`** | Với `tEnd / dt > 4000`, phần mềm tự động giãn bước `Δt` để đảm bảo giao diện phản hồi nhanh. Có thể tăng `Δt` hoặc giảm `T_end` cho phù hợp với hằng số thời gian $\tau$. |
