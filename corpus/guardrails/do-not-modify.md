---
id: do-not-modify
title: "Guardrail: Where to make changes (and where not to)"
section: guardrail
tags: guardrail, do-not-modify, core, boot, sys, networks, common, scope
summary: Extend AK in app/ and driver/. Treat the kernel, bootloader, system services (sys), network stacks, and common framework as read-only unless explicitly asked.
---

# Guardrail: Where to make changes

When designing a new feature (task, driver, helper), keep changes in the **application and driver layers**. The following are framework internals — **do not modify them** unless the user explicitly asks and understands the blast radius.

## Do NOT modify (read-only by default)

| Path | Why it's off-limits |
| --- | --- |
| `application/sources/ak/` | The Active Kernel. Scheduler, message pools, timers, FSM/TSM. A bug here breaks every task. |
| `boot/` | The bootloader image. A mistake here can brick the device's update path. |
| `application/sources/sys/` | System services: `sys_boot` (boot↔app handoff), `sys_ctrl` (clocks, watchdogs, reset), `sys_dbg` (FATAL capture), `sys_io`/`sys_irq` (IRQ plumbing). Breaking these breaks recovery, OTA, and the debug path itself. |
| `application/sources/networks/` | ZigBee, Modbus master, nRF24 / link stacks. Vendored / protocol-critical. |
| `application/sources/common/` | Screen manager, view_render, containers, xprintf. Shared framework used everywhere. |
| `application/sources/platform/` | STM32L StdPeriph, CMSIS, USB, Arduino shim, linker script. |
| `application/sources/libraries/` | Vendored third-party (ArduinoJson, QRCode, nlohmann). |

## DO work here

| Path | What goes here |
| --- | --- |
| `application/sources/app/` | New tasks, signals (`app.h`), task table (`task_list.cpp`), screens (`app/screens/`), BSP wiring (`app_bsp.cpp`). |
| `application/sources/driver/` | New hardware-agnostic drivers (function-pointer injection). |
| `application/sources/ak/ak.cfg.mk` | Pool/timer sizing + kernel debug-log flags (e.g. `LOG_AK_KERNEL_ENABLE`) — configuration, safe to tune. |
| `application/Makefile` | Feature flags (enable/disable tasks, interfaces, hardware variant). |

## If a change *seems* to require touching the core

It almost never does. Prefer these instead:

- Need new behavior? Add a **task** and post messages to it.
- Need new hardware? Add a **driver** + BSP wiring.
- Need a shared helper? Add it in `app/` (or a new `driver/` module) — not in `common/`, `sys/`, or `ak/`.
- Need new pin/IRQ plumbing? Reuse the existing `sys_io`/`io_cfg` functions or the Arduino shim (`pinMode`/`digitalWrite`); put new pin helpers in `app_bsp.cpp` — don't edit `sys/`.
- Need different timing/buffers? Adjust `ak.cfg.mk` or the `Makefile` flags, not kernel `.c` files.

If you genuinely believe the kernel must change, **stop and flag it to the engineer** with the specific reason — don't edit it silently.

See also: [constraints](ak://guardrail/constraints), [create-task](ak://guide/create-task), [create-driver](ak://guide/create-driver).
