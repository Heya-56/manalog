import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/core/config.js';
import { planSearch, _resetTermsCacheForTests } from '../src/core/terms.js';
import { discoverSuppliers } from '../src/core/discovery.js';
import { signParams, normProduct } from '../src/core/aliexpress.js';
import { normWebResult } from '../src/core/websearch.js';
import { topOrigins } from '../src/core/comtrade.js';
import { scoreSupplier } from '../src/core/scoring.js';
import { dataScope } from '../src/core/importyeti.js';

// Fake upstream APIs, keyed by host. Shapes mirror the documented responses; values are made up.
function fakeFetch(calls, { customs = [] } = {}) {
  return async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.hostname === 'data.importyeti.com') return json({ data: { data: customs } });
    if (url.hostname === 'api.search.brave.com') {
      return json({ web: { results: [
        { title: 'Example Tattoo Supply Co. - Wholesale Needles', url: 'https://www.example-tattoo.cn/', description: 'Cartridges and needles, OEM' },
        { title: 'Tattoo - Wikipedia', url: 'https://en.wikipedia.org/wiki/Tattoo', description: 'not a supplier' },
        { title: 'Kiwi Ink Wholesale | Home', url: 'https://kiwi-ink.example.nz/shop', description: 'NZ distributor' },
      ] } });
    }
    if (url.hostname === 'api-sg.aliexpress.com') {
      return json({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 200, result: { products: { product: [
        { shop_id: 101, product_title: '100pcs tattoo cartridge needles', target_sale_price: '12.90', lastest_volume: 830, evaluate_rate: '97.1%', promotion_link: 'https://s.click.aliexpress.com/e/x', shop_url: 'https://www.aliexpress.com/store/101' },
        { shop_id: 102, product_title: 'no price item', target_sale_price: '', lastest_volume: 3 },
        { shop_id: 103, product_title: 'bad link', target_sale_price: '4.10', promotion_link: 'javascript:alert(1)' },
      ] } } } } });
    }
    if (url.hostname === 'comtradeapi.un.org') {
      return json({ data: [
        { period: 2024, partnerCode: 0, partnerDesc: 'World', primaryValue: 1000, netWgt: 10 },
        { period: 2024, partnerCode: 251, partnerDesc: 'France', primaryValue: 600, netWgt: 4 },
        { period: 2024, partnerCode: 156, partnerDesc: 'China', primaryValue: 300, netWgt: 5 },
        { period: 2024, partnerCode: 554, partnerDesc: 'New Zealand', primaryValue: 100, netWgt: 1 },
        { period: 2023, partnerCode: 156, partnerDesc: 'China', primaryValue: 9999, netWgt: 1 },
      ] });
    }
    throw new Error(`unexpected host ${url.hostname}`);
  };
}

async function withLive(fn, opts) {
  const prev = { mode: config.dataMode, bedrock: config.bedrock.enabled, brave: config.webSearch.apiKey, ak: config.aliexpress.appKey, as: config.aliexpress.appSecret };
  config.dataMode = 'live'; config.bedrock.enabled = false;
  config.webSearch.apiKey = 'test-brave'; config.aliexpress.appKey = 'test-app'; config.aliexpress.appSecret = 'test-secret';
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = fakeFetch(calls, opts);
  _resetTermsCacheForTests();
  try { return await dataScope.run({ mode: 'live' }, () => fn(calls)); } finally {
    globalThis.fetch = realFetch;
    Object.assign(config, { dataMode: prev.mode }); config.bedrock.enabled = prev.bedrock;
    config.webSearch.apiKey = prev.brave; config.aliexpress.appKey = prev.ak; config.aliexpress.appSecret = prev.as;
  }
}

test('search plan: French words become precise English terms and HS codes (dictionary)', async () => {
  _resetTermsCacheForTests();
  const tattoo = await planSearch('fournitures de tatouage', { useAi: false });
  assert.deepEqual(tattoo.terms.slice(0, 2), ['tattoo needles', 'tattoo ink']);
  assert.ok(tattoo.regulated, 'tattoo supplies carry a regulation note');
  assert.deepEqual((await planSearch('fil à tricoter', { useAi: false })).terms[0], 'yarn');
  assert.deepEqual((await planSearch('coquillages', { useAi: false })).hsCodes, ['0508']);
  assert.equal((await planSearch('nacre brute', { useAi: false })).terms[0], 'mother of pearl shell');
  assert.equal((await planSearch('ukulele strings', { useAi: false })).by, 'as-is');
});

