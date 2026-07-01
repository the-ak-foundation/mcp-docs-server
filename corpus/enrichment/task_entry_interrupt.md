---
symbol: task_entry_interrupt
summary: Call first in any ISR that touches the kernel; pairs with task_exit_interrupt to bracket the handler.
fatal_codes:
see_also: task_exit_interrupt, task_post_pure_msg, task_post_common_msg
tags: isr, interrupt, bracket
---
## Semantics

Marks entry into interrupt context so kernel operations (allocations, posts) behave correctly while the current task is suspended. Must be the **first** call in the ISR body; `task_exit_interrupt()` must be the **last**.

Between them, do the minimum: capture the event and `task_post_*` to a task. No loops, no blocking, no flash writes.

## Example

```c
void EXTIx_IRQHandler(void) {
    task_entry_interrupt();
    uint8_t v = read_event_register();
    task_post_common_msg(AC_TASK_SENSOR_ID, AC_SENSOR_EVENT, &v, 1);
    task_exit_interrupt();
}
```

See [guide: isr-bridge](ak://guide/isr-bridge) for the full pattern.
