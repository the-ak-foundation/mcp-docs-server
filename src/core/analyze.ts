/**
 * analyze.ts — deterministic analyzer for AK UART console captures.
 *
 * Given raw text captured from the 115200 console (boot logs, -SIG-> traces,
 * FATAL output, `fatal l` / `fatal m` dumps, kernel timing lines), produce a
 * structured markdown diagnosis: what happened, why, and which shell commands
 * to run next.
 *
 * IMPORTANT: this module must have ZERO runtime imports (type-only imports are
 * erased) so the test suite can load it directly via Node's type stripping
 * without building or installing anything.
 */
import type { Corpus } from "./types.js";

/** What we know about each FATAL tag:code the kernel can raise. */
interface FatalKnowledge {
  cause: string;
  fix: string;
}

const FATAL_TABLE: Record<string, FatalKnowledge> = {
  "MF:0x20": {
    cause: "msg_free() saw a message whose pool-type bits are corrupted",
    fix: "memory corruption — check for buffer overruns writing past a payload, or use of a message after it was freed",
  },
  "MF:0x21": {
    cause: "COMMON message pool exhausted (get_common_msg)",
    fix: "raise AK_COMMON_MSG_POOL_SIZE in ak.cfg.mk, or find the task holding messages (see `fatal m`)",
  },
  "MF:0x23": {
    cause: "set_data_common_msg() called on a non-common message",
    fix: "allocate with get_common_msg() (not pure/dynamic) before setting common payload",
  },
  "MF:0x24": {
    cause: "common payload larger than AK_COMMON_MSG_DATA_SIZE (64 B)",
    fix: "use task_post_dynamic_msg for payloads > 64 B, or raise AK_COMMON_MSG_DATA_SIZE",
  },
  "MF:0x26": {
    cause: "get_data_common_msg() called on a non-common message",
    fix: "check msg type before reading payload — handler probably receives mixed message kinds",
  },
  "MF:0x27": {
    cause: "msg_force_free() saw a corrupted message type",
    fix: "memory corruption — same investigation as MF:0x20",
  },
  "MF:0x28": {
    cause: "reference count decremented below zero (double free)",
    fix: "unbalanced msg_inc_ref_count/msg_dec_ref_count — remove a manual msg_free after task_post",
  },
  "MF:0x31": {
    cause: "PURE message pool exhausted (get_pure_msg)",
    fix: "raise AK_PURE_MSG_POOL_SIZE in ak.cfg.mk, or find the flood source — a timer or ISR posting faster than a handler drains",
  },
  "MF:0x38": {
    cause: "get_data_len_common_msg() called on a non-common message",
    fix: "check msg type before reading payload length",
  },
  "MF:0x41": {
    cause: "DYNAMIC message pool exhausted (get_dynamic_msg)",
    fix: "raise AK_DYNAMIC_MSG_POOL_SIZE in ak.cfg.mk, or free/consume dynamic messages faster",
  },
  "MF:0x43": {
    cause: "set_data_dynamic_msg() called on a non-dynamic message",
    fix: "allocate with get_dynamic_msg() before setting dynamic payload",
  },
  "MF:0x46": {
    cause: "get_data_dynamic_msg() called on a non-dynamic message",
    fix: "check msg type before reading payload",
  },
  "MF:0x61": {
    cause: "reference count exceeded the maximum (7)",
    fix: "too many msg_inc_ref_count on one message — restructure the fan-out",
  },
  "MT:0x30": {
    cause: "TIMER pool exhausted (timer_set)",
    fix: "raise AK_TIMER_POOL_SIZE in ak.cfg.mk, or cancel timers with timer_remove_attr when tasks/screens leave their active state",
  },
  "TK:0x01": {
    cause: "task_create() received a NULL task table",
    fix: "pass app_task_table and keep the AK_TASK_EOT_ID sentinel row",
  },
  "TK:0x02": {
    cause: "task_post() to a task ID outside the registered table",
    fix: "the destination ID isn't in app_task_table — check task_list.h enum vs the table rows (feature flag mismatch is a classic cause)",
  },
  "TK:0x05": {
    cause: "task_remove_msg() with an out-of-range task ID",
    fix: "check the task ID passed to timer_remove_attr/task_remove_msg",
  },
  "TK:0x06": {
    cause: "task_polling_create() received a NULL table",
    fix: "pass app_task_polling_table with its AK_TASK_POLLING_EOT_ID sentinel",
  },
  "TK:0x07": {
    cause: "task_polling_set_ability() for an unknown polling task ID",
    fix: "use an ID from the polling enum in task_list.h",
  },
  "TSM:0x01": {
    cause: "tsm_init() received a NULL state table",
    fix: "bind a real tsm_t* table before dispatching",
  },
  "ak_malloc:0x01": {
    cause: "heap overflow — allocation would pass __heap_end__",
    fix: "dynamic payloads too large for the 16 KB part; shrink payloads or static buffers",
  },
  "ak_malloc:0x02": {
    cause: "malloc() returned NULL",
    fix: "heap exhausted/fragmented — reduce dynamic message sizes and STL usage",
  },
  "TEST:0x02": {
    cause: "test FATAL triggered by the shell command `fatal t`",
    fix: "expected if someone ran the test — send `r` to reset",
  },
};

