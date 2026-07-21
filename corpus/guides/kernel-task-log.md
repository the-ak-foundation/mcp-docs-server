---
id: kernel-task-log
title: "Recipe: Kernel task log (per-message timing) when you need it"
section: guide
tags: task-log, timing, waitTime, exeTime, AK_TASK_LOG_CONSOLE_ENABLE, LOG_AK_KERNEL_ENABLE, ak.cfg.mk, profiling, starvation, debug
summary: Flip LOG_AK_KERNEL_ENABLE from -U to -DAK_TASK_LOG_CONSOLE_ENABLE in ak.cfg.mk to make the scheduler print wait/exe time for every handled message; read it, feed it to analyze_ak_log, and turn it off when done.
---

# Recipe: Kernel task log (per-message timing)

When the system feels sluggish, misses events, or you suspect a handler is hogging the CPU,
enable the kernel's **per-message console log**: the scheduler prints one line for *every*
message it dispatches, with queue wait time and handler execution time.

## 1. Enable — one flag in `application/sources/ak/ak.cfg.mk`

This is **configuration, not a kernel edit** — `ak.cfg.mk` is on the safe list
([guardrails](ak://guardrail/do-not-modify)). Change `-U` to `-D`:

```make
# AK kernel message log (via UART console).
LOG_AK_KERNEL_ENABLE = -UAK_TASK_LOG_CONSOLE_ENABLE     # ← default: off
LOG_AK_KERNEL_ENABLE = -DAK_TASK_LOG_CONSOLE_ENABLE     # ← enabled
```

Keep `TASK_OBJ_LOG_ENABLE = -DAK_TASK_OBJ_LOG_ENABLE` (the default) — it populates the
timestamps this log prints; turning it off while the console log is on yields garbage
wait times.

Then rebuild and flash:

```sh
cd application && make clean && make && make flash    # or make flash dev=/dev/ttyUSB0
```

## 2. What you'll see

One line per handled message on the 115200 console:

```
taskID: 5	msgType:0x80	refCnt:0	sig:11		waitTime:0	exeTime:2
```

| Field | Meaning |
| --- | --- |
| `taskID` | destination task (enum order in `app/task_list.h`) |
| `msgType` | 0x80 pure · 0xC0 common · 0x40 dynamic |
| `sig` | the signal handled (≥ 10 = user signal) |
| `waitTime` | ms the message sat queued — **large ⇒ starvation** by higher-priority work |
| `exeTime` | ms the handler ran — **large ⇒ run-to-completion violation** (> ~50 ms is long; > 500 ms risks the 20 s/32 s watchdogs when repeated) |

## 3. Capture and analyze

```sh
python ak-console.py --port <P> --watch 15      # capture while reproducing the symptom
```

Paste the capture into **`analyze_ak_log`** — it parses these lines automatically and
reports max/avg exe time, the offending task+signal, and starvation warnings.

## 4. Turn it OFF when done (important)

Printing ~70 characters at 115200 baud costs **~6 ms of UART time per message** — with
traffic, the log itself slows the system and skews the very timings you're measuring
(observer effect), and it floods the console. So:

- flip back to `-UAK_TASK_LOG_CONSOLE_ENABLE` and rebuild once diagnosis is done;
- never ship a `RELEASE` build with it on.

## Alternative: post-mortem timing without console spam

The same records are always kept in a RAM ring (`AK_TASK_OBJ_LOG_ENABLE`, default on) and
flushed to external flash on FATAL. After a crash/reboot, the shell command **`fatal m`**
(safe, read-only) dumps the message history with the same wait/exe fields — no live logging
needed. Use the console log for *live* profiling, `fatal m` for *after-the-fact* forensics.

See also: [debug-uart-shell](ak://guide/debug-uart-shell), [debug-infrastructure](ak://concept/debug-infrastructure), [scheduler](ak://concept/scheduler).
