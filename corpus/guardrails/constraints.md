---
id: constraints
title: "Guardrail: Kernel constraints & invariants"
section: guardrail
tags: guardrail, constraints, no-blocking, ram, priority, ref-count, fatal, invariants
summary: Hard rules every AK task must respect — no blocking, run-to-completion, fixed pools, 64-byte common payload, max 7 refs, priority 0 reserved, 16 KB RAM budget.
---

# Guardrail: Kernel constraints & invariants

Code generated for AK must respect these or it will fail at runtime (often via `FATAL`).

## Behavioral rules

- **Handlers run to completion and must not block.** No `delay()`, no busy-wait, no `while (!flag) {}`. Need "later"? Use [a timer](ak://guide/use-timer). Need "continue after yield"? Post yourself a message.
- **Don't share task state through globals.** Send a message; keep data flow explicit and race-free.
- **ISRs only post messages**, bracketed by `task_entry_interrupt()`/`task_exit_interrupt()`. See [isr-bridge](ak://guide/isr-bridge).
- **Guard ISR↔task shared data** with `ENTRY_CRITICAL()` / `EXIT_CRITICAL()`.

## Hard limits

| Invariant | Value | Violation |
| --- | --- | --- |
| Common message payload | ≤ `AK_COMMON_MSG_DATA_SIZE` (64 B) | `FATAL("MF", 0x24)` — use a dynamic message |
| Message reference count | ≤ 7 | `FATAL("MF", 0x61)` |
| Task priority | `LEVEL_1`–`LEVEL_7`; **0 reserved** | scheduling corruption |
| User signal base | starts at `AK_USER_DEFINE_SIG` (10) | collides with kernel signals |
| Pools | fixed at compile time | exhaustion is `FATAL` — size via [tune-pools](ak://guide/tune-pools) |
| RAM budget | 16 KB total | watch STL/heap use; check `make info` |

## Allocation never returns NULL

`get_pure_msg()` / `get_common_msg()` / `get_dynamic_msg()` do not return NULL — they `FATAL` on exhaustion. So you never null-check them; instead you size the pools correctly.

## FATAL quick reference

| Tag·code | Meaning |
| --- | --- |
| `MF`·0x31 / 0x21 / 0x41 | pure / common / dynamic pool exhausted |
| `MF`·0x24 | common payload over 64 B |
| `MF`·0x61 / 0x28 | ref count over max / under zero |
| `MT`·0x30 | timer pool exhausted |
| `TK`·0x02 | `task_post` to an out-of-range task ID |
| `ak_malloc`·0x01 / 0x02 | heap overflow / `malloc` failed |

See also: [do-not-modify](ak://guardrail/do-not-modify), [messages](ak://concept/messages).
