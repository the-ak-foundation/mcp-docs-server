---
symbol: task_post_common_msg
summary: Post a message with a small inline payload (≤ 64 B) copied into a common-pool message.
fatal_codes: MF:0x21, MF:0x24, TK:0x02
see_also: task_post_pure_msg, task_post_dynamic_msg, get_data_common_msg, set_data_common_msg
tags: post, common, payload
---
## Semantics

Allocates a common message, copies `len` bytes of `data` into its inline buffer, sets the signal, and posts to `des_task_id`. Auto-freed after the handler returns. The receiver reads the payload with `get_data_common_msg(msg)` and `get_data_len_common_msg(msg)`.

## Parameters

- `task_id_t des_task_id` — destination task.
- `uint8_t sig` — the signal.
- `uint8_t* data` — pointer to the bytes to copy.
- `uint8_t len` — number of bytes, **must be ≤ `AK_COMMON_MSG_DATA_SIZE` (64)**.

## Example

```c
uint8_t frame[4] = { id, a, b, c };
task_post_common_msg(AC_TASK_IF_ID, AC_IF_COMMON_MSG_OUT, frame, sizeof(frame));
```

Receiver:

```c
uint8_t* p = get_data_common_msg(msg);
uint8_t  n = get_data_len_common_msg(msg);
```

`FATAL("MF", 0x24)` if `len > 64` (use [task_post_dynamic_msg](ak://api/task_post_dynamic_msg)); `FATAL("MF", 0x21)` if the common pool is exhausted.