test('discovery: thin customs data falls back to web + AliExpress, weighted by UN Comtrade', async () => {
  await withLive(async (calls) => {
    const r = await discoverSuppliers('fournitures de tatouage', { destination: 'PF', enrichWeb: false });
    const hosts = calls.map((u) => u.hostname);
    assert.equal(hosts.filter((h) => h === 'data.importyeti.com').length, 3, 'all 3 terms tried when customs is empty');
    assert.equal(r.counts.customs, 0);
    assert.equal(r.counts.web, 2, 'Wikipedia is filtered out');
    assert.equal(r.counts.aliexpress, 2, 'offers without a price are dropped');
    assert.equal(r.suppliers.find((s) => s.source === 'web').country, 'China', 'country from the .cn domain');
    const ali = r.suppliers.find((s) => s.source === 'aliexpress');
    assert.equal(ali.unitPriceUsd, 12.9);
    assert.equal(r.suppliers.find((s) => s.name === 'AliExpress store 103').url, null, 'non-http links are dropped');
    assert.deepEqual(r.origins.origins.map((o) => [o.country, o.share]), [['France', 60], ['China', 30], ['New Zealand', 10]], 'latest year only, World excluded');
    const aliCall = calls.find((u) => u.hostname === 'api-sg.aliexpress.com');
    assert.equal(aliCall.searchParams.get('ship_to_country'), 'PF');
    assert.match(aliCall.searchParams.get('sign'), /^[0-9A-F]{64}$/);
    assert.ok(r.plan.regulated);
  });
});

test('full mission on web + AliExpress leads: landed cost from the offer price, sources in the speech', async () => {
  const { executeTool } = await import('../src/mcp/server.js');
  const { resolveContext } = await import('../src/core/tenants.js');
  const { _resetStoreForTests } = await import('../src/core/store.js');
  _resetStoreForTests();
  await withLive(async () => {
    const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'tattoo' });
    const r = await executeTool(ctx, 'start_sourcing_mission', { product: 'aiguilles de tatouage', quantity: 20, language: 'fr' });
    assert.ok(!r.error, r.speech);
    assert.match(r.speech, /0 proven exporters from US customs, 2 from the web and 2 AliExpress offers/);
    assert.match(r.speech, /Note: Tattoo inks are regulated/);
    const ali = r.data.shortlist.find((s) => s.source === 'aliexpress');
    assert.ok(ali?.localUnit, 'AliExpress offers carry a real price, so a landed cost');
    assert.equal(ali.offer, '100pcs tattoo cartridge needles');
    assert.equal(r.data.input.requested, 'aiguilles de tatouage');
    assert.equal(r.data.origins.origins[0].country, 'France');
  });
});

test('discovery: enough customs results → no extra ImportYeti terms and no web search', async () => {
  const customs = ['a', 'b', 'c'].map((x) => ({ supplier_link: `/supplier/${x}`, supplier_name: `Exporter ${x}`, supplier_country_code: 'CN', supplier_total_shipments: 50 }));
  await withLive(async (calls) => {
    const r = await discoverSuppliers('glass bottle', { enrichWeb: false });
    const hosts = calls.map((u) => u.hostname);
    assert.equal(hosts.filter((h) => h === 'data.importyeti.com').length, 1, 'credits: one customs query is enough');
    assert.equal(hosts.includes('api.search.brave.com'), false);
    assert.equal(r.counts.customs, 3);
  }, { customs });
});

test('demo mode never calls the extra sources', async () => {
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; throw new Error('no network in demo'); };
  try {
    const r = await dataScope.run({ mode: 'demo' }, () => discoverSuppliers('glass bottle'));
    assert.ok(r.suppliers.length);
    assert.equal(n, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('scoring explains the source and rewards official origin countries', () => {
  const origins = [{ country: 'France', share: 60 }];
  const web = scoreSupplier(normWebResult({ title: 'Atelier Fil', url: 'https://atelier-fil.fr/' }), { destination: 'PF', origins });
  assert.match(web.reasons[0], /found on the web/);
  assert.ok(web.reasons.some((x) => /60% of PF imports .* France, UN Comtrade \(\+10\)/.test(x)));
  const ali = scoreSupplier(normProduct({ shop_id: 1, product_title: 'yarn', target_sale_price: '3.5', lastest_volume: 999 }), { destination: 'PF' });
  assert.match(ali.reasons[0], /999 recent orders on AliExpress/);
});

test('AliExpress signature: HMAC-SHA256 over sorted key+value pairs, uppercase hex', () => {
  const a = signParams({ b: '2', a: '1' }, 's');
  assert.equal(a, signParams({ a: '1', b: '2' }, 's'), 'order-independent');
  assert.match(a, /^[0-9A-F]{64}$/);
});

test('Comtrade mirror data aggregates by reporter', () => {
  const r = topOrigins([{ period: 2024, reporterCode: 156, reporterDesc: 'China', primaryValue: 50, netWgt: 10 }, { period: 2024, reporterCode: 842, reporterDesc: 'USA', primaryValue: 50, netWgt: 0 }], 'reporterDesc');
  assert.deepEqual(r.origins.map((o) => [o.country, o.share, o.usdPerKg]), [['China', 50, 5], ['United States', 50, null]]);
});
