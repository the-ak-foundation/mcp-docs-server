---
symbol: tsm_dispatch
summary: Table-driven state dispatch — match msg->sig in the current state's row list, transition if next_state differs, then run the row handler.
fatal_codes:
see_also: tsm_init, tsm_tran, fsm_dispatch
tags: tsm, state-machine, dispatch, table
---
## Semantics

Looks up the current state's row array, scans for a row whose `sig` matches `msg->sig` (or the `TSM_NULL_MSG` default terminator). If the matched row's `next_state` differs from the current state and isn't `TSM_NULL_STATE`, it transitions (firing the optional `on_state` callback), then runs the row's handler function if non-NULL.

Bind the table and initial state first with `tsm_init` / `TSM(...)`.

## Example

```c
tsm_t st_idle[] = {
    {EV_START, ST_RUN, on_start},
    {TSM_NULL_MSG, TSM_NULL_STATE, TSM_NULL_ROUTINE}   // default / terminator
};
tsm_t* table[] = { st_idle, st_run };                  // indexed by state id

tsm_tbl_t me = { .on_state = my_on_state };
TSM(&me, table, ST_IDLE);
/* in task handler */ tsm_dispatch(&me, msg);
```
