import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Polite, disk-cached HTTP fetching for the importer.
 *
 * Three deliberate constraints, because this hits a public college catalog:
 *  - responses are cached to disk, so re-runs and development iterations do not
 *    re-request anything;
 *  - requests are serialized with a delay between them, never concurrent;
 *  - the User-Agent identifies the project rather than impersonating a browser.
 *
 * smc.edu/robots.txt permits crawling (`Allow: /` for the wildcard agent) and
 * catalog.smc.edu serves no robots.txt. This importer is still written to be
 * gentle: it is a once-per-catalog-year job, not a live dependency.
 */

const CACHE_DIR = resolve(import.meta.dirname, "../../.cache/smc");
const USER_AGENT = "smc-ed-planner-importer/0.1 (course catalog import; contact: repository owner)";

export type FetchOptions = {
  /** Milliseconds to wait between live requests. */
  delayMs?: number;
  /** Ignore any cached copy and re-request. */
  refresh?: boolean;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

let lastRequestAt = 0;

function cachePathFor(url: string): string {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return resolve(CACHE_DIR, `${digest}.html`);
}

export function isCached(url: string): boolean {
  return existsSync(cachePathFor(url));
}

export async function fetchCached(url: string, options: FetchOptions = {}): Promise<string> {
  const { delayMs = 1000, refresh = false } = options;
  const path = cachePathFor(url);

  if (!refresh && existsSync(path)) {
    return readFileSync(path, "utf8");
  }

  const sinceLast = Date.now() - lastRequestAt;
  if (lastRequestAt > 0 && sinceLast < delayMs) {
    await sleep(delayMs - sinceLast);
  }

  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  lastRequestAt = Date.now();

  if (!response.ok) {
    throw new Error(`GET ${url} → HTTP ${response.status}`);
  }

  const body = await response.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, body, "utf8");

  return body;
}
