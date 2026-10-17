// ManaLog Depot — the physical warehouse software (fulfillment, "FBA for the islands").
// Flow: inbound notice → receive → put away → stock → order → pick → pack → label → ship → returns → billing.
// Each step writes an immutable movement to a ledger; billing is computed from the ledger, never from guesses.
// Persistence reuses the single-table store. Depot data is tenant-level (one warehouse operator = one tenant):
//   pk = "T#<tenant>#DEPOT"  sk = "SKU#<sku>" | "BIN#<code>" | "STOCK#<sku>#<bin>" | "IN#<id>" | "ORD#<id>" | "RET#<id>" | "MOV#<ts>#<id>" | "SEQ#<kind>"
// Money is in whole XPF (franc Pacifique has no cents). Carrier rates are illustrative (verified:false) until the
// operator enters its negotiated rates.
import { store } from './store.js';

export const depotPk = (ctx) => `T#${ctx.tenant.id}#DEPOT`;
const now = () => new Date().toISOString();
const err = (code, message) => Object.assign(new Error(message), { code });

// ---------- reference data ----------
export const CARTONS = [
  { code: 'ENV-S', label: 'Padded envelope', l: 25, w: 18, h: 4, maxKg: 0.5, costXpf: 60 },
  { code: 'BOX-S', label: 'Small box', l: 30, w: 20, h: 12, maxKg: 3, costXpf: 120 },
  { code: 'BOX-M', label: 'Medium box', l: 40, w: 30, h: 25, maxKg: 10, costXpf: 220 },
  { code: 'BOX-L', label: 'Large box', l: 60, w: 40, h: 40, maxKg: 25, costXpf: 380 },
];

// Delivery modes for French Polynesia. Zones: archipelago of the destination island.
export const ISLAND_ZONES = {
  tahiti: 'TAHITI', moorea: 'MOOREA',
  'bora bora': 'ISV', raiatea: 'ISV', huahine: 'ISV', tahaa: 'ISV', maupiti: 'ISV',
  rangiroa: 'TUAMOTU', fakarava: 'TUAMOTU', tikehau: 'TUAMOTU', manihi: 'TUAMOTU', hao: 'TUAMOTU',
  'nuku hiva': 'MARQUISES', 'hiva oa': 'MARQUISES', 'ua pou': 'MARQUISES',
  tubuai: 'AUSTRALES', rurutu: 'AUSTRALES', raivavae: 'AUSTRALES',
  mangareva: 'GAMBIER',
};
export const CARRIERS = [
  { code: 'COURIER', label: 'Local courier (same/next day)', zones: ['TAHITI'], baseXpf: 800, perKgXpf: 50, days: 1 },
  { code: 'FERRY', label: 'Courier + ferry', zones: ['MOOREA'], baseXpf: 1500, perKgXpf: 80, days: 1 },
  { code: 'AIR', label: 'Air freight', zones: ['ISV', 'TUAMOTU', 'MARQUISES', 'AUSTRALES', 'GAMBIER'], baseXpf: 1800, perKgXpf: 450, days: 2 },
  { code: 'SHIP', label: 'Schooner (goélette)', zones: ['ISV', 'TUAMOTU', 'MARQUISES', 'AUSTRALES', 'GAMBIER'], baseXpf: 1200, perKgXpf: 120, days: 10 },
  { code: 'POST', label: 'Postal parcel', zones: ['TAHITI', 'MOOREA', 'ISV', 'TUAMOTU', 'MARQUISES', 'AUSTRALES', 'GAMBIER'], baseXpf: 1000, perKgXpf: 300, days: 5 },
].map((c) => ({ ...c, verified: false }));

// Illustrative fulfillment tariff (operator overrides with setTariff). Storage billed per m³ per day.
export const DEFAULT_TARIFF = { storagePerM3DayXpf: 300, receivePerUnitXpf: 15, pickPackPerOrderXpf: 350, pickPerExtraUnitXpf: 40, labelXpf: 50, returnXpf: 300, verified: false };

