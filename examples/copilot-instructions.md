<!--
Copy this file to .github/copilot-instructions.md in your AK firmware project.
It "steers" the AI agent to always consult the AK MCP docs server before writing
firmware, so generated code follows kernel conventions and stays out of the core.
(Cursor: copy the same text into .cursor/rules/ak.md. Claude Code: into CLAUDE.md.
Codex: into AGENTS.md.)
-->

# AK firmware — agent instructions

This project is firmware for the **AK (Active Kernel)** event-driven MCU framework.

You have access to the **`ak-docs` MCP server**. Use it as the source of truth — do
not guess AK APIs from memory.

**Starting a new project?** If this is a fresh/empty workspace (no `application/` yet),
call **`start_ak_project`** first — it downloads the latest base-kit release and gives you
the commands to lay it out. Run them, then customize per the steps below.

Before writing or changing any firmware:

1. Call **`get_ak_guardrails`** first. Never modify `application/sources/ak/` (kernel),
   `boot/`, `application/sources/sys/`, `application/sources/networks/`, or
   `application/sources/common/`.
   Build features in `application/sources/app/` and `application/sources/driver/` only.
2. For a new task/driver/screen, call **`get_ak_guide`** (`create-task`,
   `create-driver`, `create-screen`, `use-timer`, `isr-bridge`, `tune-pools`) and follow
   the steps and skeleton exactly.
3. For any kernel function/macro, call **`get_ak_api`** to get the exact signature and
   arguments. Use **`search_ak_docs`** when you don't know the symbol name.

**Debugging a running board?** All debugging is over the UART console (115200 8N1):
call **`get_ak_guide("debug-uart-shell")`** first. Capture output non-interactively with
`python ak-console.py --port <P> --cmd "ver" --cmd "fatal l"` (or `--watch 15` for live
logs), then paste the raw text into **`analyze_ak_log`** and follow its Next steps.
For display issues, capture `--cmd "lcd d"` and paste the dump into **`decode_ak_lcd`**
to see the OLED contents.
Run only read-only shell commands on your own; destructive ones (`reboot`, `fatal t/!/@/r`,
`ram r`, `eps r`, `flash i`, `boot r/t`, `fwu`, `dbg s`) need the engineer's explicit OK.

Workflow (see `get_ak_guide("agent-workflow")`):

1. **Develop/debug with `-URELEASE`** — keep `RELEASE_OPTION = -URELEASE` in
   `application/Makefile` (its default). A `-DRELEASE` build auto-resets on FATAL and hides
   the interactive fatal mode; only build `-DRELEASE` for the shipping artifact.
2. **Commit after every finished feature** if the folder is a git repo (`git rev-parse
   --is-inside-work-tree`): one feature = one `git add -A && git commit -m "<what/why>"`.
   Don't create commits in a non-repo without asking.
3. **After implementing/changing any screen**, flash + navigate to it, capture `--cmd "lcd d"`,
   and run **`decode_ak_lcd`** to confirm the framebuffer matches the intended layout.
4. **After the final build**, exercise every path you touched, then run `--cmd "fatal l"
   --cmd "fatal m"`; if `fatal_times` rose or a tag appears, feed it to `analyze_ak_log`,
   fix the root cause, and repeat until a full run leaves `fatal_times` unchanged.

Hard rules (also returned by `get_ak_guardrails`):

- Handlers must be **non-blocking** — no `delay()`, no busy-wait. Use a timer that posts a
  signal instead.
- Tasks communicate **only via messages** (`task_post_*`), never direct calls or shared
  globals.
- User signals start at `AK_USER_DEFINE_SIG` (10); task priorities are `LEVEL_1..7`
  (0 is reserved).
- Common message payload ≤ 64 bytes; max 7 references per message; pools are fixed size.
