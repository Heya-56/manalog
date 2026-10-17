// REST API for the depot console and for partner systems (e-shops, couriers).
//   GET  /depot/overview · /depot/stock?owner= · /depot/orders?status= · /depot/inbound · /depot/invoice?owner=&month=
//   POST /depot/<action> with a JSON body (see ACTIONS)
// Every call needs an API key whose plan includes the "depot" feature (self-hosted instances unlock everything).
import * as D from './core/depot.js';
import { store } from './core/store.js';
import { hasFeature } from './core/tenants.js';

const ACTIONS = {
  sku: (ctx, b) => D.upsertSku(ctx, b),
  bin: (ctx, b) => D.addBin(ctx, b.code, b.zone),
  inbound: (ctx, b) => D.announceInbound(ctx, b),
  customs: (ctx, b) => D.clearCustoms(ctx, b.inbound, b.ref),
  receive: (ctx, b) => D.receive(ctx, b.inbound, b),
  move: (ctx, b) => D.move(ctx, b),
  order: (ctx, b) => D.createOrder(ctx, b),
  picklist: (ctx, b) => D.pickList(ctx, b.orders),
  pick: (ctx, b) => D.confirmPick(ctx, b.order),
  pack: (ctx, b) => D.pack(ctx, b.order),
  label: (ctx, b) => D.label(ctx, b.order, b.carrier),
  ship: (ctx, b) => D.ship(ctx, b.order),
  deliver: (ctx, b) => D.deliver(ctx, b.order, b),
  cancel: (ctx, b) => D.cancelOrder(ctx, b.order),
  return: (ctx, b) => D.returnOrder(ctx, b.order, b),
  tariff: (ctx, b) => D.setTariff(ctx, b),
};
const STATUS = { not_found: 404, invalid: 400, unknown_island: 400, unexpected_sku: 400, out_of_stock: 409, bad_state: 409, negative_stock: 409, customs_pending: 409, no_carrier: 400 };

export async function depotRoute(ctx, req, url, json) {
  if (!hasFeature(ctx, 'depot')) return json({ error: 'The depot module is not in your plan.' }, 403);
  const action = url.pathname.slice('/depot/'.length);
  const q = Object.fromEntries(url.searchParams);
  try {
    if (req.method === 'GET') {
      if (action === 'overview') return json(await D.overview(ctx));
      if (action === 'stock') return json(await D.stockOf(ctx, { owner: q.owner, sku: q.sku }));
      if (action === 'orders') {
        const all = await store().query(D.depotPk(ctx), 'ORD#');
        return json(all.filter((o) => !q.status || o.status === q.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
      if (action === 'inbound') return json(await store().query(D.depotPk(ctx), 'IN#'));
      if (action === 'bins') return json(await store().query(D.depotPk(ctx), 'BIN#'));
      if (action === 'invoice') return json(await D.invoice(ctx, q.owner, { month: q.month }));
      return json({ error: 'Not found' }, 404);
    }
    if (req.method === 'POST' && ACTIONS[action]) {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      return json(await ACTIONS[action](ctx, body ?? {}));
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    if (e.code) return json({ error: e.message, code: e.code }, STATUS[e.code] ?? 400);
    console.error(e);
    return json({ error: 'Depot error' }, 500);
  }
}
