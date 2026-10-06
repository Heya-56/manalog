import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateLandedCost, guessCategory } from '../src/core/landed-cost.js';
import { scoreSupplier } from '../src/core/scoring.js';
import { robotsAllows, isPrivateIp, assertPublicUrl, extractFromHtml } from '../src/core/scraper.js';
import { resolveContext, hasFeature, _resetTenantsForTests } from '../src/core/tenants.js';
import { _resetStoreForTests } from '../src/core/store.js';
import { executeTool } from '../src/mcp/server.js';
import { runAgent } from '../src/agent/agent.js';
import { handler } from '../src/lambda.js';

test('landed cost: CIF + compounding VAT math is exact', () => {
  const r = estimateLandedCost({ unitPriceUsd: 1, quantity: 1000, unitWeightKg: 0.1, origin: 'Fiji', destination: 'PF', mode: 'sea', category: 'packaging' });
  // goods 1000, freight max(180, 0.9*100)=180, insurance 0.5% of 1180 = 5.9 → CIF 1185.9
  assert.equal(r.breakdownUsd.cif, 1185.9);
  const [duty, tdl, vat] = r.breakdownUsd.taxes;
  assert.equal(duty.amountUsd, 59.3); // 5% of CIF
  assert.equal(tdl.amountUsd, 118.59); // 10% of CIF
  assert.equal(vat.baseUsd, 1363.79); // VAT compounds on CIF + previous taxes
  assert.equal(r.local.currency, 'XPF');
  assert.ok(r.disclaimer, 'unverified rates must carry a disclaimer');
});

test('landed cost: unknown destination is rejected', () => {
  assert.throws(() => estimateLandedCost({ unitPriceUsd: 1, quantity: 1, origin: 'X', destination: 'ZZ' }), /Unknown destination/);
});

test('category guessing', () => {
  assert.equal(guessCategory('amber glass bottle'), 'packaging');
  assert.equal(guessCategory('vanilla beans'), 'food_raw');
  assert.equal(guessCategory('black pearl beads'), 'craft_materials');
});

test('scoring rewards proximity and MOQ fit', () => {
  const now = Date.parse('2026-09-27');
  const near = scoreSupplier({ shipments12m: 20, lastShipment: '2026-09-01', country: 'New Zealand', moq: 300, email: 'a@b.c' }, { destination: 'PF', quantity: 500, now });
  const far = scoreSupplier({ shipments12m: 20, lastShipment: '2026-09-01', country: 'Brazil', moq: 5000, email: 'a@b.c' }, { destination: 'PF', quantity: 500, now });
  assert.ok(near.score > far.score);
  assert.equal(near.band, 'near');
  assert.ok(near.reasons.length >= 5);
});

test('robots.txt parsing', () => {
  const r = 'User-agent: *\nDisallow: /private\nAllow: /private/catalog\n\nUser-agent: BadBot\nDisallow: /';
  assert.equal(robotsAllows(r, '/products'), true);
  assert.equal(robotsAllows(r, '/private/x'), false);
  assert.equal(robotsAllows(r, '/private/catalog/1'), true);
  assert.equal(robotsAllows('User-agent: ManaLogBot\nDisallow: /', '/anything', 'ManaLogBot'), false);
});

test('SSRF guard blocks private and metadata addresses', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.20.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1']) assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp('93.184.216.34'), false);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data'), /private/);
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), /http/);
  await assert.rejects(assertPublicUrl('http://localhost:8080'), /private/);
});

test('HTML extraction finds contacts and relevant links', () => {
  const html = '<title>Acme Bottles</title><meta name="description" content="Glass"><p>Call +33 4 78 00 00 00 or sales@acme.test</p><a href="/contact">Contact us</a><a href="/blog">Blog</a><img src="x@2x.png">';
  const r = extractFromHtml(html, 'https://acme.test/');
  assert.equal(r.title, 'Acme Bottles');
  assert.deepEqual(r.emails, ['sales@acme.test']);
  assert.equal(r.links.length, 1);
  assert.equal(r.links[0].url, 'https://acme.test/contact');
});

