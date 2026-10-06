// AliExpress affiliate API (aliexpress.affiliate.product.query): small-lot products with real prices and
// shipping to the destination — what a craft shop in Tahiti actually buys (yarn, beads, shells, tattoo supplies).
// Gateway: api-sg.aliexpress.com/sync, requests signed with HMAC-SHA256 over the sorted parameters.
import { createHmac } from 'node:crypto';
import { config } from './config.js';
import { fetchJson } from './fetch-json.js';

export const aliexpressEnabled = () => !!(config.aliexpress.appKey && config.aliexpress.appSecret);

/** Sign system + business parameters: HMAC-SHA256(secret, k1v1k2v2... sorted by key), uppercase hex. */
export function signParams(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

// Links are shown as clickable anchors: keep http(s) only.
const safeUrl = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch { return null; } };
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

/** Normalize one product into the supplier shape used by scoring (one offer = one candidate). */
export function normProduct(p) {
  const shop = p.shop_id ? `AliExpress store ${p.shop_id}` : 'AliExpress seller';
  return {
    slug: null, name: shop, country: null, city: null,
    shipments12m: null, totalShipments: null, lastShipment: null,
    orders: num(p.lastest_volume), rating: p.evaluate_rate ?? null,
    topProducts: [String(p.product_title ?? '').slice(0, 160)].filter(Boolean),
    website: safeUrl(p.shop_url), url: safeUrl(p.promotion_link ?? p.product_detail_url), image: safeUrl(p.product_main_image_url),
    email: null, phone: null, moq: 1, unitPriceUsd: num(p.target_sale_price ?? p.sale_price), leadTimeDays: null,
    customers: [], hsCodes: [], source: 'aliexpress',
  };
}

/** Search AliExpress offers shipping to `shipTo` (ISO-2), sorted by recent sales; one API call. */
export async function searchAliExpress(term, { limit = 5, shipTo = 'PF' } = {}) {
  const params = {
    app_key: config.aliexpress.appKey, method: 'aliexpress.affiliate.product.query', sign_method: 'sha256',
    timestamp: String(Date.now()), format: 'json', v: '2.0',
    keywords: term, page_no: '1', page_size: String(Math.min(20, limit * 2)), sort: 'LAST_VOLUME_DESC',
    target_currency: 'USD', target_language: 'EN', ship_to_country: shipTo,
    ...(config.aliexpress.trackingId ? { tracking_id: config.aliexpress.trackingId } : {}),
  };
  params.sign = signParams(params, config.aliexpress.appSecret);
  const url = new URL(config.aliexpress.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const b = await fetchJson(url, { timeoutMs: config.aliexpress.timeoutMs, label: 'AliExpress' });
  if (b?.error_response) throw new Error(`AliExpress: ${b.error_response.msg ?? b.error_response.code}`);
  const result = b?.aliexpress_affiliate_product_query_response?.resp_result?.result;
  const list = result?.products?.product ?? [];
  return list.map(normProduct).filter((s) => s.unitPriceUsd).slice(0, limit);
}
