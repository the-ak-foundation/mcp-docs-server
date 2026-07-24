# ak-mcp — AK Active Kernel documentation MCP server

A free, public **[Model Context Protocol](https://modelcontextprotocol.io) server** that gives AI coding tools accurate, queryable documentation for the **AK (Active Kernel)** event-driven MCU framework (firmware: [`ak-base-kit-stm32l151`](https://github.com/the-ak-foundation/ak-base-kit-stm32l151)).

It lets an AI assistant:

- understand the AK kernel core (scheduler, message pools, timers, FSM/TSM),
- look up exact **API signatures and arguments** (extracted straight from the headers, so they never drift),
- follow the **rules & format** for creating tasks, drivers, and screens,
- design new tasks/drivers **without touching** the kernel, boot, sys, networks, or common code.

## How it works

This repo is **standalone** — the kernel headers are vendored (committed) under
`vendor/ak-inc/`, so nothing else needs to be cloned to build it.

```
vendor/ak-inc/*.h  ──────────────► scripts/extract.mjs ─┐   (snapshot of the kernel
  ▲ refreshed by                                          │    headers; refresh with
  scripts/fetch-headers.mjs (GitHub)                      ├─►  npm run fetch-headers)
corpus/ (hand-written guides,        scripts/build-corpus ┘─► generated/corpus.json
         guardrails, enrichment) ───────────────────────────►      (docs + BM25 index)
                                                                      │
                                          src/core (resources + tools + prompts)
                                          ├── src/worker  →  Cloudflare Worker (remote HTTP)
                                          └── src/cli     →  npx ak-mcp (stdio, local)
```

Signatures come from the vendored kernel headers; semantics/examples are layered on per symbol (`corpus/enrichment/`). A CI **drift check** fails if any cross-reference points at a symbol the headers no longer define.

## What it exposes

**Tools**
| Tool | Purpose |
| --- | --- |
| `start_ak_project(project_name?, ref?)` | resolve the **latest** base-kit release and return download/extract commands + a customization plan |
| `search_ak_docs(query, section?, limit?)` | BM25 search across everything |
| `get_ak_api(symbol)` | exact signature, params, returns, semantics, examples, FATAL codes |
| `list_ak_api(module?)` | browse the API by module (task/message/timer/fsm/tsm/ak/port) |
| `get_ak_guide(topic)` | recipes: start-project, create-task, create-driver, create-screen, use-timer, isr-bridge, tune-pools, **debug-uart-shell**, **kernel-task-log**, **agent-workflow** |
| `get_ak_guardrails()` | do-not-modify zones + kernel invariants |
| `analyze_ak_log(log, context?)` | paste raw UART output → structured diagnosis: FATAL cause/fix, timing (run-to-completion/starvation), reboot loops, next shell commands |
| `decode_ak_lcd(dump, scale?, invert?)` | paste a `lcd d` framebuffer dump → the OLED screen rendered as text art **and a PNG image**, with blank/bounding-box stats |

**Prompts:** `ak-new-project`, `ak-new-task`, `ak-new-driver`, `ak-debug` — guided scaffolding/debugging that enforces conventions and guardrails.

**Debugging loop:** the board's only debug surface is its 115200 UART console (leveled printf
+ an interactive shell). Agents capture it non-interactively with
[`examples/ak-console.py`](examples/ak-console.py) (pyserial; destructive shell commands are
blocked unless `--allow-destructive`), then feed the text to `analyze_ak_log`.

`start_ak_project` queries the GitHub "latest release" API at call time (falling back to the
pinned `v1.3` if the API is unreachable), so new projects always start from the newest tag.

**Resources:** `ak://index`, and `ak://{section}/{id}` for every concept, guide, guardrail, and API entry.

## Kernel headers (vendored)

The build reads the AK kernel's public headers, which are **committed** under `vendor/ak-inc/`
(a snapshot of a firmware release tag — see `vendor/ak-inc/SOURCE.txt`). Cloning this repo is
enough to build it: **no firmware checkout required.**

