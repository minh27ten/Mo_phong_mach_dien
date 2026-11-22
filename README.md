# MạchĐiệnLab — Phần Mềm Mô Phỏng Mạch Điện & Hệ Thống Điện (`v1.6.0`)

**MạchĐiệnLab** là ứng dụng mô phỏng mạch điện và hệ thống điện **chạy 100% cục bộ trên máy người dùng (Pure Client-Side)** dựa trên bộ giải giải tích nút cải biên **Modified Nodal Analysis (MNA)** — không cần máy chủ, không gửi dữ liệu ra ngoài và không cần API key.

- 🌐 **Dùng thử trực tiếp trên trình duyệt:** https://minh27ten.github.io/Mo_phong_mach_dien/
- 📦 **Tải bản cài đặt / Portable (`v1.6.0`):** https://github.com/minh27ten/Mo_phong_mach_dien/releases/latest
- 📖 **Tài liệu hướng dẫn thao tác chi tiết:** Xem [HUONG_DAN_SU_DUNG.md](./HUONG_DAN_SU_DUNG.md).

---

## 🚀 Dành cho người dùng cuối (Không cần biết code)

Bạn có thể tải sẵn bản đóng gói trong mục **GitHub Releases** của kho lưu trữ và mở dùng ngay mà **không cần cài đặt Node.js, Python hay môi trường lập trình**:

| Tệp phát hành (GitHub Releases) | Dung lượng | Hệ điều hành | Cách sử dụng |
| :--- | :---: | :--- | :--- |
| **`MachDienLab-VI.exe`** | ~1.17 MB | Windows 10 / 11 (x64) | Nhấn đúp chuột để mở trực tiếp như phần mềm Desktop độc lập (tích hợp WebView2 có sẵn trên Windows, biên dịch tĩnh `+crt-static`, hỗ trợ hộp thoại lưu tệp gốc Windows). |
| **`MachDienLab-VI-Portable.html`** | ~490 KB | Windows / macOS / Linux | Một tệp HTML duy nhất tự chứa toàn bộ ứng dụng — nhấn đúp để mở offline bằng bất kỳ trình duyệt hiện đại nào (Edge, Chrome, Firefox, Safari) qua `file://`. |

*Hoặc chạy trực tiếp bản web tại https://minh27ten.github.io/Mo_phong_mach_dien/.*

---

## 🆕 Điểm mới ở `v1.6.0` & Lịch sử phát triển

- **`v1.6.0` — Nối dây chéo trực quan, Bố cục chống che khuất 3 lớp & UI/UX Tối giản:**
  - **Công cụ nối dây chéo chuyên biệt (`Dây chéo / D`):** Tách rõ **`Dây vuông (W)`** và **`Dây chéo (D)`** ngay trên thanh công cụ nổi ở đỉnh bản vẽ; hiển thị huy hiệu góc `deg°` trực tiếp cạnh con trỏ (tô xanh khi bám bội `45°`), tự động khởi tạo dây chéo khi xuất phát từ chân phần tử xoay góc chéo từ chế độ *Chọn*, và nâng độ dung sai bắt chữ T lên dây chéo (`tol = 0.75px` trong `netlist.ts` & `SchematicCanvas.tsx`).
  - **Bố cục chống đè toàn diện 3 lớp (Layer 1 + 2 + 3):** Nâng cấp `computeOverlayLayout` để **Lớp 1 (tên & giá trị linh kiện)** tự đánh giá đa phương án (*Trái/Phải*, *Trên/Dưới*, tách trên-dưới thân ngang, góc chéo) tránh thân phần tử xoay, dây chéo, chấm nối, chấm cực tính hỗ cảm và nhãn lân cận trước khi đặt **Lớp 2 (dòng nhánh)** và **Lớp 3 (điện thế nút)**.
  - **Tối giản hóa & nâng cao trải nghiệm UI/UX:** Tinh gọn thanh linh kiện bên trái (loại bỏ chân trang dư, tăng không gian hiển thị toàn bộ danh mục), thêm nút thao tác nhanh **Dây vuông / Dây chéo** ở bảng *Thông số* trống, nút **Chạy mô phỏng ngay** ở bảng *Kết quả* trống và viền nhấn **Chạy lại** khi sơ đồ thay đổi.
