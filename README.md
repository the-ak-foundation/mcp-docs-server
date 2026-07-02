# ak-mcp — AK Active Kernel documentation MCP server

A free, public **[Model Context Protocol](https://modelcontextprotocol.io) server** that gives AI coding tools accurate, queryable documentation for the **AK (Active Kernel)** event-driven MCU framework, whose firmware lives in the sibling repo [`ak-base-kit-stm32l151`](https://github.com/the-ak-foundation/ak-base-kit-stm32l151).

It lets an AI assistant:

- understand the AK kernel core (scheduler, message pools, timers, FSM/TSM),
- look up exact **API signatures and arguments** (extracted straight from the headers, so they never drift),
- follow the **rules & format** for creating tasks, drivers, and screens,
- design new tasks/drivers **without touching** the kernel, boot, networks, or common code.

## How it works

```
../ak-base-kit-stm32l151/                                (sibling firmware repo)
  application/sources/ak/inc/*.h ──► scripts/extract.mjs ─┐
corpus/ (hand-written guides,        scripts/build-corpus ├─► generated/corpus.json
         guardrails, enrichment) ───────────────────────┘        (docs + BM25 index)
                                                                      │
                                          src/core (resources + tools + prompts)
                                          ├── src/worker  →  Cloudflare Worker (remote HTTP)
                                          └── src/cli     →  npx ak-mcp (stdio, local)
```

Signatures come from the kernel headers; semantics/examples are layered on per symbol (`corpus/enrichment/`). A CI **drift check** fails if any cross-reference points at a symbol the headers no longer define.

## What it exposes

**Tools**
| Tool | Purpose |
| --- | --- |
| `search_ak_docs(query, section?, limit?)` | BM25 search across everything |
| `get_ak_api(symbol)` | exact signature, params, returns, semantics, examples, FATAL codes |
| `list_ak_api(module?)` | browse the API by module (task/message/timer/fsm/tsm/ak/port) |
| `get_ak_guide(topic)` | recipes: create-task, create-driver, create-screen, use-timer, isr-bridge, tune-pools |
| `get_ak_guardrails()` | do-not-modify zones + kernel invariants |

**Prompts:** `ak-new-task`, `ak-new-driver` — guided scaffolding that enforces conventions and guardrails.

**Resources:** `ak://index`, and `ak://{section}/{id}` for every concept, guide, guardrail, and API entry.

## Repository layout (important)

This repo is **standalone** but its build reads the firmware kernel headers. Clone the
firmware repo **next to** this one:

```
<workspace>/
  ak-base-kit-stm32l151/     # firmware (source of the headers)
  mcp-docs-server/           # this repo
```

The header path is auto-resolved in this order (first existing wins):

1. `$AK_INC_DIR` — exact path to `.../application/sources/ak/inc`
2. `$AK_FIRMWARE_DIR/application/sources/ak/inc` — firmware repo root
3. `../ak-base-kit-stm32l151/application/sources/ak/inc` — sibling clone (default)

So a side-by-side clone needs no configuration. Otherwise:

```sh
AK_FIRMWARE_DIR=/path/to/ak-base-kit-stm32l151 npm run build:corpus
```

Once `generated/corpus.json` is built, the running server (stdio or Worker) needs **nothing**
from the firmware repo — the corpus is self-contained.

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

CI (`.github/workflows/ak-mcp.yml`) checks out **both** this repo and the firmware repo
(`FIRMWARE_REPO`, default `the-ak-foundation/ak-base-kit-stm32l151`, exposed to the build as
`AK_FIRMWARE_DIR`), then runs build + drift + tests + typecheck on every change, and deploys
from `main` when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set. If the
firmware repo is private, uncomment the `token:` line and add a `FIRMWARE_REPO_TOKEN` secret.
To auto-rebuild when kernel headers change, have the firmware repo send a `repository_dispatch`
(`event_type: firmware-updated`) to this repo.

## Adding documentation

- **A new API got added to the kernel?** Nothing to do for the signature — it's extracted automatically. Add `corpus/enrichment/<symbol>.md` to give it semantics/examples.
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