test('plans: enforced plans gate premium tools; self-host unlocks all', async () => {
  _resetStoreForTests(); _resetTenantsForTests();
  const anon = resolveContext({});
  assert.equal(anon.tenant.plan, 'community');
  assert.equal(hasFeature(anon, 'mission'), true); // not enforced by default (self-hosted)
  process.env.MANALOG_ENFORCE_PLANS = 'true';
  try {
    assert.equal(hasFeature(anon, 'mission'), false);
    const r = await executeTool(anon, 'start_sourcing_mission', { product: 'vanilla' });
    assert.equal(r.error, true);
    assert.match(r.speech, /Upgrade|self-host/);
    const judge = resolveContext({ apiKey: 'demo-judges-2026' });
    assert.equal(hasFeature(judge, 'mission'), true);
    assert.equal(resolveContext({ apiKey: 'wrong-key' }), null);
  } finally { delete process.env.MANALOG_ENFORCE_PLANS; }
});

test('missions persist across "sessions" for the same user and are isolated between users', async () => {
  _resetStoreForTests();
  const a = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'alice' });
  const b = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'bob' });
  const m = await executeTool(a, 'start_sourcing_mission', { product: 'coconut oil', quantity: 600, maxUnitLandedUsd: 20 });
  assert.equal(m.data.shortlist.length, 3);
  assert.ok(m.data.rfq.text.includes('coconut oil'));
  const again = await executeTool(resolveContext({ apiKey: 'demo-judges-2026', userHint: 'alice' }), 'get_mission', {});
  assert.equal(again.data.id, m.data.id);
  const other = await executeTool(b, 'list_missions', {});
  assert.equal(other.data.missions.length, 0);
});

test('offline voice router handles the demo script (EN + FR)', async () => {
  _resetStoreForTests();
  const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'voice' });
  const r1 = await runAgent(ctx, { text: 'Find me 2000 glass bottles for my monoi' });
  assert.equal(r1.calls[0].name, 'start_sourcing_mission');
  assert.equal(r1.calls[0].args.quantity, 2000);
  const r2 = await runAgent(ctx, { text: 'Send it' });
  assert.equal(r2.calls[0].name, 'approve_rfq');
  assert.ok(r2.calls[0].data.mailto.startsWith('mailto:'));
  const r3 = await runAgent(ctx, { text: 'Trouve-moi 1 500 flacons pour mon monoï' });
  assert.equal(r3.calls[0].args.quantity, 1500);
  assert.equal(r3.calls[0].args.language, 'fr');
  const r5 = await runAgent(ctx, { text: 'Find me 600 coconut oil' });
  assert.equal(r5.calls[0].args.quantity, 600, '3-digit quantities are not glued to the previous word');
  const r4 = await runAgent(ctx, { text: 'Who buys vanilla in the US?' });
  assert.equal(r4.calls[0].name, 'find_buyers');
});

test('offline router: French small talk, no word-for-word repetition', async () => {
  _resetStoreForTests();
  const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'chat' });
  const history = [];
  const replies = [];
  for (const text of ['blabla', 'blabla', 'blabla']) {
    const { reply } = await runAgent(ctx, { text, history });
    history.push({ role: 'user', text }, { role: 'assistant', text: reply });
    replies.push(reply);
  }
  assert.notEqual(replies[0], replies[1]);
  assert.notEqual(replies[1], replies[2]);
  const hi = await runAgent(ctx, { text: 'Bonjour' });
  assert.match(hi.reply, /Bonjour|Ia ora na/);
  assert.equal(hi.calls.length, 0);
  const who = await runAgent(ctx, { text: 'qui es-tu ?' });
  assert.match(who.reply, /fournisseurs|Essayez/, 'French question gets a French answer');
});