export function zoneOf(island) {
  const z = ISLAND_ZONES[String(island ?? '').trim().toLowerCase()];
  if (!z) throw err('unknown_island', `Unknown island "${island}". Known: ${Object.keys(ISLAND_ZONES).join(', ')}`);
  return z;
}

// ---------- low-level helpers ----------
async function nextId(ctx, kind, prefix) {
  const n = await store().incr(depotPk(ctx), `SEQ#${kind}`, 'n', 1);
  return `${prefix}-${String(n).padStart(5, '0')}`;
}
async function getOrThrow(ctx, sk, what) {
  const item = await store().get(depotPk(ctx), sk);
  if (!item) throw err('not_found', `${what} not found`);
  return item;
}
async function record(ctx, mov) {
  const id = Math.random().toString(36).slice(2, 8);
  const m = { at: mov.at ?? now(), ...mov };
  await store().put(depotPk(ctx), `MOV#${m.at}#${id}`, m);
  return m;
}
async function addStock(ctx, sku, bin, qty) {
  const sk = `STOCK#${sku}#${bin}`;
  const cur = (await store().get(depotPk(ctx), sk)) ?? { sku, bin, qty: 0, reserved: 0 };
  cur.qty += qty;
  if (cur.qty < 0) throw err('negative_stock', `Not enough ${sku} in ${bin}`);
  if (cur.qty === 0 && !cur.reserved) await store().del(depotPk(ctx), sk);
  else await store().put(depotPk(ctx), sk, cur);
  return cur;
}
const volumeM3 = (s) => (s.l * s.w * s.h) / 1e6;

// ---------- catalogue & bins ----------
export async function upsertSku(ctx, s) {
  if (!s.sku || !s.owner) throw err('invalid', 'sku and owner (the seller) are required');
  const item = { sku: s.sku, owner: s.owner, name: s.name ?? s.sku, weightKg: Number(s.weightKg ?? 0.5), l: Number(s.l ?? 20), w: Number(s.w ?? 15), h: Number(s.h ?? 10), barcode: s.barcode ?? s.sku, reorderAt: Number(s.reorderAt ?? 0) };
  await store().put(depotPk(ctx), `SKU#${item.sku}`, item);
  return item;
}
export async function addBin(ctx, code, zone = 'A') {
  const item = { code, zone };
  await store().put(depotPk(ctx), `BIN#${code}`, item);
  return item;
}

