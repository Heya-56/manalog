// DEMO DATA — every company below is FICTIONAL. It mirrors the shape of ImportYeti US bill-of-lading
// data so the whole agent can be tested (and judged) without an API key or paid credits.
// Switch to live data with MANALOG_DATA_MODE=live + IY_API_KEY.

const S = (slug, name, country, city, shipments12m, lastShipment, topProducts, extra = {}) => ({
  slug, name, country, city, shipments12m, lastShipment, topProducts,
  website: extra.website ?? null, email: extra.email ?? null, phone: extra.phone ?? null,
  moq: extra.moq ?? null, unitPriceUsd: extra.unitPriceUsd ?? null, leadTimeDays: extra.leadTimeDays ?? null,
  customers: extra.customers ?? [], hsCodes: extra.hsCodes ?? [],
});

export const suppliersByProduct = {
  'glass bottle': [
    S('lumiere-glassworks-fr', 'Lumière Glassworks (demo)', 'France', 'Lyon', 84, '2026-08-21', ['amber glass bottle 100ml', 'dropper bottle', 'perfume flacon'], { website: 'https://example.com/lumiere', email: 'export@example.com', moq: 1000, unitPriceUsd: 0.62, leadTimeDays: 35, customers: ['Coastline Botanicals (demo)', 'Moana Skin Co (demo)'], hsCodes: ['7010.90'] }),
    S('pacific-rim-packaging-cn', 'Pacific Rim Packaging (demo)', 'China', 'Ningbo', 212, '2026-09-02', ['glass bottle cosmetic', 'pump bottle', 'serum bottle'], { moq: 5000, unitPriceUsd: 0.21, leadTimeDays: 45, customers: ['Sunset Soap Works (demo)'], hsCodes: ['7010.90', '3923.30'] }),
    S('aoraki-bottle-nz', 'Aoraki Bottle Supply (demo)', 'New Zealand', 'Auckland', 19, '2026-07-30', ['amber glass bottle', 'jar with bamboo lid'], { moq: 300, unitPriceUsd: 0.95, leadTimeDays: 14, hsCodes: ['7010.90'] }),
    S('saigon-glass-vn', 'Saigon Glass Craft (demo)', 'Vietnam', 'Ho Chi Minh City', 57, '2026-08-10', ['frosted glass bottle', 'roll-on bottle'], { moq: 2000, unitPriceUsd: 0.34, leadTimeDays: 40, hsCodes: ['7010.90'] }),
  ],
  'vanilla': [
    S('sava-green-gold-mg', 'Sava Green Gold (demo)', 'Madagascar', 'Sambava', 131, '2026-08-28', ['vanilla beans grade A', 'vanilla extract'], { moq: 10, unitPriceUsd: 240, leadTimeDays: 21, customers: ['Heartland Flavors (demo)'], hsCodes: ['0905.10'] }),
    S('bali-spice-house-id', 'Bali Spice House (demo)', 'Indonesia', 'Denpasar', 48, '2026-07-15', ['vanilla planifolia', 'cinnamon'], { moq: 5, unitPriceUsd: 180, leadTimeDays: 25, hsCodes: ['0905.10'] }),
    S('png-highland-vanilla-pg', 'PNG Highland Vanilla (demo)', 'Papua New Guinea', 'Wewak', 22, '2026-06-02', ['vanilla tahitensis', 'cocoa'], { moq: 5, unitPriceUsd: 210, leadTimeDays: 30, hsCodes: ['0905.10'] }),
  ],
  'coconut oil': [
    S('samar-coco-ph', 'Samar Coco Mills (demo)', 'Philippines', 'Tacloban', 176, '2026-09-05', ['virgin coconut oil', 'copra oil'], { moq: 500, unitPriceUsd: 3.1, leadTimeDays: 30, hsCodes: ['1513.11'] }),
    S('fiji-pure-coconut-fj', 'Fiji Pure Coconut (demo)', 'Fiji', 'Suva', 31, '2026-08-01', ['cold pressed coconut oil', 'coconut soap base'], { moq: 200, unitPriceUsd: 4.4, leadTimeDays: 18, hsCodes: ['1513.11'] }),
    S('kerala-kera-in', 'Kerala Kera Exports (demo)', 'India', 'Kochi', 98, '2026-08-19', ['coconut oil bulk', 'coconut milk powder'], { moq: 1000, unitPriceUsd: 2.6, leadTimeDays: 35, hsCodes: ['1513.11'] }),
  ],
  'kraft paper bag': [
    S('green-fold-vn', 'GreenFold Packaging (demo)', 'Vietnam', 'Hai Phong', 143, '2026-09-01', ['kraft paper bag', 'gift box', 'tissue paper'], { moq: 3000, unitPriceUsd: 0.09, leadTimeDays: 38, hsCodes: ['4819.30'] }),
    S('eco-wrap-pt', 'EcoWrap Portugal (demo)', 'Portugal', 'Porto', 26, '2026-08-12', ['recycled kraft bag', 'cork packaging'], { moq: 500, unitPriceUsd: 0.28, leadTimeDays: 20, hsCodes: ['4819.40'] }),
  ],
  'mother of pearl': [
    S('pearl-coast-crafts-ph', 'Pearl Coast Crafts (demo)', 'Philippines', 'Cebu', 64, '2026-08-25', ['mother of pearl buttons', 'shell inlay sheets'], { moq: 1000, unitPriceUsd: 0.18, leadTimeDays: 28, hsCodes: ['9601.90'] }),
    S('lombok-shell-id', 'Lombok Shell Works (demo)', 'Indonesia', 'Mataram', 29, '2026-07-09', ['pearl shell jewelry blanks', 'shell beads'], { moq: 200, unitPriceUsd: 0.45, leadTimeDays: 30, hsCodes: ['9601.90'] }),
  ],
};

