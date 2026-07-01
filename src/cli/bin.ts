#!/usr/bin/env node
/**
 * ak-mcp — stdio MCP server for local / offline use.
 *
 * Configure in an MCP client (Claude Desktop, Cursor, …):
 *   { "mcpServers": { "ak": { "command": "npx", "args": ["-y", "ak-mcp"] } } }
 */
import { readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAkServer, SERVER_VERSION } from "../core/server.js";
import type { Corpus } from "../core/types.js";

function loadCorpus(): Corpus {
  const url = new URL("../../generated/corpus.json", import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8")) as Corpus;
  } catch (err) {
    throw new Error(
      `Could not load generated/corpus.json (${(err as Error).message}). ` +
        `Run \`npm run build:corpus\` first.`
    );
  }
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  const server = createAkServer(corpus);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — log to stderr only.
  console.error(
    `ak-mcp v${SERVER_VERSION} ready (stdio): ${corpus.documents.length} docs, ` +
      `${corpus.source.symbols} symbols.`
  );
}

main().catch((err) => {
  console.error(`ak-mcp failed to start: ${(err as Error).message}`);
  process.exit(1);
});
