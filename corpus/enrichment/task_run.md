---
symbol: task_run
summary: Enter the kernel's infinite scheduler loop; dispatches ready messages then polling tasks. Never returns.
fatal_codes:
see_also: task_init, task_create, task_polling_create, task_post
tags: scheduler, main-loop
---
## Semantics

The last call in `main_app()`. Loops forever:

```c
for (;;) {
    task_scheduler();    // run the highest-priority ready handler to completion
    task_polling_run();  // run enabled polling tasks when queues are empty
}
```

Call it only after `task_init()`, `task_create()`, and `task_polling_create()`, and after hardware init and seed timers/messages. Returns `int` only for signature symmetry — control never comes back.
