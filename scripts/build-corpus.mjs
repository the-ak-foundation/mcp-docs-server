/**
 * build-corpus.mjs — assemble the searchable corpus the MCP server serves.
 *
 * Inputs:
 *   - extracted API entries (extract.mjs, from the kernel headers)
 *   - corpus/enrichment/<symbol>.md  (hand-written semantics/examples per symbol)
 *   - corpus/concepts|guides|guardrails/*.md (hand-written long-form docs)
 *
 * Output:
 *   - generated/corpus.json  { documents, index, modules, sections }
 *
 * Run:  node scripts/build-corpus.mjs           (build)
 *       node scripts/build-corpus.mjs --check    (build + drift checks, non-zero on error)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll, resolveIncDir } from "./extract.mjs";
import { tokenize } from "./tokenize.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const CORPUS_DIR = join(ROOT, "corpus");
const OUT_DIR = join(ROOT, "generated");
const OUT_FILE = join(OUT_DIR, "corpus.json");

const CHECK = process.argv.includes("--check");
const warnings = [];
const errors = [];

/** Minimal frontmatter parser: `---\nkey: value\n---\n<body>`. */
const LIST_KEYS = new Set(["tags", "see_also", "fatal_codes", "apis"]);
function stripQuotes(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}
function parseDoc(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]\w*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    meta[key] = LIST_KEYS.has(key)
      ? val.split(",").map((s) => stripQuotes(s)).filter(Boolean)
      : stripQuotes(val);
  }
  return { meta, body: m[2].trim() };
}

function readDir(section) {
  const dir = join(CORPUS_DIR, section);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ file: f, ...parseDoc(readFileSync(join(dir, f), "utf8")) }));
}

// --- 1. API documents (extracted + enriched) -------------------------------
const incDir = resolveIncDir();
const extracted = extractAll(incDir);
const extractedNames = new Set(extracted.map((e) => e.name));
const enrichment = new Map();
for (const { file, meta, body } of readDir("enrichment")) {
  const symbol = meta.symbol ?? file.replace(/\.md$/, "");
  enrichment.set(symbol, { meta, body });
  if (!extractedNames.has(symbol)) {
    errors.push(`enrichment/${file}: symbol "${symbol}" not found in headers (renamed or removed?)`);
  }
}

const documents = [];
const usedIds = new Set();
const apiByName = {};
const modules = {};

function pushDoc(doc) {
  if (usedIds.has(doc.id)) doc.id = `${doc.id}--${doc.section}`;
  usedIds.add(doc.id);
  documents.push(doc);
  return documents.length - 1;
}

for (const e of extracted) {
  const enr = enrichment.get(e.name);
  const see_also = enr?.meta.see_also ?? [];
  for (const ref of see_also) {
    if (!extractedNames.has(ref)) warnings.push(`${e.name}: see_also "${ref}" is not a known symbol`);
  }
  const doc = {
    id: e.name,
    uri: `ak://api/${e.name}`,
    section: "api",
    title: e.name,
    kind: e.kind,
    module: e.module,
    header: e.header,
    signature: e.signature,
    params: e.params ?? null,
    returns: e.returns ?? null,
    constants: e.constants ?? null,
    typedefKind: e.typedefKind ?? null,
    functionLike: e.functionLike ?? null,
    summary: enr?.meta.summary ?? "",
    fatal_codes: enr?.meta.fatal_codes ?? [],
    see_also,
    body: enr?.body ?? "",
    needs_docs: !enr,
    tags: [e.module, e.kind, ...(enr?.meta.tags ?? [])],
  };
  pushDoc(doc);
  apiByName[e.name] = doc.id;
  (modules[e.module] ??= []).push(e.name);
}

// --- 2. Long-form documents (concepts / guides / guardrails) ----------------
const sections = { concept: [], guide: [], guardrail: [] };
for (const section of Object.keys(sections)) {
  for (const { file, meta, body } of readDir(`${section}s`)) {
    const id = meta.id ?? file.replace(/\.md$/, "");
    const doc = {
      id,
      uri: `ak://${section}/${id}`,
      section,
      title: meta.title ?? id,
      summary: meta.summary ?? "",
      tags: meta.tags ?? [],
      apis: meta.apis ?? [],
      body,
    };
    for (const ref of doc.apis) {
      if (!extractedNames.has(ref)) {
        errors.push(`${section}s/${file}: referenced API "${ref}" not found in headers`);
      }
    }
    pushDoc(doc);
    sections[section].push(id);
  }
}

// --- 3. Inverted index (BM25 inputs) ---------------------------------------
const postings = {};
const docLen = {};
let totalLen = 0;
documents.forEach((doc, idx) => {
  const text = [
    doc.title,
    doc.summary,
    (doc.tags ?? []).join(" "),
    doc.signature ?? "",
    (doc.see_also ?? []).join(" "),
    doc.body ?? "",
  ].join(" ");
  const tokens = tokenize(text);
  docLen[idx] = tokens.length;
  totalLen += tokens.length;
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  for (const [term, count] of Object.entries(tf)) {
    (postings[term] ??= []).push([idx, count]);
  }
});

const corpus = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: { incDir: incDir.replace(/\\/g, "/"), symbols: extracted.length },
  documents,
  modules,
  sections,
  apiByName,
  index: {
    N: documents.length,
    avgdl: documents.length ? totalLen / documents.length : 0,
    docLen,
    postings,
  },
};

// --- 4. Drift report --------------------------------------------------------
const enrichedFns = extracted.filter((e) => e.kind === "function" && enrichment.has(e.name)).length;
const totalFns = extracted.filter((e) => e.kind === "function").length;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(corpus));

console.log(`[build-corpus] ${documents.length} documents -> ${OUT_FILE}`);
console.log(`[build-corpus] api=${extracted.length} concepts=${sections.concept.length} guides=${sections.guide.length} guardrails=${sections.guardrail.length}`);
console.log(`[build-corpus] function enrichment coverage: ${enrichedFns}/${totalFns}`);
for (const w of warnings) console.warn(`  warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  error: ${e}`);
  if (CHECK) {
    console.error(`[build-corpus] drift check FAILED with ${errors.length} error(s)`);
    process.exit(1);
  }
}
if (CHECK) console.log("[build-corpus] drift check passed");
