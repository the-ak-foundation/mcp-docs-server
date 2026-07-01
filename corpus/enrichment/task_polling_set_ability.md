---
symbol: task_polling_set_ability
summary: Enable or disable a polling task at runtime.
fatal_codes: TK:0x07
see_also: task_polling_create, task_run
tags: polling, runtime, enable
---
## Semantics

Sets a registered polling task's ability to `AK_ENABLE` or `AK_DISABLE`. Disabled polling tasks are skipped in `task_polling_run()`. Polling tasks run once per scheduler loop only when all message queues are empty, so use them for cheap background work (e.g. draining a UART RX buffer) and gate them when not needed.

`FATAL("TK", 0x07)` if `task_polling_id` is not in the polling table.

## Example

```c
/* stop console polling while doing a blocking-ish flash op elsewhere */
task_polling_set_ability(AC_TASK_POLLING_CONSOLE_ID, AK_DISABLE);
/* ... */
task_polling_set_ability(AC_TASK_POLLING_CONSOLE_ID, AK_ENABLE);
```
