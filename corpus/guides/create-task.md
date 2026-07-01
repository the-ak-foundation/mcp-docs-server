---
id: create-task
title: "Recipe: Create a new task"
section: guide
tags: task, create, recipe, task_list, app_task_table, signal, makefile
summary: Five steps to add an AK task — register an ID, add a table row with a priority, declare signals, implement the switch handler, and add the source to Makefile.mk.
apis: task_post_pure_msg, timer_set
---

# Recipe: Create a new task

A task is `void task_xxx(ak_msg_t* msg)` — a `switch (msg->sig)` handler. Work only in `application/sources/app/`; do not touch the kernel ([guardrails](ak://guardrail/do-not-modify)).

## 1. Register an ID — `app/task_list.h`

Add to the task enum **in increasing order, before `AK_TASK_EOT_ID`**, and declare the entry point.

```c
enum {
    /* ... existing IDs ... */
    AC_TASK_BLINK_ID,
    AK_TASK_EOT_ID,           // keep last
};
extern void task_blink(ak_msg_t*);
```

## 2. Add a table row — `app/task_list.cpp`

```c
const task_t app_task_table[] = {
    /* ... */
    {AC_TASK_BLINK_ID, TASK_PRI_LEVEL_3, task_blink},
    {AK_TASK_EOT_ID,   TASK_PRI_LEVEL_0, (pf_task)0}   // sentinel
};
```

Pick a priority `LEVEL_1`–`LEVEL_7` (higher = more urgent). UI/heartbeat tasks sit low; time-critical interface tasks sit higher. **Never use `LEVEL_0`** (reserved).

## 3. Declare signals & intervals — `app/app.h`

```c
#define AC_BLINK_INTERVAL_MS  (500)
enum {
    AC_BLINK_TICK = AK_USER_DEFINE_SIG,   // user signals start at 10
    AC_BLINK_STOP,
};
```

## 4. Implement the handler — `app/task_blink.cpp` (+ `app/task_blink.h`)

```c
#include "ak.h"
#include "message.h"
#include "timer.h"
#include "app.h"
#include "app_dbg.h"
#include "task_list.h"
#include "task_blink.h"
#include "led.h"

void task_blink(ak_msg_t* msg) {
    switch (msg->sig) {
    case AC_BLINK_TICK:
        APP_DBG_SIG("AC_BLINK_TICK\n");
        led_toggle(&led_user);
        break;                          // a PERIODIC timer re-fires automatically
    case AC_BLINK_STOP:
        timer_remove_attr(AC_TASK_BLINK_ID, AC_BLINK_TICK);
        break;
    default:
        break;
    }
}
```

## 5. Compile it & kick it off

Add the source to `app/Makefile.mk`:

```make
SOURCES_CPP += sources/app/task_blink.cpp
```

Then seed the first message/timer (e.g. in `app_start_timer()` in `app/app.cpp`):

```c
timer_set(AC_TASK_BLINK_ID, AC_BLINK_TICK, AC_BLINK_INTERVAL_MS, TIMER_PERIODIC);
```

## Checklist

- [ ] ID added before `AK_TASK_EOT_ID`, increasing order
- [ ] Row in `app_task_table[]` with a `LEVEL_1..7` priority
- [ ] Signals start at `AK_USER_DEFINE_SIG`
- [ ] Handler is non-blocking (no `delay`, no spin loops)
- [ ] Source added to `app/Makefile.mk`
- [ ] Task triggered (timer, seed message, or another task)
