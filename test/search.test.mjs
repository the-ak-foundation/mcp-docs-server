import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../scripts/tokenize.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "generated", "corpus.json"), "utf8"));

/**
 * Reference BM25 — intentionally identical to src/core/search.ts so this test
 * also guards the algorithm the server actually runs. If you change one, change
 * the other.
 */
function search(query, { section, limit = 8 } = {}) {
  const idx = corpus.index;
  const K1 = 1.5;
  const B = 0.75;
  const terms = [...new Set(tokenize(query))];
  const scores = new Map();
  for (const term of terms) {
    const post = idx.postings[term];
    if (!post) continue;
    const df = post.length;
    const idf = Math.log(1 + (idx.N - df + 0.5) / (df + 0.5));
    for (const [i, tf] of post) {
      const dl = idx.docLen[i] ?? idx.avgdl;
      const denom = tf + K1 * (1 - B + (B * dl) / (idx.avgdl || 1));
      scores.set(i, (scores.get(i) ?? 0) + idf * ((tf * (K1 + 1)) / (denom || 1)));
    }
  }
  let res = [...scores].map(([i, s]) => ({ doc: corpus.documents[i], score: s }));
  if (section) res = res.filter((r) => r.doc.section === section);
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, limit);
}

test("a driver question finds the create-driver guide", () => {
  const ids = search("how do I create a new driver").map((r) => r.doc.id);
  assert.ok(ids.includes("create-driver"), `got: ${ids.slice(0, 5).join(", ")}`);
});

test("one-shot timer query surfaces timer docs", () => {
  const ids = search("one-shot timer timeout").slice(0, 5).map((r) => r.doc.id);
  assert.ok(
    ids.some((id) => ["timer_set", "timers", "use-timer"].includes(id)),
    `got: ${ids.join(", ")}`
  );
});

test("debugging over uart finds the debug guide", () => {
  const ids = search("debug uart shell log").slice(0, 5).map((r) => r.doc.id);
  assert.ok(ids.includes("debug-uart-shell"), `got: ${ids.join(", ")}`);
});

test("starting a new project finds the start-project guide", () => {
  const ids = search("start a new project download base kit").slice(0, 5).map((r) => r.doc.id);
  assert.ok(ids.includes("start-project"), `got: ${ids.join(", ")}`);
});

test("section filter restricts results", () => {
  const res = search("task", { section: "guide" });
  assert.ok(res.length > 0);
  assert.ok(res.every((r) => r.doc.section === "guide"));
});

test("posting a message ranks the task_post APIs", () => {
  const ids = search("post a message to a task", { section: "api" })
    .slice(0, 6)
    .map((r) => r.doc.id);
  assert.ok(ids.some((id) => id.startsWith("task_post")), `got: ${ids.join(", ")}`);
});

test("guardrail query finds the do-not-modify rules", () => {
  const ids = search("which files must not be modified kernel").slice(0, 5).map((r) => r.doc.id);
  assert.ok(ids.includes("do-not-modify"), `got: ${ids.join(", ")}`);
});

test("unknown gibberish returns nothing", () => {
  assert.equal(search("zzqqxx_nonexistent_term").length, 0);
});