// ---------- inbound ----------
export async function announceInbound(ctx, { owner, reference, lines, mode = 'local' }) {
  if (!owner || !lines?.length) throw err('invalid', 'owner and at least one line are required');
  for (const l of lines) await getOrThrow(ctx, `SKU#${l.sku}`, `SKU ${l.sku}`);
  const id = await nextId(ctx, 'IN', 'IN');
  const item = { id, owner, reference: reference ?? null, mode, status: 'expected', createdAt: now(),
    lines: lines.map((l) => ({ sku: l.sku, expected: l.qty, received: 0, damaged: 0 })), customs: mode === 'import' ? 'pending' : 'n/a' };
  await store().put(depotPk(ctx), `IN#${id}`, item);
  return item;
}
export async function clearCustoms(ctx, inboundId, ref) {
  const inb = await getOrThrow(ctx, `IN#${inboundId}`, `Inbound ${inboundId}`);
  inb.customs = 'cleared'; inb.customsRef = ref ?? null;
  await store().put(depotPk(ctx), `IN#${inboundId}`, inb);
  return inb;
}
// Receive counted goods into a bin. Damaged units go to the QUARANTINE bin. Discrepancies are reported, not hidden.
export async function receive(ctx, inboundId, { sku, qty, damaged = 0, bin }) {
  const inb = await getOrThrow(ctx, `IN#${inboundId}`, `Inbound ${inboundId}`);
  if (inb.customs === 'pending') throw err('customs_pending', `Inbound ${inboundId} is not cleared by customs yet`);
  const line = inb.lines.find((l) => l.sku === sku);
  if (!line) throw err('unexpected_sku', `${sku} is not on inbound ${inboundId}`);
  await getOrThrow(ctx, `BIN#${bin}`, `Bin ${bin}`);
  if (qty > 0) await addStock(ctx, sku, bin, qty);
  if (damaged > 0) { await addBin(ctx, 'QUARANTINE', 'Q'); await addStock(ctx, sku, 'QUARANTINE', damaged); }
  line.received += qty; line.damaged += damaged;
  inb.status = inb.lines.every((l) => l.received + l.damaged >= l.expected) ? 'received' : 'receiving';
  await store().put(depotPk(ctx), `IN#${inboundId}`, inb);
  await record(ctx, { type: 'receive', owner: inb.owner, sku, bin, qty, damaged, ref: inboundId });
  return { inbound: inb, discrepancies: discrepancies(inb) };
}
export function discrepancies(inb) {
  return inb.lines.filter((l) => l.received + l.damaged !== l.expected || l.damaged)
    .map((l) => ({ sku: l.sku, expected: l.expected, received: l.received, damaged: l.damaged, missing: Math.max(0, l.expected - l.received - l.damaged) }));
}
export async function move(ctx, { sku, from, to, qty }) {
  await getOrThrow(ctx, `BIN#${to}`, `Bin ${to}`);
  const src = await store().get(depotPk(ctx), `STOCK#${sku}#${from}`);
  if (!src || src.qty - (src.reserved ?? 0) < qty) throw err('negative_stock', `Not enough free ${sku} in ${from}`);
  await addStock(ctx, sku, from, -qty);
  await addStock(ctx, sku, to, qty);
  return record(ctx, { type: 'move', sku, from, to, qty });
}

// ---------- stock ----------
export async function stockOf(ctx, { owner, sku } = {}) {
  const rows = await store().query(depotPk(ctx), 'STOCK#');
  const skus = Object.fromEntries((await store().query(depotPk(ctx), 'SKU#')).map((s) => [s.sku, s]));
  const by = {};
  for (const r of rows) {
    const s = skus[r.sku];
    if (!s || (owner && s.owner !== owner) || (sku && r.sku !== sku)) continue;
    const e = (by[r.sku] ??= { sku: r.sku, name: s.name, owner: s.owner, onHand: 0, reserved: 0, available: 0, quarantine: 0, bins: [], reorderAt: s.reorderAt });
    if (r.bin === 'QUARANTINE') { e.quarantine += r.qty; continue; }
    e.onHand += r.qty; e.reserved += r.reserved ?? 0;
    e.bins.push({ bin: r.bin, qty: r.qty, reserved: r.reserved ?? 0 });
  }
  return Object.values(by).map((e) => ({ ...e, available: e.onHand - e.reserved, bins: e.bins.sort((a, b) => a.bin.localeCompare(b.bin)), reorder: e.reorderAt > 0 && e.onHand - e.reserved <= e.reorderAt }));
}

