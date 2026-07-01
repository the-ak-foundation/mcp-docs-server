import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiDoc, Corpus, Doc } from "./types.js";
import { KERNEL_MODULES } from "./types.js";
import { search } from "./search.js";
import {
  formatApi,
  formatApiList,
  formatContent,
  formatDoc,
  formatGuardrails,
  formatSearchResults,
} from "./format.js";

export const SERVER_NAME = "ak-mcp";
export const SERVER_VERSION = "0.1.0";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const errorText = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

/** Build a fully configured MCP server over a loaded corpus (transport-agnostic). */
export function createAkServer(corpus: Corpus): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Documentation for the AK (Active Kernel) event-driven MCU framework. " +
        "Use `search_ak_docs` to find anything, `get_ak_api` for exact function/macro " +
        "signatures and arguments, `get_ak_guide` for create-task/create-driver/create-screen " +
        "recipes, and ALWAYS consult `get_ak_guardrails` before generating code — never modify " +
        "the kernel (application/sources/ak), boot, networks, or common; build in app/ and driver/.",
    }
  );

  const byUri = new Map(corpus.documents.map((d) => [d.uri, d]));
  const findApi = (symbol: string): ApiDoc | undefined => {
    const id = corpus.apiByName[symbol];
    const doc = corpus.documents.find((d) => d.id === id);
    return doc && doc.section === "api" ? (doc as ApiDoc) : undefined;
  };

  // --- Resources ------------------------------------------------------------
  server.registerResource(
    "ak-index",
    "ak://index",
    {
      title: "AK documentation index",
      description: "List of every AK concept, guide, guardrail, and API resource.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderIndex(corpus) }],
    })
  );

  server.registerResource(
    "ak-doc",
    new ResourceTemplate("ak://{section}/{id}", {
      list: async () => ({
        resources: corpus.documents.map((d) => ({
          uri: d.uri,
          name: d.title,
          description: describe(d),
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "AK document",
      description: "A single AK concept, guide, guardrail, or API entry.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const doc = byUri.get(uri.href);
      if (!doc) throw new Error(`Unknown AK resource: ${uri.href}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: formatDoc(doc) }] };
    }
  );

  // --- Tools ----------------------------------------------------------------
  server.registerTool(
    "search_ak_docs",
    {
      title: "Search AK docs",
      description:
        "Full-text search across AK concepts, guides, guardrails, and API entries. " +
        "Returns ranked results with resource URIs.",
      inputSchema: {
        query: z.string().describe("Keywords, e.g. 'post message to task' or 'one-shot timer'."),
        section: z
          .enum(["api", "concept", "guide", "guardrail"])
          .optional()
          .describe("Restrict results to one section."),
        limit: z.number().int().min(1).max(20).optional().describe("Max results (default 8)."),
      },
    },
    async ({ query, section, limit }) =>
      text(formatSearchResults(query, search(corpus, query, { section, limit })))
  );

  server.registerTool(
    "get_ak_api",
    {
      title: "Get AK API entry",
      description:
        "Exact signature, parameters, return value, semantics, examples, and FATAL codes " +
        "for an AK kernel function, macro, or type (e.g. 'timer_set', 'task_post_pure_msg').",
      inputSchema: {
        symbol: z.string().describe("The exact symbol name, e.g. 'timer_set'."),
      },
    },
    async ({ symbol }) => {
      const doc = findApi(symbol);
      if (doc) return text(formatApi(doc));
      const hits = search(corpus, symbol, { section: "api", limit: 5 });
      const suggest = hits.map((h) => h.doc.title).filter((t) => t !== symbol);
      return errorText(
        `No API symbol named "${symbol}".` +
          (suggest.length ? ` Did you mean: ${suggest.join(", ")}?` : "") +
          ` Use list_ak_api or search_ak_docs to browse.`
      );
    }
  );

  server.registerTool(
    "list_ak_api",
    {
      title: "List AK API",
      description:
        "List AK kernel API symbols, optionally filtered by module " +
        "(task, message, timer, fsm, tsm, ak, port), each with a one-line summary.",
      inputSchema: {
        module: z
          .enum([...KERNEL_MODULES] as [string, ...string[]])
          .optional()
          .describe("Restrict to one kernel module."),
      },
    },
    async ({ module }) => text(formatApiList(corpus, module))
  );

  const guideTopics = corpus.sections.guide;
  server.registerTool(
    "get_ak_guide",
    {
      title: "Get AK how-to guide",
      description:
        "Step-by-step recipe (with skeleton code, Makefile.mk steps, and wiring) for a common " +
        `AK task. Topics: ${guideTopics.join(", ")}.`,
      inputSchema: {
        topic: (guideTopics.length
          ? z.enum(guideTopics as [string, ...string[]])
          : z.string()
        ).describe("Which recipe to fetch."),
      },
    },
    async ({ topic }) => {
      const doc = corpus.documents.find((d) => d.section === "guide" && d.id === topic);
      return doc
        ? text(formatContent(doc))
        : errorText(`No guide "${topic}". Available: ${guideTopics.join(", ")}.`);
    }
  );

  server.registerTool(
    "get_ak_guardrails",
    {
      title: "Get AK guardrails",
      description:
        "The rules every AK contribution must follow: which directories are off-limits " +
        "(kernel, boot, networks, common) and the kernel invariants (no blocking, fixed pools, " +
        "64-byte payload, max 7 refs, priority 0 reserved). Consult before generating code.",
      inputSchema: {},
    },
    async () => text(formatGuardrails(corpus))
  );

  // --- Prompts --------------------------------------------------------------
  server.registerPrompt(
    "ak-new-task",
    {
      title: "Design a new AK task",
      description: "Scaffold a new AK task following kernel conventions and guardrails.",
      argsSchema: { description: z.string().describe("What the task should do.") },
    },
    async ({ description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Design a new AK task that: ${description}\n\n` +
              `Before writing code, call the tools \`get_ak_guide("create-task")\` and ` +
              `\`get_ak_guardrails()\`. Then follow the 5-step format exactly:\n` +
              `1) add an ID before AK_TASK_EOT_ID in app/task_list.h (increasing order);\n` +
              `2) add a row to app_task_table[] in app/task_list.cpp with a LEVEL_1..7 priority;\n` +
              `3) declare signals (starting at AK_USER_DEFINE_SIG) and intervals in app/app.h;\n` +
              `4) implement task_xxx.cpp as a non-blocking switch(msg->sig);\n` +
              `5) add the source to app/Makefile.mk and trigger it (timer or seed message).\n` +
              `Only modify files under application/sources/app/. Do not touch the kernel, ` +
              `boot, networks, or common. Output the diffs.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "ak-new-driver",
    {
      title: "Design a new AK driver",
      description: "Scaffold a new hardware-agnostic AK driver using function-pointer injection.",
      argsSchema: { description: z.string().describe("What hardware the driver controls.") },
    },
    async ({ description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Design a new AK driver for: ${description}\n\n` +
              `First call \`get_ak_guide("create-driver")\` and \`get_ak_guardrails()\`. ` +
              `Follow the function-pointer injection pattern: the driver in ` +
              `application/sources/driver/<name>/ holds pf_* control pointers and contains no pin ` +
              `numbers; the real GPIO functions and the instance live in BSP/app code and are ` +
              `injected via <name>_init(...). Register the module in driver/Makefile.mk, hook any ` +
              `periodic work into sys_irq_timer_10ms(), and have callbacks only task_post_* into a ` +
              `task. Do not modify the kernel, boot, networks, or common. Output the diffs.`,
          },
        },
      ],
    })
  );

  return server;
}

function describe(doc: Doc): string {
  if (doc.section === "api") {
    const api = doc as ApiDoc;
    return api.summary || api.signature;
  }
  return doc.summary || doc.section;
}

function renderIndex(corpus: Corpus): string {
  const lines = ["# AK documentation index", ""];
  const group = (title: string, ids: string[], section: string) => {
    lines.push(`## ${title}`);
    for (const id of ids) {
      const doc = corpus.documents.find((d) => d.section === section && d.id === id);
      if (doc) lines.push(`- [${doc.title}](${doc.uri})${"summary" in doc && doc.summary ? ` — ${doc.summary}` : ""}`);
    }
    lines.push("");
  };
  group("Concepts", corpus.sections.concept, "concept");
  group("Guides", corpus.sections.guide, "guide");
  group("Guardrails", corpus.sections.guardrail, "guardrail");
  lines.push("## API (by module)");
  for (const [mod, names] of Object.entries(corpus.modules)) {
    lines.push(`- **${mod}** (${names.length}): ${names.join(", ")}`);
  }
  return lines.join("\n");
}
