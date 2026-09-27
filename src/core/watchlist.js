// Supplier watchlist: remembered across sessions; "what changed?" compares fresh trade data with the last snapshot.
import { supplierProfile } from './importyeti.js';
import { store, userPk } from './store.js';

export async function watchSupplier(ctx, slug, note) {
  const p = await supplierProfile(slug);
  if (!p) return null;
  const item = { slug, name: p.name, country: p.country, note: note ?? null, addedAt: new Date().toISOString(), snapshot: { shipments12m: p.shipments12m, lastShipment: p.lastShipment } };
  await store().put(userPk(ctx), `WATCH#${slug}`, item);
  return item;
}

export async function unwatchSupplier(ctx, slug) { await store().del(userPk(ctx), `WATCH#${slug}`); }

export async function checkWatchlist(ctx) {
  const items = await store().query(userPk(ctx), 'WATCH#');
  const out = [];
  for (const it of items) {
    const fresh = await supplierProfile(it.slug).catch(() => null);
    const changes = [];
    if (fresh) {
      if (fresh.lastShipment && fresh.lastShipment !== it.snapshot.lastShipment) changes.push(`new shipment on ${fresh.lastShipment}`);
      if (fresh.shipments12m != null && fresh.shipments12m !== it.snapshot.shipments12m) changes.push(`12-month shipments ${it.snapshot.shipments12m} → ${fresh.shipments12m}`);
      await store().put(userPk(ctx), `WATCH#${it.slug}`, { ...it, pk: undefined, sk: undefined, snapshot: { shipments12m: fresh.shipments12m, lastShipment: fresh.lastShipment }, checkedAt: new Date().toISOString() });
    }
    out.push({ slug: it.slug, name: it.name, country: it.country, note: it.note, changes });
  }
  return out;
}
