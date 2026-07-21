import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_PATH = join(ROOT, "generated", "corpus.json");

test("generated/corpus.json exists", () => {
  assert.ok(existsSync(CORPUS_PATH), "missing corpus.json — run `npm run build:corpus`");
});

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

test("ships the core concepts, guides, and guardrails", () => {
  for (const id of [
    "overview",
    "scheduler",
    "messages",
    "timers",
    "state-machines",
    "debug-infrastructure",
  ]) {
    assert.ok(corpus.sections.concept.includes(id), `concept ${id} missing`);
  }
  for (const id of [
    "create-task",
    "create-driver",
    "create-screen",
    "use-timer",
    "isr-bridge",
    "start-project",
    "debug-uart-shell",
    "kernel-task-log",
  ]) {
    assert.ok(corpus.sections.guide.includes(id), `guide ${id} missing`);
  }
  for (const id of ["do-not-modify", "constraints"]) {
    assert.ok(corpus.sections.guardrail.includes(id), `guardrail ${id} missing`);
  }
});

test("apiByName resolves to a real, enriched doc", () => {
  const doc = corpus.documents.find((d) => d.id === corpus.apiByName["timer_set"]);
  assert.ok(doc);
  assert.equal(doc.section, "api");
  assert.match(doc.signature, /timer_set/);
  assert.equal(doc.needs_docs, false);
  assert.ok(doc.fatal_codes.includes("MT:0x30"));
});

test("every API see_also references a known symbol", () => {
  for (const d of corpus.documents) {
    if (d.section !== "api") continue;
    for (const ref of d.see_also ?? []) {
      assert.ok(corpus.apiByName[ref], `see_also "${ref}" in ${d.id} is unknown`);
    }
  }
});

test("every guide/concept API reference exists", () => {
  for (const d of corpus.documents) {
    for (const ref of d.apis ?? []) {
      assert.ok(corpus.apiByName[ref], `apis "${ref}" in ${d.id} is unknown`);
    }
  }
});

test("every document has a unique id and a well-formed uri", () => {
  const ids = new Set();
  for (const d of corpus.documents) {
    assert.ok(!ids.has(d.id), `duplicate doc id ${d.id}`);
    ids.add(d.id);
    assert.match(d.uri, /^ak:\/\/(api|concept|guide|guardrail)\//);
  }
});

test("inverted index is consistent with the document set", () => {
  assert.equal(corpus.index.N, corpus.documents.length);
  assert.ok(corpus.index.avgdl > 0);
  assert.ok(Object.keys(corpus.index.postings).length > 500);
});