Refresh the snapshot when the kernel changes:

```sh
npm run fetch-headers            # pinned default tag (v1.3)
npm run fetch-headers v1.4       # a specific release tag
```

then `npm run build:corpus` and commit `vendor/ak-inc/`. Header resolution order (first
existing wins) — override only if you want to build against a live firmware checkout:

1. `$AK_INC_DIR` — exact path to `.../application/sources/ak/inc`
2. `$AK_FIRMWARE_DIR/application/sources/ak/inc` — a firmware repo root
3. `vendor/ak-inc/` — the committed snapshot (default)

Once `generated/corpus.json` is built, the running server (stdio or Worker) needs **nothing**
external — the corpus is self-contained.

## Develop

```sh
npm install
npm run build:corpus     # generate generated/corpus.json from the headers + corpus/
npm run drift            # build + fail on broken cross-references
npm test                 # extractor, corpus integrity, and search ranking (no deps needed)
npm run typecheck        # core + cli
```

The corpus pipeline (`scripts/*.mjs`) and tests are **zero-dependency** and run on plain Node ≥ 20 — no install required for `npm run build:corpus` / `node --test` (only the firmware headers must be reachable as above).

## Run locally (stdio)

```sh
npm run build            # build:corpus + tsc -> dist/
node dist/cli/bin.js     # or, after publishing: npx -y ak-mcp
```

Inspect it with the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node dist/cli/bin.js
```

Client config (Claude Desktop / Cursor):

```json
{ "mcpServers": { "ak": { "command": "npx", "args": ["-y", "ak-mcp"] } } }
```

## Deploy (remote, public)

The Worker bundles `corpus.json` at build time, so it needs no database.

```sh
npm run dev              # local Streamable HTTP at http://localhost:8787/mcp
npm run deploy           # build:corpus + wrangler deploy
```

Endpoints: `/mcp` (Streamable HTTP), `/sse` (legacy), `/` (landing page).

Remote client config:

```json
{ "mcpServers": { "ak": { "url": "https://ak-mcp.<your-account>.workers.dev/mcp" } } }
```

**Using it in VS Code (vibe coding):** see [docs/vscode-vibe-coding.md](docs/vscode-vibe-coding.md)
for step-by-step setup (Copilot Agent mode, Cursor, Cline, Claude Code), a copy-paste
[`.vscode/mcp.json`](examples/vscode-mcp.json) template, and a project steering file
([`examples/copilot-instructions.md`](examples/copilot-instructions.md)).

CI (`.github/workflows/ak-mcp.yml`) builds from the vendored headers (no firmware checkout):
`verify` runs build + drift + tests + typecheck on every change, and `deploy` ships from `main`
when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set. A `refresh-headers` job
(manual **Run workflow** with an optional `tag`, or a `repository_dispatch` of type
`firmware-updated` from the firmware repo) re-fetches `vendor/ak-inc/`, verifies it, and commits
the update if anything changed.

## Adding documentation

- **The kernel released a new version?** Run `npm run fetch-headers [<tag>]` to refresh `vendor/ak-inc/`, then `npm run build:corpus` and commit the snapshot. New/changed signatures are then extracted automatically.
- **A new API needs prose?** Add `corpus/enrichment/<symbol>.md` to give it semantics/examples (the signature is already extracted).
- **A new recipe or concept?** Add a markdown file under `corpus/guides/` or `corpus/concepts/` with frontmatter (`id`, `title`, `tags`, `summary`, optional `apis`).
- Run `npm run drift` to verify all references resolve.

Enrichment / content frontmatter:

```markdown
---
symbol: timer_set            # enrichment only
summary: One-line summary.
fatal_codes: MT:0x30
see_also: timer_remove_attr, timer_tick
tags: timer, periodic
---
Markdown body (semantics, examples) ...
```
