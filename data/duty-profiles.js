// Destination duty & tax profiles used by the landed-cost estimator.
// ⚠️ Rates are ILLUSTRATIVE defaults for demos, marked verified:false. Real tariffs depend on the exact
// HS code, origin, trade agreements and local rules — each white-label tenant overrides these with
// rates confirmed by its customs broker (see docs/WHITE_LABEL.md). The estimator always says so.

import { getProfile } from 'pacific-customs-kit';

// Fiji and French Polynesia come from the open-source pacific-customs-kit (MIT): official VAT, valuation rules and
// fixed taxes with sources. The landed-cost engine delegates their tax math to the kit (see src/core/landed-cost.js).
const fjKit = getProfile('FJ');
const pfKit = getProfile('PF');

export const dutyProfiles = {
  PF: {
    name: 'French Polynesia (Tahiti)', currency: 'XPF', fxPerUsd: pfKit.fx.indicativeXpfPerUsd, verified: false, kit: 'PF',
    notes: 'VAT 16% on CIF + duty + taxes, TEA 2%, toll 1.25%, statistical tax and PID are official (customs FAQ). Customs duty depends on the tariff line and origin; product taxes (TDL, TCP...) are not included. Check a line with the official customs simulator or a transitaire.',
    sources: { vat: pfKit.vat.source, valuation: pfKit.valuation.source, simulator: pfKit.lodgement.officialSimulator },
    ports: pfKit.offices,
  },
  FJ: {
    name: 'Fiji', currency: 'FJD', fxPerUsd: fjKit.fx.indicativeFjdPerUsd, verified: false, kit: 'FJ',
    notes: `VAT ${fjKit.vat.rate * 100}% is official (FRCS). Fiscal duty and excise are illustrative until the exact tariff line is confirmed; FRCS converts at the weekly ASYCUDA exchange rate. Entries are lodged in ASYCUDA World by the importer or a customs agent.`,
    sources: { vat: fjKit.vat.source, valuation: fjKit.valuation.source },
    ports: fjKit.offices,
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
  FJ: { near: ['New Zealand', 'Australia', 'New Caledonia', 'Samoa', 'Tonga', 'Vanuatu', 'Tuvalu', 'French Polynesia'], mid: ['China', 'Hong Kong', 'United States', 'Japan', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'India', 'Papua New Guinea'] },
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