// US importers of a product — used for EXPORT prospecting ("who buys vanilla in the US?").
export const buyersByProduct = {
  'vanilla': [
    { slug: 'heartland-flavors-us', name: 'Heartland Flavors (demo)', state: 'IL', shipments12m: 73, topOrigins: ['Madagascar', 'Indonesia'], website: 'https://example.com/heartland' },
    { slug: 'pacific-gourmet-us', name: 'Pacific Gourmet Imports (demo)', state: 'CA', shipments12m: 28, topOrigins: ['Papua New Guinea', 'Tonga', 'French Polynesia'], website: 'https://example.com/pg' },
    { slug: 'artisan-bakers-supply-us', name: 'Artisan Bakers Supply (demo)', state: 'OR', shipments12m: 11, topOrigins: ['Mexico', 'Uganda'] },
  ],
  'monoi': [
    { slug: 'coastline-botanicals-us', name: 'Coastline Botanicals (demo)', state: 'HI', shipments12m: 17, topOrigins: ['French Polynesia', 'Fiji'], website: 'https://example.com/coastline' },
    { slug: 'moana-skin-co-us', name: 'Moana Skin Co (demo)', state: 'CA', shipments12m: 9, topOrigins: ['French Polynesia'] },
  ],
  'coconut oil': [
    { slug: 'sunset-soap-works-us', name: 'Sunset Soap Works (demo)', state: 'FL', shipments12m: 41, topOrigins: ['Philippines', 'Sri Lanka'] },
  ],
  'black pearl': [
    { slug: 'blue-lagoon-jewelers-us', name: 'Blue Lagoon Jewelers (demo)', state: 'NY', shipments12m: 22, topOrigins: ['French Polynesia', 'Japan'] },
  ],
};

export const aliases = {
  'bottle': 'glass bottle', 'bottles': 'glass bottle', 'glass bottles': 'glass bottle', 'flacon': 'glass bottle', 'flacons': 'glass bottle',
  'vanille': 'vanilla', 'vanilla beans': 'vanilla',
  'huile de coco': 'coconut oil', 'coprah': 'coconut oil', 'copra': 'coconut oil',
  'kraft': 'kraft paper bag', 'paper bags': 'kraft paper bag', 'sac kraft': 'kraft paper bag', 'packaging': 'kraft paper bag',
  'nacre': 'mother of pearl', 'shell': 'mother of pearl',
  'monoï': 'monoi', 'perle noire': 'black pearl', 'pearls': 'black pearl', 'tahitian pearl': 'black pearl',
};
