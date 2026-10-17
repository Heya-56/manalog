import test from 'node:test';
import assert from 'node:assert/strict';
import { _resetStoreForTests } from '../src/core/store.js';
import * as D from '../src/core/depot.js';

const ctx = { tenant: { id: 'depot-test', plan: 'whitelabel' }, userId: 'op1' };
const shipTo = { name: 'Teva (demo)', island: 'Rangiroa', phone: '+689 87 00 00 00', address: 'Avatoru, PK 3' };

async function seed() {
  _resetStoreForTests();
  await D.upsertSku(ctx, { sku: 'MONOI-100', owner: 'artisan-a', name: 'Monoï 100 ml (demo)', weightKg: 0.15, l: 5, w: 5, h: 15, reorderAt: 5 });
  await D.upsertSku(ctx, { sku: 'PAREO-01', owner: 'artisan-a', name: 'Paréo (demo)', weightKg: 0.25, l: 25, w: 18, h: 2 });
  await D.addBin(ctx, 'A-01-1'); await D.addBin(ctx, 'A-02-1'); await D.addBin(ctx, 'B-01-1');
}

test('depot: import inbound is blocked until customs clearance, then received with discrepancies reported', async () => {
  await seed();
  const inb = await D.announceInbound(ctx, { owner: 'artisan-a', mode: 'import', lines: [{ sku: 'MONOI-100', qty: 20 }] });
  await assert.rejects(D.receive(ctx, inb.id, { sku: 'MONOI-100', qty: 18, bin: 'A-01-1' }), { code: 'customs_pending' });
  await D.clearCustoms(ctx, inb.id, 'DEMO-DAU-1');
  const r = await D.receive(ctx, inb.id, { sku: 'MONOI-100', qty: 17, damaged: 1, bin: 'A-01-1' });
  assert.equal(r.inbound.status, 'receiving');
  assert.deepEqual(r.discrepancies[0], { sku: 'MONOI-100', expected: 20, received: 17, damaged: 1, missing: 2 });
  const [s] = await D.stockOf(ctx, { sku: 'MONOI-100' });
  assert.equal(s.onHand, 17); assert.equal(s.quarantine, 1);
});

test('depot: orders reserve stock so the same unit is never promised twice', async () => {
  await seed();
  const inb = await D.announceInbound(ctx, { owner: 'artisan-a', lines: [{ sku: 'MONOI-100', qty: 6 }] });
  await D.receive(ctx, inb.id, { sku: 'MONOI-100', qty: 4, bin: 'A-01-1' });
  await D.receive(ctx, inb.id, { sku: 'MONOI-100', qty: 2, bin: 'B-01-1' });
  const o1 = await D.createOrder(ctx, { owner: 'artisan-a', shipTo, lines: [{ sku: 'MONOI-100', qty: 5 }] });
  assert.equal(o1.allocations.length, 2);
  await assert.rejects(D.createOrder(ctx, { owner: 'artisan-a', shipTo, lines: [{ sku: 'MONOI-100', qty: 2 }] }), { code: 'out_of_stock' });
  await D.cancelOrder(ctx, o1.id);
  const [s] = await D.stockOf(ctx, { sku: 'MONOI-100' });
  assert.equal(s.available, 6);
});

test('depot: full flow pick → pack → label → ship → invoice, carriers follow the island zone', async () => {
  await seed();
  const inb = await D.announceInbound(ctx, { owner: 'artisan-a', lines: [{ sku: 'MONOI-100', qty: 10 }, { sku: 'PAREO-01', qty: 5 }] });
  await D.receive(ctx, inb.id, { sku: 'MONOI-100', qty: 10, bin: 'A-02-1' });
  await D.receive(ctx, inb.id, { sku: 'PAREO-01', qty: 5, bin: 'A-01-1' });
  const o = await D.createOrder(ctx, { owner: 'artisan-a', shipTo, cod: 4500, lines: [{ sku: 'MONOI-100', qty: 2 }, { sku: 'PAREO-01', qty: 1 }] });
  assert.equal(o.shipTo.zone, 'TUAMOTU');
  const list = await D.pickList(ctx, [o.id]);
  assert.deepEqual(list.map((s) => s.bin), ['A-01-1', 'A-02-1']);
  await D.confirmPick(ctx, o.id);
  const packed = await D.pack(ctx, o.id);
  assert.equal(packed.package.carton, 'BOX-S');
  assert.deepEqual(packed.quotes.map((q) => q.code).sort(), ['AIR', 'POST', 'SHIP']);
  assert.ok(packed.quotes.every((q) => q.verified === false));
  const labeled = await D.label(ctx, o.id, 'SHIP');
  assert.match(labeled.labelText, /RANGIROA \(TUAMOTU\)/);
  assert.match(labeled.labelText, /4500 XPF/);
  await D.ship(ctx, o.id);
  const ov = await D.overview(ctx);
  assert.equal(ov.inTransit, 1);
  const inv = await D.invoice(ctx, 'artisan-a', { days: 30 });
  assert.equal(inv.currency, 'XPF');
  assert.ok(Number.isInteger(inv.totalXpf));
  assert.equal(inv.disbursementsXpf, labeled.shippingXpf);
  assert.ok(inv.lines.find((l) => l.label.startsWith('Pick & pack')).qty === 1);
  assert.equal(inv.lines.find((l) => l.label.startsWith('Extra units')).qty, 2);
});

test('depot: wrong order of steps is refused, unknown island is refused, returns go back to stock', async () => {
  await seed();
  const inb = await D.announceInbound(ctx, { owner: 'artisan-a', lines: [{ sku: 'PAREO-01', qty: 3 }] });
  await D.receive(ctx, inb.id, { sku: 'PAREO-01', qty: 3, bin: 'A-01-1' });
  await assert.rejects(D.createOrder(ctx, { owner: 'artisan-a', shipTo: { ...shipTo, island: 'Atlantis' }, lines: [{ sku: 'PAREO-01', qty: 1 }] }), { code: 'unknown_island' });
  const o = await D.createOrder(ctx, { owner: 'artisan-a', shipTo: { ...shipTo, island: 'Tahiti' }, lines: [{ sku: 'PAREO-01', qty: 1 }] });
  await assert.rejects(D.pack(ctx, o.id), { code: 'bad_state' });
  await D.pickList(ctx, [o.id]); await D.confirmPick(ctx, o.id); await D.pack(ctx, o.id);
  const l = await D.label(ctx, o.id);
  assert.equal(l.carrier, 'COURIER');
  await D.ship(ctx, o.id);
  await D.deliver(ctx, o.id, { ok: false, note: 'Absent' });
  await D.returnOrder(ctx, o.id, { bin: 'A-01-1' });
  const [s] = await D.stockOf(ctx, { sku: 'PAREO-01' });
  assert.equal(s.onHand, 3);
});

test('depot HTTP API: console page, overview, plan gating and error codes', async () => {
  _resetStoreForTests();
  const { handle } = await import('../src/http.js');
  const page = await handle(new Request('http://x/depot'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ManaLog Dépôt/);
  const post = (path, body) => handle(new Request(`http://x/depot/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post('bin', { code: 'A-01-1' })).status, 200);
  const missing = await post('pack', { order: 'ORD-99999' });
  assert.equal(missing.status, 404);
  const ov = await handle(new Request('http://x/depot/overview'));
  assert.equal((await ov.json()).toPick, 0);
});
