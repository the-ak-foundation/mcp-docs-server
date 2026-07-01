---
symbol: timer_set
summary: Arm or re-arm a software timer that posts a signal to a task after a duty (ms); one-shot or periodic.
fatal_codes: MT:0x30
see_also: timer_remove_attr, timer_tick, task_post_pure_msg
tags: timer, periodic, one-shot
---
## Semantics

Schedules `sig` to be posted to `des_task_id` after `duty` ticks (milliseconds in this firmware).

- `type`: `TIMER_ONE_SHOT` (fires once, then removed) or `TIMER_PERIODIC` (reloads `duty` and keeps firing).
- **Key = `(des_task_id, sig)`.** If a timer with the same task+signal already exists, `timer_set` **re-arms it** (resets the counter) instead of allocating a second timer. There can only be one live timer per `(task, sig)`.
- Returns `TIMER_RET_OK` (1).

## Parameters

- `task_id_t des_task_id` — destination task that will receive the signal.
- `timer_sig_t sig` — the signal to post on expiry.
- `uint32_t duty` — delay in ticks (ms).
- `timer_type_t type` — `TIMER_ONE_SHOT` or `TIMER_PERIODIC`.

## Example

```c
/* periodic 1 s heartbeat */
timer_set(AC_TASK_LIFE_ID, AC_LIFE_TICK, 1000, TIMER_PERIODIC);

/* one-shot 2 s reply timeout */
timer_set(AC_TASK_X_ID, AC_REQ_TIMEOUT, 2000, TIMER_ONE_SHOT);
```

Exhausting the timer pool (`AK_TIMER_POOL_SIZE`) triggers `FATAL("MT", 0x30)`.
