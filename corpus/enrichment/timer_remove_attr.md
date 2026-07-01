---
symbol: timer_remove_attr
summary: Cancel a timer by (task, sig) AND purge any already-posted expiry message from the task's queue — the safe way to stop a timer.
fatal_codes:
see_also: timer_set, task_remove_msg
tags: timer, cancel
---
## Semantics

Removes the timer keyed by `(des_task_id, sig)` **and** calls `task_remove_msg` to drop any expiry message of that signal already sitting in the task's queue. This guarantees the timeout cannot fire after you've handled the thing it was guarding.

Returns `TIMER_RET_OK` if a timer was found and removed, `TIMER_RET_NG` otherwise.

## Example

```c
case AC_REQ_REPLY:                 // reply arrived in time
    timer_remove_attr(AC_TASK_X_ID, AC_REQ_TIMEOUT);
    handle_reply(msg);
    break;
```

Always cancel periodic timers when a task or screen leaves its active state, or the pool leaks toward `FATAL("MT", 0x30)`.