// ---------- outbound ----------
// Creating an order reserves stock bin by bin (fewest bins first), so two orders can never promise the same unit.
export async function createOrder(ctx, { owner, channel = 'api', reference, shipTo, lines, cod = 0 }) {
  if (!owner || !lines?.length || !shipTo?.name || !shipTo?.island) throw err('invalid', 'owner, lines and shipTo { name, island, phone, address } are required');
  const zone = zoneOf(shipTo.island);
  const stock = await stockOf(ctx, { owner });
  for (const l of lines) {
    const s = stock.find((x) => x.sku === l.sku);
    if (!s || s.available < l.qty) throw err('out_of_stock', `Only ${s?.available ?? 0} ${l.sku} available`);
  }
  const id = await nextId(ctx, 'ORD', 'ORD');
  const allocations = [];
  for (const l of lines) {
    let need = l.qty;
    const bins = stock.find((x) => x.sku === l.sku).bins.map((b) => ({ ...b, free: b.qty - b.reserved })).filter((b) => b.free > 0).sort((a, b) => b.free - a.free);
    for (const b of bins) {
      if (!need) break;
      const take = Math.min(need, b.free);
      const row = await store().get(depotPk(ctx), `STOCK#${l.sku}#${b.bin}`);
      row.reserved = (row.reserved ?? 0) + take;
      await store().put(depotPk(ctx), `STOCK#${l.sku}#${b.bin}`, row);
      allocations.push({ sku: l.sku, bin: b.bin, qty: take });
      need -= take;
    }
  }
  const order = { id, owner, channel, reference: reference ?? null, shipTo: { ...shipTo, zone }, lines, allocations, cod: Number(cod) || 0, status: 'new', createdAt: now(), history: [{ status: 'new', at: now() }] };
  await store().put(depotPk(ctx), `ORD#${id}`, order);
  return order;
}
async function setStatus(ctx, order, status, extra = {}) {
  Object.assign(order, extra, { status });
  order.history.push({ status, at: now() });
  await store().put(depotPk(ctx), `ORD#${order.id}`, order);
  return order;
}
// One pick list for a wave of orders, sorted by bin so the picker walks the aisles once.
export async function pickList(ctx, orderIds) {
  const stops = {};
  for (const id of orderIds) {
    const o = await getOrThrow(ctx, `ORD#${id}`, `Order ${id}`);
    if (o.status !== 'new') throw err('bad_state', `Order ${id} is ${o.status}`);
    for (const a of o.allocations) {
      const k = `${a.bin}|${a.sku}`;
      (stops[k] ??= { bin: a.bin, sku: a.sku, qty: 0, orders: [] }).qty += a.qty;
      stops[k].orders.push({ order: id, qty: a.qty });
    }
    await setStatus(ctx, o, 'picking');
  }
  return Object.values(stops).sort((a, b) => a.bin.localeCompare(b.bin) || a.sku.localeCompare(b.sku));
}
export async function confirmPick(ctx, orderId) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (o.status !== 'picking') throw err('bad_state', `Order ${orderId} is ${o.status}`);
  for (const a of o.allocations) {
    const row = await store().get(depotPk(ctx), `STOCK#${a.sku}#${a.bin}`);
    row.reserved -= a.qty; row.qty -= a.qty;
    if (row.qty <= 0 && !row.reserved) await store().del(depotPk(ctx), `STOCK#${a.sku}#${a.bin}`);
    else await store().put(depotPk(ctx), `STOCK#${a.sku}#${a.bin}`, row);
    await record(ctx, { type: 'pick', owner: o.owner, sku: a.sku, bin: a.bin, qty: a.qty, ref: orderId });
  }
  return setStatus(ctx, o, 'picked');
}
// Smallest carton whose volume (with 15% filling margin) and weight limit fit the order.
export function chooseCarton(items) {
  const kg = items.reduce((t, i) => t + i.weightKg * i.qty, 0);
  const m3 = items.reduce((t, i) => t + volumeM3(i) * i.qty, 0) * 1.15;
  const longest = Math.max(...items.map((i) => Math.max(i.l, i.w, i.h)));
  const c = CARTONS.find((b) => b.maxKg >= kg && volumeM3(b) >= m3 && Math.max(b.l, b.w, b.h) >= longest);
  return { carton: c ?? null, weightKg: Math.round(kg * 100) / 100, oversize: !c };
}
export function quoteCarriers(zone, weightKg) {
  const billable = Math.max(1, Math.ceil(weightKg));
  return CARRIERS.filter((c) => c.zones.includes(zone))
    .map((c) => ({ code: c.code, label: c.label, days: c.days, priceXpf: c.baseXpf + c.perKgXpf * billable, verified: c.verified }))
    .sort((a, b) => a.priceXpf - b.priceXpf);
}
export async function pack(ctx, orderId) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (o.status !== 'picked') throw err('bad_state', `Order ${orderId} is ${o.status}`);
  const items = [];
  for (const l of o.lines) items.push({ ...(await getOrThrow(ctx, `SKU#${l.sku}`, `SKU ${l.sku}`)), qty: l.qty });
  const box = chooseCarton(items);
  return setStatus(ctx, o, 'packed', { package: { carton: box.carton?.code ?? 'CUSTOM', weightKg: box.weightKg, oversize: box.oversize }, quotes: quoteCarriers(o.shipTo.zone, box.weightKg) });
}
// Label = tracking number + printable text block (works on any thermal printer driver, ZPL can come later).
export async function label(ctx, orderId, carrierCode) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (o.status !== 'packed') throw err('bad_state', `Order ${orderId} is ${o.status}`);
  const q = o.quotes.find((x) => x.code === (carrierCode ?? o.quotes[0]?.code));
  if (!q) throw err('no_carrier', `No carrier ${carrierCode} serves ${o.shipTo.zone}`);
  const tracking = `ML${q.code.slice(0, 2)}${orderId.replace(/\D/g, '')}${String(Date.now()).slice(-4)}`;
  const text = [
    `MANALOG  ${q.label.toUpperCase()}`,
    `TRACKING ${tracking}`,
    `TO: ${o.shipTo.name}`, o.shipTo.address ?? '', `${o.shipTo.island.toUpperCase()} (${o.shipTo.zone})`, `TEL: ${o.shipTo.phone ?? '-'}`,
    `ORDER ${o.id}  ${o.package.weightKg} kg  ${o.package.carton}`,
    o.cod ? `PAIEMENT A LA LIVRAISON: ${o.cod} XPF` : '',
  ].filter(Boolean).join('\n');
  await record(ctx, { type: 'label', owner: o.owner, ref: orderId, carrier: q.code, shippingXpf: q.priceXpf });
  return setStatus(ctx, o, 'labeled', { carrier: q.code, shippingXpf: q.priceXpf, tracking, labelText: text });
}
export async function ship(ctx, orderId) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (o.status !== 'labeled') throw err('bad_state', `Order ${orderId} is ${o.status}`);
  await record(ctx, { type: 'ship', owner: o.owner, ref: orderId, units: o.lines.reduce((t, l) => t + l.qty, 0) });
  return setStatus(ctx, o, 'shipped', { shippedAt: now() });
}
export async function deliver(ctx, orderId, { ok = true, note } = {}) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (o.status !== 'shipped') throw err('bad_state', `Order ${orderId} is ${o.status}`);
  return setStatus(ctx, o, ok ? 'delivered' : 'failed_delivery', { deliveryNote: note ?? null });
}
export async function cancelOrder(ctx, orderId) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (!['new', 'picking'].includes(o.status)) throw err('bad_state', `Order ${orderId} is already ${o.status}`);
  for (const a of o.allocations) {
    const row = await store().get(depotPk(ctx), `STOCK#${a.sku}#${a.bin}`);
    row.reserved -= a.qty;
    await store().put(depotPk(ctx), `STOCK#${a.sku}#${a.bin}`, row);
  }
  return setStatus(ctx, o, 'cancelled');
}

