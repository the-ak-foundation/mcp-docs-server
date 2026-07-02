---
id: start-project
title: "Recipe: Start a new project from the base kit"
section: guide
tags: start, new, project, bootstrap, scaffold, download, release, base-kit, tarball
summary: Download the latest ak-base-kit-stm32l151 release, lay it out as a new project, then customize only app/ and driver/ using the AK guides.
---

# Recipe: Start a new project from the base kit

Use the **`start_ak_project`** tool to do this end to end — it resolves the *latest* release
automatically and returns ready-to-run commands. This guide documents the same flow.

## 1. Download & extract the latest release

The base kit lives at `the-ak-foundation/ak-base-kit-stm32l151`. Grab the latest tagged
release (example tag `v1.3`; the tool substitutes whatever is newest):

**bash / macOS / Linux / WSL / Git Bash:**
```sh
curl -L https://github.com/the-ak-foundation/ak-base-kit-stm32l151/archive/refs/tags/v1.3.tar.gz -o ak.tar.gz
tar -xzf ak.tar.gz
mv ak-base-kit-stm32l151-1.3 my-ak-app
rm ak.tar.gz
```

**Windows PowerShell:**
```powershell
Invoke-WebRequest https://github.com/the-ak-foundation/ak-base-kit-stm32l151/archive/refs/tags/v1.3.tar.gz -OutFile ak.tar.gz
tar -xzf ak.tar.gz
Rename-Item ak-base-kit-stm32l151-1.3 my-ak-app
Remove-Item ak.tar.gz
```

**Or clone (keeps git history):**
```sh
git clone --depth 1 --branch v1.3 https://github.com/the-ak-foundation/ak-base-kit-stm32l151.git my-ak-app
```

> A GitHub tarball for tag `vX.Y` extracts to a folder `ak-base-kit-stm32l151-X.Y` (the leading
> `v` is dropped) — rename it to your project name.

## 2. Get oriented

- `application/` — the firmware you build (`sources/app/` = tasks & screens, `sources/driver/` = drivers). **Work here.**
- `boot/` — bootloader (separate image). Leave alone.
- `application/sources/ak/`, `networks/`, `common/`, `platform/` — framework; do not modify.
- Build: Unix-like shell + `arm-none-eabi-gcc` (see the repo `CLAUDE.md`), then `cd application && make`.

## 3. Customize for the engineer's needs

1. Call **`get_ak_guardrails`** — stay inside `application/sources/app/` and `application/sources/driver/`.
2. For each feature, call **`get_ak_guide`** (`create-task`, `create-driver`, `create-screen`, `use-timer`, `isr-bridge`) and follow it exactly.
3. Use **`get_ak_api`** for exact signatures/arguments; **`search_ak_docs`** when unsure of a name.
4. Rebuild with `make`; check `make info` against the 16 KB RAM budget.

## Reproducibility

Prefer pinning a specific tag (pass `ref: "v1.3"` to `start_ak_project`) so the project builds
from a fixed source rather than a moving "latest".

See also: [do-not-modify](ak://guardrail/do-not-modify), [create-task](ak://guide/create-task), [create-driver](ak://guide/create-driver).
