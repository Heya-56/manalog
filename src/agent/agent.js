// Voice agent: simulates the Alexa+ experience in the browser console.
// With Bedrock enabled → Claude on Amazon Bedrock plans & calls the SAME tools the MCP server exposes.
// Without Bedrock → a small deterministic intent router, so the demo runs fully offline.
import { z } from 'zod';
import { tools } from '../mcp/tools.js';
import { executeTool } from '../mcp/server.js';
import { bedrockEnabled, converse } from '../core/bedrock.js';
import { hasFeature } from '../core/tenants.js';

const jsonSchema = (shape) => { const { $schema, ...s } = z.toJSONSchema(z.object(shape), { io: 'input' }); return s; };
const toolSpecs = () => tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: jsonSchema(t.schema) } } }));

const system = (brand) => `You are ${brand.voiceName}, a voice assistant (Alexa+ style) for small importers/exporters, built for island makers in French Polynesia.
Rules: your reply is read aloud by a speech engine: plain text only, NO markdown (no asterisks, bullets, headings or emojis); speak in 1-3 short sentences; numbers rounded; say currency as XPF for Tahiti and FJD (Fiji dollars) for Fiji. Use tools for any factual answer.
For open sourcing requests use start_sourcing_mission; if the user mentions a unit price (e.g. "about 40 cents each"), pass it as targetUnitPriceUsd. "Send it"/"approve" → approve_rfq. "Compare"/"last time" → get_mission. "Where does Tahiti buy X" → trade_flows. Fiji, Suva, Lautoka or Nadi → destination FJ. "Check my invoice", "verify the VAT", "is my customs entry right" → check_customs_documents (never compute taxes yourself; read the numbers from the tool). Pass the product in the user's own words: the server translates it into precise search terms.
Never claim an email was sent: the user sends it from the card. Mention estimates are indicative. Reply in the user's language (French or English).`;
// The console's language switch wins over language detection.
const LANG_RULE = {
  fr: '\nThe user chose French: always reply in French, and pass language "fr" to start_sourcing_mission.',
  en: '\nThe user chose English: always reply in English.',
};

export async function runAgent(ctx, { text, history = [], lang }) {
  const calls = [];
  lang = ['fr', 'en'].includes(lang) ? lang : undefined;
  // Bedrock (paid LLM calls) only for tenants whose plan includes agentic missions; others get the free router.
  if (!bedrockEnabled() || !hasFeature(ctx, 'mission')) return routeOffline(ctx, text, calls, { history, keyless: bedrockEnabled(), chosenLang: lang });

  const messages = [
    ...history.slice(-6).filter((h) => h.text).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: [{ text: h.text }] })),
    { role: 'user', content: [{ text }] },
  ];
  // Bedrock requires alternating roles starting with user
  while (messages.length && messages[0].role !== 'user') messages.shift();
  for (let i = 0; i < 6; i++) {
    const r = await converse({ system: system(ctx.tenant.brand) + (lang ? LANG_RULE[lang] : ''), messages, tools: toolSpecs() });
    const msg = r.output?.message;
    messages.push(msg);
    const uses = (msg?.content ?? []).filter((b) => b.toolUse);
    if (r.stopReason !== 'tool_use' || !uses.length) {
      return { reply: (msg?.content ?? []).map((b) => b.text ?? '').join(' ').trim(), calls, engine: 'bedrock' };
    }
    const results = [];
    for (const { toolUse } of uses) {
      if (lang && toolUse.name === 'start_sourcing_mission') toolUse.input = { ...toolUse.input, language: lang };
      const out = await executeTool(ctx, toolUse.name, toolUse.input ?? {});
      calls.push({ name: toolUse.name, args: toolUse.input, speech: out.speech, data: out.data });
      results.push({ toolResult: { toolUseId: toolUse.toolUseId, status: out.error ? 'error' : 'success', content: [{ json: { speech: out.speech, data: trim(out.data) } }] } });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: calls.at(-1)?.speech ?? 'Done.', calls, engine: 'bedrock' };
}