// ---------- returns ----------
export async function returnOrder(ctx, orderId, { lines, restock = true, bin }) {
  const o = await getOrThrow(ctx, `ORD#${orderId}`, `Order ${orderId}`);
  if (!['shipped', 'delivered', 'failed_delivery'].includes(o.status)) throw err('bad_state', `Order ${orderId} is ${o.status}`);
  const id = await nextId(ctx, 'RET', 'RET');
  const target = restock ? bin : 'QUARANTINE';
  if (!target) throw err('invalid', 'bin is required to restock');
  if (target === 'QUARANTINE') await addBin(ctx, 'QUARANTINE', 'Q'); else await getOrThrow(ctx, `BIN#${target}`, `Bin ${target}`);
  for (const l of lines ?? o.lines) {
    await addStock(ctx, l.sku, target, l.qty);
    await record(ctx, { type: 'return', owner: o.owner, sku: l.sku, bin: target, qty: l.qty, ref: id });
  }
  const r = { id, order: orderId, lines: lines ?? o.lines, restocked: restock, at: now() };
  await store().put(depotPk(ctx), `RET#${id}`, r);
  await setStatus(ctx, o, 'returned');
  return r;
}

// ---------- billing ----------
export async function setTariff(ctx, tariff) {
  const t = { ...DEFAULT_TARIFF, ...tariff, verified: true };
  await store().put(depotPk(ctx), 'TARIFF', t);
  return t;
}
async function tariffOf(ctx) { return (await store().get(depotPk(ctx), 'TARIFF')) ?? DEFAULT_TARIFF; }

