# Hướng dẫn dùng AK MCP server cho vibe coding trên VS Code

Tài liệu này dành cho **kỹ sư vibe coding**: cách kết nối AK MCP server (đã deploy) vào IDE và dùng nó để AI sinh code firmware AK đúng chuẩn cho **một dự án mới**.

> **AK MCP server** cung cấp cho công cụ AI: tra cứu API kernel (chữ ký + đối số chính xác), các recipe tạo task/driver/screen, và "guardrails" (vùng cấm sửa). Khi AI có nó, code sinh ra bám đúng convention của AK thay vì đoán mò.

---

## 0. Trước khi bắt đầu — lấy URL server

Sau khi `npm run deploy`, Cloudflare in ra URL dạng:

```
https://ak-mcp.<your-account>.workers.dev
```

Kiểm tra server sống bằng cách mở URL gốc trên trình duyệt (hoặc `curl`): bạn sẽ thấy trang landing liệt kê endpoint và tool. Endpoint MCP là:

```
https://ak-mcp.<your-account>.workers.dev/mcp        ← Streamable HTTP (dùng cái này)
https://ak-mcp.<your-account>.workers.dev/sse        ← SSE (client cũ)
```

> Thay `<your-account>` bằng subdomain thật của bạn ở **mọi** ví dụ bên dưới.

---

## 1. VS Code + GitHub Copilot (Agent mode) — khuyến nghị

Yêu cầu: **VS Code ≥ 1.102** và extension **GitHub Copilot Chat**. MCP chỉ hoạt động ở **Agent mode**.

### Cách A — qua file `.vscode/mcp.json` (gắn theo dự án)

Tạo file `.vscode/mcp.json` trong thư mục dự án (có sẵn template ở [`examples/vscode-mcp.json`](../examples/vscode-mcp.json)):

```json
{
  "servers": {
    "ak-docs": {
      "type": "http",
      "url": "https://ak-mcp.<your-account>.workers.dev/mcp"
    }
  }
}
```

Lưu file → VS Code hiện nút **Start** ngay trên file đó, bấm để kết nối (lần đầu sẽ hỏi Trust, chọn cho phép).

### Cách B — qua Command Palette (gắn theo user, mọi dự án)

`Ctrl/Cmd + Shift + P` → **MCP: Add Server** → **HTTP** → dán URL `/mcp` → đặt tên `ak-docs` → chọn lưu vào *User* hoặc *Workspace*.

### Bật và kiểm tra

1. Mở **Chat view** (`Ctrl/Cmd + Alt + I`), đổi dropdown chế độ sang **Agent**.
2. Bấm icon 🔧 (**Tools**) → thấy nhóm `ak-docs` với 8 tool: `start_ak_project`, `search_ak_docs`, `get_ak_api`, `list_ak_api`, `get_ak_guide`, `get_ak_guardrails`, `analyze_ak_log`, `decode_ak_lcd` → tick bật.
3. Lệnh **MCP: List Servers** cho biết trạng thái Running/Stopped và xem log nếu lỗi.

---

## 2. Các công cụ khác (cùng dùng được URL trên)

> Có sẵn file mẫu copy-paste cho từng client trong [`examples/`](../examples/) — xem
> [examples/README.md](../examples/README.md) để biết chép vào đâu. Nhớ thay `<your-account>`.

### Cursor
Tạo `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "ak-docs": { "url": "https://ak-mcp.<your-account>.workers.dev/mcp" }
  }
}
```
Vào **Settings → MCP** để thấy server xanh, rồi chat ở chế độ **Agent**.

### Cline / Roo Code (extension trong VS Code)
Mở panel Cline → icon **MCP Servers** → **Configure MCP Servers** → dán nội dung
[`examples/cline-mcp-settings.json`](../examples/cline-mcp-settings.json) (dùng
`type: "streamableHttp"` và auto-approve 5 tool chỉ-đọc). Hoặc dùng tab **Remote Servers →
Add** rồi nhập Name `ak-docs` + URL `…/mcp`.

### Claude Code (terminal trong VS Code)
```sh
claude mcp add --transport http ak-docs https://ak-mcp.<your-account>.workers.dev/mcp
```
Hoặc đặt [`examples/claude-code.mcp.json`](../examples/claude-code.mcp.json) thành `.mcp.json`
ở gốc dự án (chia sẻ được qua git). Kiểm tra: `claude mcp list`.

