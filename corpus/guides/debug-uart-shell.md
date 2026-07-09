---
id: debug-uart-shell
title: "Recipe: Debug via UART log & shell"
section: guide
tags: debug, uart, shell, console, log, fatal, serial, com, analyze, playbook, minicom, pyserial
summary: Connect to the 115200 UART console, capture logs, drive the shell (full command reference, safe vs destructive), diagnose by symptom, and feed output to analyze_ak_log.
apis: task_pri_queue_dump, get_pure_msg_pool_used_max, timer_set
---

# Recipe: Debug via UART log & shell

Everything observable about a running AK board comes out of **one UART console, 115200 8N1**
(see [debug-infrastructure](ak://concept/debug-infrastructure) for how it works). This guide
is the *doing* side: connect, run commands, interpret, fix.

> **For AI agents:** capture output with the non-interactive helper `examples/ak-console.py`
> (in the ak-mcp repo), then paste the raw text into the **`analyze_ak_log`** tool for a
> structured diagnosis. Only run commands from the *safe* list below on your own; ask the
> engineer before anything *destructive*.

## 1. Connect

| Method | Command |
| --- | --- |
| **Agent-friendly (recommended)** | `python ak-console.py --port COM3 --cmd "ver" --cmd "fatal l"` — sends each command, captures the reply, exits. `--watch 10` just listens (boot logs). `--list` finds ports. |
| Makefile | `make com dev=/dev/ttyUSB0` (minicom; Linux/WSL) |
| pyserial terminal | `python -m serial.tools.miniterm COM3 115200` |
| PuTTY / TeraTerm | Serial, 115200-8N1, no flow control |

Line ending for commands: **CR** (`\r`). The shell echoes typed characters; backspace = 0x08.

## 2. Shell command reference

Syntax is `<cmd> <option> [args]` — one word, one option letter, then optional args
(e.g. `ram d 0x20000000 0x20000100`). `help` lists everything on-device.

### Safe (read-only — agents may run freely)

| Command | What it shows |
| --- | --- |
| `ver` | kernel + app version, firmware checksum/length, **FLASH/SRAM used, stack & heap available**, CPU clock, tick, console baud, **VCC (mV), MCU temp (°C)** |
| `help` | command list |
| `fatal l` | last FATAL record: `fatal_times` / `restart_times`, tag+code, task id/pri/entry, active object (task, sig, type, ref count, wait time), core registers, IRQ number |
| `fatal m` | saved **active-object log**: per-message `task_id, msg_type, ref_count, sig, wait_time, exe_time` — the event history right before the last FATAL |
| `fatal e` | saved exception/IRQ log (exception number, IRQ number, timestamp) |
| `fatal R <columns>` | RAM snapshot **saved at FATAL time** (from external flash) |
| `ram d\|h <start> <stop>` | live RAM dump dec/hex (e.g. `ram d 0x20000000 0x20000400`) |
| `ram s` | stack size, usage, stack space dump |
| `ram c` | CPU core registers (IPSR/PRIMASK/FAULTMASK/BASEPRI/CONTROL) |
| `flash d\|h <start> <stop>` | external SPI flash dump dec/hex |
| `eps d\|h` | EEPROM dump dec/hex |
| `lcd d` | **OLED framebuffer dump** (128×64, 1024 bytes hex CSV) — paste into the **`decode_ak_lcd`** tool to render the screen as text art + PNG |
| `boot i` | boot-share region: current/update firmware headers + boot commands |
| `dbg v` / `dbg t` | VBAT voltage / MCU temperature |
| `modbus r` | poll all Modbus registers (if `TASK_MBMASTER_EN`) |
| `stt`, `epi` | stubs (reserved, no output) |

### Destructive (side effects — ask the engineer first)

| Command | Effect |
| --- | --- |
| `reboot` | system reset |
| `fatal t` | **triggers a real test FATAL** |
| `fatal !` / `fatal @` | hang the CPU (watchdog test; `@` = with IRQs disabled) |
| `fatal r` | erase the saved fatal log |
| `ram r <start> <stop>` | **writes zeros into RAM** |
| `eps r` | erase EEPROM |
| `flash i` | erase fatal-log flash sector |
| `boot r` / `boot t` | clear / trigger boot-share update command |
| `fwu` | reset into UART firmware-update mode (bootloader) |
| `psv` | trigger PendSV exception |
| `dbg s` | stop the MCU (low-power) |
| `lcd i/o/f/b/w/t/r/a/c/p`, `beep i/1-4` | display/buzzer test patterns (harmless but visible) |

## 3. Symptom → action playbook

| Symptom | Do this | Interpret |
| --- | --- | --- |
| **Board resets repeatedly** | `--watch 15` to catch the boot banner, then `fatal l` | `fatal_times` rising → a FATAL (tag+code tells which pool/bug — see [constraints](ak://guardrail/constraints)); `restart_times` rising with `fatal_times` flat → **watchdog** (32 s IWDG / 20 s soft): some handler blocks. Check `fatal m` exe_times. |
| **FATAL printed** (`MF 31`, `MT 30`, …) | paste into `analyze_ak_log`; on-device: `fatal l` then `fatal m` | tag+code → cause; `fatal m` shows the message storm that exhausted the pool |
| **Board seems hung** | is the life LED blinking fast? → **fatal mode**: send single keys `f`, `m`, `e` (`ak-console.py --key f`) | LED fast-blink = FATAL handler; no LED + no shell = hard hang → power-cycle and watch boot |
| **Sluggish / missed events** | enable `AK_TASK_LOG_CONSOLE_ENABLE` in `ak.cfg.mk`, rebuild, capture | `exeTime` > ~50 ms breaks run-to-completion — split the handler; big `waitTime` → raise the task's priority or shorten higher-priority handlers |
| **Suspected RAM pressure** | `ver` (heap/stack avail) + `ram s` | heap avail shrinking over time = leak (dynamic messages not freed?) |
| **Screen shows wrong content** | `lcd d`, paste the dump into **`decode_ak_lcd`** | the tool renders the actual framebuffer (page-major, LSB = top pixel) as text art + PNG and reports blank/bounding-box stats — compare against what the screen *should* show |
| **Silent console** | check `-D*_EN` flags in `application/Makefile` `CONSOLE_OPTION`; wrong baud; TX/RX swapped | log macros compile to nothing when their gate is off |
| **Pool exhaustion recurring** | print `get_*_msg_pool_used_max()` from a debug task, or crash-analyze | resize in `ak.cfg.mk` — see [tune-pools](ak://guide/tune-pools) |

## 4. Add your own shell command (legit customization)

`shell.cpp` is **app-layer** — extending it is allowed and is the standard way to expose
your feature's internals:

```c
/* 1. handler — shell.cpp */
int32_t shell_myfeature(uint8_t* argv) {
    switch (*(argv + 10)) {          /* option char: offset = strlen("myfeature") + 1 */
    case 's':
        LOGIN_PRINT("state: %d\n", my_feature_state);
        break;
    default:
        LOGIN_PRINT("usage: myfeature s\n");
        break;
    }
    return 0;
}

/* 2. register — add BEFORE the End-Of-Table row in lgn_cmd_table[] */
{(const int8_t*)"myfeature", shell_myfeature, (const int8_t*)"my feature status"},
```

For multi-argument commands use `str_parser((char*)argv)` + `str_parser_get_attr(i)`
(see `shell_ram` for the pattern). Long dumps must kick both watchdogs inside the loop
(`sys_ctrl_independent_watchdog_reset(); sys_ctrl_soft_watchdog_reset();`).

Debug prints in *your* code: `APP_DBG_SIG("MY_SIG\n")` first line of each `case`;
`APP_DBG` for values. Don't leave `APP_PRINT` spam in hot paths — UART at 115200 is slow
and printing inside a handler adds to its `exeTime`.

## 5. Automated loop for agents

```
capture:  python ak-console.py --port <P> --watch 10          (boot/log trace)
inspect:  python ak-console.py --port <P> --cmd "ver" --cmd "fatal l" --cmd "fatal m"
screen:   python ak-console.py --port <P> --cmd "lcd d"       → paste into decode_ak_lcd
analyze:  paste ALL captured text into analyze_ak_log
fix:      follow its Next steps; edit only app/ & driver/ per guardrails; rebuild; re-verify
```

See also: [debug-infrastructure](ak://concept/debug-infrastructure), [tune-pools](ak://guide/tune-pools), [constraints](ak://guardrail/constraints).
