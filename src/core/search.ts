import type { Corpus, Doc } from "./types.js";

/**
 * Tokenizer — MUST stay identical to scripts/tokenize.mjs `tokenize`, since the
 * inverted index is built with that one and queried with this one.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (raw.length >= 2) tokens.push(raw);
    if (raw.includes("_")) {
      for (const part of raw.split("_")) if (part.length >= 2) tokens.push(part);
    }
  }
  return tokens;
}

export interface SearchResult {
  doc: Doc;
  score: number;
}

export interface SearchOptions {
  section?: Doc["section"];
  limit?: number;
}

const K1 = 1.5;
const B = 0.75;

/** BM25 ranking over the precomputed inverted index. */
export function search(corpus: Corpus, query: string, opts: SearchOptions = {}): SearchResult[] {
  const { section, limit = 8 } = opts;
  const idx = corpus.index;
  const terms = [...new Set(tokenize(query))];
  const scores = new Map<number, number>();

  for (const term of terms) {
    const postings = idx.postings[term];
    if (!postings) continue;
    const df = postings.length;
    const idf = Math.log(1 + (idx.N - df + 0.5) / (df + 0.5));
    for (const [docIdx, tf] of postings) {
      const dl = idx.docLen[docIdx] ?? idx.avgdl;
      const denom = tf + K1 * (1 - B + (B * dl) / (idx.avgdl || 1));
      const score = idf * ((tf * (K1 + 1)) / (denom || 1));
      scores.set(docIdx, (scores.get(docIdx) ?? 0) + score);
    }
  }

  let results: SearchResult[] = [];
  for (const [docIdx, score] of scores) {
    const doc = corpus.documents[docIdx];
    if (!doc) continue;
    if (section && doc.section !== section) continue;
    results.push({ doc, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
