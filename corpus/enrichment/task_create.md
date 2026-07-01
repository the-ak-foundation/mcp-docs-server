---
symbol: task_create
summary: Register the application's task table; must be terminated by an AK_TASK_EOT_ID sentinel row.
fatal_codes: TK:0x01
see_also: task_init, task_polling_create, task_run
tags: registration, task-table
---
## Semantics

Records the task table the scheduler dispatches from. The table is an array of `task_t { id, pri, task_fn }`, ordered by increasing ID, terminated by a sentinel row with `id == AK_TASK_EOT_ID`.

Call inside a critical section during bring-up, after `task_init()`.

## Example

```c
const task_t app_task_table[] = {
    {TASK_TIMER_TICK_ID, TASK_PRI_LEVEL_7, task_timer_tick},
    {AC_TASK_LIFE_ID,    TASK_PRI_LEVEL_6, task_life},
    {AK_TASK_EOT_ID,     TASK_PRI_LEVEL_0, (pf_task)0}   // sentinel
};

ENTRY_CRITICAL();
task_init();
task_create((task_t*)app_task_table);
EXIT_CRITICAL();
```

`FATAL("TK", 0x01)` if passed a NULL table.