### Claude Desktop
Chép [`examples/claude-desktop.json`](../examples/claude-desktop.json) vào file cấu hình
(`%APPDATA%\Claude\claude_desktop_config.json` trên Windows; `~/Library/Application
Support/Claude/…` trên macOS) — bản mẫu bắc cầu remote qua stdio bằng `mcp-remote` (cần Node).
Bản Pro/Team có thể thêm trực tiếp qua **Settings → Connectors** (dán URL, không cần cầu nối).

### OpenAI Codex (CLI + extension)
Gộp [`examples/codex-config.toml`](../examples/codex-config.toml) vào `~/.codex/config.toml`,
hoặc:
```sh
codex mcp add ak-docs -- npx -y mcp-remote https://ak-mcp.<your-account>.workers.dev/mcp
```
Bản Codex mới hỗ trợ HTTP trực tiếp (`url = "…"`); xem chú thích trong file mẫu.

### Chạy offline (không cần mạng) — stdio cục bộ
Nếu muốn dùng bản local thay vì server remote:
```sh
cd mcp-docs-server && npm install && npm run build
```
Rồi trỏ client tới lệnh stdio (ví dụ `.vscode/mcp.json`):
```json
{
  "servers": {
    "ak-docs": {
      "type": "stdio",
      "command": "node",
      "args": ["D:/đường-dẫn/mcp-docs-server/dist/cli/bin.js"]
    }
  }
}
```

---

## 3. Chạy thử với một dự án mới — từng bước

Bạn **không cần tự tải** base kit: chỉ mở thư mục trống rồi chat đúng "rule", agent sẽ tự tải bản release mới nhất và tùy biến.

1. **Mở một thư mục trống** trong VS Code.
2. **Thêm MCP server**: tạo `.vscode/mcp.json` như mục 1, bấm Start.
3. **"Lái" agent dùng MCP** (rất nên làm): copy [`examples/copilot-instructions.md`](../examples/copilot-instructions.md) vào `.github/copilot-instructions.md` của dự án (Cursor: `.cursor/rules/`; Claude Code: `CLAUDE.md`; Codex: `AGENTS.md`). File này buộc agent gọi `start_ak_project` khi bắt đầu dự án và `get_ak_guardrails` / `get_ak_guide` trước khi viết code.
4. **Bật Agent mode**, tick các tool `ak-docs` (gồm `start_ak_project`).
5. **Chat rule khởi tạo**, ví dụ: *"Tạo dự án AK mới tên `smart-fan`: đọc cảm biến nhiệt qua ADC và bật quạt khi quá ngưỡng."*
   → agent gọi `start_ak_project` (lấy release mới nhất), chạy lệnh `curl … | tar` để tải + giải nén vào `smart-fan/`, rồi tùy biến theo `get_ak_guide`.
6. **Duyệt diff**: kiểm tra agent chỉ sửa trong `application/sources/app/` (và `driver/`), không đụng `ak/`, `boot/`, `networks/`, `common/`.
7. **Build kiểm chứng**: `cd smart-fan/application && make` (xem `CLAUDE.md` trong source vừa tải về toolchain — cần shell Unix/WSL).

> Muốn build tái lập (reproducible)? Yêu cầu ghim tag: *"…dùng `ref: v1.3`"* — agent sẽ tải đúng bản đó thay vì "latest".

---

## 4. Prompt mẫu cho vibe coding

Cứ mô tả nhu cầu tự nhiên; với steering file ở trên, agent sẽ tự tra MCP. Vài ví dụ:

- > "Khởi tạo dự án AK mới tên `door-lock` dựa trên base kit mới nhất, có 1 task đọc nút bấm và điều khiển relay."
  → agent gọi `start_ak_project` → tải + giải nén release mới nhất vào `door-lock/`, rồi `get_ak_guide("create-task")`/`("create-driver")` để tùy biến. (Prompt dựng sẵn: `ak-new-project`.)

