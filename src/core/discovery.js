// Supplier discovery across sources, cheapest and most proven first:
//   0. plan the search (precise English terms + HS codes, from Bedrock or the dictionary)
//   1. US customs bills of lading (ImportYeti) — proven exporters; extra terms only if the first is thin
//   2. web search (Brave) — manufacturers/wholesalers worldwide, when customs data is thin; homepages read for contacts
//   3. AliExpress — small-lot offers with real prices shipping to the destination
//   4. UN Comtrade — which countries actually supply the destination (scoring bonus, spoken context)
// Demo mode (and every tenant without live data) only uses the bundled fixtures: no external call at all.
import { rankSuppliers, dataMode } from './importyeti.js';
import { planSearch } from './terms.js';
import { webSearchEnabled, searchWebSuppliers } from './websearch.js';
import { aliexpressEnabled, searchAliExpress } from './aliexpress.js';
import { importOrigins } from './comtrade.js';
import { scrapeSupplierSite } from './scraper.js';

const ENOUGH = 3;
const SHIP_TO = { PF: 'PF', US: 'US', FR: 'FR' };

export async function discoverSuppliers(product, { limit = 8, destination = 'PF', country, enrichWeb = true } = {}) {
  const steps = [];
  if (dataMode() !== 'live') {
    const r = await rankSuppliers(product, { limit, country });
    steps.push(`Queried demo US customs data: ${r.suppliers.length} suppliers ship "${r.product}"`);
    return { product: r.product, source: r.source, suppliers: r.suppliers.map((s) => ({ ...s, source: 'customs' })), plan: null, origins: null, counts: { customs: r.suppliers.length }, errors: [], steps };
  }

  const plan = await planSearch(product);
  steps.push(`Search terms (${plan.by}): ${plan.terms.join(', ')}${plan.hsCodes.length ? ` · HS ${plan.hsCodes.join(', ')}` : ''}`);
  const errors = [];
  const soft = (label) => (e) => { errors.push(`${label}: ${e.message}`); return null; };

  // Comtrade runs in parallel with everything else (free, independent).
  const originsP = plan.hsCodes.length ? importOrigins(plan.hsCodes, destination).catch(soft('UN Comtrade')) : Promise.resolve(null);

  // 1. Customs: first term, then the other terms together only if results are thin (each query costs credits).
  const customs = [];
  const seen = new Set();
  const addCustoms = (r, term) => { for (const s of r?.suppliers ?? []) { const k = s.slug ?? s.name; if (!seen.has(k)) { seen.add(k); customs.push({ ...s, source: 'customs', matchedTerm: term }); } } };
  const [first, ...rest] = plan.terms;
  addCustoms(await rankSuppliers(first, { limit, country }).catch(soft('ImportYeti')), first);
  if (customs.length < ENOUGH && rest.length) {
    const more = await Promise.all(rest.map((t) => rankSuppliers(t, { limit, country }).catch(soft('ImportYeti'))));
    more.forEach((r, i) => addCustoms(r, rest[i]));
  }
  steps.push(`US customs data: ${customs.length} proven exporters`);

  // 2 + 3 in parallel.
  const webP = customs.length < ENOUGH && webSearchEnabled() ? searchWebSuppliers(first, { limit: 5 }).catch(soft('Web search')) : Promise.resolve(null);
  const aliP = aliexpressEnabled() ? searchAliExpress(first, { limit: 4, shipTo: SHIP_TO[destination] ?? 'PF' }).catch(soft('AliExpress')) : Promise.resolve(null);
  let [web, ali, origins] = await Promise.all([webP, aliP, originsP]);
  web = (web ?? []).filter((s) => !country || (s.country ?? '').toLowerCase().includes(country.toLowerCase()));
  ali = ali ?? [];

  if (web.length && enrichWeb) {
    // Read the homepage of the first web leads for a contact email (robots.txt respected, no AI pass to save cost).
    await Promise.all(web.slice(0, 3).map(async (s) => {
      const page = await scrapeSupplierSite(s.website, { ai: false }).catch(() => null);
      if (page?.allowed) { s.email = page.emails?.[0] ?? null; s.phone = page.phones?.[0] ?? null; }
    }));
  }
  if (webSearchEnabled() && customs.length < ENOUGH) steps.push(`Web search: ${web.length} manufacturers/wholesalers${enrichWeb && web.length ? ', homepages read for contacts' : ''}`);
  if (aliexpressEnabled()) steps.push(`AliExpress: ${ali.length} small-lot offers shipping to ${destination}`);
  if (origins?.origins?.length) steps.push(`UN Comtrade ${origins.period}${origins.mirror ? ' (partner data)' : ''}: ${destination} imports mostly from ${origins.origins.slice(0, 3).map((o) => `${o.country} ${o.share}%`).join(', ')}`);
  if (errors.length) steps.push(`Skipped: ${errors.join(' · ')}`);

  return {
    product: plan.product, source: 'live', suppliers: [...customs, ...web, ...ali], plan, origins,
    counts: { customs: customs.length, web: web.length, aliexpress: ali.length }, errors, steps,
  };
}