test('language switch: the chosen language wins over detection', async () => {
  _resetStoreForTests();
  const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'lang' });
  const fr = await runAgent(ctx, { text: 'hello', lang: 'fr' });
  assert.match(fr.reply, /Bonjour|Ia ora na/);
  const mission = await runAgent(ctx, { text: 'Find me 2000 glass bottles for my monoi', lang: 'fr' });
  assert.equal(mission.calls[0].args.language, 'fr', 'RFQ drafted in French');
  assert.match(mission.reply, /^C'est fait\. J'ai examiné/);
  const en = await runAgent(ctx, { text: 'bonjour', lang: 'en' });
  assert.match(en.reply, /^(Hi|Hello)/);
});

test('Lambda handler speaks MCP 2025-11-25 (initialize + tools/list)', async () => {
  const post = (body) => handler({
    rawPath: '/mcp', rawQueryString: '', requestContext: { http: { method: 'POST' } },
    headers: { host: 'x.lambda-url.us-east-1.on.aws', 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', 'x-api-key': 'demo-judges-2026' },
    body: JSON.stringify(body), isBase64Encoded: false,
  });
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.statusCode, 200);
  assert.equal(JSON.parse(init.body).result.protocolVersion, '2025-11-25');
  const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const names = JSON.parse(list.body).result.tools.map((t) => t.name);
  assert.ok(names.includes('start_sourcing_mission'));
  const bad = await handler({ rawPath: '/mcp', requestContext: { http: { method: 'POST' } }, headers: { host: 'x', 'x-api-key': 'nope' }, body: '{}' });
  assert.equal(bad.statusCode, 401);
});

test('cost guard: anonymous users never hit live data or Bedrock when plans are enforced', async () => {
  _resetStoreForTests(); _resetTenantsForTests();
  const { config } = await import('../src/core/config.js');
  const prev = { mode: config.dataMode, bedrock: config.bedrock.enabled };
  config.dataMode = 'live'; config.bedrock.enabled = true;
  process.env.MANALOG_ENFORCE_PLANS = 'true';
  const realFetch = globalThis.fetch;
  let liveCalls = 0;
  globalThis.fetch = async (...a) => { liveCalls++; return realFetch(...a); };
  try {
    const anon = resolveContext({});
    const r = await executeTool(anon, 'find_suppliers', { product: 'vanilla' });
    assert.equal(r.data.source, 'demo');
    assert.equal(liveCalls, 0, 'no ImportYeti call for community tenants');
    const a = await runAgent(anon, { text: 'Who buys vanilla in the US?' });
    assert.equal(a.engine, 'offline-router', 'no Bedrock for community tenants');
  } finally {
    globalThis.fetch = realFetch; config.dataMode = prev.mode; config.bedrock.enabled = prev.bedrock;
    delete process.env.MANALOG_ENFORCE_PLANS;
  }
});

