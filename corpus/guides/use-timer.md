---
id: use-timer
title: "Recipe: Use a software timer"
section: guide
tags: timer, timeout, periodic, one-shot, re-arm, cancel, recipe
summary: Use timer_set for periodic/one-shot signals, rely on (task_id,sig) re-arm semantics, and always cancel with timer_remove_attr to avoid late firing.
apis: timer_set, timer_remove_attr
---

# Recipe: Use a software timer

Timers replace blocking delays. They post a **signal** to a **task** after a duty in milliseconds.

## Periodic work

```c
/* fire AC_SENSOR_SAMPLE every 250 ms */
timer_set(AC_TASK_SENSOR_ID, AC_SENSOR_SAMPLE, 250, TIMER_PERIODIC);
```

A periodic timer keeps firing until you cancel it — the handler does **not** need to re-arm.

## One-shot timeout (the classic request/timeout pattern)

```c
case AC_REQ_SEND:
    send_request();
    timer_set(AC_TASK_X_ID, AC_REQ_TIMEOUT, 2000, TIMER_ONE_SHOT);  // arm timeout
    break;

case AC_REQ_REPLY:                       // reply arrived in time
    timer_remove_attr(AC_TASK_X_ID, AC_REQ_TIMEOUT);                // cancel timeout
    handle_reply(msg);
    break;

case AC_REQ_TIMEOUT:                      // no reply
    APP_DBG("request timed out\n");
    break;
```

## Two rules that prevent 90% of timer bugs

1. **`(task_id, sig)` is the key.** Re-calling `timer_set` with the same task + signal **re-arms** (resets the counter); it does not stack. Use this to implement an "inactivity" timer: every event re-arms it.
2. **Cancel with `timer_remove_attr`, not by ignoring the signal.** It removes the timer *and* purges an already-queued expiry message, so a timeout cannot fire after you've moved on.

## Don't

- Don't `timer_set` the same `(task, sig)` for two different logical purposes — they collide.
- Don't assume sub-millisecond precision; resolution is the hardware tick.
- Don't leak timers — cancel periodic timers when a task/screen leaves its active state. Pool size is `AK_TIMER_POOL_SIZE`; exhaustion is `FATAL("MT", 0x30)`.

See also: [timers](ak://concept/timers).
