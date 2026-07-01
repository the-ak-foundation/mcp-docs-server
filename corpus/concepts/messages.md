---
id: messages
title: Messages, Signals & Pools
section: concept
tags: message, signal, pool, pure, common, dynamic, ref-count, ak_msg_t
summary: Three fixed-size message pools (pure/common/dynamic) carry signals between tasks; messages are reference-counted and auto-freed after the handler returns.
apis: task_post_pure_msg, task_post_common_msg, task_post_dynamic_msg, get_common_msg, set_data_common_msg, msg_inc_ref_count, msg_free
---

# Messages, Signals & Pools

A **message** (`ak_msg_t`) is the envelope delivered to a task. It carries a **signal** (`msg->sig`) and optional payload. Handlers are a `switch (msg->sig)`.

## Signals

Each task owns a signal enum. **User signals start at `AK_USER_DEFINE_SIG` (10)**; values `0..9` (`AK_SYS_DEFINE_SIG`) are reserved for the kernel.

```c
enum {
    AC_BLINK_TICK = AK_USER_DEFINE_SIG,   // 10
    AC_BLINK_STOP,                        // 11
};
```

## The three pools

Allocation comes from fixed-size pools (deterministic, no fragmentation). Allocation **never returns NULL** — exhaustion is a `FATAL`, so size pools for the worst case.

| Helper | Backing | Payload | Use when |
| --- | --- | --- | --- |
| `task_post_pure_msg(id, sig)` | pure pool | none | just a signal (the common case) |
| `task_post_common_msg(id, sig, data, len)` | common pool | inline, `len ≤ AK_COMMON_MSG_DATA_SIZE` (64 B) | small fixed payload |
| `task_post_dynamic_msg(id, sig, data, len)` | dynamic pool | heap pointer + length | variable / large payload |

Pool sizes are compile-time, configured in `application/sources/ak/ak.cfg.mk`
(`AK_PURE_MSG_POOL_SIZE`, `AK_COMMON_MSG_POOL_SIZE`, `AK_DYNAMIC_MSG_POOL_SIZE`, `AK_COMMON_MSG_DATA_SIZE`).

## Building a message by hand

Use the low-level `get_*_msg()` + `task_post()` when you must set fields the helpers don't (e.g. the external "interface" header for off-device routing):

```c
ak_msg_t* m = get_common_msg();
set_msg_sig(m, AC_IF_COMMON_MSG_OUT);
set_if_des_task_id(m, remote_task);
set_if_sig(m, REMOTE_CMD);
set_data_common_msg(m, buf, len);
task_post(AC_TASK_IF_ID, m);     // hand off; do NOT free — the kernel frees it
```

## Lifetime & reference counting

Default rule: **don't free messages yourself, and don't touch a message after you post it.** The kernel frees it after the destination handler returns.

For fan-out (deliver to several tasks, or keep beyond the handler):

| Function | Effect |
| --- | --- |
| `msg_inc_ref_count(msg)` | keep alive past one delivery (max ref count **7**) |
| `msg_dec_ref_count(msg)` | release a reference |
| `msg_free(msg)` | decrement and free at zero (what the scheduler calls) |

> `ref_count` packs the pool type in its top 2 bits — always use the helpers / `get_msg_*` macros, never read the byte directly.

See also: [scheduler](ak://concept/scheduler), [guide: tune-pools](ak://guide/tune-pools).
