import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAll } from "../scripts/extract.mjs";

const all = extractAll();
const find = (name, kind) => all.find((e) => e.name === name && (!kind || e.kind === kind));

test("extracts a healthy number of symbols of each kind", () => {
  assert.ok(all.filter((e) => e.kind === "function").length >= 50);
  assert.ok(all.filter((e) => e.kind === "macro").length >= 30);
  assert.ok(all.filter((e) => e.kind === "type").length >= 20);
});

test("timer_set: signature, module, params, return", () => {
  const f = find("timer_set", "function");
  assert.ok(f, "timer_set not found");
  assert.equal(f.module, "timer");
  assert.equal(f.returns, "uint8_t");
  assert.deepEqual(
    f.params.map((p) => p.name),
    ["des_task_id", "sig", "duty", "type"]
  );
  assert.equal(f.params[3].type, "timer_type_t");
});

test("task_post_common_msg: pointer param types preserved", () => {
  const f = find("task_post_common_msg", "function");
  assert.deepEqual(
    f.params.map((p) => p.type),
    ["task_id_t", "uint8_t", "uint8_t*", "uint8_t"]
  );
});

test("enum constants captured for timer_type_t", () => {
  const t = find("timer_type_t", "type");
  assert.equal(t.typedefKind, "enum");
  assert.deepEqual(t.constants, ["TIMER_ONE_SHOT", "TIMER_PERIODIC"]);
});

test("function-pointer and struct typedefs are named correctly", () => {
  assert.equal(find("pf_task", "type")?.typedefKind, "alias");
  assert.equal(find("state_handler", "type")?.typedefKind, "alias");
  assert.equal(find("ak_msg_t", "type")?.typedefKind, "struct");
  assert.equal(find("task_t", "type")?.typedefKind, "struct");
});

test("include guards are not emitted as macros", () => {
  assert.ok(!all.some((e) => /_H__$/.test(e.name)));
});

test("key kernel macros are present", () => {
  assert.ok(find("AK_USER_DEFINE_SIG", "macro"));
  assert.ok(find("TASK_PRI_LEVEL_7", "macro"));
  assert.ok(find("FSM_TRAN", "macro")?.functionLike);
});

test("no duplicate (kind,name) entries", () => {
  const seen = new Set();
  for (const e of all) {
    const key = `${e.kind}:${e.name}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});
