---
id: agent-workflow
title: "Recipe: The develop → verify → commit workflow"
section: guide
tags: workflow, process, release, debug, commit, git, lcd, fatal, verify, best-practice, checklist
summary: Develop and debug with -URELEASE, commit after every finished feature (if a git repo exists), verify any new screen with decode_ak_lcd, and check fatal after the final build — fixing anything that surfaces.
---

# Recipe: The develop → verify → commit workflow

Four rules that keep AK development safe and reviewable. Follow them by default; they are also
baked into the project steering file (ak-docs `examples/copilot-instructions.md`).

## 1. Develop and debug with `-URELEASE` (non-release build)

Keep `RELEASE_OPTION = -URELEASE` in `application/Makefile` (its default) while building and
debugging. **Do not switch to `-DRELEASE` until you are shipping.**

Why it matters for debugging:

- **RELEASE auto-resets on FATAL** (`sys_dbg.c`: `#if defined(RELEASE) sys_ctrl_reset();`) — the
  board just reboots, so you lose the interactive **fatal mode** (the single-key `f`/`m`/`e`/`R`
  post-mortem and the fast-blinking life LED). A crash becomes a silent reboot you can't inspect.
- Non-release keeps full log levels enabled so `[DBG]` / `-SIG->` traces actually print.

`application/Makefile` feature flags are on the safe-to-edit list — flipping `RELEASE_OPTION`
is configuration, not a kernel change. Build a `-DRELEASE` image only for the final production
artifact.

## 2. Commit after every finished feature (if the repo is under git)

If the project is a git repository (`git rev-parse --is-inside-work-tree` succeeds), **commit
each feature as soon as it builds and is verified** — don't batch several features into one
commit.

```sh
git add -A
git commit -m "Add <feature>: <one-line what/why>"
```

Rationale: one feature per commit keeps history bisectable, makes review easy, and gives you a
safe rollback point before the next change. If the folder is **not** a git repo (e.g. a fresh
`start_ak_project` extract), offer to `git init` first; don't create commits the engineer
didn't ask for in a non-repo.

## 3. Verify every new screen with `decode_ak_lcd`

After implementing or changing any screen ([create-screen](ak://guide/create-screen)), don't
trust the code alone — **look at the actual framebuffer**:

```sh
# flash, navigate to the screen on the device, then:
python ak-console.py --port <PORT> --cmd "lcd d"
```

Paste that dump into the **`decode_ak_lcd`** tool and compare the rendered text-art/PNG against
what the screen is *supposed* to show. This catches off-by-one layout, wrong cursor origin,
inverted pixels, empty/blank draws, and text that runs off the 128×64 panel — none of which the
compiler can see.

## 4. Check `fatal` after the final build, and fix what you find

When the feature set is complete, do a crash sweep before calling it done:

1. Build/flash the final `-URELEASE` image and **exercise every path** you touched (navigate all
   screens, trigger every new signal, run for a while).
2. Read the crash history — safe, read-only:
   ```sh
   python ak-console.py --port <PORT> --cmd "fatal l" --cmd "fatal m"
   ```
3. If `fatal_times` increased, or `fatal l` shows a tag/code: paste the output into
   **`analyze_ak_log`**, follow its diagnosis, **fix the root cause**, and repeat from step 1.
4. Only ship once a full exercise leaves `fatal_times` unchanged.

`restart_times` climbing while `fatal_times` stays flat means the **watchdog** fired (a handler
blocked) — same fix loop via `fatal m` timing (see [debug-uart-shell](ak://guide/debug-uart-shell)).

## Quick checklist

- [ ] Building with `-URELEASE` (not `-DRELEASE`) during development
- [ ] Committed the previous feature before starting the next (if git repo)
- [ ] Ran `decode_ak_lcd` on every new/changed screen
- [ ] Swept `fatal l` / `fatal m` after the final build; `fatal_times` did not rise
- [ ] Edited only `application/sources/app/` and `driver/` ([guardrails](ak://guardrail/do-not-modify))

See also: [create-screen](ak://guide/create-screen), [debug-uart-shell](ak://guide/debug-uart-shell), [kernel-task-log](ak://guide/kernel-task-log).
