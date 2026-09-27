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
  const r4 = await runAgent(ctx, { text: 'Who buys vanilla in the US?' });
  assert.equal(r4.calls[0].name, 'find_buyers');
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