/** Default task-ID map of the stock base kit (enum order in app/task_list.h). */
const BASE_KIT_TASK_IDS: Record<number, string> = {
  0: "TASK_TIMER_TICK_ID (kernel timer)",
  1: "AC_TASK_SYSTEM_ID",
  2: "AC_TASK_FW_ID",
  3: "AC_TASK_SHELL_ID",
  4: "AC_TASK_LIFE_ID",
  5: "AC_TASK_IF_ID",
  6: "AC_TASK_RF24_IF_ID",
  7: "AC_TASK_UART_IF_ID",
  8: "AC_TASK_DBG_ID",
  9: "AC_TASK_DISPLAY_ID",
};

const EXE_WARN_MS = 50;
const EXE_SEVERE_MS = 500;
const WAIT_WARN_MS = 200;
/** fatal-m dumps of an erased flash sector decode to garbage — filter it. */
const INSANE_MS = 100_000_000;
const INSANE_TASK_ID = 100;

interface TimingRec {
  task: number;
  sig: number;
  wait: number;
  exe: number;
}

function normTag(tag: string, code: number): string {
  return `${tag}:0x${code.toString(16).toUpperCase().padStart(2, "0")}`;
}

function describeTaskId(id: number): string {
  const name = BASE_KIT_TASK_IDS[id];
  return name
    ? `${id} (${name} in the stock base kit — verify against this project's app/task_list.h)`
    : `${id} (project-specific — look it up in app/task_list.h enum order)`;
}

function describeSig(sig: number): string {
  if (sig === 254) return `${sig} (SCREEN_ENTRY)`;
  if (sig === 255) return `${sig} (SCREEN_EXIT)`;
  return sig >= 10
    ? `${sig} (user signal — AK_USER_DEFINE_SIG+${sig - 10}; count from the task's enum in app/app.h)`
    : `${sig} (kernel-reserved signal 0..9)`;
}

