/**
 * tokenize.mjs — the single source of truth for tokenization.
 *
 * Used by build-corpus.mjs (to build the inverted index) and by the tests.
 * src/core/search.ts keeps a TypeScript mirror of this function; the two MUST
 * stay identical or query terms won't match indexed terms.
 *
 * Rule: lowercase, split on non-[a-z0-9_], keep tokens of length >= 2, and also
 * index the underscore-separated parts (so "timer" matches "timer_set").
 */
export function tokenize(text) {
  const tokens = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (raw.length >= 2) tokens.push(raw);
    if (raw.includes("_")) {
      for (const part of raw.split("_")) if (part.length >= 2) tokens.push(part);
    }
  }
  return tokens;
}