test('live ImportYeti payloads normalize to country, 12-month volume, last shipment and website', async () => {
  const { normSupplier, normBuyer, mergeSupplier } = await import('../src/core/importyeti.js');
  // Anonymized extracts of real responses (2026-09-27): names, addresses and sites replaced, field names and formats kept.
  const searchRow = {
    supplier_link: '/supplier/andes-glass-s-a', supplier_name: 'Andes Glass S A', matching_shipments: 2908, specialization: 98.78,
    supplier_country_code: 'CO', supplier_address: 'Calle 1 Envigado - Colombia', supplier_total_shipments: 2944, supplier_experience: 3.3,
    product_description: ['Glass Bottles Cod'], customer_companies: ['Example Container Co', 'Example Brewery'], total_customers: 30, weight: 175293579, relevance_score: 99.53,
  };
  const profile = {
    title: 'Andes Glass S A', address_country: 'Colombia', address_country_code: 'CO', website: 'ex.', other_websites: [{ website: 'example.com', frequency: 6 }],
    phone_number: '0000000000', total_shipments: 2944, date_range: { start_date: '02/01/2015', end_date: '16/09/2026' },
    companies_table: [{ company_name: 'Example Container Co', shipments_12m: 74 }, { company_name: 'Example Brewery', shipments_12m: 14 }],
    recent_bols: [{ date_formatted: '16/09/2026' }, { date_formatted: '14/09/2026' }], hs_codes: [{ hs_code: '70', description: 'Glassware' }],
  };
  const row = normSupplier(searchRow);
  assert.equal(row.slug, 'andes-glass-s-a');
  assert.equal(row.country, 'Colombia');
  assert.equal(row.totalShipments, 2944);
  assert.equal(row.shipments12m, null, 'search rows carry no 12-month count');
  const full = mergeSupplier(row, normSupplier({ slug: row.slug, ...profile }));
  assert.equal(full.country, 'Colombia');
  assert.equal(full.shipments12m, 88);
  assert.equal(full.lastShipment, '2026-09-16');
  assert.equal(full.website, 'example.com', 'truncated website falls back to other_websites');
  assert.deepEqual(full.hsCodes, ['70']);
  const { scoreSupplier } = await import('../src/core/scoring.js');
  assert.ok(scoreSupplier(full, { destination: 'US', now: Date.parse('2026-09-27') }).score >= 60);
  // A profile with unknown fields must not erase what the search row knew.
  assert.equal(mergeSupplier(row, normSupplier({ slug: row.slug, title: 'Andes Glass S A' })).country, 'Colombia');
  const buyer = normBuyer({ company_link: '/company/example-import', company_name: 'Example Import', matching_shipments: 235, company_total_shipments: 352, company_suppliers: ['Example Export'], total_suppliers: 1 });
  assert.deepEqual([buyer.slug, buyer.matchingShipments, buyer.totalShipments, buyer.topSuppliers[0]], ['example-import', 235, 352, 'Example Export']);
});

test('target price fallback: landed cost computed when supplier has no price', async () => {
  _resetStoreForTests();
  const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'tp' });
  const r = await runAgent(ctx, { text: 'Find me 2000 glass bottles for my monoi at about 40 cents each' });
  assert.equal(r.calls[0].args.quantity, 2000);
  assert.equal(r.calls[0].args.targetUnitPriceUsd, 0.4);
  assert.ok(r.calls[0].data.shortlist.every((s) => s.localUnit), 'every shortlisted supplier has a landed cost');
});

test('dashboard: read-only summary of missions, KPIs and usage (no paid calls)', async () => {
  _resetStoreForTests();
  const ctx = resolveContext({ apiKey: 'demo-judges-2026', userHint: 'dash' });
  await runAgent(ctx, { text: 'Find me 2000 glass bottles for my monoi at about 40 cents each' });
  await runAgent(ctx, { text: 'Send it' });
  const res = await handler({ rawPath: '/dashboard', rawQueryString: '', requestContext: { http: { method: 'GET' } }, headers: { host: 'x', 'x-api-key': 'demo-judges-2026', 'x-manalog-user': 'dash' }, isBase64Encoded: false });
  assert.equal(res.statusCode, 200);
  const d = JSON.parse(res.body);
  assert.equal(d.kpis.missions, 1);
  assert.equal(d.kpis.rfqsApproved, 1);
  assert.ok(d.kpis.totalLandedXpf > 0);
  assert.ok(d.kpis.avgMultiplier > 1, 'landing costs more than the purchase price');
  assert.equal(d.missions[0].bestUnit.currency, 'XPF');
  assert.ok(d.missions[0].detail.shortlist.length, 'full mission included to reopen its card');
  const other = await handler({ rawPath: '/dashboard', rawQueryString: '', requestContext: { http: { method: 'GET' } }, headers: { host: 'x', 'x-api-key': 'demo-judges-2026', 'x-manalog-user': 'someone-else' }, isBase64Encoded: false });
  assert.equal(JSON.parse(other.body).kpis.missions, 0, 'users are isolated');
});
