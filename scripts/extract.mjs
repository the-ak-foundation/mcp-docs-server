/**
 * extract.mjs — zero-dependency parser for the AK kernel public headers.
 *
 * Reads application/sources/ak/inc/*.h and emits one "raw API entry" per public
 * symbol (function prototype, #define macro, typedef). Signatures come straight
 * from the source so they can never drift from the code. Human-written docs are
 * layered on top later by build-corpus.mjs (the "hybrid" model).
 *
 * Run standalone to inspect:  node scripts/extract.mjs            (prints JSON)
 *                             node scripts/extract.mjs --summary  (counts only)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
export const AK_INC_DIR =
  process.env.AK_INC_DIR ?? join(REPO_ROOT, "application", "sources", "ak", "inc");

/** Headers to parse, in module order. Filename stem == module name. */
const HEADERS = ["ak.h", "task.h", "message.h", "timer.h", "fsm.h", "tsm.h", "port.h"];

/** Strip C/C++ comments while preserving string literals. */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '"' || c === "'") {
      // Copy the whole string/char literal verbatim (handle escapes).
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        out += src[i];
        if (src[i] === "\\") {
          out += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Join `\`-continued lines into one physical line. */
function joinContinuations(src) {
  return src.replace(/\\\r?\n/g, " ");
}

/** Is this a header include-guard macro (e.g. __TIMER_H__)? */
function isIncludeGuard(name) {
  return /_H__$/.test(name);
}

/** Parse `#define` lines into macro entries. */
function parseMacros(src, module, header) {
  const macros = [];
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(/^#\s*define\s+([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/);
    if (!m) continue;
    const [, name, paramsRaw, bodyRaw] = m;
    if (isIncludeGuard(name)) continue;
    const functionLike = paramsRaw != null;
    const params = functionLike
      ? paramsRaw
          .slice(1, -1)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const body = bodyRaw.trim();
    const signature = `#define ${name}${functionLike ? `(${params.join(", ")})` : ""}${
      body ? ` ${body}` : ""
    }`.replace(/\s+/g, " ");
    macros.push({
      name,
      kind: "macro",
      functionLike,
      module,
      header,
      params,
      body,
      signature,
    });
  }
  return macros;
}

/** Remove preprocessor lines and the `extern "C"` C++ wrapper (incl. its braces). */
function declarationsText(src) {
  const hadExternC = /extern\s+"C"/.test(src);
  // Drop every preprocessor line.
  let text = src
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  text = text.replace(/extern\s+"C"/g, " ");
  if (hadExternC) {
    // The wrapper's `{` is the first brace in the file and its `}` is the last.
    const open = text.indexOf("{");
    if (open !== -1) text = text.slice(0, open) + " " + text.slice(open + 1);
    const close = text.lastIndexOf("}");
    if (close !== -1) text = text.slice(0, close) + " " + text.slice(close + 1);
  }
  return text;
}

/** Split into top-level statements, respecting brace/paren nesting. */
function splitStatements(src) {
  const stmts = [];
  let brace = 0;
  let paren = 0;
  let cur = "";
  for (const ch of src) {
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    if (ch === ";" && brace === 0 && paren === 0) {
      const t = cur.trim();
      if (t) stmts.push(t);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

/** Derive the defined name from a `typedef ...` statement. */
function typedefName(stmt) {
  const fp = stmt.match(/\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\(/); // function pointer typedef
  if (fp) return fp[1];
  const tail = stmt.match(/([A-Za-z_]\w*)\s*$/);
  return tail ? tail[1] : null;
}

/** Split a typedef enum body into its constant names, if any. */
function enumConstants(stmt) {
  const body = stmt.match(/enum\s*\{([\s\S]*)\}/);
  if (!body) return [];
  return body[1]
    .split(",")
    .map((e) => e.trim().split(/\s*=\s*/)[0].trim())
    .filter((e) => /^[A-Za-z_]\w*$/.test(e));
}

/** Parse a function prototype statement into name/return/params. */
function parseFunction(stmt) {
  const m = stmt.match(
    /^(?:extern\s+)?([A-Za-z_][\w\s\*]*?)\s*\b([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*$/
  );
  if (!m) return null;
  const returns = m[1].replace(/\s+/g, " ").trim();
  const name = m[2];
  const rawParams = m[3].trim();
  const params = [];
  if (rawParams && rawParams !== "void") {
    for (const p of rawParams.split(",")) {
      const t = p.trim();
      if (!t || t === "void") continue;
      const pm = t.match(/^(.*?)([A-Za-z_]\w*)$/);
      if (pm && pm[1].trim()) {
        params.push({ type: pm[1].trim(), name: pm[2] });
      } else {
        params.push({ type: t, name: "" });
      }
    }
  }
  const signature = `${returns} ${name}(${params
    .map((p) => `${p.type} ${p.name}`.trim())
    .join(", ")})`.replace(/\s+/g, " ");
  return { name, kind: "function", returns, params, signature };
}

/** Parse one header file into raw entries. */
function parseHeader(path, module) {
  const header = `application/sources/ak/inc/${module}.h`;
  const src = joinContinuations(stripComments(readFileSync(path, "utf8")));
  const entries = [];

  for (const macro of parseMacros(src, module, header)) entries.push(macro);

  for (const stmt of splitStatements(declarationsText(src))) {
    if (stmt.startsWith("typedef")) {
      const name = typedefName(stmt);
      if (!name) continue;
      const kind = /\bstruct\b/.test(stmt)
        ? "struct"
        : /\benum\b/.test(stmt)
          ? "enum"
          : "alias";
      entries.push({
        name,
        kind: "type",
        typedefKind: kind,
        module,
        header,
        signature: stmt.replace(/\s+/g, " ").trim(),
        ...(kind === "enum" ? { constants: enumConstants(stmt) } : {}),
      });
      continue;
    }
    if (/\(/.test(stmt) && !/[{}]/.test(stmt)) {
      const fn = parseFunction(stmt);
      if (fn) entries.push({ ...fn, module, header });
    }
  }
  return entries;
}

/** Extract every public symbol from every AK kernel header. */
export function extractAll(incDir = AK_INC_DIR) {
  const all = [];
  const seen = new Set();
  for (const file of HEADERS) {
    const path = join(incDir, file);
    if (!existsSync(path)) {
      console.warn(`[extract] skip missing header: ${path}`);
      continue;
    }
    const module = file.replace(/\.h$/, "");
    for (const e of parseHeader(path, module)) {
      const key = `${e.kind}:${e.name}`;
      if (seen.has(key)) continue; // first declaration wins
      seen.add(key);
      all.push(e);
    }
  }
  return all;
}

// CLI entry point.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const entries = extractAll();
  if (process.argv.includes("--summary")) {
    const by = {};
    for (const e of entries) by[e.kind] = (by[e.kind] ?? 0) + 1;
    console.log(`Extracted ${entries.length} symbols from ${AK_INC_DIR}`);
    console.log(by);
  } else {
    console.log(JSON.stringify(entries, null, 2));
  }
}
