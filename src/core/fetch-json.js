// fetch + timeout + JSON, shared by the live data adapters.
export async function fetchJson(url, { headers = {}, timeoutMs = 8000, label = 'API' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${label} ${res.status}: ${body?.message || body?.error?.message || res.statusText}`);
    return body;
  } finally { clearTimeout(t); }
}
