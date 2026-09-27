// Multi-tenant + plans + metering. This is the white-label / monetization layer.
// - Self-hosters (AGPL): MANALOG_ENFORCE_PLANS unset → every feature unlocked on their own instance.
// - Hosted ManaLog / resellers: MANALOG_ENFORCE_PLANS=true → plans & monthly quotas apply per API key.
import { config } from './config.js';
import { store } from './store.js';

export const PLANS = {
  community: { label: 'Community', monthlyCalls: 50, features: ['search', 'buyers', 'landed_cost', 'shipments', 'watchlist'] },
  pro: { label: 'Pro', monthlyCalls: 2000, features: ['search', 'buyers', 'landed_cost', 'shipments', 'watchlist', 'mission', 'scrape', 'rfq', 'live_data'] },
  whitelabel: { label: 'White-label', monthlyCalls: 20000, features: ['search', 'buyers', 'landed_cost', 'shipments', 'watchlist', 'mission', 'scrape', 'rfq', 'live_data', 'branding', 'custom_rates'] },
};

const DEFAULT_BRAND = { name: 'ManaLog', tagline: 'Voice sourcing for island makers', color: '#0E7C86', voiceName: 'ManaLog', locale: 'en-US' };

function loadTenants() {
  const list = [];
  if (config.tenantsJson) {
    try { list.push(...JSON.parse(config.tenantsJson)); } catch (e) { console.error('Invalid MANALOG_TENANTS_JSON', e.message); }
  }
  // Free judges/demo key — required by the hackathon rules (free testing until judging ends).
  if (!list.some((t) => t.apiKey === config.demoKey)) {
    list.push({ id: 'demo', apiKey: config.demoKey, plan: 'pro', brand: DEFAULT_BRAND });
  }
  return list;
}

let cache;
const tenants = () => (cache ??= loadTenants());
export function _resetTenantsForTests() { cache = undefined; }

export const enforcePlans = () => process.env.MANALOG_ENFORCE_PLANS === 'true';

/** Resolve tenant + user from request headers / query. Returns null if unauthorized. */
export function resolveContext({ apiKey, userHint } = {}) {
  let t = apiKey ? tenants().find((x) => x.apiKey === apiKey) : null;
  if (!t) {
    if (apiKey || !config.allowAnonymous) return null;
    t = { id: 'public', plan: 'community', brand: DEFAULT_BRAND };
  }
  const brand = { ...DEFAULT_BRAND, ...(t.brand ?? {}) };
  const userId = String(userHint || 'default').replace(/[^a-zA-Z0-9_.@-]/g, '').slice(0, 64) || 'default';
  return { tenant: { ...t, brand, plan: t.plan ?? 'community' }, userId };
}

export function hasFeature(ctx, feature) {
  if (!enforcePlans()) return true;
  return (PLANS[ctx.tenant.plan] ?? PLANS.community).features.includes(feature);
}

const month = () => new Date().toISOString().slice(0, 7).replace('-', '');

/** Meter one call; returns {ok, used, limit}. */
export async function meter(ctx, tool) {
  const pk = `T#${ctx.tenant.id}`;
  const sk = `USAGE#${month()}`;
  const used = await store().incr(pk, sk, 'calls');
  await store().incr(pk, sk, `tool_${tool}`);
  const limit = (PLANS[ctx.tenant.plan] ?? PLANS.community).monthlyCalls;
  return { ok: !enforcePlans() || used <= limit, used, limit };
}

export async function usage(ctx) {
  const row = (await store().get(`T#${ctx.tenant.id}`, `USAGE#${month()}`)) ?? {};
  const plan = PLANS[ctx.tenant.plan] ?? PLANS.community;
  return { plan: ctx.tenant.plan, planLabel: plan.label, month: month(), calls: row.calls ?? 0, limit: plan.monthlyCalls, enforced: enforcePlans(), features: plan.features };
}

export function upgradeMessage(ctx, feature) {
  return `This needs the ${feature} feature, which is not in your ${ctx.tenant.plan} plan. Upgrade at ${config.upgradeUrl} — or self-host ManaLog (open source, AGPL-3.0) to unlock everything on your own AWS account.`;
}
