---
id: create-driver
title: "Recipe: Create a new driver"
section: guide
tags: driver, create, recipe, bsp, function-pointer, gpio, polling, makefile, callback
summary: Drivers are hardware-agnostic modules using function-pointer injection; the BSP supplies the real GPIO, app code instantiates and wires them, and events enter the kernel via task_post_*.
apis: task_post_pure_msg, timer_set
---

# Recipe: Create a new driver

AK drivers follow a **dependency-injection-by-function-pointer** pattern: the driver knows the *logic* (debounce, blink, state) but not the *pins*. The board-support layer (BSP) supplies the actual GPIO functions. This keeps drivers portable and the kernel untouched ([guardrails](ak://guardrail/do-not-modify)).

Reference implementations: `application/sources/driver/led/`, `application/sources/driver/button/`, wired in `application/sources/app/app_bsp.cpp`.

## The shape of a driver

A driver is a self-contained module under `application/sources/driver/<name>/` with `<name>.h`, `<name>.c` (or `.cpp`), and `Makefile.mk`. Its handle struct holds **control function pointers** plus state. Example, modelled on `led_t`:

```c
/* driver/relay/relay.h */
#ifndef __RELAY_H__
#define __RELAY_H__
#ifdef __cplusplus
extern "C" {
#endif
#include <stdint.h>

typedef void (*pf_relay_ctrl)();

typedef struct {
    uint8_t       status;
    pf_relay_ctrl pf_init;
    pf_relay_ctrl pf_on;
    pf_relay_ctrl pf_off;
} relay_t;

void relay_init(relay_t* relay, pf_relay_ctrl init, pf_relay_ctrl on, pf_relay_ctrl off);
void relay_on(relay_t* relay);
void relay_off(relay_t* relay);

#ifdef __cplusplus
}
#endif
#endif /* __RELAY_H__ */
```

```c
/* driver/relay/relay.c - pure logic, no pins */
#include "relay.h"
void relay_init(relay_t* r, pf_relay_ctrl init, pf_relay_ctrl on, pf_relay_ctrl off) {
    r->pf_init = init; r->pf_on = on; r->pf_off = off;
    if (r->pf_init) r->pf_init();
    if (r->pf_off) r->pf_off();          /* default OFF */
}
void relay_on(relay_t* r)  { r->status = 1; if (r->pf_on)  r->pf_on(); }
void relay_off(relay_t* r) { r->status = 0; if (r->pf_off) r->pf_off(); }
```

## 1. Register the module in the build

`driver/relay/Makefile.mk`:

```make
CFLAGS   += -I./sources/driver/relay
CPPFLAGS += -I./sources/driver/relay
VPATH    += sources/driver/relay
SOURCES  += sources/driver/relay/relay.c
```

Then add one line to `application/sources/driver/Makefile.mk`:

```make
include sources/driver/relay/Makefile.mk
```

## 2. Put the pin functions in `io_cfg.c` (the board IO layer)

**All GPIO/register code lives in `application/sources/platform/stm32l/io_cfg.c`** — never in
the driver, never inline in the app ([guardrails](ak://guardrail/do-not-modify)). This is the
platform seam: porting to another MCU means rewriting only `io_cfg.*`. Add the pin-map macros to
`io_cfg.h` and the `io_*` functions to `io_cfg.c`, exactly like the stock `led_life_*` /
`io_button_*` functions:

```c
/* io_cfg.h — pin map */
#define RELAY_FAN_IO_PIN     (GPIO_Pin_5)
#define RELAY_FAN_IO_PORT    (GPIOA)
#define RELAY_FAN_IO_CLOCK   (RCC_AHBPeriph_GPIOA)
extern void relay_fan_init();
extern void relay_fan_on();
extern void relay_fan_off();

/* io_cfg.c — the ONLY place that touches the register */
void relay_fan_init() { /* RCC clock + GPIO_Init as output */ }
void relay_fan_on()   { GPIO_SetBits(RELAY_FAN_IO_PORT, RELAY_FAN_IO_PIN); }
void relay_fan_off()  { GPIO_ResetBits(RELAY_FAN_IO_PORT, RELAY_FAN_IO_PIN); }
```

Then in **app code** (`app_bsp.cpp` / `app.cpp`) only create the instance and **inject** those
functions — no register access here:

```c
relay_t relay_fan;
/* in main_app(): */
relay_init(&relay_fan, relay_fan_init, relay_fan_on, relay_fan_off);
```

## 3. (Input drivers) Poll periodically and bridge events to a task

Input drivers expose a `*_polling()` you call from the 10 ms timer hook `sys_irq_timer_10ms()` (see `app.cpp`), exactly like `button_timer_polling(&btn_mode)`. The driver's **callback** turns a hardware event into an AK message - it must not do heavy work:

```c
void btn_mode_callback(void* b) {
    button_t* me = (button_t*)b;
    if (me->state == BUTTON_SW_STATE_PRESSED) {
        task_post_pure_msg(AC_TASK_DISPLAY_ID, AC_DISPLAY_BUTON_MODE_PRESSED);
    }
}
```

This is the bridge from hardware into the event-driven world: **drivers post messages; tasks contain the logic.**

## Checklist

- [ ] Driver under `driver/<name>/` with `<name>.h/.c` + `Makefile.mk`
- [ ] Handle struct holds `pf_*` function pointers (no hardcoded pins in the driver)
- [ ] `include`d from `driver/Makefile.mk`
- [ ] **GPIO/pin functions defined in `platform/stm32l/io_cfg.c` (macros in `io_cfg.h`)** — not in the driver or app
- [ ] App only creates the instance and injects the `io_*` functions via `*_init(...)`
- [ ] Periodic work hooked into `sys_irq_timer_10ms()`; callbacks only `task_post_*`
- [ ] Kernel / `boot` / `sys` / `networks` / `common` untouched

See also: [isr-bridge](ak://guide/isr-bridge), [create-task](ak://guide/create-task).
