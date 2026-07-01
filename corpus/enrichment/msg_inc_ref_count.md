---
symbol: msg_inc_ref_count
summary: Keep a message alive past a single delivery (for fan-out); max reference count is 7.
fatal_codes: MF:0x61
see_also: msg_dec_ref_count, msg_free, task_post
tags: ref-count, fan-out, lifetime
---
## Semantics

Increments the message's reference count so it survives the automatic free that happens when a handler returns. Pair every increment with a matching `msg_dec_ref_count` (or `msg_free`) when each consumer is done.

Use this to deliver the same message to multiple tasks, or to retain a message beyond the current handler. **Maximum reference count is 7** — exceeding it is `FATAL("MF", 0x61)`.

## Example

```c
msg_inc_ref_count(msg);             // I'll forward this too
task_post(AC_TASK_A_ID, msg);
task_post(AC_TASK_B_ID, msg);       // both deliveries share one message
```

> Never read or write the `ref_count` byte directly — it also encodes the pool type. Use these helpers and the `get_msg_*` macros.
