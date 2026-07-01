---
symbol: task_post
summary: Low-level primitive to enqueue a message you built by hand to a task; the kernel owns and frees it afterwards.
fatal_codes: TK:0x02
see_also: task_post_pure_msg, get_common_msg, get_pure_msg, set_msg_sig
tags: post, low-level
---
## Semantics

Appends an already-allocated `ak_msg_t*` to `des_task_id`'s priority queue and marks the level ready. Use it when the `task_post_*` helpers don't expose a field you need — typically the external "interface" header (`set_if_*`) for routing a message off-device.

After posting, **the message belongs to the kernel**: do not read, modify, or free it. It is freed automatically once the destination handler returns.

## Example

```c
ak_msg_t* m = get_common_msg();
set_msg_sig(m, AC_IF_COMMON_MSG_OUT);
set_if_des_task_id(m, remote_task);
set_if_sig(m, REMOTE_CMD);
set_data_common_msg(m, buf, len);
task_post(AC_TASK_IF_ID, m);
```

`FATAL("TK", 0x02)` if `des_task_id` is out of range.