const trim = (d) => JSON.parse(JSON.stringify(d ?? {}, (k, v) => (k === 'steps' || k === 'textSample' ? undefined : v)));

// ---------- offline intent router (no LLM) ----------
const numberIn = (t) => { const m = t.replace(/(?<=\d)[,\s](?=\d{3}\b)/g, '').match(/\b(\d{2,7})\b/); return m ? Number(m[1]) : undefined; };
const PRODUCTS = ['glass bottle', 'bottle', 'flacon', 'vanilla', 'vanille', 'coconut oil', 'huile de coco', 'kraft', 'paper bag', 'sac kraft', 'mother of pearl', 'nacre', 'monoi', 'monoï', 'black pearl', 'perle noire'];
const productIn = (t) => PRODUCTS.find((p) => t.includes(p));

// Small talk / fallback answers: several variants so the router never repeats its previous reply word for word.
const SMALL_TALK = {
  greet: {
    fr: ['Bonjour ! Je suis ManaLog. Dites-moi ce que vous voulez acheter ou vendre, par exemple : trouve-moi 2000 flacons pour mon monoï.', 'Ia ora na ! Que puis-je sourcer pour vous aujourd\'hui ? Un produit et une quantité suffisent.'],
    en: ['Hi! I am ManaLog. Tell me what you want to buy or sell, for example: find me 2000 glass bottles for my monoi.', 'Hello! What can I source for you today? A product and a quantity is enough.'],
  },
  thanks: {
    fr: ['Avec plaisir ! Autre chose à sourcer ?', 'Mauruuru à vous ! Je reste là si besoin.'],
    en: ['You are welcome! Anything else to source?', 'Happy to help. I am here if you need anything else.'],
  },
  help: {
    fr: ['Je sais faire quatre choses : trouver des fournisseurs, estimer un coût rendu à Tahiti, trouver des acheteurs aux États-Unis, et suivre vos missions. Par exemple : combien coûtent 3000 sacs kraft livrés ?', 'Essayez : trouve-moi 1000 flacons à 40 centimes, ou : qui achète de la vanille aux États-Unis ?'],
    en: ['I can find suppliers, estimate landed cost to Tahiti, find US buyers and track your missions. For example: how much for 3000 kraft paper bags landed?', 'Try: find me 1000 glass bottles at 40 cents each, or: who buys vanilla in the US?'],
  },
  fallback: {
    fr: ['Je n\'ai pas compris. Donnez-moi un produit et une quantité, par exemple : trouve-moi 2000 flacons pour mon monoï.', 'Pardon, je n\'ai pas saisi. Vous cherchez un fournisseur, un coût rendu, ou des acheteurs ?', 'Je ne suis pas sûr de comprendre. Essayez : qui achète de la vanille aux États-Unis ?'],
    en: ['Sorry, I did not get that. Give me a product and a quantity, for example: find me 2000 glass bottles for my monoi.', 'I did not catch that. Are you looking for a supplier, a landed cost, or buyers?', 'Not sure I understood. Try: who buys vanilla in the US?'],
  },
};
const KEY_HINT = {
  fr: 'Pour parler librement avec moi, ouvrez la console avec votre clé.',
  en: 'To chat freely with me, open the console with your key.',
};

function smallTalk(kind, lang, history, keyless) {
  const last = [...history].reverse().find((h) => h.role === 'assistant')?.text ?? '';
  const options = SMALL_TALK[kind][lang];
  const pick = options.find((o) => !last.startsWith(o)) ?? options[0];
  // The key hint is said once, not appended to every answer.
  const hint = keyless && (kind === 'fallback' || kind === 'help') && !history.some((h) => h.text?.includes(KEY_HINT[lang])) ? ' ' + KEY_HINT[lang] : '';
  return pick + hint;
}

