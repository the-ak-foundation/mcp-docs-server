import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// analyze.ts has zero runtime imports, so Node's type stripping loads it directly.
import { analyzeLog } from "../src/core/analyze.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "generated", "corpus.json"), "utf8"));

test("FATAL banner MT<TAB>30 -> timer pool diagnosis with corpus cross-ref", () => {
  const report = analyzeLog("boot ok\nMT\t30\n", corpus);
  assert.match(report, /MT:0x30/);
  assert.match(report, /TIMER pool exhausted/);
  assert.match(report, /AK_TIMER_POOL_SIZE/);
  assert.match(report, /timer_set/); // cross-referenced from corpus fatal_codes
  assert.match(report, /fatal l/); // next steps point at the shell
});

test("FATAL banner MF<TAB>31 -> pure pool diagnosis", () => {
  const report = analyzeLog("MF\t31", corpus);
  assert.match(report, /MF:0x31/);
  assert.match(report, /PURE message pool/);
  assert.match(report, /AK_PURE_MSG_POOL_SIZE/);
});

test("`fatal l` block -> counters, task and signal interpretation", () => {
  const log = [
    "[times] fatal: 1",
    "[times] restart: 42",
    "[fatal] type: MF",
    "[fatal] code: 0x21",
    "[task] id: 9",
    "[task] pri: 4",
    "[obj] task: 9",
    "[obj] sig: 12",
  ].join("\n");
  const report = analyzeLog(log, corpus);
  assert.match(report, /MF:0x21/);
  assert.match(report, /COMMON message pool/);
  assert.match(report, /fatal_times=1/);
  assert.match(report, /restart_times=42/);
  assert.match(report, /watchdog/i); // restarts >> fatals
  assert.match(report, /AC_TASK_DISPLAY_ID/); // stock base-kit task 9
  assert.match(report, /user signal/); // sig 12 >= AK_USER_DEFINE_SIG
});

test("timing lines -> severe run-to-completion + garbage records filtered", () => {
  const log = [
    "index: 0\ttask_id: 4\tmsg_type:0x80\tref_count:0\tsig: 10\t\twait_time: 1\texe_time: 2",
    "index: 1\ttask_id: 2\tmsg_type:0xc0\tref_count:0\tsig: 20\t\twait_time: 3\texe_time: 1200",
    "index: 2\ttask_id: 255\tmsg_type:0xff\tref_count:63\tsig: 255\t\twait_time: 4294967295\texe_time: 4294967295",
  ].join("\n");
  const report = analyzeLog(log, corpus);
  assert.match(report, /2 message record/); // the 0xFF flash-garbage row is dropped
  assert.match(report, /1200 ms/);
  assert.match(report, /severe/);
  assert.match(report, /run-to-completion/);
});

test("wait_time spike -> starvation warning", () => {
  const log =
    "taskID: 8\tmsgType:0x80\trefCnt:0\tsig:11\t\twaitTime:900\texeTime:2\n" +
    "taskID: 8\tmsgType:0x80\trefCnt:0\tsig:11\t\twaitTime:1\texeTime:3";
  const report = analyzeLog(log, corpus);
  assert.match(report, /starvation/i);
});

test("-SIG-> trace before a FATAL names the last signal", () => {
  const log = [
    "-SIG-> FW_CHECKING_REQ",
    "-SIG-> AC_DISPLAY_SHOW_LOGO",
    "-SIG-> AC_LIFE_SYSTEM_CHECK",
    "MF\t31",
  ].join("\n");
  const report = analyzeLog(log, corpus);
  assert.match(report, /AC_LIFE_SYSTEM_CHECK/);
  assert.match(report, /last/i);
});

test("repeated boot banners -> reboot-loop finding", () => {
  const banner = "App run mode: DEBUG, App version: 0.0.0.3\n[task_run] Active Objects is ready\n";
  const report = analyzeLog(banner + "stuff\n" + banner + "stuff\n" + banner, corpus);
  assert.match(report, /3 boot banners/);
  assert.match(report, /watchdog/i);
});

test("uninformative log -> guidance, not findings", () => {
  const report = analyzeLog("hello world\nnothing to see\n", corpus);
  assert.match(report, /No FATAL/);
  assert.match(report, /ver/);
  assert.match(report, /debug-uart-shell/);
});

test("destructive commands are flagged in next steps when findings exist", () => {
  const report = analyzeLog("MT\t30", corpus);
  assert.match(report, /destructive/i);
  assert.match(report, /guardrail/i);
});
