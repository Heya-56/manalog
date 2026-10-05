// Dashboard summary: read-only view of what the user already has in storage.
// It never calls ImportYeti or Bedrock and is not metered, so opening the dashboard costs nothing.
import { listMissions } from './missions.js';
import { usage } from './tenants.js';
import { store, userPk } from './store.js';

const best = (m) => m.shortlist?.find((s) => s.localUnit) ?? null;

export async function dashboardSummary(ctx) {
  const [missions, u, watch] = await Promise.all([
    listMissions(ctx),
    usage(ctx),
    store().query(userPk(ctx), 'WATCH#'),
  ]);
  const rows = missions.map((m) => {
    const b = best(m);
    return {
      id: m.id, createdAt: m.createdAt, product: m.input?.product, quantity: m.input?.quantity, destination: m.input?.destination,
      status: m.status, rfqStatus: m.rfq?.status ?? null, topSupplier: m.shortlist?.[0]?.name ?? null, topScore: m.shortlist?.[0]?.score ?? null,
      bestUnit: b ? { supplier: b.name, unit: b.localUnit.unit, currency: b.localUnit.currency, priceSource: b.priceSource,
        multiplier: b.unitPriceUsd && b.unitLandedUsd ? Math.round((b.unitLandedUsd / b.unitPriceUsd) * 100) / 100 : null,
        orderTotal: Math.round(b.localUnit.unit * (m.input?.quantity ?? 0)) } : null,
      dataSource: m.dataSource,
      detail: m, // full mission (without the step log) so the console can reopen its card without a new paid call
    };
  });
  // Unit costs of different products are not comparable (a kilo of vanilla vs a bottle), so the KPIs use
  // the landed multiplier (landed unit cost ÷ purchase price) and the total estimated order value instead.
  const xpf = rows.filter((r) => r.bestUnit?.currency === 'XPF');
  const mult = rows.map((r) => r.bestUnit?.multiplier).filter((n) => n != null);
  const scores = rows.map((r) => r.topScore).filter((n) => n != null);
  return {
    kpis: {
      missions: rows.length,
      rfqsApproved: rows.filter((r) => r.rfqStatus === 'approved').length,
      totalLandedXpf: xpf.length ? xpf.reduce((a, r) => a + r.bestUnit.orderTotal, 0) : null,
      avgMultiplier: mult.length ? Math.round((mult.reduce((a, n) => a + n, 0) / mult.length) * 100) / 100 : null,
      avgTopScore: scores.length ? Math.round(scores.reduce((a, n) => a + n, 0) / scores.length) : null,
      watched: watch.length,
    },
    usage: { planLabel: u.planLabel, calls: u.calls, limit: u.limit, month: u.month },
    missions: rows,
    watchlist: watch.map((w) => ({ slug: w.slug, name: w.name, country: w.country, note: w.note, addedAt: w.addedAt, checkedAt: w.checkedAt ?? null })),
  };
}
