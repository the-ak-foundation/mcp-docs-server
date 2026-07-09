import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiDoc, Corpus, Doc } from "./types.js";
import { KERNEL_MODULES } from "./types.js";
import { search } from "./search.js";
import { analyzeLog } from "./analyze.js";
import {
  parseLcdDump,
  renderLcdAscii,
  describeLcd,
  encodeLcdPng,
  toBase64,
} from "./lcd.js";
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

/** Firmware repo the base kit is scaffolded from, and the pinned fallback tag. */
export const AK_FIRMWARE_REPO = "the-ak-foundation/ak-base-kit-stm32l151";
export const AK_DEFAULT_TAG = "v1.3";

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const errorText = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

interface Release {
  tag: string;
  tarball: string;
  zipball: string;
  origin: "latest" | "requested" | "pinned";
}

function archiveUrls(tag: string): { tarball: string; zipball: string } {
  return {
    tarball: `https://github.com/${AK_FIRMWARE_REPO}/archive/refs/tags/${tag}.tar.gz`,
    zipball: `https://github.com/${AK_FIRMWARE_REPO}/archive/refs/tags/${tag}.zip`,
  };
}

/**
 * Resolve which base-kit release to scaffold from. An explicit `ref` wins; else
 * query the GitHub "latest release" API (best-effort, 4s timeout), falling back
 * to the pinned AK_DEFAULT_TAG on any error / rate-limit.
 */
