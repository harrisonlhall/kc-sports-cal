const MAX = 8;
let active = 0;
const queue = [];

function schedule(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          const next = queue.shift();
          if (next) next();
        });
    };
    if (active < MAX) run();
    else queue.push(run);
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * One HTTP attempt. Retries and host rotation live with the callers so a
 * 403 from one host does not burn the backoff before the mirror is tried.
 */
export function fetchOnce(url, { headers, timeoutMs = 20000 } = {}) {
  return schedule(async () => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, url };
    } catch (error) {
      return { ok: false, status: 0, text: "", url, error: error?.message || String(error) };
    }
  });
}

export async function getJsonWithHosts(buildUrl, hosts, headers) {
  let lastError = "no response";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const host of hosts) {
      const url = buildUrl(host);
      const res = await fetchOnce(url, { headers });
      if (res.ok) {
        try {
          return { ok: true, status: res.status, data: JSON.parse(res.text), host, url };
        } catch {
          lastError = `invalid JSON from ${host}`;
          continue;
        }
      }
      lastError = res.error || `HTTP ${res.status} from ${host}`;
      if (res.status === 404) return { ok: true, status: 404, data: null, host, url, empty: true };
    }
    if (attempt < 2) await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 200));
  }
  return { ok: false, status: 0, data: null, error: lastError };
}
