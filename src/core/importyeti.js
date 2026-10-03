// Trade-data source adapter. Live mode calls the ImportYeti API (US customs bills of lading);
// demo mode serves bundled fictional fixtures with the same normalized shape.
// Every function returns normalized objects so the rest of the agent never depends on the raw API.

import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';

// Per-request data scope: tenants without the live_data feature always get demo data,
// so anonymous/community traffic can never spend the operator's ImportYeti credits.
export const dataScope = new AsyncLocalStorage();
export const dataMode = () => dataScope.getStore()?.mode ?? config.dataMode;
import { suppliersByProduct, buyersByProduct, aliases } from '../../data/fixtures.js';

export function normalizeProduct(q) {
  const k = String(q || '').trim().toLowerCase();
  return aliases[k] ?? k;
}

async function iy(path, params = {}) {
  const url = new URL(config.importYeti.baseUrl + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.importYeti.timeoutMs);
  try {
    const res = await fetch(url, { headers: { IYApiKey: config.importYeti.apiKey, Accept: 'application/json' }, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`ImportYeti ${res.status}: ${body?.message || res.statusText}`);
    return body;
  } finally { clearTimeout(t); }
}

const rows = (b) => b?.data?.data ?? b?.data ?? b?.results ?? [];
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// Field names below are the ones the live API actually returns (checked 2026-09-27):
// - GET /product/{p}/suppliers → supplier_link, supplier_name, supplier_country_code, supplier_total_shipments,
//   matching_shipments, product_description[], customer_companies[]  (no 12-month count, no last date)
// - GET /supplier/{slug}      → title, address_country, website, other_websites[], phone_number, total_shipments,
//   companies_table[].shipments_12m, recent_bols[].date_formatted (DD/MM/YYYY), date_range.end_date, hs_codes[]
// - GET /product/{p}/companies → company_link, company_name, company_total_shipments, matching_shipments, company_suppliers[]
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryFromCode = (code) => { try { return code ? regionNames.of(String(code).toUpperCase()) : null; } catch { return null; } };
const slugFromLink = (link) => (link ? String(link).split('/').filter(Boolean).pop() : null);
const isoFromDmy = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (d ?? null); };
const sum = (list, key) => (Array.isArray(list) && list.length ? list.reduce((a, x) => a + (Number(x?.[key]) || 0), 0) : null);
// `website` is sometimes truncated ("o-i."); fall back to the most frequent entry of other_websites.
const cleanSite = (r) => {
  const ok = (w) => typeof w === 'string' && /^[\w-]+(\.[\w-]+)+$/.test(w.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  if (ok(r.website)) return r.website;
  const alt = [...(r.other_websites ?? [])].sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0)).find((x) => ok(x.website));
  return alt?.website ?? null;
};

export function normSupplier(r) {
  return {
    slug: r.slug ?? slugFromLink(r.supplier_link) ?? null,
    name: r.name ?? r.supplier_name ?? r.title ?? 'Unknown supplier',
    country: r.country ?? r.address_country ?? countryFromCode(r.supplier_country_code ?? r.address_country_code),
    city: r.city ?? null,
    shipments12m: num(r.shipments12m ?? sum(r.companies_table, 'shipments_12m')),
    totalShipments: num(r.totalShipments ?? r.total_shipments ?? r.supplier_total_shipments),
    lastShipment: r.lastShipment ?? isoFromDmy(r.recent_bols?.[0]?.date_formatted ?? r.date_range?.end_date),
    topProducts: r.topProducts ?? r.product_description ?? [],
    website: cleanSite(r), email: r.email ?? null, phone: r.phone ?? r.phone_number ?? null,
    moq: r.moq ?? null, unitPriceUsd: r.unitPriceUsd ?? null, leadTimeDays: r.leadTimeDays ?? null,
    customers: r.customers ?? r.customer_companies ?? (r.companies_table ?? []).map((c) => c.company_name),
    hsCodes: r.hsCodes ?? (r.hs_codes ?? []).map((h) => h.hs_code ?? h),
  };
}

/** Merge a profile into a search row without letting unknown (null/empty) profile fields erase known ones. */
export function mergeSupplier(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v;
  return out;
}

