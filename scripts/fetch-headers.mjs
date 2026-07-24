/**
 * fetch-headers.mjs — refresh the vendored AK kernel headers.
 *
 * This repo is STANDALONE: it does not need the firmware repo checked out. A
 * snapshot of the 7 public kernel headers is committed under vendor/ak-inc/, and
 * the corpus is built from that snapshot. Run this script to update the snapshot
 * to a given release tag (downloads from GitHub raw; needs network).
 *
 *   node scripts/fetch-headers.mjs              # default tag (AK_TAG env or v1.3)
 *   node scripts/fetch-headers.mjs v1.4         # a specific tag
 *   AK_TAG=main node scripts/fetch-headers.mjs  # a branch
 *
 * After running, review `git diff vendor/ak-inc/`, then `npm run build:corpus`.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.AK_REPO ?? "the-ak-foundation/ak-base-kit-stm32l151";
// Keep in sync with AK_DEFAULT_TAG in src/core/server.ts (the version start_ak_project serves).
const DEFAULT_TAG = "v1.3";
const HEADERS = ["ak.h", "task.h", "message.h", "timer.h", "fsm.h", "tsm.h", "port.h"];

const tag = process.argv[2] ?? process.env.AK_TAG ?? DEFAULT_TAG;
const VENDOR_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "vendor", "ak-inc");

async function fetchHeader(name) {
  const url = `https://raw.githubusercontent.com/${REPO}/${tag}/application/sources/ak/inc/${name}`;
  const res = await fetch(url, { headers: { "User-Agent": "ak-mcp-fetch-headers" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  mkdirSync(VENDOR_DIR, { recursive: true });
  console.log(`Fetching ${HEADERS.length} headers from ${REPO}@${tag} ...`);
  for (const name of HEADERS) {
    const text = await fetchHeader(name);
    writeFileSync(join(VENDOR_DIR, name), text);
    console.log(`  vendor/ak-inc/${name}  (${text.length} bytes)`);
  }
  writeFileSync(
    join(VENDOR_DIR, "SOURCE.txt"),
    [
      "AK kernel headers vendored for the ak-mcp documentation build.",
      "Do not edit by hand — refresh with: npm run fetch-headers [<tag>]",
      "",
      `repo: ${REPO}`,
      `tag:  ${tag}`,
      `path: application/sources/ak/inc/`,
      `fetched: ${new Date().toISOString()}`,
      "",
    ].join("\n")
  );
  console.log(`Done. Now run: npm run build:corpus  (and commit vendor/ak-inc/)`);
}

main().catch((err) => {
  console.error(`fetch-headers failed: ${err.message}`);
  process.exit(1);
});
