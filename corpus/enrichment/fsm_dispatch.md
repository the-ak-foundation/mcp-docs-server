---
symbol: fsm_dispatch
summary: Invoke the current state function of an FSM with a message; combine with the FSM() and FSM_TRAN() macros.
fatal_codes:
see_also: tsm_dispatch, task_post_pure_msg
tags: fsm, state-machine, dispatch
---
## Semantics

Calls the FSM's current state handler with `msg`. A "state" is just a function pointer (`state_handler`). Set the initial state with `FSM(me, init_fn)` and switch states from inside a handler with `FSM_TRAN(me, target_fn)`.

The `fsm_t` must be the first member of your state object (or cast to `fsm_t*`).

## Example

```c
typedef struct { fsm_t fsm; int retries; } my_fsm_t;
static my_fsm_t me;

void state_idle(ak_msg_t* msg) {
    switch (msg->sig) {
    case EV_GO: FSM_TRAN(&me, state_run); break;
    }
}

/* setup */            FSM(&me, state_idle);
/* in task handler */  fsm_dispatch((fsm_t*)&me, msg);
```

For a declarative, table-driven alternative see [tsm_dispatch](ak://api/tsm_dispatch).