const destIn = (t) => (/\b(fiji|fidji|suva|lautoka|nadi)\b/.test(t) ? 'FJ' : /\b(us|usa|états-unis)\b/.test(t) ? 'US' : 'PF');

async function routeOffline(ctx, raw, calls, { history = [], keyless = false, chosenLang } = {}) {
  const t = raw.toLowerCase();
  const call = async (name, args) => { const o = await executeTool(ctx, name, args); calls.push({ name, args, speech: o.speech, data: o.data }); return { reply: o.speech, calls, engine: 'offline-router' }; };
  const fr = chosenLang ? chosenLang === 'fr' : /\b(trouve|cherche|combien|mes|fournisseur|acheteur|envoie|compare|bonjour|salut|merci|qui|quoi|comment|pourquoi|je|tu|vous|est|pour|mon|ma|aide)\b|[éèêàùçôî]|ia ora na|mauruuru/.test(t);
  const lang = fr ? 'fr' : 'en';
  const say = (kind) => ({ reply: smallTalk(kind, lang, history, keyless), calls, engine: 'offline-router' });
  if (/^\s*(bonjour|salut|hello|hi|hey|ia ora na|coucou|bonsoir)\b[\s!.,?]*(manalog)?[\s!.,?]*$/.test(t)) return say('greet');
  if (/^\s*(merci|thanks|thank you|mauruuru|super|parfait|ok|d'accord)\b/.test(t) && !productIn(t)) return say('thanks');
  if (/\b(aide|help|que sais-tu|what can you|qui es-tu|who are you|tu fais quoi|comment ça marche)\b/.test(t)) return say('help');
  if (/\b(check|verify|vérifie|verifie|contrôle|controle)\b.*\b(invoice|facture|document|entry|déclaration|declaration|vat|tva|douane|customs)|\b(customs check|contrôle douanier)\b/.test(t)) return call('check_customs_documents', {});
  if (/send it|approve|envoie|valide|approuve/.test(t)) return call('approve_rfq', { decision: 'approved' });
  if (/compare|last time|dernière|derniere|mission/.test(t) && !/find|trouve|source/.test(t)) return call('get_mission', {});
  if (/what'?s new|watchlist|quoi de neuf|surveill/.test(t)) return call('check_watchlist', {});
  if (/plan|usage|account|compte|abonnement/.test(t)) return call('my_account', {});
  if (/https?:\/\//.test(raw)) return call('scrape_supplier_site', { url: raw.match(/https?:\/\/\S+/)[0] });
  if (/buy|buyer|acheteur|clients?\b|customers?|export|sell|vendre/.test(t)) return call('find_buyers', { product: productIn(t) ?? 'vanilla' });
  if (/landed|cost|coût|cout|combien/.test(t) && numberIn(t)) {
    const d = destIn(t);
    return call('estimate_landed_cost', { unitPriceUsd: 0.34, quantity: numberIn(t), origin: d === 'FJ' ? 'China' : 'Vietnam', destination: d, product: productIn(t) ?? 'glass bottle' });
  }
  const p = productIn(t);
  const cents = t.match(/(\d+(?:[.,]\d+)?)\s*(cents?|centimes?)/); const usd = t.match(/\$\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:usd|dollars?)/);
  const target = cents ? Number(cents[1].replace(',', '.')) / 100 : usd ? Number((usd[1] ?? usd[2]).replace(',', '.')) : undefined;
  if (p) return call('start_sourcing_mission', { product: p, quantity: numberIn(t.replace(/(\d+(?:[.,]\d+)?)\s*(cents?|centimes?|usd|dollars?)|\$\s?\d+(?:[.,]\d+)?/g, '')) ?? 1000, ...(target ? { targetUnitPriceUsd: target } : {}), destination: destIn(t), language: fr ? 'fr' : 'en' });
  return say('fallback');
}
