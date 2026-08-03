---
id: do-not-modify
title: "Guardrail: Where to make changes (and where not to)"
section: guardrail
tags: guardrail, do-not-modify, core, boot, sys, networks, common, scope, io_cfg, bsp, gpio, platform, portability, naming, task-prefix
summary: Extend AK in app/ and driver/. Kernel, bootloader, sys, networks, common are read-only. Put ALL board IO/GPIO code in platform/stm32l/io_cfg.c only, and reserve the task_* prefix for AK tasks declared in task_list.h.
---

# Guardrail: Where to make changes

When designing a new feature (task, driver, helper), keep changes in the **application and driver layers**. The following are framework internals - **do not modify them** unless the user explicitly asks and understands the blast radius.

## Do NOT modify (read-only by default)

| Path | Why it's off-limits |
| --- | --- |
| `application/sources/ak/` | The Active Kernel. Scheduler, message pools, timers, FSM/TSM. A bug here breaks every task. |
| `boot/` | The bootloader image. A mistake here can brick the device's update path. |
| `application/sources/sys/` | System services: `sys_boot` (boot↔app handoff), `sys_ctrl` (clocks, watchdogs, reset), `sys_dbg` (FATAL capture), `sys_io`/`sys_irq` (IRQ plumbing). Breaking these breaks recovery, OTA, and the debug path itself. |
| `application/sources/networks/` | ZigBee, Modbus master, nRF24 / link stacks. Vendored / protocol-critical. |
| `application/sources/common/` | Screen manager, view_render, containers, xprintf. Shared framework used everywhere. |
| `application/sources/platform/` | STM32L StdPeriph, CMSIS, USB, Arduino shim, linker script. **Exception:** `platform/stm32l/io_cfg.c` + `io_cfg.h` are editable — that is the board IO layer (see below). |
| `application/sources/libraries/` | Vendored third-party (ArduinoJson, QRCode, nlohmann). |

## DO work here

| Path | What goes here |
| --- | --- |
| `application/sources/app/` | New tasks, signals (`app.h`), task table (`task_list.cpp`), screens (`app/screens/`), BSP wiring (`app_bsp.cpp`). |
| `application/sources/driver/` | New hardware-agnostic drivers (function-pointer injection — no pin numbers). |
| `application/sources/platform/stm32l/io_cfg.c` + `io_cfg.h` | **The board IO layer** — all GPIO/ADC/UART/pin-map code and low-level `io_*` functions go here (see Conventions). This is the platform seam you rewrite to port to another MCU. |
| `application/sources/ak/ak.cfg.mk` | Pool/timer sizing + kernel debug-log flags (e.g. `LOG_AK_KERNEL_ENABLE`) - configuration, safe to tune. |
| `application/Makefile` | Feature flags (enable/disable tasks, interfaces, hardware variant). |

## If a change *seems* to require touching the core

It almost never does. Prefer these instead:

- Need new behavior? Add a **task** and post messages to it.
- Need new hardware? Add a **driver** + BSP wiring.
- Need a shared helper? Add it in `app/` (or a new `driver/` module) - not in `common/`, `sys/`, or `ak/`.
- Need a new GPIO/pin, ADC channel, or UART? Add the pin-map macros and the `io_*` function(s) in `platform/stm32l/io_cfg.h` / `io_cfg.c`, then inject them (see below). Don't touch `sys/`.
- Need different timing/buffers? Adjust `ak.cfg.mk` or the `Makefile` flags, not kernel `.c` files.

If you genuinely believe the kernel must change, **stop and flag it to the engineer** with the specific reason - don't edit it silently.

## Conventions

### 1. All board IO/BSP code lives in `io_cfg.c` — nowhere else

Every function that touches a pin, register, GPIO, ADC, or UART (the low-level `io_*` /
`led_life_*` / `io_button_*` style functions) must be defined in
`application/sources/platform/stm32l/io_cfg.c`, with its pin-map macros in `io_cfg.h`.

- **Drivers** (`driver/`) hold *function pointers*, never pin numbers or register access.
- **App/BSP** (`app_bsp.cpp`, `app.cpp`) create the driver instance and **inject** the `io_cfg`
  functions (e.g. `led_init(&led_life, led_life_init, led_life_on, led_life_off)`), but must not
  define GPIO/register code themselves.

**Why:** all hardware coupling is isolated in one file. Porting to another MCU means rewriting
only `platform/<mcu>/io_cfg.*` — the drivers and the whole app stay unchanged. Scattering
`GPIO_SetBits(...)` / `pinMode(...)` into a driver or an app file breaks that and is not allowed.

### 2. The `task_*` prefix is reserved for AK tasks

Only the active-object handlers `void task_xxx(ak_msg_t*)` that are **registered in
`app/task_list.h`** may use the `task_` prefix (file name and function name). Do **not** prefix
any other file, helper, or function with `task_`.

- Screens → `scr_*` (`scr_clock.cpp`, `scr_clock_handle`).
- Drivers → `<device>_*` (`relay_on`).
- Board IO → `io_*` / `led_*` in `io_cfg.c`.
- Feature helpers → `<feature>_*`.

**Why:** `task_*` should mean exactly one thing — "an AK task" — so the task list, the code, and
the debug logs (`taskID`, `-SIG->`) stay unambiguous.

See also: [constraints](ak://guardrail/constraints), [create-task](ak://guide/create-task), [create-driver](ak://guide/create-driver).