- **`v1.5.0` — Chọn góc quay linh kiện 45° / tùy ý & Bố cục nhãn mạch chống đè:**
  - **Xoay linh kiện theo góc 45° & góc bất kỳ `[0, 360)`:** Bổ sung bộ chọn góc nhanh (`−45°`, nhập số độ tùy ý, `+45°`, và lưới góc chuẩn `0° / 45° / 90° / 135° / 180° / 225° / 270° / 315°`) trong bảng *Thông số*, nút `+45°` / `90°` trên pill nổi, phím tắt `Shift+R` (`+45°`), khung chọn xoay theo linh kiện, chữ ký hiệu bên trong nguồn phụ thuộc/`Z`/`Th` luôn đứng thẳng, cùng chế độ **Nối dây Thẳng/Chéo** (giữ `Shift` hoặc chuyển nút kiểu dây) và tự bắt dính vào chân linh kiện xoay chéo off-grid.
  - **Chống đè Nhãn mạch (`overlay`) thông minh:** Động cơ bố cục mới (`labelLayout.ts`) né toàn bộ thân linh kiện (kể cả góc chéo), chân linh kiện, **chấm cực tính hỗ cảm (`•`)**, nhãn tên/giá trị phần tử, dây dẫn và các nhãn khác trên mọi điểm neo của nút (chân, ngã ba, đỉnh/trung điểm dây), tự vẽ đường gióng nét đứt khi nhãn dời ra vùng thoáng.
- **`v1.4.0` — Hitbox chính xác, Hộp thoại Lưu JSON & Giao diện Tối giản:**
  - **Cải thiện vùng nhận diện thao tác (Hitbox):** Mở rộng vùng click/kéo (`68×36`) phủ trọn thân và khe hở của **Tụ điện (`C`)**, **Cuộn dây (`L`)**, **Điện trở (`R`)**, **Tổng trở (`Z`)**, **1-Cửa (`ONE_PORT`)** và toàn bộ `17 + GND` phần tử; bổ sung khung hover trực quan, khung chọn ôm sát phần tử, tăng độ nhạy chân kết nối (`r = 10`) và dây dẫn (`strokeWidth = 14`), hỗ trợ nhấp đúp hoàn tất đoạn dây đang vẽ.
  - **Hộp thoại lưu tệp khi xuất JSON (`Xuất JSON` / `Ctrl + S`):** Mở hộp thoại lưu tệp gốc của hệ điều hành (`showSaveFilePicker` trên trình duyệt hỗ trợ và Win32 `GetSaveFileNameW` trên bản Desktop `.exe`) cho phép tùy chỉnh tên tệp và chọn thư mục lưu trữ trước khi lưu; tự động mở hộp thoại đặt tên tệp dự phòng trên Firefox, Safari hoặc khi mở offline qua `file://`.
  - **Giao diện người dùng (UI/UX) tối giản & trực quan:** Hợp nhất thanh tiêu đề với **Menu thả xuống Mạch mẫu**, bộ chọn 4 chế độ giải (`DC`, `Xác lập DC`, `AC`, `Quá độ`), hộp thoại **Làm quen nhanh & Phím tắt (`?`)**, cùng thanh công cụ vẽ nổi và cấu hình `Δt`/`T_end` ngay trên khung bản vẽ.
