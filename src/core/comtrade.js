// UN Comtrade: which countries supply a product (HS headings) to the destination, by value.
// No supplier names — it tells the agent where to look and backs the scoring with official statistics.
// Uses the free preview endpoint, or the keyed data endpoint when COMTRADE_API_KEY is set.
import { config } from './config.js';
import { fetchJson } from './fetch-json.js';

// UN M49 codes used as reporter/partner.
export const M49 = { PF: 258, US: 842, FR: 251 };
// Comtrade short names → the names used by our distance bands.
const RENAME = { USA: 'United States', 'Türkiye': 'Turkey', 'Rep. of Korea': 'South Korea', 'China, Hong Kong SAR': 'Hong Kong', 'Viet Nam': 'Vietnam' };

const years = () => { const y = new Date().getUTCFullYear(); return [y - 1, y - 2, y - 3]; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(params, period) {
  const keyed = !!config.comtrade.apiKey;
  const url = new URL(`${config.comtrade.baseUrl}${keyed ? '/data/v1/get' : '/public/v1/preview'}/C/A/HS`);
  // Totals only (all transport modes, all customs procedures, no second partner) so rows are not double counted.
  for (const [k, v] of Object.entries({ ...params, period, partner2Code: 0, motCode: 0, customsCode: 'C00', includeDesc: 'true' })) url.searchParams.set(k, String(v));
  const opts = { headers: keyed ? { 'Ocp-Apim-Subscription-Key': config.comtrade.apiKey } : {}, timeoutMs: config.comtrade.timeoutMs, label: 'UN Comtrade' };
  for (let attempt = 0; ; attempt++) {
    try { return (await fetchJson(url, opts))?.data ?? []; } catch (e) {
      if (!/ 429:/.test(e.message) || attempt >= 2) throw e;
      await pause(1200 * (attempt + 1)); // the free preview allows about one request per second
    }
  }
}

// The keyed endpoint takes several years at once; the free preview takes one, so walk back from the latest.
async function query(params) {
  if (config.comtrade.apiKey) return get(params, years().join(','));
  for (const y of years()) {
    const rows = await get(params, y);
    if (rows.some((r) => (r.primaryValue ?? 0) > 0)) return rows;
  }
  return [];
}

/** Aggregate rows of the most recent year by origin country (the side given by `countryField`). */
export function topOrigins(rows, countryField) {
  // Drop the World total and "nes" buckets (Areas, nes / Other ..., nes): they are not countries.
  const valid = rows.filter((r) => r[countryField] && r[`${countryField.replace('Desc', 'Code')}`] !== 0 && !/, nes$/.test(r[countryField]) && (r.primaryValue ?? 0) > 0);
  if (!valid.length) return { period: null, origins: [] };
  const period = Math.max(...valid.map((r) => Number(r.period)));
  const byCountry = new Map();
  for (const r of valid.filter((x) => Number(x.period) === period)) {
    const name = RENAME[r[countryField]] ?? r[countryField];
    const cur = byCountry.get(name) ?? { country: name, valueUsd: 0, netKg: 0 };
    cur.valueUsd += r.primaryValue; cur.netKg += r.netWgt ?? 0;
    byCountry.set(name, cur);
  }
  const total = [...byCountry.values()].reduce((a, x) => a + x.valueUsd, 0);
  const origins = [...byCountry.values()]
    .map((o) => ({ ...o, valueUsd: Math.round(o.valueUsd), share: Math.round((o.valueUsd / total) * 100), usdPerKg: o.netKg ? Math.round((o.valueUsd / o.netKg) * 100) / 100 : null }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  return { period, origins };
}

/** Where does `destination` import these HS headings from? Falls back to partners' reported exports (mirror data). */
export async function importOrigins(hsCodes, destination = 'PF') {
  const code = M49[destination];
  if (!code || !hsCodes?.length) return null;
  const cmdCode = hsCodes.join(',');
  let r = topOrigins(await query({ reporterCode: code, flowCode: 'M', cmdCode }), 'partnerDesc');
  let mirror = false;
  if (!r.origins.length) {
    r = topOrigins(await query({ partnerCode: code, flowCode: 'X', cmdCode }), 'reporterDesc');
    mirror = true;
  }
  return { destination, hsCodes, period: r.period, origins: r.origins.slice(0, 5), mirror, source: 'un-comtrade' };
}
