---
id: timers
title: Software Timers
section: concept
tags: timer, timeout, periodic, one-shot, timer_set, timer_tick
summary: Software timers post a signal to a task after a duty; one-shot or periodic, keyed by (task_id, sig), fed by timer_tick() from the hardware tick ISR.
apis: timer_set, timer_remove_attr, timer_tick, task_timer_tick
---

# Software Timers

Timers are how AK expresses "later" — there is no `sleep`. A timer posts a **signal** to a **task** after a **duty** (in ticks; this firmware feeds milliseconds).

## Arming

```c
/* periodic 1 s heartbeat */
timer_set(AC_TASK_LIFE_ID, AC_LIFE_TICK, 1000, TIMER_PERIODIC);

/* one-shot 5 s timeout */
timer_set(AC_TASK_FW_ID, FW_PACKET_TIMEOUT, 5000, TIMER_ONE_SHOT);
```

- `type` is `TIMER_ONE_SHOT` or `TIMER_PERIODIC`.
- **`(des_task_id, sig)` is the unique key.** Calling `timer_set` again with the same task+signal **re-arms** (resets the counter) instead of creating a duplicate. You cannot have two live timers posting the same signal to the same task.

## Cancelling

```c
timer_remove_attr(AC_TASK_FW_ID, FW_PACKET_TIMEOUT);
```

`timer_remove_attr` cancels the timer **and** purges any already-posted message with that signal from the task's queue — the safe way to stop a timer, with no late firing.

## How it works

- `timer_tick(t)` runs in the **hardware tick ISR** (e.g. SysTick). It only accumulates elapsed ticks and posts a single `TIMER_TICK` message to the timer task — it self-throttles so at most one tick message is in flight.
- `task_timer_tick` (the highest-priority system task) walks the active-timer list, decrements counters, and posts due signals. Periodic timers reload; one-shot timers are removed on fire.

The timer pool size is `AK_TIMER_POOL_SIZE` in `ak.cfg.mk`; exhaustion is `FATAL("MT", 0x30)`.

See also: [guide: use-timer](ak://guide/use-timer), [scheduler](ak://concept/scheduler).
