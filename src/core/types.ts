/** Shapes of generated/corpus.json (produced by scripts/build-corpus.mjs). */

export interface Param {
  type: string;
  name: string;
}

export interface ApiDoc {
  id: string;
  uri: string;
  section: "api";
  title: string;
  kind: "function" | "macro" | "type";
  module: string;
  header: string;
  signature: string;
  params: Param[] | null;
  returns: string | null;
  constants: string[] | null;
  typedefKind: string | null;
  functionLike: boolean | null;
  summary: string;
  fatal_codes: string[];
  see_also: string[];
  body: string;
  needs_docs: boolean;
  tags: string[];
}

export interface ContentDoc {
  id: string;
  uri: string;
  section: "concept" | "guide" | "guardrail";
  title: string;
  summary: string;
  tags: string[];
  apis: string[];
  body: string;
}

export type Doc = ApiDoc | ContentDoc;

export function isApiDoc(doc: Doc): doc is ApiDoc {
  return doc.section === "api";
}

export interface CorpusIndex {
  N: number;
  avgdl: number;
  docLen: Record<string, number>;
  postings: Record<string, [number, number][]>;
}

export interface Corpus {
  version: number;
  generatedAt: string;
  source: { incDir: string; symbols: number };
  documents: Doc[];
  modules: Record<string, string[]>;
  sections: { concept: string[]; guide: string[]; guardrail: string[] };
  apiByName: Record<string, string>;
  index: CorpusIndex;
}

export const KERNEL_MODULES = ["task", "message", "timer", "fsm", "tsm", "ak", "port"] as const;
export type KernelModule = (typeof KERNEL_MODULES)[number];
