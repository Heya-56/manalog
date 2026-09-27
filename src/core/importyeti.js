// Trade-data source adapter. Live mode calls the ImportYeti API (US customs bills of lading);
// demo mode serves bundled fictional fixtures with the same normalized shape.
// Every function returns normalized objects so the rest of the agent never depends on the raw API.

import { config } from './config.js';
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

function normSupplier(r) {
  return {
    slug: r.slug ?? r.supplier_slug ?? r.key ?? null,
    name: r.name ?? r.supplier_name ?? r.title ?? 'Unknown supplier',
    country: r.country ?? r.supplier_country ?? null,
    city: r.city ?? null,
    shipments12m: num(r.shipments12m ?? r.shipments_last_12m ?? r.total_shipments ?? r.shipments ?? r.count),
    lastShipment: r.lastShipment ?? r.most_recent_shipment ?? r.last_shipment_date ?? null,
    topProducts: r.topProducts ?? r.product_descriptions ?? [],
    website: r.website ?? null, email: r.email ?? null, phone: r.phone ?? null,
    moq: r.moq ?? null, unitPriceUsd: r.unitPriceUsd ?? null, leadTimeDays: r.leadTimeDays ?? null,
    customers: r.customers ?? (r.top_customers ?? []).map((c) => c.name ?? c),
    hsCodes: r.hsCodes ?? (r.hs_codes ?? []),
  };
}

/** Rank overseas suppliers that ship a product to the US. */
export async function rankSuppliers(product, { limit = 5, country } = {}) {
  const p = normalizeProduct(product);
  let list;
  if (config.dataMode === 'live') {
    const b = await iy(`/product/${encodeURIComponent(p)}/suppliers`, { page_size: Math.min(limit * 2, 50) });
    list = rows(b).map(normSupplier);
  } else {
    list = (suppliersByProduct[p] ?? fuzzy(suppliersByProduct, p) ?? []).map(normSupplier);
  }
  if (country) list = list.filter((s) => (s.country || '').toLowerCase().includes(country.toLowerCase()));
  return { product: p, source: config.dataMode, suppliers: list.slice(0, limit) };
}

/** Rank US companies importing a product — export prospecting. */
export async function rankBuyers(product, { limit = 5 } = {}) {
  const p = normalizeProduct(product);
  if (config.dataMode === 'live') {
    const b = await iy(`/product/${encodeURIComponent(p)}/companies`, { page_size: Math.min(limit, 50) });
    return {
      product: p, source: 'live',
      buyers: rows(b).slice(0, limit).map((r) => ({
        slug: r.slug ?? r.company_slug ?? null, name: r.name ?? r.company_name ?? 'Unknown',
        state: r.state ?? null, shipments12m: num(r.shipments12m ?? r.total_shipments ?? r.count),
        topOrigins: r.topOrigins ?? r.supplier_countries ?? [], website: r.website ?? null,
      })),
    };
  }
  return { product: p, source: 'demo', buyers: (buyersByProduct[p] ?? fuzzy(buyersByProduct, p) ?? []).slice(0, limit) };
}

/** Full profile for one supplier. */
export async function supplierProfile(slug) {
  if (config.dataMode === 'live') return normSupplier({ slug, ...(await iy(`/supplier/${encodeURIComponent(slug)}`)).data });
  for (const list of Object.values(suppliersByProduct)) {
    const s = list.find((x) => x.slug === slug);
    if (s) return normSupplier(s);
  }
  return null;
}

/** Raw shipment search (PowerQuery syntax supported in live mode). */
export async function searchShipments(query, { pageSize = 10, startDate, endDate } = {}) {
  if (config.dataMode === 'live') {
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
