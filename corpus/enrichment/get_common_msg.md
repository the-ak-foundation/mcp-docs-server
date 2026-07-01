---
symbol: get_common_msg
summary: Allocate a common-pool message (with a 64-byte inline buffer); returns a ready message with ref_count 1. Never NULL.
fatal_codes: MF:0x21
see_also: set_data_common_msg, get_data_common_msg, task_post, msg_free
tags: alloc, common
---
## Semantics

Returns a fresh `ak_msg_t*` from the common pool, with `ref_count == 1` and `src_task_id` set to the current task. **Never returns NULL** — pool exhaustion is `FATAL("MF", 0x21)`, so you do not null-check it.

Used by `task_post_common_msg` internally. Call it directly only when building a message by hand for `task_post`. After posting, the kernel owns and frees it.

## Example

```c
ak_msg_t* m = get_common_msg();
set_msg_sig(m, MY_SIG);
set_data_common_msg(m, data, len);
task_post(AC_TASK_X_ID, m);   // do not free; kernel frees after handling
```

Related allocators: `get_pure_msg()` (no payload), `get_dynamic_msg()` (heap payload).
