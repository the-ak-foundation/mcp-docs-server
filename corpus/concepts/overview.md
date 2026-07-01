---
id: overview
title: AK Active Kernel — Overview
section: concept
tags: ak, active-object, event-driven, mcu, stm32l151
summary: AK is a cooperative, event-driven kernel where tasks communicate only via messages carrying signals, driven by timers and structured as state machines.
apis: task_run, task_post_pure_msg, timer_set
---

# AK Active Kernel — Overview

AK is a tiny **cooperative, event-driven kernel** for microcontrollers (this codebase targets the STM32L151CBT6: Cortex-M3, 128 KB flash, 16 KB RAM). Firmware is structured as a set of **tasks** (active objects) that:

- never block and never busy-wait,
- communicate **only** by passing **messages** that carry a **signal** (a `uint8_t` event code),
- express "later" with **timers** that post a signal to a task,
- organize their logic as **state machines** (FSM or TSM).

The scheduling model is the "active object" pattern (see `application/sources/ak/doc/Samek0607.pdf`).

## The mental model

- **One stack, no preemption.** Each task handler runs to completion before the next runs. No mutexes are needed for task-local state.
- **No blocking.** Replace `delay()` / spin loops with a timer that posts a message.
- **No shared memory between tasks.** State lives inside a task; other tasks influence it only by sending messages. Data flow is explicit.
- **Priorities without threads.** Eight priority levels schedule *messages*, not threads.

The cost: a long-running handler delays everything below it. Keep handlers short; offload by posting follow-up messages.

## The four pillars

1. **Tasks** — `void task_xxx(ak_msg_t* msg)`, registered in `app_task_table[]` with an ID and a priority. See [scheduler](ak://concept/scheduler).
2. **Messages & signals** — three pools (pure / common / dynamic), reference-counted, auto-freed. See [messages](ak://concept/messages).
3. **Timers** — one-shot or periodic software timers. See [timers](ak://concept/timers).
4. **State machines** — FSM (function-pointer state) and TSM (table-driven). See [state-machines](ak://concept/state-machines).

## Where things live

| Path | Role |
| --- | --- |
| `application/sources/ak/` | the kernel (rarely edited) |
| `application/sources/app/` | application tasks + `screens/` (where features go) |
| `application/sources/driver/` | board drivers (led, button, buzzer, flash, …) |
| `application/sources/common/` | screen manager, view_render, containers |
| `application/sources/sys/` | sys_boot / sys_ctrl / sys_dbg / sys_io / sys_irq |

When extending AK, work in `app/` and `driver/`. See [guardrails](ak://guardrail/do-not-modify).
