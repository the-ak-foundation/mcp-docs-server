# Client config examples

Ready-to-copy configs for connecting AI coding tools to the deployed **ak-docs** MCP server.

> In **every** file, replace `<your-account>` with your real workers.dev subdomain
> (from the `wrangler deploy` output or the Cloudflare dashboard). The endpoint is
> `https://ak-mcp.<your-account>.workers.dev/mcp`.

| File | Client | Copy to |
| --- | --- | --- |
| [`vscode-mcp.json`](vscode-mcp.json) | VS Code + GitHub Copilot (Agent mode) | `.vscode/mcp.json` in your project |
| [`claude-code.mcp.json`](claude-code.mcp.json) | Claude Code (CLI) | `.mcp.json` at your project root |
| [`claude-desktop.json`](claude-desktop.json) | Claude Desktop | see path below |
| [`codex-config.toml`](codex-config.toml) | OpenAI Codex (CLI + IDE extension) | merge into `~/.codex/config.toml` |
| [`cline-mcp-settings.json`](cline-mcp-settings.json) | Cline (VS Code extension) | `cline_mcp_settings.json` (open via Cline's UI) |
| [`copilot-instructions.md`](copilot-instructions.md) | any agent | project steering file (see below) |

All configs point at the **remote** deployed Worker (Streamable HTTP). For a local/offline
stdio server instead, see [`../docs/vscode-vibe-coding.md`](../docs/vscode-vibe-coding.md).

---

## Claude Code (CLI)

Native remote transport. Drop [`claude-code.mcp.json`](claude-code.mcp.json) at your project
root as `.mcp.json` (project-scoped, shareable via git), or add it from the CLI:

```sh
claude mcp add --transport http ak-docs https://ak-mcp.<your-account>.workers.dev/mcp
```

Check with `claude mcp list`.

## Claude Desktop

Config file location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Claude Desktop connects to stdio servers, so the example bridges the remote URL over stdio
with **mcp-remote** (needs Node on PATH). Copy [`claude-desktop.json`](claude-desktop.json)
into the config file, then restart Claude Desktop.

> On Pro/Max/Team/Enterprise you can instead add it via **Settings → Connectors → Add custom
> connector** and paste `https://ak-mcp.<your-account>.workers.dev/mcp` directly (no bridge).

## Codex (CLI + IDE extension)

Merge [`codex-config.toml`](codex-config.toml) into `~/.codex/config.toml`. The example uses
the **mcp-remote** stdio bridge (works on every MCP-capable Codex build); recent versions can
use a native `url = "…"` instead (commented in the file). CLI shortcut:

```sh
codex mcp add ak-docs -- npx -y mcp-remote https://ak-mcp.<your-account>.workers.dev/mcp
```

## Cline (VS Code extension)

Open the Cline panel → **MCP Servers** icon → **Configure MCP Servers** (this opens
`cline_mcp_settings.json`), then paste the contents of
[`cline-mcp-settings.json`](cline-mcp-settings.json). It uses `type: "streamableHttp"` and
**auto-approves** the five read-only tools (safe — this server only reads docs).

---

## Steering file (recommended for all clients)

[`copilot-instructions.md`](copilot-instructions.md) makes the agent *actually use* the server —
consulting `get_ak_guardrails` / `get_ak_guide` before writing firmware. Copy it to:

- GitHub Copilot / VS Code: `.github/copilot-instructions.md`
- Cursor: `.cursor/rules/ak.md`
- Claude Code: `CLAUDE.md`
- Codex: `AGENTS.md`