- **`v1.3.0` — Hỗ cảm giữa các Tổng trở phức ($Z_M$):** Hỗ trợ ghép hỗ cảm bất kỳ `L–L`, `Z–Z`, `L–Z` với nhập trực tiếp $Z_M = R_M + jX_M$ hoặc $M$ (H), chọn riêng chân chấm cực tính (`•`) `Chân 1`/`Chân 2`, cùng mạch mẫu #6 (`Hỗ cảm Z`).
- **`v1.2.0` — Bài toán Mạng 1 cửa tìm $Z_{\text{opt}}$ truyền công suất cực đại ($P_{\max}$):** Giải tối ưu theo 4 ràng buộc (*Liên hợp $Z^*$*, *Thuần trở $R$*, *Cố định $X$*, *Cố định $\varphi$*), vẽ đường cong $P(R_L)$ / $P(|Z_L|)$, kiểm chứng trực tiếp bằng MNA và gán thẳng $Z_{\text{opt}}$ lên mạch (mạch mẫu #5 `1-Cửa P_max`).
- **`v1.1.0` — Phần tử Tổng trở phức (`IMPEDANCE` / `Z`):** Hỗ trợ nhập đại số $R + jX$ lẫn dạng cực $|Z| \angle \varphi^\circ$ và tự quy đổi sang nhánh $R$-$L$ / $R$-$C$ khi chạy Quá độ.
- **`v1.0.0` — Nền tảng MNA toàn diện:** 4 chế độ giải (`DC`, `DC_SS`, `AC` xếp chồng đa tần & nguồn hỗn hợp `MIXED`, `TRANSIENT` Backward Euler), `16 + GND` phần tử, hệ 3 pha $Y/\Delta$ & lệch trung tính $U_{N'N}$, trích xuất Thévenin/Norton & Mạng 2 cửa `[Z], [Y], [A]`, vỏ Desktop Rust/WebView2 & HTML Portable.

---

## ✨ Tính năng chính

- **Bộ giải vật lý Modified Nodal Analysis (MNA):**
  - Triển khai số học phức (`Complex`) và khử Gauss chọn phần tử trụ từng phần kèm ổn định hội tụ ma trận (`G_min = 1e-12`).
  - Tự động nhận diện nút đất (`GND` — Nút `0 V`, hoặc tự chọn cực âm tham chiếu khi chưa đặt đất) kèm chẩn đoán hở mạch, vòng nguồn áp lý tưởng và nút cô lập bằng tiếng Việt.
  - Tự động kiểm tra **Cân bằng công suất** ($P_{\text{phát}} = P_{\text{tiêu thụ}}$ và $Q_{\text{phát}} = Q_{\text{tiêu thụ}}$) với huy hiệu *Khớp lý thuyết*.
- **4 chế độ phân tích:**
  1. **Một chiều (`DC`):** Phân tích mạch điện một chiều tức thời.
  2. **Xác lập một chiều (`DC_SS`):** Tự động hở mạch tụ điện ($C$) và ngắn mạch cuộn cảm ($L$).
  3. **Xoay chiều xác lập (`AC`):** Tự động gom các nguồn theo từng tần số, giải MNA phức và áp dụng **nguyên lý xếp chồng đa tần số** để tính tổng giá trị hiệu dụng RMS, biên độ/pha phasor và công suất $P, Q, S$.
  4. **Quá độ (`TRANSIENT`):** Tích hợp ẩn **Backward Euler** theo bước $\Delta t$ và $T_{\text{end}}$, hỗ trợ sơ kiện $u_C(0), i_L(0)$, kích thích DC / AC / Step, hỗ cảm $M / Z_M$ và vẽ biểu đồ dao động ký SVG đa kênh $u(t), i(t)$.
- **Trình trích xuất mạng tương đương:**
  - **Thévenin / Norton & Tìm Z để P_max:** Chọn cặp nút $(a, b)$ hoặc một nhánh tải sẵn có để trích xuất $U_{th}, Z_{th}, I_N, Y_N$ (hỗ trợ cả nguồn phụ thuộc), giải bài toán truyền công suất cực đại $Z_{opt}$ theo 4 ràng buộc (*Liên hợp $Z^*$*, *Thuần trở $R$*, *Cố định $X$*, *Cố định $\varphi$*), vẽ đường cong $P(R_L)$ / $P(|Z_L|)$ và gán trực tiếp lên sơ đồ.
  - **Mạng hai cửa:** Chọn 2 cặp nút Cửa 1 và Cửa 2 để tính trực tiếp ma trận thông số $[Z]$, $[Y]$ và $[A]$.
- **Hệ thống điện 3 pha & Sơ đồ trực quan:**
  - Nguồn 3 pha, đường dây có tổng trở dây trung tính $Z_N$, tải 3 pha $Y/\Delta$ hỗ trợ tải không đối xứng và tính **điện áp lệch trung tính $U_{N'N}$**.
  - Lưới vẽ `20 px`, nối dây trực giao bẻ góc (`Space` đảo góc), vùng nhận diện click tối ưu cho mọi phần tử (`R`, `C`, `L`, `Z`, `GND`...), thanh công cụ nổi tối giản kèm hộp thoại hướng dẫn nhanh (`?`), hiển thị số đo ngay trên mạch, 6 mạch mẫu (*RLC & Hỗ cảm*, *Op-Amp & Phụ thuộc*, *Hệ thống 3 pha*, *Nguồn hỗn hợp*, *1-Cửa P_max*, *Hỗ cảm Z*) và Xuất / Nhập tệp JSON với hộp thoại chọn tên & thư mục lưu.

---

## 🧩 Danh mục linh kiện (`17 + GND`)

Ngoài **Nút đất chuẩn (`GND`)**, thư viện hỗ trợ 17 phần tử kỹ thuật điện chuẩn IEC/IEEE:

| Nhóm | Ký hiệu / Mã loại | Phần tử |
| :--- | :--- | :--- |
| **Nguồn độc lập** | `V_SRC` (`E`), `I_SRC` (`J`) | Nguồn áp độc lập, Nguồn dòng độc lập (DC / AC / Hỗn hợp đa sóng hài / Step) |
| **Phần tử thụ động** | `RESISTOR` (`R`), `CAPACITOR` (`C`), `INDUCTOR` (`L`), `IMPEDANCE` (`Z`), `MUTUAL` (`M`/`Z_M`) | Điện trở, Tụ điện, Cuộn cảm, Tổng trở phức $Z = R + jX$, Ghép hỗ cảm $L/Z$ |
| **Nguồn phụ thuộc** | `VCVS`, `CCVS`, `VCCS`, `CCCS` | 4 loại nguồn phụ thuộc tuyến tính ($\mu, r, g, \beta$) |
| **Khuếch đại** | `OPAMP` (`OA`) | Khuếch đại thuật toán lý tưởng ($V_+ = V_-$, $I_{\text{in}} = 0$) |
| **Mạng tương đương** | `ONE_PORT` (`P1`), `TWO_PORT` (`P2`) | Mạng 1 cửa (Thévenin/Norton), Mạng 2 cửa ($[Z], [Y], [A]$) |
| **Hệ thống 3 pha** | `THREE_PHASE_SRC` (`G3`), `THREE_PHASE_LINE` (`DZ`), `THREE_PHASE_LOAD` (`T3`) | Nguồn 3 pha, Đường dây 3 pha 4 dây, Phụ tải 3 pha $Y/\Delta$ |

---

## 🛠️ Hướng dẫn dành cho Lập trình viên (Chạy từ mã nguồn)

### Yêu cầu môi trường
- **Web App & Kiểm thử:** [Node.js](https://nodejs.org/) v20+ (khuyến nghị **v22 LTS**, đồng bộ với GitHub Actions CI).
- **Build file `.exe` Desktop (tùy chọn):** [Rust Toolchain](https://rustup.rs/) (`cargo`, Windows MSVC target) và WebView2 (có sẵn trên Windows 10/11).

### Cài đặt & khởi chạy

```bash
git clone https://github.com/minh27ten/Mo_phong_mach_dien.git
cd Mo_phong_mach_dien
npm install
npm run dev
```

Mở trình duyệt tại `http://localhost:3000/`.

### Các lệnh npm có sẵn

| Lệnh | Công dụng |
| :--- | :--- |
| `npm run dev` | Chạy máy chủ phát triển Vite tại cổng `3000` |
| `npm run lint` | Kiểm tra kiểu tĩnh TypeScript (`tsc --noEmit`) |
| `npm test` | Chạy 47 bài kiểm thử tự động bộ giải MNA, bố cục nhãn & stress test (`mna.test.ts`, `solver.test.ts`, `stress.test.ts`) |
| `npm run build` | Build bản web tối ưu vào `dist/` |
| `npm run preview` | Xem trước bản build `dist/` qua Vite Preview |
| `npm run build:portable` | Đóng gói bản HTML đơn tệp chạy offline (`dist-portable/index.html`) |
| `npm run build:desktop` | Build bản Portable HTML rồi biên dịch vỏ Desktop Rust/WebView2 trong `desktop/` thành file `.exe` |
| `npm run clean` | Xóa hai thư mục build tạm `dist/` và `dist-portable/` |

---

## 📁 Cấu trúc kho mã nguồn

```text
├── .github/workflows/deploy.yml   # CI/CD: lint + test + build + deploy GitHub Pages (Node 22)
├── .gitignore                     # Loại trừ node_modules, dist, dist-portable, desktop/target, *.exe
├── desktop/                       # Mã nguồn vỏ Desktop Windows (Rust + tao + wry WebView2)
│   ├── .cargo/config.toml         # Cấu hình +crt-static cho Windows MSVC
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── src/main.rs                # Nhúng dist-portable/index.html & hộp thoại Lưu tệp Win32 (GetSaveFileNameW)
├── src/
│   ├── engine/                    # Bộ giải toán học & netlist MNA
│   │   ├── complex.ts             # Đại số số phức
│   │   ├── pins.ts                # Tọa độ chân linh kiện theo góc xoay (hỗ trợ 45° / góc bất kỳ)
│   │   ├── labelLayout.ts         # Động cơ chống đè nhãn nút, dòng nhánh & chấm cực tính hỗ cảm
│   │   ├── netlist.ts             # Hợp nhất dây dẫn & kiểm tra topology
│   │   ├── mna.ts                 # Bộ giải DC, DC_SS, AC đa tần, Transient, Thévenin & 2-Port
│   │   ├── mna.test.ts            # Unit test cơ bản
│   │   └── __tests__/             # solver.test.ts & stress.test.ts
│   ├── components/                # Giao diện React (Canvas, Palette, Inspector, TransientPlot...)
│   ├── data/presets.ts            # 6 mạch mẫu tích hợp sẵn
│   ├── types/circuit.ts           # Định nghĩa kiểu dữ liệu mạch điện
│   ├── App.tsx                    # Điều phối trạng thái & phím tắt
│   └── main.tsx
├── HUONG_DAN_SU_DUNG.md           # Hướng dẫn sử dụng chi tiết cho người dùng
├── LICENSE                        # Giấy phép MIT
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vite.portable.config.ts        # Cấu hình vite-plugin-singlefile
```

---

## 🌐 Triển khai GitHub Pages

Workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) tự động chạy `npm ci` → `npm run lint && npm test` → `npm run build` bằng Node.js 22 và xuất bản lên GitHub Pages khi đẩy code lên nhánh `main` (bật **Settings → Pages → Source: GitHub Actions**).

## 📄 Giấy phép

Phát hành theo [Giấy phép MIT](./LICENSE).