async function resolveRelease(ref?: string): Promise<Release> {
  if (ref && ref.trim()) {
    const tag = ref.trim();
    return { tag, ...archiveUrls(tag), origin: "requested" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.github.com/repos/${AK_FIRMWARE_REPO}/releases/latest`, {
      headers: { "User-Agent": SERVER_NAME, Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string };
      if (data.tag_name) return { tag: data.tag_name, ...archiveUrls(data.tag_name), origin: "latest" };
    }
  } catch {
    /* network/rate-limit — fall back to the pinned tag */
  }
  return { tag: AK_DEFAULT_TAG, ...archiveUrls(AK_DEFAULT_TAG), origin: "pinned" };
}

/** Render the "download + lay out + customize" plan for a new project. */
function formatBootstrap(projectName: string, rel: Release): string {
  const name =
    projectName.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[-._]+|[-._]+$/g, "") || "my-ak-app";
  const extracted = `ak-base-kit-stm32l151-${rel.tag.replace(/^v/, "")}`;
  const note =
    rel.origin === "latest"
      ? `latest release (${rel.tag})`
      : rel.origin === "requested"
        ? `requested release (${rel.tag})`
        : `pinned fallback (${rel.tag}) — could not reach the GitHub API for the latest`;
  return [
    `# Bootstrap AK project "${name}"`,
    ``,
    `Using **${note}** of \`${AK_FIRMWARE_REPO}\`.`,
    ``,
    `## 1. Download & extract the base kit`,
    ``,
    `**bash / macOS / Linux / WSL / Git Bash:**`,
    "```sh",
    `curl -L ${rel.tarball} -o ak.tar.gz`,
    `tar -xzf ak.tar.gz`,
    `mv ${extracted} ${name}`,
    `rm ak.tar.gz`,
    "```",
    ``,
    `**Windows PowerShell:**`,
    "```powershell",
    `Invoke-WebRequest ${rel.tarball} -OutFile ak.tar.gz`,
    `tar -xzf ak.tar.gz`,
    `Rename-Item ${extracted} ${name}`,
    `Remove-Item ak.tar.gz`,
    "```",
    ``,
    `**Or track git history instead of a snapshot:**`,
    "```sh",
    `git clone --depth 1 --branch ${rel.tag} https://github.com/${AK_FIRMWARE_REPO}.git ${name}`,
    "```",
    ``,
    `## 2. Get oriented`,
    ``,
    `- \`${name}/application/\` — the firmware you build (\`sources/app/\` = tasks & screens, \`sources/driver/\` = drivers). **Work here.**`,
    `- \`${name}/boot/\` — bootloader (separate image). Leave alone.`,
    `- Kernel \`application/sources/ak/\`, \`networks/\`, \`common/\` are framework — do not modify.`,
    `- Build needs a Unix-like shell + arm-none-eabi-gcc; see the repo's \`CLAUDE.md\`. Build with \`cd ${name}/application && make\`.`,
    ``,
    `## 3. Keep this MCP wired for customization`,
    ``,
    `Add a steering file so I keep following AK conventions (see the ak-docs \`examples/copilot-instructions.md\`), then:`,
    ``,
    `## 4. Customize for the engineer's needs`,
    ``,
    `1. Call **\`get_ak_guardrails\`** — only edit \`application/sources/app/\` and \`application/sources/driver/\`.`,
    `2. For each feature, call **\`get_ak_guide\`** (\`create-task\`, \`create-driver\`, \`create-screen\`, …) and follow it exactly.`,
    `3. Use **\`get_ak_api\`** for exact signatures/arguments; **\`search_ak_docs\`** when unsure of a name.`,
    `4. Rebuild with \`make\` and check \`make info\` for the 16 KB RAM budget.`,
    ``,
    `_Tip: prefer a specific tag for reproducible builds — call this tool again with \`ref: "${rel.tag}"\`._`,
  ].join("\n");
}

/** Build a fully configured MCP server over a loaded corpus (transport-agnostic). */
export function createAkServer(corpus: Corpus): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Documentation for the AK (Active Kernel) event-driven MCU framework. " +
        "To START A NEW PROJECT from the base kit, call `start_ak_project` — it resolves the " +
        "latest ak-base-kit-stm32l151 release and returns the exact download/extract commands, " +
        "then customize the extracted source. " +
        "To DEBUG a running board, call `get_ak_guide(\"debug-uart-shell\")` for the UART/shell " +
        "playbook and paste any captured console output into `analyze_ak_log` for diagnosis. " +
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

  server.registerTool(
    "start_ak_project",
    {
      title: "Start a new AK project",
      description:
        "Begin a new firmware project from the AK base kit. Resolves the LATEST " +
        "ak-base-kit-stm32l151 release (or a given tag) and returns the exact commands to " +
        "download, extract, and lay out the project, plus the steps to customize it. Call this " +
        "when an engineer wants to start/create/bootstrap a new AK-based project.",
      inputSchema: {
        project_name: z
          .string()
          .optional()
          .describe("Folder name for the new project (default 'my-ak-app')."),
        ref: z
          .string()
          .optional()
          .describe("Specific release tag, e.g. 'v1.3'. Omit to use the latest release."),
      },
    },
    async ({ project_name, ref }) => {
      const rel = await resolveRelease(ref);
      return text(formatBootstrap(project_name ?? "my-ak-app", rel));
    }
  );

  server.registerTool(
    "analyze_ak_log",
    {
      title: "Analyze AK UART log",
      description:
        "Paste raw UART console output from an AK board (boot logs, -SIG-> traces, FATAL " +
        "banners, `fatal l`/`fatal m` dumps, timing lines) and get a structured diagnosis: " +
        "detected FATAL codes with cause and fix, run-to-completion/starvation timing issues, " +
        "reboot-loop detection, and the exact shell commands to run next.",
      inputSchema: {
        log: z.string().min(1).describe("Raw text captured from the 115200 UART console."),
        context: z
          .string()
          .optional()
          .describe("Optional: what the engineer observed (symptom, when it happens)."),
      },
    },
    async ({ log, context }) => {
      const report = analyzeLog(log, corpus);
      return text(context ? `> Context: ${context}\n\n${report}` : report);
    }
  );

  server.registerTool(
    "decode_ak_lcd",
    {
      title: "Decode AK OLED framebuffer",
      description:
        "See the board's OLED screen headlessly: paste the raw output of the shell command " +
        "`lcd d` (the 0xNN,0xNN,... framebuffer dump) and get the screen rendered as text art " +
        "plus a PNG image, with content stats. Format: 128x64 @ 1bpp, page-major, LSB = top " +
        "pixel (Adafruit_oled_drv).",
      inputSchema: {
        dump: z.string().min(1).describe("Raw `lcd d` capture, including the 0xNN,... lines."),
        scale: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe("PNG upscale factor (default 4 → 512×256)."),
        invert: z
          .boolean()
          .optional()
          .describe("Set true if the display is inverted (content drawn dark on light)."),
      },
    },
    async ({ dump, scale, invert }) => {
      let fb;
      try {
        fb = parseLcdDump(dump);
      } catch (err) {
        return errorText((err as Error).message);
      }
      const art = renderLcdAscii(fb, invert ?? false);
      const png = encodeLcdPng(fb, scale ?? 4, invert ?? false);
      const summaryLines = [
        `OLED ${fb.width}x${fb.height} — ${describeLcd(fb)}`,
        ...fb.warnings.map((w) => `warning: ${w}`),
        "",
        "```",
        art,
        "```",
      ];
      return {
        content: [
          { type: "text" as const, text: summaryLines.join("\n") },
          { type: "image" as const, data: toBase64(png), mimeType: "image/png" },
        ],
      };
    }
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

  server.registerPrompt(
    "ak-new-project",
    {
      title: "Start a new AK project from the base kit",
      description:
        "Download the latest ak-base-kit-stm32l151 release and customize it for the engineer.",
      argsSchema: {
        description: z.string().describe("What the new firmware should do."),
        project_name: z.string().optional().describe("Folder name (default 'my-ak-app')."),
        ref: z.string().optional().describe("Release tag to pin (default: latest)."),
      },
    },
    async ({ description, project_name, ref }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Bootstrap a new AK firmware project` +
              (project_name ? ` named "${project_name}"` : "") +
              ` for: ${description}\n\n` +
              `Steps:\n` +
              `1) Call \`start_ak_project\`` +
              (project_name || ref
                ? ` with { ${[project_name && `project_name: "${project_name}"`, ref && `ref: "${ref}"`]
                    .filter(Boolean)
                    .join(", ")} }`
                : "") +
              ` to resolve the latest base kit and get the download commands.\n` +
              `2) Run those commands to download and extract the source into the project folder.\n` +
              `3) Call \`get_ak_guardrails\` — only edit application/sources/app/ and .../driver/.\n` +
              `4) Implement the feature above using \`get_ak_guide\` / \`get_ak_api\`, then build with make.\n` +
              `Output the commands you run and the resulting diffs.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "ak-debug",
    {
      title: "Debug an AK board over UART/shell",
      description:
        "Guided debugging: capture the UART console, drive the shell, and diagnose with analyze_ak_log.",
      argsSchema: {
        symptom: z.string().describe("What is going wrong (e.g. 'board resets every ~30 s')."),
        port: z.string().optional().describe("Serial port, e.g. COM3 or /dev/ttyUSB0."),
      },
    },
    async ({ symptom, port }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Debug this AK board over the UART console. Symptom: ${symptom}\n` +
              (port ? `Serial port: ${port}\n` : "") +
              `\nSteps:\n` +
              `1) Call \`get_ak_guide("debug-uart-shell")\` for the connection commands, the full shell reference, and the symptom playbook.\n` +
              `2) Capture data with the non-interactive helper (115200 8N1):\n` +
              `   - live trace: python ak-console.py --port ${port ?? "<PORT>"} --watch 15\n` +
              `   - health + crash history: python ak-console.py --port ${port ?? "<PORT>"} --cmd "ver" --cmd "fatal l" --cmd "fatal m"\n` +
              `   - if the symptom involves the display: python ak-console.py --port ${port ?? "<PORT>"} --cmd "lcd d", then paste that dump into \`decode_ak_lcd\` to see the screen.\n` +
              `3) Paste ALL captured text into \`analyze_ak_log\` (include the symptom as context) and follow its Next steps.\n` +
              `4) Only run read-only shell commands on your own; ask before anything destructive ` +
              `(reboot, fatal t/!/@/r, ram r, eps r, flash i, boot r/t, fwu, dbg s).\n` +
              `5) When you fix code, follow \`get_ak_guardrails\` (edit only app/ and driver/), rebuild with make, and re-verify by repeating step 2.`,
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