/** Rank overseas suppliers that ship a product to the US. */
export async function rankSuppliers(product, { limit = 5, country } = {}) {
  const p = normalizeProduct(product);
  let list;
  if (dataMode() === 'live') {
    const b = await iy(`/product/${encodeURIComponent(p)}/suppliers`, { page_size: Math.min(limit * 2, 50) });
    list = rows(b).map(normSupplier);
  } else {
    list = (suppliersByProduct[p] ?? fuzzy(suppliersByProduct, p) ?? []).map(normSupplier);
  }
  if (country) list = list.filter((s) => (s.country || '').toLowerCase().includes(country.toLowerCase()));
  return { product: p, source: dataMode(), suppliers: list.slice(0, limit) };
}

// The companies search has no state, origin countries or 12-month count: only all-time and matching volumes.
export function normBuyer(r) {
  return {
    slug: r.slug ?? slugFromLink(r.company_link), name: r.name ?? r.company_name ?? 'Unknown',
    state: r.state ?? null, shipments12m: num(r.shipments12m),
    matchingShipments: num(r.matching_shipments), totalShipments: num(r.company_total_shipments),
    topOrigins: r.topOrigins ?? [], topSuppliers: r.company_suppliers ?? [], website: r.website ?? null,
  };
}

/** Rank US companies importing a product — export prospecting. */
export async function rankBuyers(product, { limit = 5 } = {}) {
  const p = normalizeProduct(product);
  if (dataMode() === 'live') {
    const b = await iy(`/product/${encodeURIComponent(p)}/companies`, { page_size: Math.min(limit, 50) });
    return {
      product: p, source: 'live',
      buyers: rows(b).slice(0, limit).map(normBuyer),
    };
  }
  return { product: p, source: 'demo', buyers: (buyersByProduct[p] ?? fuzzy(buyersByProduct, p) ?? []).slice(0, limit) };
}

/** Full profile for one supplier. */
export async function supplierProfile(slug) {
  if (dataMode() === 'live') return normSupplier({ slug, ...(await iy(`/supplier/${encodeURIComponent(slug)}`)).data });
  for (const list of Object.values(suppliersByProduct)) {
    const s = list.find((x) => x.slug === slug);
    if (s) return normSupplier(s);
  }
  return null;
}

/** Raw shipment search (PowerQuery syntax supported in live mode). */
export async function searchShipments(query, { pageSize = 10, startDate, endDate } = {}) {
  if (dataMode() === 'live') {
    const b = await iy('/powerquery/us-import/bols', { product_description: query, page_size: pageSize, start_date: startDate, end_date: endDate });
    return {
      source: 'live', total: b?.data?.totalCount ?? null, creditsRemaining: b?.creditsRemaining ?? null,
      shipments: rows(b).map((r) => ({
        bol: r.bol_number, date: r.arrival_date, importer: r.company_name, supplier: r.supplier_name,
        country: r.supplier_country, description: r.product_description, hs: r.hs_code, port: r.entry_port, weightKg: num(r.weight),
      })),
    };
  }
  const p = normalizeProduct(query);
  const sups = suppliersByProduct[p] ?? fuzzy(suppliersByProduct, p) ?? [];
  const shipments = sups.flatMap((s, i) => (s.customers.length ? s.customers : ['Undisclosed importer']).map((c, j) => ({
    bol: `DEMO${String(100000 + i * 37 + j * 11)}`, date: s.lastShipment, importer: c, supplier: s.name, country: s.country,
    description: s.topProducts[0], hs: s.hsCodes[0] ?? null, port: ['Los Angeles', 'Long Beach', 'Oakland', 'Newark'][(i + j) % 4], weightKg: 800 + i * 350,
  })));
  return { source: 'demo', total: shipments.length, creditsRemaining: null, shipments: shipments.slice(0, pageSize) };
}

function fuzzy(map, p) {
  const key = Object.keys(map).find((k) => p.includes(k) || k.includes(p) || k.split(' ').some((w) => w.length > 3 && p.includes(w)));
  return key ? map[key] : null;
}

export const knownDemoProducts = () => ({ supply: Object.keys(suppliersByProduct), exportMarkets: Object.keys(buyersByProduct) });
