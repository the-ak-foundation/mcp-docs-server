---
id: scheduler
title: The AK Scheduler & Task Model
section: concept
tags: scheduler, task, priority, run-to-completion, ready-queue, active-object
summary: task_run() loops the scheduler then polling tasks; it dispatches the highest-priority ready message to a run-to-completion handler across 8 priority levels.
apis: task_run, task_init, task_create, task_polling_create, task_post, task_self
---

# The AK Scheduler & Task Model

## The loop

`task_run()` is the kernel's main loop and never returns:

```c
for (;;) {
    task_scheduler();    // drain ready message queues, highest priority first
    task_polling_run();  // run enabled polling tasks once the queues are empty
}
```

## How a message reaches a handler

1. A producer (task or ISR) calls `task_post_*` with a **destination task ID**. The message is appended to the queue for that task's **priority level**, and the level is marked ready.
2. `task_scheduler()` repeatedly picks the **highest-priority ready level**, pops one message, and calls that task's handler with it.
3. When the handler returns, the kernel **automatically frees the message** (reference count decremented; freed at zero).
4. A handler may post more messages; a higher-priority post made mid-handler is serviced before lower-priority work, but only after the current handler finishes (**run-to-completion**).

## Priorities

- Eight levels: `TASK_PRI_LEVEL_0` … `TASK_PRI_LEVEL_7`. **Higher number = higher priority.**
- Each level has its own FIFO queue; within a level, messages run in arrival order.
- **Level 0 is reserved** (used only by the end-of-table sentinel). Real tasks use `LEVEL_1`–`LEVEL_7`.
- The system timer task (`TASK_TIMER_TICK_ID`) is conventionally placed at the top (`LEVEL_7`).

## Registration

Tasks are declared in a table terminated by `AK_TASK_EOT_ID`:

```c
const task_t app_task_table[] = {
    {TASK_TIMER_TICK_ID, TASK_PRI_LEVEL_7, task_timer_tick},
    {AC_TASK_LIFE_ID,    TASK_PRI_LEVEL_6, task_life},
    /* ... */
    {AK_TASK_EOT_ID,     TASK_PRI_LEVEL_0, (pf_task)0}   // sentinel
};
```

Bring-up order in `main_app()`:

```c
ENTRY_CRITICAL();
task_init();                                       // pools + timer module
task_create((task_t*)app_task_table);
task_polling_create((task_polling_t*)app_task_polling_table);
EXIT_CRITICAL();
/* ... init hardware, arm timers, post seed messages ... */
return task_run();                                 // never returns
```

## Polling tasks

For non-event work (e.g. draining a UART FIFO), register a polling task in `app_task_polling_table[]`. It runs once per scheduler loop **only when all message queues are empty**, so it must be cheap. Toggle at runtime with `task_polling_set_ability(id, AK_ENABLE|AK_DISABLE)`.

See also: [messages](ak://concept/messages), [guide: create-task](ak://guide/create-task).
