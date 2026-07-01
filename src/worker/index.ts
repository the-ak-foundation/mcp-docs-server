/**
 * Cloudflare Worker transport — public, remote MCP endpoint.
 *
 *   POST/GET  /mcp    Streamable HTTP (recommended; modern MCP clients)
 *   GET       /sse    SSE transport (legacy clients)
 *   GET       /       human-readable landing page
 *
 * Each MCP session is held in the `AkMcp` Durable Object (see wrangler.toml).
 * The corpus is bundled at build time, so the Worker needs no filesystem or KV.
 */
import { McpAgent } from "agents/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAkServer, SERVER_NAME, SERVER_VERSION } from "../core/server.js";
import type { Corpus } from "../core/types.js";
// Bundled by Wrangler/esbuild at build time (run `npm run build:corpus` first).
import corpusJson from "../../generated/corpus.json";

const corpus = corpusJson as unknown as Corpus;

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
}

export class AkMcp extends McpAgent<Env> {
  server: McpServer = createAkServer(corpus);
  async init(): Promise<void> {
    // The server is fully configured in createAkServer(); nothing per-session.
  }
}

const LANDING = `${SERVER_NAME} v${SERVER_VERSION} — AK Active Kernel documentation MCP server

Connect an MCP client to:
  Streamable HTTP : <this-origin>/mcp
  SSE (legacy)    : <this-origin>/sse

Tools:    search_ak_docs, get_ak_api, list_ak_api, get_ak_guide, get_ak_guardrails
Prompts:  ak-new-task, ak-new-driver
Resources: ak://index and ak://{section}/{id}

Example client config:
  { "mcpServers": { "ak": { "url": "<this-origin>/mcp" } } }

Docs cover ${corpus.documents.length} entries (${corpus.source.symbols} kernel symbols).
`;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    const landing = LANDING.replaceAll("<this-origin>", url.origin);

    if (url.pathname === "/mcp") {
      return AkMcp.serve("/mcp").fetch(request, env, ctx);
    }
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return AkMcp.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(landing, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("Not found. Try /mcp, /sse, or /.", { status: 404 });
  },
};
