// gta6-meme-x-01 entrypoint: hand the gate the post.
//
// The meme itself lives on X. POST.json, sitting in the bot directory next
// to this script, names that post, and the gate reads POST.json from the
// output directory — so this program's whole job is to check POST.json is
// well formed and then copy it across, byte for byte, untouched.
//
// Invocation matches the starter's contract:
//   node main.ts
// MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR override the source and output
// directories (the grader's container uses /bot and /output). When
// MAKEFUN_BOT_DIR is not set, the source is resolved relative to this
// script's own directory, which is where POST.json lives in the repo.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const POST_FILE = 'POST.json';
const X_POST_URL = /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/;

function fail(message: string): never {
  console.error(`gta6-meme-x-01: ${message}`);
  process.exit(1);
}

function sourceDir(): string {
  return process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url));
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

// Read POST.json and return the post URL it names, refusing anything that
// is not a JSON object holding an https://x.com/ status URL.
function readPostUrl(path: string): string {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read ${path} — POST.json must sit in the bot directory`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${path} is not valid JSON`);
  }

  const url = (parsed as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !X_POST_URL.test(url)) {
    fail(`${path} must look like {"url": "https://x.com/<user>/status/<id>"}`);
  }
  return url;
}

// The gate trusts whatever lands in the output directory, so do not just
// copy and hope: read both files back and refuse to report success unless
// the delivered bytes are exactly the source bytes.
function verifyDelivered(src: string, dst: string): void {
  let before: Buffer;
  let after: Buffer;
  try {
    before = readFileSync(src);
    after = readFileSync(dst);
  } catch (err) {
    fail(`could not read back the copy for verification: ${(err as Error).message}`);
  }
  if (!before.equals(after)) {
    fail(`verification failed: ${dst} differs from ${src}`);
  }
}

function main(): void {
  const src = join(sourceDir(), POST_FILE);
  const dst = join(outputDir(), POST_FILE);

  const url = readPostUrl(src);

  mkdirSync(outputDir(), { recursive: true });
  try {
    copyFileSync(src, dst);
  } catch (err) {
    fail(`could not copy ${src} to ${dst}: ${(err as Error).message}`);
  }
  verifyDelivered(src, dst);

  console.log(`gta6-meme-x-01: delivered POST.json to ${dst} (post: ${url})`);
}

main();
