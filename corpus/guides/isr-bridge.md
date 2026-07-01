---
id: isr-bridge
title: "Recipe: Bridge an interrupt to a task"
section: guide
tags: isr, interrupt, irq, bridge, task_entry_interrupt, critical-section, recipe
summary: An ISR brackets its body with task_entry_interrupt()/task_exit_interrupt(), does minimal work, and posts a message to a task instead of processing in interrupt context.
apis: task_entry_interrupt, task_exit_interrupt, task_post_pure_msg, task_post_common_msg
---

# Recipe: Bridge an interrupt to a task

ISRs are **not** tasks. An ISR's job is to capture the event, **post a message**, and return — the real work happens in a task handler at the right priority.

## The pattern

```c
void EXTIx_IRQHandler(void) {
    task_entry_interrupt();                         // MUST be first

    /* minimal capture only */
    uint8_t v = read_event_register();
    task_post_common_msg(AC_TASK_SENSOR_ID, AC_SENSOR_EVENT, &v, 1);

    task_exit_interrupt();                          // MUST be last
}
```

## Rules

- **Bracket the body** with `task_entry_interrupt()` / `task_exit_interrupt()`. They maintain the kernel's notion of "current task" so allocations and posts behave correctly in interrupt context.
- **Do the minimum.** Read a register, post a message, return. No loops, no flash writes, no waiting.
- **Prefer pure/common messages.** Avoid `task_post_dynamic_msg` in an ISR (it heap-allocates).
- **Share ISR↔task data only inside `ENTRY_CRITICAL()` / `EXIT_CRITICAL()`.** That is the only safe way to touch a variable both an ISR and a task read/write.

## Periodic hardware tick

The same idea drives time: `timer_tick(elapsed_ms)` is called from the periodic tick ISR and simply posts one `TIMER_TICK` message to the timer task. Driver polling (buttons, LEDs) is invoked from `sys_irq_timer_10ms()` — a 10 ms timer hook — which calls each driver's `*_polling()`.

> You normally do not edit ISRs in `application/sources/ak/` or `sys/`. For a new peripheral, add your IRQ handler in the app/driver layer and follow this bracketing pattern.

See also: [scheduler](ak://concept/scheduler), [create-driver](ak://guide/create-driver).
