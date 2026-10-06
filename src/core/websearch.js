// Web search source (Brave Search API): finds manufacturers and wholesalers worldwide, including the small-lot
// suppliers that never show up in US customs data. Results are leads, not proof: the scorer says so out loud.
import { config } from './config.js';
import { fetchJson } from './fetch-json.js';

// Pages that are never a supplier's own site.
const SKIP = /(^|\.)(wikipedia\.org|youtube\.com|facebook\.com|instagram\.com|pinterest\.[a-z.]+|reddit\.com|quora\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|aliexpress\.[a-z.]+|temu\.com|wish\.com)$/i;

// Country-code TLD → country name used by the distance bands (only unambiguous ccTLDs).
const TLD = { cn: 'China', vn: 'Vietnam', in: 'India', id: 'Indonesia', ph: 'Philippines', th: 'Thailand', jp: 'Japan', kr: 'South Korea', tw: 'Taiwan', nz: 'New Zealand', au: 'Australia', fj: 'Fiji', fr: 'France', de: 'Germany', it: 'Italy', es: 'Spain', pt: 'Portugal', be: 'Belgium', uk: 'United Kingdom', tr: 'Turkey', mx: 'Mexico', cl: 'Chile', pk: 'Pakistan', bd: 'Bangladesh', lk: 'Sri Lanka', pf: 'French Polynesia', nc: 'New Caledonia' };

export const webSearchEnabled = () => !!config.webSearch.apiKey;

export function countryFromHost(host) {
  const tld = String(host).toLowerCase().split('.').pop();
  return TLD[tld] ?? null;
}

/** Normalize one Brave web result into the supplier shape used by scoring. Returns null for non-supplier pages. */
export function normWebResult(r) {
  let u;
  try { u = new URL(r.url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  if (SKIP.test(host)) return null;
  const name = String(r.title ?? host).replace(/<[^>]+>/g, '').split(/\s[|\-–—:]\s/)[0].trim().slice(0, 80) || host;
  return {
    slug: null, name, country: countryFromHost(host), city: null,
    shipments12m: null, totalShipments: null, lastShipment: null,
    topProducts: [String(r.description ?? '').replace(/<[^>]+>/g, '').slice(0, 160)].filter(Boolean),
    website: u.origin, url: u.toString(), email: null, phone: null,
    moq: null, unitPriceUsd: null, leadTimeDays: null, customers: [], hsCodes: [],
    source: 'web',
  };
}

/** Search the web for suppliers of `term`; one API call. */
export async function searchWebSuppliers(term, { limit = 6 } = {}) {
  const url = new URL(config.webSearch.baseUrl);
  url.searchParams.set('q', `${term} manufacturer wholesale supplier`);
  url.searchParams.set('count', '15');
  url.searchParams.set('safesearch', 'strict');
  const b = await fetchJson(url, { headers: { 'X-Subscription-Token': config.webSearch.apiKey }, timeoutMs: config.webSearch.timeoutMs, label: 'Web search' });
  const seen = new Set();
  const out = [];
  for (const r of b?.web?.results ?? []) {
    const s = normWebResult(r);
    if (!s || seen.has(s.website)) continue;
    seen.add(s.website); out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