/** Analyze a raw UART capture; returns a markdown report. */
export function analyzeLog(raw: string, corpus: Corpus): string {
  const findings: string[] = [];
  const interpretation: string[] = [];
  const steps: string[] = [];

  const lines = raw.split(/\r?\n/);

  // ---- 1. FATAL banner lines: xprintf("%s\t%x\n") -> "MT\t30" -------------
  const fatalHits: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_]{2,12})[\t ]+([0-9a-fA-F]{1,2})\s*$/);
    if (!m) continue;
    const key = normTag(m[1], parseInt(m[2], 16));
    // Only treat it as a FATAL if we know the tag family (avoids random "ok 1" lines).
    const family = key.split(":")[0];
    if (FATAL_TABLE[key] || ["MF", "MT", "TK", "TSM", "ak_malloc"].includes(family)) {
      if (!fatalHits.includes(key)) fatalHits.push(key);
    }
  }
  // ---- 2. `fatal l` / fatal-mode `f` block --------------------------------
  const gv = (re: RegExp): string | null => {
    const m = raw.match(re);
    return m ? m[1] : null;
  };
  const blockType = gv(/\[fatal\]\s*type:\s*([A-Za-z_]+)/);
  const blockCode = gv(/\[fatal\]\s*code:\s*0x([0-9a-fA-F]+)/);
  if (blockType && blockCode) {
    const key = normTag(blockType, parseInt(blockCode, 16));
    if (!fatalHits.includes(key)) fatalHits.push(key);
  }

  for (const key of fatalHits) {
    const known = FATAL_TABLE[key];
    findings.push(`**FATAL \`${key}\`** detected.`);
    if (known) {
      interpretation.push(`- \`${key}\`: ${known.cause}.\n  **Fix:** ${known.fix}.`);
    } else {
      interpretation.push(
        `- \`${key}\`: not a stock kernel code — search this project's sources for \`FATAL("${key.split(":")[0]}"\`.`
      );
    }
    // Cross-reference corpus API docs that list this fatal code.
    const related = corpus.documents.filter(
      (d) => d.section === "api" && (d as { fatal_codes?: string[] }).fatal_codes?.includes(key)
    );
    if (related.length) {
      interpretation.push(
        `  Raised by: ${related.map((d) => `\`${d.title}\` (${d.uri})`).join(", ")}.`
      );
    }
  }
  if (fatalHits.length) {
    steps.push(
      "If the board is still in fatal mode (life LED blinking fast): send single keys — `f` (fatal info), `m` (message history), `e` (IRQ log). With the helper: `python ak-console.py --port <P> --key f`.",
      "After reboot the snapshot persists: run `fatal l` and `fatal m` (safe, read-only).",
      "Cross-check the pool high-water marks and sizes in ak.cfg.mk (guide: tune-pools)."
    );
  }

  // ---- 3. fatal block details (task / obj / counters) ---------------------
  const fatalTimes = gv(/\[times\]\s*fatal:\s*(\d+)/);
  const restartTimes = gv(/\[times\]\s*restart:\s*(\d+)/);
  if (fatalTimes !== null && restartTimes !== null) {
    const f = parseInt(fatalTimes, 10);
    const r = parseInt(restartTimes, 10);
    findings.push(`Crash counters: **fatal_times=${f}**, **restart_times=${r}**.`);
    if (r > f * 2 && r - f >= 3) {
      interpretation.push(
        `- Restarts (${r}) far exceed FATALs (${f}) → most resets are **not** FATALs: suspect the **watchdog** (32 s independent / 20 s soft) — a handler or loop blocks too long — or power issues. Check \`fatal m\` for huge exe_time entries.`
      );
    }
  }
  const objTask = gv(/\[obj\]\s*task:\s*(\d+)/);
  const objSig = gv(/\[obj\]\s*sig:\s*(\d+)/);
  if (objTask !== null && objSig !== null) {
    findings.push(`Active object at crash: task ${objTask}, sig ${objSig}.`);
    interpretation.push(
      `- The message being handled when it died: **task ${describeTaskId(parseInt(objTask, 10))}**, **sig ${describeSig(parseInt(objSig, 10))}**. That handler (or something it called) is the prime suspect.`
    );
  }

  // ---- 4. Timing lines (console live log + `fatal m` dump) ----------------
  const timings: TimingRec[] = [];
  for (const line of lines) {
    const m = line.match(
      /task_?id:?\s*(\d+).*?sig:?\s*(\d+).*?wait_?time:?\s*(\d+).*?exe_?time:?\s*(\d+)/i
    );
    if (!m) continue;
    const rec: TimingRec = {
      task: parseInt(m[1], 10),
      sig: parseInt(m[2], 10),
      wait: parseInt(m[3], 10),
      exe: parseInt(m[4], 10),
    };
    if (rec.task >= INSANE_TASK_ID || rec.exe >= INSANE_MS || rec.wait >= INSANE_MS) continue;
    timings.push(rec);
  }
  if (timings.length) {
    const maxExe = timings.reduce((a, b) => (b.exe > a.exe ? b : a));
    const maxWait = timings.reduce((a, b) => (b.wait > a.wait ? b : a));
    const avgExe = timings.reduce((s, t) => s + t.exe, 0) / timings.length;
    findings.push(
      `Timing log: ${timings.length} message record(s); max exe_time **${maxExe.exe} ms** (task ${maxExe.task}, sig ${maxExe.sig}); max wait_time **${maxWait.wait} ms**; avg exe ${avgExe.toFixed(1)} ms.`
    );
    if (maxExe.exe >= EXE_SEVERE_MS) {
      interpretation.push(
        `- exe_time ${maxExe.exe} ms on task ${describeTaskId(maxExe.task)} sig ${maxExe.sig} is **severe** — AK is run-to-completion, so this handler froze everything else (and risks the 20 s/32 s watchdogs). Split the work: post follow-up messages or use a timer.`
      );
    } else if (maxExe.exe >= EXE_WARN_MS) {
      interpretation.push(
        `- exe_time ${maxExe.exe} ms on task ${describeTaskId(maxExe.task)} sig ${maxExe.sig} exceeds ~${EXE_WARN_MS} ms — long for a run-to-completion handler; consider splitting it.`
      );
    }
    if (maxWait.wait >= WAIT_WARN_MS) {
      interpretation.push(
        `- wait_time ${maxWait.wait} ms for task ${describeTaskId(maxWait.task)} sig ${maxWait.sig} → **starvation**: higher-priority queues (or one slow handler) delayed it. Check priorities in app_task_table[].`
      );
    }
  }

  // ---- 5. -SIG-> trace ------------------------------------------------------
  const sigTrace = lines
    .map((l) => l.match(/-SIG->\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1])
    .filter((s): s is string => Boolean(s));
  if (sigTrace.length) {
    const freq = new Map<string, number>();
    for (const s of sigTrace) freq.set(s, (freq.get(s) ?? 0) + 1);
    const last = sigTrace.slice(-5);
    findings.push(
      `Signal trace: ${sigTrace.length} \`-SIG->\` line(s); last before end: ${last.map((s) => `\`${s}\``).join(" → ")}.`
    );
    if (fatalHits.length || raw.includes("[fatal]")) {
      interpretation.push(
        `- The last traced signal (\`${last[last.length - 1]}\`) is the last handler that started before the crash — begin reading there.`
      );
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 10 && top[1] / sigTrace.length > 0.6) {
      interpretation.push(
        `- \`${top[0]}\` dominates the trace (${top[1]}/${sigTrace.length}) — possible message flood (runaway periodic timer or ISR re-posting).`
      );
    }
  }

  // ---- 6. Boot banners → reboot loop ---------------------------------------
  const boots = (raw.match(/App run mode:/g) ?? []).length;
  if (boots >= 2) {
    findings.push(`**${boots} boot banners** ("App run mode:") in one capture → the board restarted ${boots - 1}×.`);
    interpretation.push(
      `- Repeated restarts: if no FATAL tag appears between banners, suspect the **watchdog** (a blocking handler) or power/brown-out. Run \`fatal l\` — rising fatal_times means FATALs; rising restart_times alone means watchdog/power.`
    );
    steps.push("Capture longer with `--watch 40` to see whether a FATAL tag prints right before each restart.");
  }

  // ---- Assemble -------------------------------------------------------------
  if (!findings.length) {
    return [
      "# AK log analysis",
      "",
      "No FATAL, timing, signal-trace, or reboot patterns recognized in this capture.",
      "",
      "## Next steps",
      "1. Confirm log gates are compiled in: `-DAPP_DBG_EN -DAPP_DBG_SIG_EN` (CONSOLE_OPTION in application/Makefile); console is 115200 8N1.",
      "2. Run safe shell commands and re-analyze: `ver`, `fatal l`, `fatal m` (e.g. `python ak-console.py --port <P> --cmd \"ver\" --cmd \"fatal l\"`).",
      "3. For live behavior, capture 10–30 s of `-SIG->` trace: `python ak-console.py --port <P> --watch 20`.",
      "4. See guide `debug-uart-shell` (ak://guide/debug-uart-shell) for the symptom→action playbook.",
    ].join("\n");
  }

  if (!steps.length) {
    steps.push(
      "Run `ver` and `fatal l` (safe) for system health + crash history, then re-run this analysis with the new output."
    );
  }
  steps.push(
    "Only run destructive commands (`reboot`, `fatal t/!/@/r`, `ram r`, `eps r`, `flash i`, `boot r/t`, `fwu`, `dbg s`) with the engineer's explicit OK.",
    "When fixing code, follow the guardrails: edit only application/sources/app/ and driver/ (ak://guardrail/do-not-modify)."
  );

  return [
    "# AK log analysis",
    "",
    "## Findings",
    ...findings.map((f) => `- ${f}`),
    "",
    "## Interpretation",
    ...interpretation,
    "",
    "## Next steps",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}
