// Landed-cost estimator: goods + freight + insurance → CIF, then stacked duties/taxes per destination profile.
import { computeImportCharges } from 'pacific-customs-kit';
import { dutyProfiles, freightRates, distanceBand, categoryHints } from '../../data/duty-profiles.js';

export function guessCategory(product = '') {
  const p = product.toLowerCase();
  for (const [cat, words] of Object.entries(categoryHints)) if (words.some((w) => p.includes(w))) return cat;
  return 'general';
}

const r2 = (n) => Math.round(n * 100) / 100;

// Suggested national tariff lines for unambiguous demo products (the classification must still be confirmed).
const SUGGESTED_LINES = [
  { words: ['glass bottle', 'flacon', 'bouteille en verre'], hs: '70109000' },
  { words: ['vanilla', 'vanille'], hs: '09051000' },
  { words: ['kraft', 'paper bag', 'sac papier'], hs: '48194000' },
];
export const suggestTariffLine = (product = '') => SUGGESTED_LINES.find((x) => x.words.some((w) => product.toLowerCase().includes(w)))?.hs ?? null;

/**
 * @param {object} i
 * @param {number} i.unitPriceUsd  FOB/ex-works unit price
 * @param {number} i.quantity
 * @param {number} i.unitWeightKg
 * @param {string} i.origin        origin country name
 * @param {string} i.destination   profile code (PF, US, FR)
 * @param {'sea'|'air'|'post'} [i.mode]
 * @param {string} [i.product]
 * @param {string} [i.category]
 * @param {object} [overrides]     tenant overrides { dutyProfiles, freightRates }
 */
export function estimateLandedCost(i, overrides = {}) {
  const profiles = { ...dutyProfiles, ...(overrides.dutyProfiles ?? {}) };
  const rates = { ...freightRates, ...(overrides.freightRates ?? {}) };
  const dest = (i.destination || 'PF').toUpperCase();
  const profile = profiles[dest];
  if (!profile) throw new Error(`Unknown destination profile "${dest}". Available: ${Object.keys(profiles).join(', ')}`);
  const mode = i.mode && rates[i.mode] ? i.mode : 'sea';
  const qty = Math.max(1, Math.floor(i.quantity || 1));
  const goods = (i.unitPriceUsd || 0) * qty;
  const weight = Math.max(0.01, (i.unitWeightKg || 0.1) * qty);
  const band = distanceBand(i.origin, dest);
  const fr = rates[mode];
  const freight = Math.max(fr.minimumUsd, fr[band] * weight);
  const insurance = 0.005 * (goods + freight);
  const cif = goods + freight + insurance;
  const knownCats = ['packaging', 'food_raw', 'cosmetic_inputs', 'craft_materials', 'general'];
  const category = i.category && (profile.categories?.[i.category] || (profile.kit && knownCats.includes(i.category))) ? i.category : guessCategory(i.product);
  const fx = profile.fxPerUsd;

  let running = cif;
  let taxes;
  let kitNotes = [];
  let tariffLine = null;
  if (profile.kit && !profile.categories) {
    // Pacific profiles: exact local-currency math from pacific-customs-kit (official VAT base, fixed taxes, rounding).
    const hsCode = i.hsCode ?? suggestTariffLine(i.product);
    const k = computeImportCharges({ country: profile.kit, valueForDuty: r2(cif * fx), category, weightKg: weight, lineCount: 1, dutyRate: i.dutyRate, hsCode, mode: mode === 'air' ? 'air' : 'sea' });
    if (k.tariffLine) tariffLine = { ...k.tariffLine, classification: i.hsCode ? 'given' : 'suggested — confirm the HS code' };
    taxes = k.lines.map((l) => ({ name: l.name, rate: l.rate, baseUsd: r2(l.base / fx), amountUsd: r2(l.amount / fx), amountLocal: l.amount, rateSource: l.rateSource }));
    running = cif + k.totalCharges / fx;
    kitNotes = k.notes;
  } else {
    const lines = profile.categories[category] ?? profile.categories.general;
    taxes = lines.map((t) => {
      const base = t.compound ? running : cif;
      const amount = base * t.rate;
      running += amount;
      return { name: t.name, rate: t.rate, baseUsd: r2(base), amountUsd: r2(amount) };
    });
  }
  const brokerage = dest === 'US' ? 125 : 95; // flat broker/handling estimate
  const total = running + brokerage;
  return {
    destination: dest, destinationName: profile.name, category, mode, distanceBand: band,
    transitDays: fr.transitDays[band], quantity: qty, totalWeightKg: r2(weight),
    breakdownUsd: { goods: r2(goods), freight: r2(freight), insurance: r2(insurance), cif: r2(cif), taxes, brokerage },
    totalUsd: r2(total), unitLandedUsd: r2(total / qty),
    local: { currency: profile.currency, total: Math.round(total * fx), unit: r2((total / qty) * fx) },
    landedMultiplier: goods > 0 ? r2(total / goods) : null,
    verifiedRates: !!profile.verified,
    disclaimer: profile.verified ? null : 'Estimate using illustrative rates — confirm the HS code and rates with a licensed customs broker before ordering.',
    notes: profile.notes,
    ...(kitNotes.length ? { calcNotes: kitNotes } : {}),
    ...(profile.kit ? { engine: 'pacific-customs-kit' } : {}),
    ...(tariffLine ? { tariffLine } : {}),
  };
}

export const listDestinations = (overrides = {}) =>
  Object.entries({ ...dutyProfiles, ...(overrides.dutyProfiles ?? {}) }).map(([code, p]) => ({ code, name: p.name, currency: p.currency, verified: !!p.verified }));