- > "Tạo một task mới `task_buzzer` kêu bíp 3 lần khi nhận tín hiệu báo động. Theo đúng chuẩn AK."
  → agent gọi `get_ak_guide("create-task")` + `get_ak_guardrails()` rồi sinh đủ 5 chỗ sửa (`task_list.h/.cpp`, `app.h`, `task_buzzer.cpp`, `Makefile.mk`).

- > "Viết driver cho cảm biến nhiệt qua chân ADC, đưa giá trị về một task mỗi 500ms."
  → `get_ak_guide("create-driver")` → driver dùng function-pointer injection + wiring BSP + hook polling.

- > "Hàm `timer_set` nhận những tham số gì? Cho ví dụ one-shot 2 giây."
  → `get_ak_api("timer_set")` trả chữ ký + ngữ nghĩa re-arm + ví dụ.

- > "Tôi muốn màn hình OLED hiển thị đồng hồ, cập nhật mỗi giây."
  → `get_ak_guide("create-screen")`.

- > "Vì sao firmware reset liên tục với log FATAL 'MT' 0x30?"
  → `search_ak_docs("MT 0x30 fatal timer")` → hết pool timer, chỉ cách chỉnh `ak.cfg.mk` (`tune-pools`).

- > "Màn hình OLED của board ở COM3 đang hiển thị gì?"
  → agent chạy `python ak-console.py --port COM3 --cmd "lcd d"`, dán dump vào `decode_ak_lcd` → "nhìn" màn hình dưới dạng text art + ảnh PNG kèm thống kê (trống/bounding box).

- > "Board cắm ở COM3 cứ ~30 giây lại reset một lần. Tự debug qua UART và tìm nguyên nhân."
  → agent gọi `get_ak_guide("debug-uart-shell")`, chạy `python ak-console.py --port COM3 --watch 15` + `--cmd "ver" --cmd "fatal l" --cmd "fatal m"`, dán toàn bộ output vào `analyze_ak_log` → chẩn đoán (FATAL code / watchdog / handler chậm) + lệnh chạy tiếp. (Prompt dựng sẵn: `ak-debug`. Cần `pip install pyserial`; script chỉ tự chạy lệnh read-only, lệnh phá hoại bị chặn trừ khi `--allow-destructive`.)

**Mẹo:** nếu agent "quên" dùng MCP, ép thẳng: *"Dùng tool ak-docs, gọi get_ak_guide('create-task') trước khi viết."* Trong VS Code có thể tham chiếu tool bằng `#get_ak_guide` ngay trong prompt.

---

## 5. Khắc phục sự cố

| Triệu chứng | Cách xử lý |
| --- | --- |
| Không thấy tool trong picker | Đảm bảo đang ở **Agent mode** (không phải Ask/Edit); chạy **MCP: List Servers** xem có Running không. |
| Server "Stopped"/đỏ | Mở URL gốc trên trình duyệt xem landing page có hiện không; kiểm tra lại đúng đường dẫn `/mcp`. |
| 404 / không kết nối | Sai URL hoặc thiếu `/mcp`. Streamable HTTP dùng `/mcp`; client chỉ hỗ trợ SSE thì đổi sang `/sse`. |
| Agent vẫn "chế" API sai | Thêm/đậm hơn steering file (mục 3.3); hoặc yêu cầu trực tiếp gọi `get_ak_api`. |
| Cần xem log | VS Code: **MCP: List Servers → ak-docs → Show Output**. |

---

## 6. Server này cung cấp gì

- **Tools:** `start_ak_project`, `search_ak_docs`, `get_ak_api`, `list_ak_api`, `get_ak_guide`, `get_ak_guardrails`, `analyze_ak_log`, `decode_ak_lcd`
- **Guides:** start-project, create-task, create-driver, create-screen, use-timer, isr-bridge, tune-pools, debug-uart-shell
- **Prompts:** `ak-new-project`, `ak-new-task`, `ak-new-driver`, `ak-debug` (template scaffolding kèm guardrails)
- **Serial bridge cho agent:** [`examples/ak-console.py`](../examples/ak-console.py) — gửi lệnh shell/bắt log UART không tương tác (cần `pip install pyserial`)
- **Resources:** `ak://index`, `ak://{section}/{id}` (concept / guide / guardrail / api)

Chi tiết kiến trúc & cách cập nhật tài liệu: [README.md](../README.md).
