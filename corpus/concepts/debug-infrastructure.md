---
id: debug-infrastructure
title: Debug Infrastructure — UART logs, shell & FATAL
section: concept
tags: debug, uart, console, log, printf, xprintf, shell, fatal, watchdog, app_dbg, sys_dbg
summary: All AK debugging flows through one UART console at 115200 — prefixed printf macros, an interactive shell, and a FATAL handler that snapshots the whole system to external flash.
apis: task_pri_queue_dump, get_pure_msg_pool_used_max
---

# Debug Infrastructure — UART logs, shell & FATAL

The AK base kit has **no SWO/trace debugging in normal workflow** — everything goes through
one UART console (**115200 8N1**, `xprintf`-based). Three subsystems share it:

1. **Log macros** — leveled printf with recognizable prefixes.
2. **The shell** — an interactive command interpreter (`application/sources/app/shell.cpp`).
3. **The FATAL handler** — crash capture + interactive post-mortem mode (`sys/sys_dbg.c`).

## 1. Log macros and their prefixes

| Macro | Prefix on UART | Purpose | Compile gate |
| --- | --- | --- | --- |
| `APP_PRINT(fmt, ...)` | `[PRINT] ` | app-level info | `-DAPP_PRINT_EN` |
| `APP_DBG(fmt, ...)` | `[DBG] ` | app-level debug | `-DAPP_DBG_EN` |
| `APP_DBG_SIG(fmt, ...)` | `-SIG-> ` | signal trace — by convention the **first line of every `case` in a handler**, printing the signal name | `-DAPP_DBG_SIG_EN` |
| `LOGIN_PRINT(fmt, ...)` | *(none)* | shell command output | `-DLOGIN_PRINT_EN` |
| `SYS_PRINT` / `SYS_DBG` | *(none)* | kernel/system layer | `-DSYS_PRINT_EN` / `-DSYS_DBG_EN` |

All gates live in `CONSOLE_OPTION` near the top of `application/Makefile`. Defined in
`application/sources/app/app_dbg.h` and `application/sources/sys/sys_dbg.h`.

Because `APP_DBG_SIG` traces every handled signal, a capture of UART output **is an event
trace of the whole system** — the `-SIG->` lines immediately before a crash tell you which
handler was running.

### Kernel per-message timing log

Flip `LOG_AK_KERNEL_ENABLE = -UAK_TASK_LOG_CONSOLE_ENABLE` to
`-DAK_TASK_LOG_CONSOLE_ENABLE` in `application/sources/ak/ak.cfg.mk`
(recipe: [kernel-task-log](ak://guide/kernel-task-log)) and the scheduler
prints one line per handled message:

```
taskID: 5	msgType:0x80	refCnt:0	sig:11		waitTime:0	exeTime:2
```

- `waitTime` = ms the message sat in the queue (large → starvation by higher-priority work).
- `exeTime` = ms the handler ran (large → run-to-completion violation; keep handlers short).

The same records are also kept in a RAM ring (`AK_TASK_OBJ_LOG_ENABLE`, on by default) and
are flushed to external flash on FATAL — readable later with the shell command `fatal m`.

## 2. Console RX path (how typed commands reach code)

ISR RX bytes → `ring_buffer_console_rev` → polling task `task_polling_console` (runs when no
messages pending) accumulates until CR/LF → posts the line as a common message
(`AC_SHELL_LOGIN_CMD`) to `task_shell` → `cmd_line` parser matches the first word against
`lgn_cmd_table[]` in `shell.cpp` and calls the handler.

Consequence: the shell **only responds while the kernel loop is alive**. If the board is hard-
hung, the shell is dead too — but FATAL mode (below) has its own blocking read loop that
still works.

## 3. FATAL flow (what happens on a crash)

`FATAL("TAG", code)` — used by the kernel on pool exhaustion, bad task IDs, ref-count bugs:

1. Disables interrupts, switches the console to blocking mode.
2. Prints the tag and code to UART: `TAG<TAB><code-hex>` (e.g. `MT	30`).
3. Saves to **external flash**: the fatal record (tag, code, current task, current active
   object/message, Cortex-M3 core registers, `fatal_times`/`restart_times` counters), the
   active-object log ring, the IRQ log ring, and a **full RAM dump**.
4. **Non-RELEASE build:** enters an interactive *fatal mode* — life LED blinks fast (~2.5 Hz)
   and single-key commands work over UART:

   | Key | Prints |
   | --- | --- |
   | `r` | reset the system |
   | `f` | fatal info (tag/code, task id/pri, object task/sig/type/refcount, core regs) |
   | `m` | saved active-object log (per-message wait/exe times) |
   | `e` | saved exception/IRQ log |
   | `R` | full RAM dump (address + byte values) |
   | `c` | CPU core registers |
   | `s` | stack space dump |

5. **RELEASE build:** resets immediately — but the flash snapshot survives, so after reboot
   the shell commands `fatal l` / `fatal m` / `fatal e` / `fatal R` read the same data back.

`restart_times` increments on every boot and `fatal_times` on every FATAL — comparing them
(via `fatal l`) distinguishes watchdog resets (32 s independent / 20 s soft) from FATALs.

## 4. What to reach for

| Question | Tool |
| --- | --- |
| What is the system doing right now? | capture UART: `-SIG->` trace + `[DBG]` lines |
| Why did it reset? | shell `fatal l` (tag/code + counters) |
| What ran just before the crash? | shell `fatal m` (message log) or fatal-mode key `m` |
| Is a handler too slow / starving others? | timing log (`AK_TASK_LOG_CONSOLE_ENABLE`) or `fatal m` |
| RAM/stack health? | shell `ver`, `ram s` |
| What is on the OLED (headless)? | shell `lcd d` (framebuffer dump) |

The actionable playbook — connection commands, the full shell reference, and the
symptom→action matrix — is in [guide: debug-uart-shell](ak://guide/debug-uart-shell).
Paste any captured output into the **`analyze_ak_log`** tool for automatic diagnosis.
