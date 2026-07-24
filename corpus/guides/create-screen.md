---
id: create-screen
title: "Recipe: Create a new screen"
section: guide
tags: screen, display, oled, fsm, view_render, screen_manager, recipe
summary: A screen is an FSM handler scr_xxx_handle(msg) reacting to SCREEN_ENTRY/EXIT and app signals, navigating with SCREEN_TRAN/SCREEN_BACK and drawing via view_render.
apis: timer_set, timer_remove_attr
---

# Recipe: Create a new screen

The OLED UI is managed by the screen manager (`application/sources/common/screen_manager.h`). `task_display` forwards every message to the current screen via `scr_mng_dispatch(msg)`. A **screen is an FSM handler** that draws through `view_render`. Reference: `application/sources/app/screens/` (`scr_idle.cpp`, `scr_welcome.cpp`).

## 1. Declare the screen — `app/screens/scr_clock.h` + register in `screens.h`

```c
extern view_screen_t scr_clock;
extern void scr_clock_handle(ak_msg_t* msg);
```

## 2. Implement the handler — `app/screens/scr_clock.cpp`

```c
#include "scr_clock.h"

static void view_scr_clock() {
    view_render.setCursor(0, 0);
    view_render.print("12:00");           // drawn by task_display each render
}

view_dynamic_t dyn_view_clock = { { .item_type = ITEM_TYPE_DYNAMIC }, view_scr_clock };
view_screen_t  scr_clock      = { &dyn_view_clock, ITEM_NULL, ITEM_NULL, .focus_item = 0 };

void scr_clock_handle(ak_msg_t* msg) {
    switch (msg->sig) {
    case SCREEN_ENTRY:
        APP_DBG_SIG("SCREEN_ENTRY\n");
        timer_set(AC_TASK_DISPLAY_ID, AC_DISPLAY_CLOCK_TICK,
                  1000, TIMER_PERIODIC);          // refresh via timer, never a loop
        break;
    case AC_DISPLAY_CLOCK_TICK:
        /* update model; view_scr_clock() renders it */
        break;
    case AC_DISPLAY_BUTON_MODE_PRESSED:
        timer_remove_attr(AC_TASK_DISPLAY_ID, AC_DISPLAY_CLOCK_TICK);
        SCREEN_BACK();                            // pop to previous screen
        break;
    case SCREEN_EXIT:
        timer_remove_attr(AC_TASK_DISPLAY_ID, AC_DISPLAY_CLOCK_TICK);
        break;
    default:
        break;
    }
}
```

## 3. Navigate

- Enter from another screen: `SCREEN_TRAN(scr_clock_handle, &scr_clock);`
- Return: `SCREEN_BACK();`
- The first screen is set in `app_task_init()` with `SCREEN_CTOR(&scr_mng_app, scr_startup_handle, &scr_startup);`

## 4. Wire signals & build

- Add `AC_DISPLAY_CLOCK_TICK` (and interval `#define`) to the display enum in `app/app.h`.
- Add `SOURCES_CPP += sources/app/screens/scr_clock.cpp` to `app/screens/Makefile.mk`.

## Rules

- **Refresh with a periodic timer**, not a loop — keep the handler short (≤ ~20 FPS).
- Always cancel your timers on `SCREEN_EXIT` / when leaving.
- Mind the 16 KB RAM budget if using STL containers in a screen.

## Verify the screen (do not skip)

After building/flashing, navigate to the new screen on the device, dump the framebuffer, and
check it with the **`decode_ak_lcd`** tool — the compiler can't see a mis-laid-out screen:

```sh
python ak-console.py --port <PORT> --cmd "lcd d"    # paste output into decode_ak_lcd
```

Compare the rendered 128×64 image against the intended layout (blank draw? text off-panel?
inverted? wrong cursor origin?). See [agent-workflow](ak://guide/agent-workflow).

See also: [state-machines](ak://concept/state-machines), [use-timer](ak://guide/use-timer), [debug-uart-shell](ak://guide/debug-uart-shell).
