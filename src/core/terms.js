// Search-term planner: turns what the user said ("fournitures de tatouage", "coquillages") into the precise
// English terms trade databases index, plus HS codes for trade statistics. Bedrock does it for any product;
// a small dictionary covers the common island products offline and when Bedrock is off.
import { bedrockEnabled, generate, parseJson } from './bedrock.js';
import { normalizeProduct } from './importyeti.js';

// match: lowercase fragments (FR/EN/Tahitian) · terms: English search terms, best first · hs: HS-4 headings (illustrative)
const DICTIONARY = [
  { match: ['tatouage', 'tattoo', 'tatau'], terms: ['tattoo needles', 'tattoo ink', 'tattoo cartridges'], hs: ['3215'], regulated: 'Tattoo inks are regulated (composition, labelling, import authorisation): check the local rules before ordering.' },
  { match: ['yarn', 'fil ', 'fils ', 'laine', 'wool', 'tricot', 'crochet', 'knitting'], terms: ['yarn', 'knitting yarn', 'cotton yarn'], hs: ['5205', '5207', '5509', '5511'] },
  { match: ['nacre', 'mother of pearl'], terms: ['mother of pearl shell', 'mother of pearl'], hs: ['0508', '9601'] },
  { match: ['coquillage', 'seashell', 'sea shell', 'shells', 'shell', 'cowrie', 'porcelaine'], terms: ['seashells', 'cowrie shells', 'shell craft'], hs: ['0508'] },
  { match: ['perle de verre', 'perles de verre', 'bead'], terms: ['glass beads', 'beads'], hs: ['7018'] },
  { match: ['tissu', 'fabric', 'pareo', 'paréo'], terms: ['printed rayon fabric', 'cotton fabric'], hs: ['5408', '5208'] },
  { match: ['flacon', 'glass bottle', 'bottle', 'bouteille'], terms: ['glass bottle', 'cosmetic glass bottle'], hs: ['7010'] },
  { match: ['huile de coco', 'coconut oil'], terms: ['coconut oil'], hs: ['1513'] },
  { match: ['vanille', 'vanilla'], terms: ['vanilla'], hs: ['0905'] },
  { match: ['sac kraft', 'kraft', 'paper bag'], terms: ['kraft paper bag', 'paper bag'], hs: ['4819'] },
];

const cache = new Map();

/** @returns {Promise<{product:string, terms:string[], hsCodes:string[], regulated:string|null, by:'bedrock'|'dictionary'|'as-is'}>} */
export async function planSearch(product, { useAi = bedrockEnabled() } = {}) {
  const raw = String(product || '').trim();
  const key = raw.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let plan = null;
  if (useAi) {
    try {
      const out = await generate(
        'You prepare searches in trade databases (US customs bills of lading, web search, AliExpress). Reply ONLY with JSON: ' +
        '{"terms":["..."],"hsCodes":["...."],"regulated":null}. terms: 1-3 short English product names as written on shipping documents, most specific first. ' +
        'hsCodes: 1-3 four-digit HS headings. regulated: one short sentence if importing it needs special permits or safety rules (e.g. tattoo ink, cosmetics, food), else null. Never invent brands.',
        raw, { maxTokens: 200, temperature: 0 },
      );
      const j = parseJson(out);
      if (Array.isArray(j?.terms) && j.terms.length) {
        plan = {
          terms: j.terms.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 3),
          hsCodes: (j.hsCodes ?? []).map((h) => String(h).replace(/\D/g, '').slice(0, 4)).filter((h) => h.length === 4).slice(0, 3),
          regulated: j.regulated ? String(j.regulated) : null, by: 'bedrock',
        };
      }
    } catch { /* fall back to the dictionary */ }
  }
  if (!plan) {
    const padded = ` ${key} `;
    const hit = DICTIONARY.find((d) => d.match.some((m) => padded.includes(m)));
    plan = hit
      ? { terms: hit.terms, hsCodes: hit.hs, regulated: hit.regulated ?? null, by: 'dictionary' }
      : { terms: [normalizeProduct(raw)], hsCodes: [], regulated: null, by: 'as-is' };
  }
  plan = { product: plan.terms[0], ...plan };
  cache.set(key, plan);
  return plan;
}

export function _resetTermsCacheForTests() { cache.clear(); }
