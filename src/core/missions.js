// Agentic sourcing missions: one voice request → multi-step autonomous workflow
// (trade data → enrichment → scoring → landed cost → shortlist → RFQ draft), persisted across sessions.
import { randomUUID } from 'node:crypto';
import { supplierProfile, mergeSupplier, dataMode } from './importyeti.js';
import { discoverSuppliers } from './discovery.js';
import { rankScored } from './scoring.js';
import { estimateLandedCost } from './landed-cost.js';
import { bedrockEnabled, generate } from './bedrock.js';
import { store, userPk } from './store.js';
import { config } from './config.js';

export async function draftRfq({ supplier, product, quantity, destination, buyerName, language = 'en', brand }) {
  const facts = { supplier: supplier.name, country: supplier.country, product, quantity, destination, buyer: buyerName || 'our company', moq: supplier.moq };
  if (bedrockEnabled()) {
    const text = await generate(
      `You write concise, professional B2B request-for-quotation emails for a small importer. Language: ${language === 'fr' ? 'French' : 'English'}. ` +
      'Plain text only, no markdown (no asterisks or bold). First line: "Subject: ..." (or "Objet : ..." in French). Include: subject line, short intro, product & quantity, destination port and Incoterm question (FOB vs CIF), requested info (unit price tiers, MOQ, lead time, samples, certifications, HS code), and a polite close. Under 170 words. No placeholders in brackets except the sender signature.',
      JSON.stringify(facts), { maxTokens: 500 },
    );
    return { generatedBy: 'bedrock', text: text.replace(/\*\*|__|^#+\s*/gm, '').trim() };
  }
  const fr = language === 'fr';
  const port = destination === 'PF' ? (fr ? 'Papeete, Polynésie française' : 'Papeete, French Polynesia') : destination;
  const text = fr
    ? `Objet : Demande de devis — ${product} (${quantity} unités)\n\nBonjour ${supplier.name},\n\nNous souhaitons commander ${quantity} unités de ${product}, livraison ${port}. Pourriez-vous nous indiquer :\n- prix unitaire par palier de quantité (FOB et CIF),\n- MOQ et délai de production,\n- possibilité d'échantillons,\n- certifications et code SH.\n\nMerci d'avance,\n${facts.buyer}`
    : `Subject: RFQ — ${product} (${quantity} units)\n\nHello ${supplier.name} team,\n\nWe would like a quotation for ${quantity} units of ${product}, delivered to ${port}. Could you share:\n- unit price by quantity tier (FOB and CIF),\n- MOQ and production lead time,\n- sample availability,\n- certifications and HS code.\n\nThank you,\n${facts.buyer}`;
  return { generatedBy: 'template', text: brand?.name && brand.name !== 'ManaLog' ? `${text}\n\n— sent via ${brand.name}` : text };
}

export async function runMission(ctx, input) {
  const { product, quantity = 1000, destination = 'PF', unitWeightKg = 0.2, maxUnitLandedUsd, targetUnitPriceUsd, priority = 'balanced', mode = 'sea', language = 'en', buyerName } = input;
  const steps = [];
  const log = (s) => steps.push({ at: new Date().toISOString(), step: s });

  const found = await discoverSuppliers(product, { limit: 8, destination });
  found.steps.forEach(log);
  if (!found.suppliers.length) {
    const tried = found.plan ? found.plan.terms.join(', ') : found.product;
    return { status: 'no_results', product: found.product, steps, speech: language === 'fr'
      ? `Je n'ai trouvé aucun fournisseur pour ${product} (recherché : ${tried}). Essayez un nom de produit plus précis.`
      : `I couldn't find suppliers of ${product} (searched: ${tried}). Try a more specific product name.` };
  }

  // Enrich the top customs candidates with their full profile (live mode only; demo fixtures are already complete)
  let profiled = 0;
  const enriched = await Promise.all(found.suppliers.map(async (s) => {
    if (s.source !== 'customs' || !s.slug || dataMode() !== 'live' || profiled >= 3) return s;
    profiled++;
    return mergeSupplier(s, await supplierProfile(s.slug).catch(() => null));
  }));
  if (profiled) log(`Enriched ${profiled} customs candidates with supplier profiles`);

  const scored = rankScored(enriched, { destination, quantity, priority, origins: found.origins?.origins });
  log(`Scored ${scored.length} suppliers on track record, recency, proximity to ${destination}, MOQ fit, reachability${found.origins?.origins?.length ? ' and official trade statistics' : ''}`);

  const withCost = scored.map((s) => {
    // Customs data has volumes, not prices: fall back to the user's target FOB price when the supplier has none.
    const price = s.unitPriceUsd ?? targetUnitPriceUsd;
    if (!price) return { ...s, landed: null };
    const landed = estimateLandedCost({ unitPriceUsd: price, quantity, unitWeightKg, origin: s.country, destination, mode, product: found.product }, ctx.tenant.overrides ?? {});
    return { ...s, landed };
  });
  log(`Estimated landed cost to ${destination} by ${mode} for suppliers with known prices`);

  // Blend price into the score: the cheapest landed unit earns +15, others proportionally less.
  const costs = withCost.map((s) => s.landed?.unitLandedUsd).filter((x) => x > 0);
  if (costs.length) {
    const min = Math.min(...costs);
    for (const s of withCost) {
      if (!s.landed) continue;
      const pts = Math.round(15 * (min / s.landed.unitLandedUsd));
      s.score = Math.min(100, s.score + pts);
      s.reasons = [...s.reasons, `landed ${s.landed.local.unit} ${s.landed.local.currency}/unit (+${pts})`];
    }
    withCost.sort((a, b) => b.score - a.score);
    log('Re-ranked with landed cost (cheapest landed unit +15)');
  }

  let shortlist = withCost;
  if (maxUnitLandedUsd) {
    const within = withCost.filter((s) => s.landed && s.landed.unitLandedUsd <= maxUnitLandedUsd);
    log(`${within.length} suppliers fit your budget of $${maxUnitLandedUsd} per landed unit`);
    if (within.length) shortlist = within;
  }
  shortlist = shortlist.slice(0, 3);
  const top = shortlist[0];
  const rfq = await draftRfq({ supplier: top, product: found.product, quantity, destination, buyerName, language, brand: ctx.tenant.brand });
  log(`Drafted a request for quotation to ${top.name} (${rfq.generatedBy})`);

  const mission = {
    id: randomUUID().slice(0, 8), type: 'sourcing', status: 'shortlisted', createdAt: new Date().toISOString(),
    input: { product: found.product, requested: product, quantity, destination, unitWeightKg, maxUnitLandedUsd, priority, mode },
    shortlist: shortlist.map((s) => ({
      slug: s.slug, name: s.name, country: s.country, score: s.score, reasons: s.reasons, moq: s.moq, email: s.email, website: s.website,
      source: s.source ?? 'customs', url: s.url ?? null, offer: s.source === 'aliexpress' ? s.topProducts?.[0] ?? null : null,
      unitPriceUsd: s.unitPriceUsd ?? targetUnitPriceUsd ?? null, priceSource: s.unitPriceUsd ? 'supplier' : (targetUnitPriceUsd ? 'your target price' : null), unitLandedUsd: s.landed?.unitLandedUsd ?? null, localUnit: s.landed?.local ?? null, transitDays: s.landed?.transitDays ?? null,
    })),
    rfq: { to: top.name, email: top.email, ...rfq, status: 'draft' },
    steps, dataSource: found.source, counts: found.counts, origins: found.origins ?? null,
    searchTerms: found.plan?.terms ?? null, regulated: found.plan?.regulated ?? null,
  };
  await store().put(userPk(ctx), `MISSION#${mission.id}`, mission);

  const cur = top.landed?.local;
  const c = found.counts;
  const checked = found.source === 'live' && (c.web || c.aliexpress)
    ? `${scored.length} suppliers of ${found.product}: ${c.customs} proven exporters from US customs, ${c.web ?? 0} from the web and ${c.aliexpress ?? 0} AliExpress offers`
    : `${scored.length} proven exporters of ${found.product}`;
  mission.speech = `Done. I checked ${checked}. ` +
    `Best match: ${top.name}${top.country ? ` in ${top.country}` : ''}, score ${top.score} out of 100` +
    (cur ? `, about ${Math.round(cur.unit)} ${cur.currency} per unit landed in ${destination === 'PF' ? 'Tahiti' : destination}` : '') +
    (top.source === 'aliexpress' ? '. It can be ordered online in small quantities' : '') +
    `. I drafted a quote request for them. Say "send it" to approve, or "compare" to hear the other two.` +
    (found.plan?.regulated ? ` Note: ${found.plan.regulated}` : '');
  return mission;
}

export async function listMissions(ctx) {
  const items = await store().query(userPk(ctx), 'MISSION#');
  return items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).map(({ pk, sk, steps, ...m }) => m);
}

export async function getMission(ctx, id) {
  const m = await store().get(userPk(ctx), `MISSION#${id}`);
  if (!m) return null;
  const { pk, sk, ...rest } = m;
  return rest;
}

export async function updateRfqStatus(ctx, id, status) {
  const m = await store().get(userPk(ctx), `MISSION#${id}`);
  if (!m) return null;
  m.rfq.status = status;
  m.status = status === 'approved' ? 'rfq_approved' : m.status;
  m.steps.push({ at: new Date().toISOString(), step: `RFQ ${status} by user` });
  await store().put(userPk(ctx), `MISSION#${id}`, m);
  return m;
}
