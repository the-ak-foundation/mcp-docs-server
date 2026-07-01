---
id: state-machines
title: State Machines — FSM & TSM
section: concept
tags: fsm, tsm, state-machine, state, transition, dispatch, screen
summary: AK ships two state-machine styles — FSM (state is a function pointer) and TSM (table-driven states/transitions); both dispatch a message to the current state.
apis: fsm_dispatch, tsm_init, tsm_tran, tsm_dispatch
---

# State Machines — FSM & TSM

Both styles are dispatched from inside a task handler.

## FSM — state is a function pointer

Good for free-form logic and screens.

```c
typedef struct { fsm_t fsm; /* ...your data... */ } my_fsm_t;
static my_fsm_t me;

FSM(&me, state_idle);            // set initial state
fsm_dispatch((fsm_t*)&me, msg);  // route msg to the current state function

void state_idle(ak_msg_t* msg) {
    switch (msg->sig) {
    case EV_GO: FSM_TRAN(&me, state_running); break;   // transition
    }
}
```

| Macro / fn | Effect |
| --- | --- |
| `FSM(me, init_fn)` | set the initial state |
| `FSM_TRAN(me, target_fn)` | transition to another state |
| `fsm_dispatch(me, msg)` | invoke the current state with `msg` |

## TSM — table-driven

Good when transitions are regular and you want them declared as data. Each state is a null-terminated array of `{sig, next_state, handler}` rows; an optional `on_state` callback fires on every transition.

```c
tsm_t state_idle_rows[] = {
    {EV_START, ST_RUN, on_start},                    // EV_START -> ST_RUN, run on_start()
    {TSM_NULL_MSG, TSM_NULL_STATE, TSM_NULL_ROUTINE} // terminator / default
};
tsm_t* table[] = { state_idle_rows, state_run_rows };  // indexed by state id

tsm_tbl_t me = { .on_state = my_on_state };
TSM(&me, table, ST_IDLE);   // bind table + set start state
tsm_dispatch(&me, msg);     // match (state,sig) -> transition + run handler
```

| Function | Effect |
| --- | --- |
| `tsm_init(tbl, table, state)` / `TSM(...)` | bind the table and set the initial state |
| `tsm_tran(tbl, state)` / `TSM_TRAN(...)` | force a transition (fires `on_state`) |
| `tsm_dispatch(tbl, msg)` | match `msg->sig` in the current state's rows, transition if `next_state` differs, then run the handler |

## Screens are FSMs

The screen manager (`common/screen_manager.h`) is an FSM specialization: each screen is a state handler receiving `SCREEN_ENTRY`/`SCREEN_EXIT` plus app signals, with `SCREEN_TRAN`/`SCREEN_BACK` navigation. See [guide: create-screen](ak://guide/create-screen).