// Monthly invoice for one seller, computed from the ledger. Storage = current volume × days (snapshot method;
// a daily snapshot job replaces it once volumes move a lot). Shipping is re-invoiced at cost as a disbursement (débours).
export async function invoice(ctx, owner, { month, days } = {}) {
  const m = month ?? now().slice(0, 7);
  const t = await tariffOf(ctx);
  const movs = (await store().query(depotPk(ctx), `MOV#${m}`)).filter((x) => x.owner === owner);
  const skus = Object.fromEntries((await store().query(depotPk(ctx), 'SKU#')).map((s) => [s.sku, s]));
  const stock = await stockOf(ctx, { owner });
  const m3 = stock.reduce((sum, s) => sum + volumeM3(skus[s.sku]) * (s.onHand + s.quarantine), 0);
  const d = days ?? new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  const received = movs.filter((x) => x.type === 'receive').reduce((s, x) => s + x.qty + x.damaged, 0);
  const shipped = movs.filter((x) => x.type === 'ship');
  const extraUnits = shipped.reduce((s, x) => s + Math.max(0, x.units - 1), 0);
  const labels = movs.filter((x) => x.type === 'label');
  const returns = new Set(movs.filter((x) => x.type === 'return').map((x) => x.ref)).size;
  const lines = [
    { label: `Storage ${m3.toFixed(3)} m³ × ${d} days`, qty: 1, unitXpf: Math.round(m3 * d * t.storagePerM3DayXpf) },
    { label: 'Receiving (per unit)', qty: received, unitXpf: t.receivePerUnitXpf },
    { label: 'Pick & pack (per order)', qty: shipped.length, unitXpf: t.pickPackPerOrderXpf },
    { label: 'Extra units picked', qty: extraUnits, unitXpf: t.pickPerExtraUnitXpf },
    { label: 'Shipping labels', qty: labels.length, unitXpf: t.labelXpf },
    { label: 'Returns handled', qty: returns, unitXpf: t.returnXpf },
  ].filter((l) => l.qty && l.unitXpf).map((l) => ({ ...l, totalXpf: l.qty * l.unitXpf }));
  const services = lines.reduce((s, l) => s + l.totalXpf, 0);
  const disbursements = labels.reduce((s, x) => s + (x.shippingXpf ?? 0), 0);
  return { owner, month: m, currency: 'XPF', lines, servicesXpf: services, disbursementsXpf: disbursements, totalXpf: services + disbursements, tariffVerified: !!t.verified,
    note: 'Services billed by the depot; shipping re-invoiced at cost as disbursements (débours). Taxes depend on the operator status and are added by its accounting.' };
}

// ---------- overview for the console ----------
export async function overview(ctx) {
  const orders = await store().query(depotPk(ctx), 'ORD#');
  const inbound = await store().query(depotPk(ctx), 'IN#');
  const count = (s) => orders.filter((o) => o.status === s).length;
  const stock = await stockOf(ctx);
  return {
    toPick: count('new'), picking: count('picking'), toPack: count('picked'), toLabel: count('packed'), toShip: count('labeled'), inTransit: count('shipped'),
    inboundOpen: inbound.filter((i) => i.status !== 'received').length,
    customsPending: inbound.filter((i) => i.customs === 'pending').length,
    lowStock: stock.filter((s) => s.reorder).map((s) => s.sku),
    quarantineUnits: stock.reduce((t, s) => t + s.quarantine, 0),
  };
}
