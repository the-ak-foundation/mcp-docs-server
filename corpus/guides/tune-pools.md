---
id: tune-pools
title: "Recipe: Size and tune the pools"
section: guide
tags: pool, tuning, ak.cfg.mk, ram, high-water-mark, fatal, recipe
summary: Read the *_used_max() high-water-mark counters under a real workload, then size the message and timer pools in ak.cfg.mk with headroom.
apis: get_pure_msg_pool_used_max, get_common_msg_pool_used_max, get_dynamic_msg_pool_used_max, get_timer_msg_pool_used_max
---

# Recipe: Size and tune the pools

Pools are fixed at compile time. Too small → `FATAL` at runtime; too large → wasted RAM on a 16 KB part. Size them from measured peak usage, not guesswork.

## 1. Measure the high-water marks

Each pool exposes a live counter and a peak (`_max`) counter. Run a representative workload (worst case: bursts, retries, all features active), then read:

```c
APP_PRINT("pure max:    %lu\n", get_pure_msg_pool_used_max());
APP_PRINT("common max:  %lu\n", get_common_msg_pool_used_max());
APP_PRINT("dynamic max: %lu\n", get_dynamic_msg_pool_used_max());
APP_PRINT("timer max:   %lu\n", get_timer_msg_pool_used_max());
```

## 2. Set sizes with headroom — `application/sources/ak/ak.cfg.mk`

```make
PURE_MSG_POOL_SIZE    = -DAK_PURE_MSG_POOL_SIZE=32
COMMON_MSG_POOL_SIZE  = -DAK_COMMON_MSG_POOL_SIZE=8
COMMON_MSG_DATA_SIZE  = -DAK_COMMON_MSG_DATA_SIZE=64
DYNAMIC_MSG_POOL_SIZE = -DAK_DYNAMIC_MSG_POOL_SIZE=8
TIMER_POOL_SIZE       = -DAK_TIMER_POOL_SIZE=16
```

Rule of thumb: `size = observed_max + margin` (e.g. +50%). `ak.cfg.mk` is configuration, not kernel logic — editing it is expected and safe.

## 3. Know the failure codes

| Symptom (`FATAL` tag·code) | Pool | Fix |
| --- | --- | --- |
| `MF`·0x31 | pure | raise `AK_PURE_MSG_POOL_SIZE` |
| `MF`·0x21 | common | raise `AK_COMMON_MSG_POOL_SIZE` |
| `MF`·0x41 | dynamic | raise `AK_DYNAMIC_MSG_POOL_SIZE` |
| `MF`·0x24 | common payload > 64 B | raise `AK_COMMON_MSG_DATA_SIZE` or use a dynamic message |
| `MT`·0x30 | timer | raise `AK_TIMER_POOL_SIZE`; check for timers you never cancel |

A pool that climbs and never drains usually means a missing `timer_remove_attr` or a message kept with `msg_inc_ref_count` but never released.

See also: [messages](ak://concept/messages), [guardrails](ak://guardrail/constraints).
