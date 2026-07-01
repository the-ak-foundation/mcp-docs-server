---
symbol: set_data_common_msg
summary: Copy up to 64 bytes of payload into a common message's inline buffer.
fatal_codes: MF:0x23, MF:0x24
see_also: get_common_msg, get_data_common_msg, get_data_len_common_msg
tags: payload, common
---
## Semantics

Copies `size` bytes from `data` into the message's inline buffer and records the length. The message must be a common-pool message and `size` must be `≤ AK_COMMON_MSG_DATA_SIZE` (64). Returns `AK_MSG_OK`.

`FATAL("MF", 0x23)` if `msg` is not a common message; `FATAL("MF", 0x24)` if `size > 64`.

## Example

```c
ak_msg_t* m = get_common_msg();
set_msg_sig(m, MY_SIG);
set_data_common_msg(m, buf, len);   // len <= 64
task_post(AC_TASK_X_ID, m);
```
