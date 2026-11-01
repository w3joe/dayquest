const UA = "dayquest/0.1 (hackathon; https://github.com/w3joe/dayquest)";
const cache = new Map<string, Promise<unknown>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Nominatim's usage policy allows at most one request per second.
const MIN_GAP: Record<string, number> = { "nominatim.openstreetmap.org": 1100 };
const lastHit = new Map<string, number>();
async function throttle(host: string) {
  const gap = MIN_GAP[host];
  if (!gap) return;
  const wait = Math.max(0, (lastHit.get(host) ?? 0) + gap - Date.now());
  lastHit.set(host, Date.now() + wait);
  if (wait) await sleep(wait);
}

/** GET/POST JSON with a User-Agent (OSM services reject anonymous clients), timeout, backoff and an in-process cache. */
export function fetchJson<T>(url: string, init: RequestInit & { retries?: number; timeoutMs?: number; cacheKey?: string } = {}): Promise<T> {
  const key = init.cacheKey ?? `${init.method ?? "GET"} ${url} ${String(init.body ?? "")}`;
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const run = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= (init.retries ?? 2); attempt++) {
      try {
        await throttle(new URL(url).host);
        const response = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(init.timeoutMs ?? 15000) });
        if (response.ok && response.headers.get("content-type")?.includes("json")) return (await response.json()) as T;
        lastError = new Error(`${response.status} from ${new URL(url).host}`);
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) { lastError = error; }
      await sleep(600 * 2 ** attempt);
    }
    throw lastError instanceof Error ? lastError : new Error("Request failed");
  })();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}
