import type { ApiDoc, Corpus, Doc } from "./types.js";
import { isApiDoc } from "./types.js";
import type { SearchResult } from "./search.js";

/** Render a full API entry (signature + docs) as markdown. */
export function formatApi(doc: ApiDoc): string {
  const lines: string[] = [];
  lines.push(`# ${doc.title}  \`(${doc.kind}, module: ${doc.module})\``);
  lines.push("");
  lines.push("```c");
  lines.push(doc.signature);
  lines.push("```");
  if (doc.summary) lines.push(`\n${doc.summary}`);

  if (doc.kind === "function" && doc.params && doc.params.length) {
    lines.push("\n**Parameters**");
    for (const p of doc.params) lines.push(`- \`${p.type}\` **${p.name}**`);
  }
  if (doc.kind === "function" && doc.returns) {
    lines.push(`\n**Returns:** \`${doc.returns}\``);
  }
  if (doc.constants && doc.constants.length) {
    lines.push(`\n**Enum constants:** ${doc.constants.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (doc.fatal_codes.length) {
    lines.push(`\n**FATAL codes:** ${doc.fatal_codes.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (doc.body) lines.push(`\n${doc.body}`);
  if (doc.see_also.length) {
    lines.push(`\n**See also:** ${doc.see_also.map((s) => `\`${s}\``).join(", ")}`);
  }
  lines.push(`\n_Source: ${doc.header} · resource: ${doc.uri}_`);
  if (doc.needs_docs) {
    lines.push(
      "\n> Note: signature is extracted from the header; no hand-written notes exist for this symbol yet."
    );
  }
  return lines.join("\n");
}

/** Render a concept/guide/guardrail document as markdown. */
export function formatContent(doc: Doc): string {
  const header = `# ${doc.title}\n\n_${doc.section} · resource: ${doc.uri}_`;
  return `${header}\n\n${doc.body}`;
}

/** Render any document. */
export function formatDoc(doc: Doc): string {
  return isApiDoc(doc) ? formatApi(doc) : formatContent(doc);
}

/** Render a ranked list of search hits. */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (!results.length) {
    return `No results for "${query}". Try a different term, or list APIs with \`list_ak_api\`.`;
  }
  const lines = [`Found ${results.length} result(s) for "${query}":\n`];
  for (const { doc, score } of results) {
    const summary = "summary" in doc && doc.summary ? doc.summary : firstLine(doc.body);
    lines.push(`- **${doc.title}** \`[${doc.section}]\` — ${doc.uri}`);
    if (summary) lines.push(`  ${summary}`);
  }
  lines.push(
    "\nFetch full detail with `get_ak_api` (for api results) or read the resource URI."
  );
  return lines.join("\n");
}

/** Render `list_ak_api` output, grouped by module. */
export function formatApiList(corpus: Corpus, moduleFilter?: string): string {
  const modules = moduleFilter ? [moduleFilter] : Object.keys(corpus.modules);
  const lines: string[] = [];
  for (const mod of modules) {
    const names = corpus.modules[mod];
    if (!names || !names.length) continue;
    lines.push(`\n## module: ${mod} (${names.length})`);
    for (const name of names) {
      const doc = corpus.documents.find((d) => d.id === corpus.apiByName[name]) as
        | ApiDoc
        | undefined;
      if (!doc) continue;
      const oneLine = doc.summary || doc.signature;
      lines.push(`- **${name}** \`${doc.kind}\` — ${oneLine}`);
    }
  }
  lines.push("\nUse `get_ak_api(\"<symbol>\")` for the full entry.");
  return lines.join("\n").trim();
}

/** Concatenate every guardrail document. */
export function formatGuardrails(corpus: Corpus): string {
  const docs = corpus.documents.filter((d) => d.section === "guardrail");
  if (!docs.length) return "No guardrail documents found.";
  return docs.map((d) => formatContent(d)).join("\n\n---\n\n");
}

function firstLine(body: string): string {
  return (body || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
}
