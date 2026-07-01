---
symbol: task_post_pure_msg
summary: Post a signal-only message (no payload) to a task — the cheapest and most common way to trigger a task.
fatal_codes: MF:0x31, TK:0x02
see_also: task_post_common_msg, task_post_dynamic_msg, task_post, timer_set
tags: post, signal, pure
---
## Semantics

Allocates a pure message from the pure pool, sets its signal, and posts it to `des_task_id`. The kernel frees it automatically after the destination handler returns.

Use this for events that carry no data — the overwhelmingly common case.

## Parameters

- `task_id_t des_task_id` — destination task ID (from the `task_list.h` enum).
- `uint8_t sig` — the signal (≥ `AK_USER_DEFINE_SIG` for app signals).

## Example

```c
task_post_pure_msg(AC_TASK_DISPLAY_ID, AC_DISPLAY_BUTON_MODE_PRESSED);
```

`FATAL("MF", 0x31)` if the pure pool is exhausted; `FATAL("TK", 0x02)` if `des_task_id` is out of range (not registered / wrong ID).
