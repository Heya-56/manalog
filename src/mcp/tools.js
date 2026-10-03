// Tool registry — single source of truth used by BOTH the MCP server (Alexa+) and the Bedrock voice agent.
// Each handler returns { speech, data }: `speech` is short and voice-ready, `data` is structured for cards/UIs.
import { z } from 'zod';
import { rankSuppliers, rankBuyers, searchShipments, knownDemoProducts, dataMode } from '../core/importyeti.js';
import { rankScored } from '../core/scoring.js';
import { estimateLandedCost, listDestinations } from '../core/landed-cost.js';
import { runMission, listMissions, getMission, updateRfqStatus } from '../core/missions.js';
import { scrapeSupplierSite } from '../core/scraper.js';
import { watchSupplier, unwatchSupplier, checkWatchlist } from '../core/watchlist.js';
import { usage } from '../core/tenants.js';
import { config } from '../core/config.js';

const dest = z.string().default('PF').describe('Destination profile code: PF (French Polynesia/Tahiti), US, FR');
const place = (d) => (d === 'PF' ? 'Tahiti' : d);
export const MISSION_CARD_URI = 'ui://manalog/mission-card.html';

export const tools = [
  {
    name: 'find_suppliers', title: 'Find proven suppliers', feature: 'search',
    description: 'Find overseas manufacturers that have ACTUALLY shipped a product (from US customs bills of lading), scored 0-100 for a small importer at the destination. Use for "who makes / where can I buy X".',
    schema: {
      product: z.string().min(2).describe('Product in plain words, e.g. "glass bottle", "vanilla", "kraft paper bag"'),
      destination: dest,
      quantity: z.number().int().positive().optional().describe('Planned order quantity (improves MOQ fit)'),
      country: z.string().optional().describe('Only suppliers from this origin country'),
      priority: z.enum(['balanced', 'price', 'speed']).default('balanced'),
      limit: z.number().int().min(1).max(10).default(3),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(ctx, a) {
      const r = await rankSuppliers(a.product, { limit: 10, country: a.country });
      const list = rankScored(r.suppliers, { destination: a.destination, quantity: a.quantity, priority: a.priority }).slice(0, a.limit);
      if (!list.length) return { speech: `I found no proven exporters for ${a.product}.`, data: { ...r, suppliers: [] } };
      const s = list.map((x, i) => `${i + 1}: ${x.name}, ${x.country}, score ${x.score}`).join('. ');
      return { speech: `Top ${list.length} suppliers of ${r.product} for ${place(a.destination)}. ${s}.`, data: { product: r.product, source: r.source, destination: a.destination, suppliers: list } };
    },
  },
  {
    name: 'find_buyers', title: 'Find export buyers', feature: 'buyers',
    description: 'EXPORT prospecting: list US companies that import a product (e.g. vanilla, monoi, black pearl) with their volumes and origin countries. Use for "who buys my X in the US".',
    schema: { product: z.string().min(2), limit: z.number().int().min(1).max(10).default(3) },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(ctx, a) {
      const r = await rankBuyers(a.product, { limit: a.limit });
      if (!r.buyers.length) return { speech: `I found no US importers of ${a.product} yet.`, data: r };
      const s = r.buyers.map((b) => `${b.name}${b.state ? ` in ${b.state}` : ''}, ${b.shipments12m ?? b.matchingShipments ?? 'several'} shipments`).join('; ');
      return { speech: `US buyers of ${r.product}: ${s}. Want me to watch any of them or draft an intro?`, data: r };
    },
  },
  {
    name: 'estimate_landed_cost', title: 'Estimate landed cost', feature: 'landed_cost',
    description: 'Estimate the true landed cost (goods + freight + insurance + duties/taxes + brokerage) of an order to the destination, in USD and local currency (XPF for Tahiti).',
    schema: {
      unitPriceUsd: z.number().positive(), quantity: z.number().int().positive(), unitWeightKg: z.number().positive().default(0.2),
      origin: z.string().describe('Origin country, e.g. "Vietnam"'), destination: dest,
      mode: z.enum(['sea', 'air', 'post']).default('sea'), product: z.string().optional(),
      category: z.enum(['packaging', 'food_raw', 'cosmetic_inputs', 'craft_materials', 'general']).optional(),
    },
    annotations: { readOnlyHint: true },
    async handler(ctx, a) {
      const r = estimateLandedCost(a, ctx.tenant.overrides ?? {});
      return {
        speech: `${a.quantity} units from ${a.origin} by ${r.mode}: about ${r.local.total.toLocaleString('en-US')} ${r.local.currency} landed, ${Math.round(r.local.unit)} ${r.local.currency} per unit — ${r.landedMultiplier} times the factory price, around ${r.transitDays} days in transit. ${r.verifiedRates ? '' : 'Rates are estimates; confirm with your broker.'}`,
        data: r,
      };
    },
  },
  {
    name: 'search_shipments', title: 'Search shipment records', feature: 'shipments',
    description: 'Search raw US import bills of lading by product description (PowerQuery syntax: AND, NOT, "exact phrase", wildcards). Useful for competitive intelligence.',
    schema: { query: z.string().min(2), pageSize: z.number().int().min(1).max(25).default(5) },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(ctx, a) {
      const r = await searchShipments(a.query, { pageSize: a.pageSize });
      return { speech: `${r.total ?? r.shipments.length} shipment records match. Latest: ${r.shipments.slice(0, 2).map((s) => `${s.supplier} to ${s.importer}`).join('; ') || 'none'}.`, data: r };
    },
  },
  {
    name: 'start_sourcing_mission', title: 'Run a sourcing mission', feature: 'mission',
    description: 'AGENTIC: one request runs the full workflow — find proven suppliers, enrich, score, estimate landed cost, filter by budget, shortlist 3, draft an RFQ email for the best one — and saves the mission for later sessions. Use for "find me X for my shop", "source N units of X".',
    schema: {
      product: z.string().min(2), quantity: z.number().int().positive().default(1000), destination: dest,
      unitWeightKg: z.number().positive().default(0.2), maxUnitLandedUsd: z.number().positive().optional().describe('Budget per unit, landed'),
      targetUnitPriceUsd: z.number().positive().optional().describe('Expected factory (FOB) price per unit in USD, used for landed cost when the supplier price is unknown (customs data has no prices)'),
      priority: z.enum(['balanced', 'price', 'speed']).default('balanced'), mode: z.enum(['sea', 'air', 'post']).default('sea'),
      language: z.enum(['en', 'fr']).default('en').describe('Language of the RFQ email'), buyerName: z.string().optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
    ui: MISSION_CARD_URI,
    async handler(ctx, a) { const m = await runMission(ctx, a); return { speech: m.speech, data: m }; },
  },
  {
    name: 'list_missions', title: 'List my missions', feature: 'watchlist',
    description: 'List the user\'s saved sourcing missions (persisted across sessions and devices).',
    schema: {}, annotations: { readOnlyHint: true },
    async handler(ctx) {
      const ms = await listMissions(ctx);
      return { speech: ms.length ? `You have ${ms.length} mission${ms.length > 1 ? 's' : ''}. Latest: ${ms.slice(0, 3).map((m) => `${m.input.product}, ${m.status.replace('_', ' ')}`).join('; ')}.` : 'No missions yet. Try: find me 2000 glass bottles for my monoi.', data: { missions: ms } };
    },
  },
  {
    name: 'get_mission', title: 'Get mission details', feature: 'watchlist',
    description: 'Get a saved mission: shortlist, scores with reasons, landed costs, RFQ draft and the agent\'s step log. Use for "compare", "what did you find last time".',
    schema: { missionId: z.string().optional().describe('Mission id; omit for the latest') },
    annotations: { readOnlyHint: true }, ui: MISSION_CARD_URI,
    async handler(ctx, a) {
      const m = a.missionId ? await getMission(ctx, a.missionId) : (await listMissions(ctx))[0];
      if (!m) return { speech: 'I could not find that mission.', data: null };
      const s = m.shortlist.map((x, i) => `${i + 1}: ${x.name}, ${x.country}, score ${x.score}${x.localUnit ? `, ${Math.round(x.localUnit.unit)} ${x.localUnit.currency} per unit landed` : ''}`).join('. ');
      return { speech: `Your ${m.input.product} mission: ${s}. RFQ to ${m.rfq.to} is ${m.rfq.status}.`, data: m };
    },
  },
  {
    name: 'approve_rfq', title: 'Approve or reject the RFQ', feature: 'rfq',
    description: 'Human-in-the-loop: approve (or reject) the drafted request-for-quotation of a mission. Approval returns a ready-to-send email link; ManaLog never emails suppliers without explicit approval.',
    schema: { missionId: z.string().optional(), decision: z.enum(['approved', 'rejected']).default('approved') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async handler(ctx, a) {
      const id = a.missionId ?? (await listMissions(ctx))[0]?.id;
      const m = id ? await updateRfqStatus(ctx, id, a.decision) : null;
      if (!m) return { speech: 'There is no mission with a draft to approve.', data: null };
      const [subjectLine, ...body] = m.rfq.text.split('\n');
      const subject = subjectLine.replace(/^(Subject|Objet)\s*:\s*/i, '');
      const mailto = `mailto:${m.rfq.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join('\n').trim())}`;
      return { speech: a.decision === 'approved' ? `Approved. The quote request to ${m.rfq.to} is ready in your app — one tap to send it from your own email.` : 'Okay, I discarded that draft.', data: { missionId: m.id, rfq: m.rfq, mailto } };
    },
  },
  {
    name: 'scrape_supplier_site', title: 'Read a supplier website', feature: 'scrape',
    description: 'Visit ONE public supplier web page (robots.txt respected) and extract contact emails, phones, product/contact links and an AI summary card.',
    schema: { url: z.string().url(), product: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(ctx, a) {
      const r = await scrapeSupplierSite(a.url, { product: a.product });
      if (!r.allowed) return { speech: r.message, data: r };
      return { speech: `I read ${r.title || 'the page'}. ${r.emails.length ? `Contact: ${r.emails[0]}.` : 'No public email found.'} ${r.aiCard?.summary ?? ''}`.trim(), data: r };
    },
  },
  {
    name: 'watch_supplier', title: 'Watch a supplier', feature: 'watchlist',
    description: 'Add (or remove) a supplier to the user\'s watchlist to get notified of new shipments in later sessions.',
    schema: { supplierSlug: z.string(), note: z.string().optional(), remove: z.boolean().default(false) },
    annotations: { readOnlyHint: false, idempotentHint: true },
    async handler(ctx, a) {
      if (a.remove) { await unwatchSupplier(ctx, a.supplierSlug); return { speech: 'Removed from your watchlist.', data: { removed: a.supplierSlug } }; }
      const w = await watchSupplier(ctx, a.supplierSlug, a.note);
      return w ? { speech: `I'm now watching ${w.name}. Ask "what's new with my suppliers" anytime.`, data: w } : { speech: 'I could not find that supplier.', data: null };
    },
  },
  {
    name: 'check_watchlist', title: 'What changed with my suppliers', feature: 'watchlist',
    description: 'Check watched suppliers for new shipments or volume changes since the last check.',
    schema: {}, annotations: { readOnlyHint: false },
    async handler(ctx) {
      const r = await checkWatchlist(ctx);
      if (!r.length) return { speech: 'Your watchlist is empty.', data: { items: [] } };
      const changed = r.filter((x) => x.changes.length);
      return { speech: changed.length ? changed.map((x) => `${x.name}: ${x.changes.join(', ')}`).join('. ') : `No changes for your ${r.length} watched supplier${r.length > 1 ? 's' : ''}.`, data: { items: r } };
    },
  },
  {
    name: 'my_account', title: 'Plan, usage & destinations', feature: null,
    description: 'Show the current plan, monthly usage, brand, available destination profiles and demo products.',
    schema: {}, annotations: { readOnlyHint: true },
    async handler(ctx) {
      const u = await usage(ctx);
      return {
        speech: `You're on the ${u.planLabel} plan of ${ctx.tenant.brand.name}: ${u.calls} of ${u.limit} calls used this month.`,
        data: { ...u, brand: ctx.tenant.brand, destinations: listDestinations(ctx.tenant.overrides ?? {}), dataMode: dataMode(), demoProducts: dataMode() === 'demo' ? knownDemoProducts() : null, upgradeUrl: config.upgradeUrl },
      };
    },
  },
];
