---
symbol: task_post_dynamic_msg
summary: Post a message with a variable/large heap-allocated payload; avoid in ISRs.
fatal_codes: MF:0x41, TK:0x02, ak_malloc:0x01
see_also: task_post_common_msg, get_data_dynamic_msg, set_data_dynamic_msg
tags: post, dynamic, payload, heap
---
## Semantics

Allocates a dynamic message and a heap buffer of `len` bytes (via `ak_malloc`), copies `data` in, and posts to `des_task_id`. When the message is freed, its heap buffer is freed too. Read with `get_data_dynamic_msg(msg)` / `get_data_len_dynamic_msg(msg)`.

Use only when the payload is larger than 64 B or genuinely variable-length. Prefer common/pure messages otherwise, and **do not use this in an ISR** (it heap-allocates).

## Parameters

- `task_id_t des_task_id` — destination task.
- `uint8_t sig` — the signal.
- `uint8_t* data` — bytes to copy.
- `uint32_t len` — payload length.

`FATAL("MF", 0x41)` if the dynamic pool is exhausted; `FATAL("ak_malloc", 0x01)` on heap overflow (the part has only 16 KB RAM).
