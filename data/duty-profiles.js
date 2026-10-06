// Destination duty & tax profiles used by the landed-cost estimator.
// ⚠️ Rates are ILLUSTRATIVE defaults for demos, marked verified:false. Real tariffs depend on the exact
// HS code, origin, trade agreements and local rules — each white-label tenant overrides these with
// rates confirmed by its customs broker (see docs/WHITE_LABEL.md). The estimator always says so.

export const dutyProfiles = {
  PF: {
    name: 'French Polynesia (Tahiti)', currency: 'XPF', fxPerUsd: 110, verified: false,
    notes: 'Island destination: most goods transit via Papeete. Local taxes stack on CIF value. Verify with the Direction régionale des douanes de Polynésie française or a licensed broker.',
    categories: {
      packaging:        [{ name: 'Customs duty', rate: 0.05 }, { name: 'Local development tax', rate: 0.10 }, { name: 'VAT (import)', rate: 0.16, compound: true }],
      food_raw:         [{ name: 'Customs duty', rate: 0.00 }, { name: 'Local development tax', rate: 0.05 }, { name: 'VAT (import, reduced)', rate: 0.05, compound: true }],
      cosmetic_inputs:  [{ name: 'Customs duty', rate: 0.05 }, { name: 'Local development tax', rate: 0.10 }, { name: 'VAT (import)', rate: 0.16, compound: true }],
      craft_materials:  [{ name: 'Customs duty', rate: 0.05 }, { name: 'Local development tax', rate: 0.05 }, { name: 'VAT (import)', rate: 0.16, compound: true }],
      general:          [{ name: 'Customs duty', rate: 0.10 }, { name: 'Local development tax', rate: 0.10 }, { name: 'VAT (import)', rate: 0.16, compound: true }],
    },
  },
  US: {
    name: 'United States', currency: 'USD', fxPerUsd: 1, verified: false,
    notes: 'Duty from the HTSUS rate for the exact code; add MPF/HMF fees for formal entries. Section 301/232 tariffs may apply by origin.',
    categories: {
      packaging: [{ name: 'Duty (HTS est.)', rate: 0.03 }, { name: 'MPF + HMF (est.)', rate: 0.0047 }],
      food_raw: [{ name: 'Duty (HTS est.)', rate: 0.0 }, { name: 'MPF + HMF (est.)', rate: 0.0047 }],
      cosmetic_inputs: [{ name: 'Duty (HTS est.)', rate: 0.03 }, { name: 'MPF + HMF (est.)', rate: 0.0047 }],
      craft_materials: [{ name: 'Duty (HTS est.)', rate: 0.04 }, { name: 'MPF + HMF (est.)', rate: 0.0047 }],
      general: [{ name: 'Duty (HTS est.)', rate: 0.05 }, { name: 'MPF + HMF (est.)', rate: 0.0047 }],
    },
  },
  FR: {
    name: 'France (EU)', currency: 'EUR', fxPerUsd: 0.92, verified: false,
    notes: 'EU Common Customs Tariff (TARIC) by CN code, then French import VAT on (CIF + duty).',
    categories: {
      packaging: [{ name: 'EU duty (TARIC est.)', rate: 0.05 }, { name: 'VAT (import)', rate: 0.20, compound: true }],
      food_raw: [{ name: 'EU duty (TARIC est.)', rate: 0.06 }, { name: 'VAT (import, reduced)', rate: 0.055, compound: true }],
      cosmetic_inputs: [{ name: 'EU duty (TARIC est.)', rate: 0.03 }, { name: 'VAT (import)', rate: 0.20, compound: true }],
      craft_materials: [{ name: 'EU duty (TARIC est.)', rate: 0.03 }, { name: 'VAT (import)', rate: 0.20, compound: true }],
      general: [{ name: 'EU duty (TARIC est.)', rate: 0.04 }, { name: 'VAT (import)', rate: 0.20, compound: true }],
    },
  },
};

// USD per kg, by freight mode and distance band (origin→destination). Illustrative consolidated rates.
export const freightRates = {
  sea:  { near: 0.9, mid: 1.6, far: 2.4, minimumUsd: 180, transitDays: { near: 12, mid: 28, far: 45 } },
  air:  { near: 5.5, mid: 8.0, far: 11.0, minimumUsd: 90, transitDays: { near: 3, mid: 6, far: 9 } },
  post: { near: 9.0, mid: 14.0, far: 19.0, minimumUsd: 15, transitDays: { near: 10, mid: 18, far: 28 } },
};

// Rough distance bands from each origin country to each destination (island logistics!).
const regions = {
  PF: { near: ['New Zealand', 'Fiji', 'Cook Islands', 'Samoa', 'Tonga', 'New Caledonia'], mid: ['Australia', 'United States', 'Chile', 'Papua New Guinea', 'Philippines', 'Indonesia', 'Japan'] },
  US: { near: ['Mexico', 'Canada'], mid: ['China', 'Vietnam', 'Japan', 'Philippines', 'Indonesia', 'French Polynesia', 'Fiji', 'New Zealand', 'Australia', 'Papua New Guinea', 'Colombia'] },
  FR: { near: ['Portugal', 'Spain', 'Italy', 'Germany', 'Belgium'], mid: ['Morocco', 'Tunisia', 'Turkey', 'India', 'Madagascar'] },
};

export function distanceBand(origin, dest) {
  const r = regions[dest];
  if (!r || !origin) return 'far';
  if (r.near.includes(origin)) return 'near';
  if (r.mid.includes(origin)) return 'mid';
  return 'far';
}

export const categoryHints = {
  packaging: ['bottle', 'jar', 'bag', 'box', 'packaging', 'label', 'kraft', 'pump', 'flacon'],
  food_raw: ['vanilla', 'spice', 'cocoa', 'coffee', 'sugar', 'flour'],
  cosmetic_inputs: ['oil', 'butter', 'essential', 'fragrance', 'wax', 'soap', 'monoi'],
  craft_materials: ['pearl', 'shell', 'bead', 'wood', 'pandanus', 'fiber', 'tapa', 'resin', 'polymer', 'yarn', 'thread'],
};
