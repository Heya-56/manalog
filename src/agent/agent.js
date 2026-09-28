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
Rules: your reply is read aloud by a speech engine: plain text only, NO markdown (no asterisks, bullets, headings or emojis); speak in 1-3 short sentences; numbers rounded; say currency as XPF for Tahiti. Use tools for any factual answer.
For open sourcing requests use start_sourcing_mission; if the user mentions a unit price (e.g. "about 40 cents each"), pass it as targetUnitPriceUsd. "Send it"/"approve" → approve_rfq. "Compare"/"last time" → get_mission.
Never claim an email was sent: the user sends it from the card. Mention estimates are indicative. Reply in the user's language (French or English).`;

export async function runAgent(ctx, { text, history = [] }) {
  const calls = [];
  // Bedrock (paid LLM calls) only for tenants whose plan includes agentic missions; others get the free router.
  if (!bedrockEnabled() || !hasFeature(ctx, 'mission')) return routeOffline(ctx, text, calls);

  const messages = [
    ...history.slice(-6).filter((h) => h.text).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: [{ text: h.text }] })),
    { role: 'user', content: [{ text }] },
  ];
  // Bedrock requires alternating roles starting with user
  while (messages.length && messages[0].role !== 'user') messages.shift();
  for (let i = 0; i < 6; i++) {
    const r = await converse({ system: system(ctx.tenant.brand), messages, tools: toolSpecs() });
    const msg = r.output?.message;
    messages.push(msg);
    const uses = (msg?.content ?? []).filter((b) => b.toolUse);
    if (r.stopReason !== 'tool_use' || !uses.length) {
      return { reply: (msg?.content ?? []).map((b) => b.text ?? '').join(' ').trim(), calls, engine: 'bedrock' };
    }
    const results = [];
    for (const { toolUse } of uses) {
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
const numberIn = (t) => { const m = t.replace(/[,\s](?=\d{3}\b)/g, '').match(/\b(\d{2,7})\b/); return m ? Number(m[1]) : undefined; };
const PRODUCTS = ['glass bottle', 'bottle', 'flacon', 'vanilla', 'vanille', 'coconut oil', 'huile de coco', 'kraft', 'paper bag', 'sac kraft', 'mother of pearl', 'nacre', 'monoi', 'monoï', 'black pearl', 'perle noire'];
const productIn = (t) => PRODUCTS.find((p) => t.includes(p));

async function routeOffline(ctx, raw, calls) {
  const t = raw.toLowerCase();
  const call = async (name, args) => { const o = await executeTool(ctx, name, args); calls.push({ name, args, speech: o.speech, data: o.data }); return { reply: o.speech, calls, engine: 'offline-router' }; };
  const fr = /\b(trouve|cherche|combien|mes|fournisseur|acheteur|envoie|compare)\b/.test(t);
  if (/send it|approve|envoie|valide|approuve/.test(t)) return call('approve_rfq', { decision: 'approved' });
  if (/compare|last time|dernière|derniere|mission/.test(t) && !/find|trouve|source/.test(t)) return call('get_mission', {});
  if (/what'?s new|watchlist|quoi de neuf|surveill/.test(t)) return call('check_watchlist', {});
  if (/plan|usage|account|compte|abonnement/.test(t)) return call('my_account', {});
  if (/https?:\/\//.test(raw)) return call('scrape_supplier_site', { url: raw.match(/https?:\/\/\S+/)[0] });
  if (/buy|buyer|acheteur|export|sell|vendre/.test(t)) return call('find_buyers', { product: productIn(t) ?? 'vanilla' });
  if (/landed|cost|coût|cout|combien/.test(t) && numberIn(t)) {
    return call('estimate_landed_cost', { unitPriceUsd: 0.34, quantity: numberIn(t), origin: 'Vietnam', destination: 'PF', product: productIn(t) ?? 'glass bottle' });
  }
  const p = productIn(t);
  const cents = t.match(/(\d+(?:[.,]\d+)?)\s*(cents?|centimes?)/); const usd = t.match(/\$\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:usd|dollars?)/);
  const target = cents ? Number(cents[1].replace(',', '.')) / 100 : usd ? Number((usd[1] ?? usd[2]).replace(',', '.')) : undefined;
  if (p) return call('start_sourcing_mission', { product: p, quantity: numberIn(t.replace(/(\d+(?:[.,]\d+)?)\s*(cents?|centimes?|usd|dollars?)|\$\s?\d+(?:[.,]\d+)?/g, '')) ?? 1000, ...(target ? { targetUnitPriceUsd: target } : {}), destination: /\b(us|usa|états-unis)\b/.test(t) ? 'US' : 'PF', language: fr ? 'fr' : 'en' });
  return { reply: fr ? 'Je peux trouver des fournisseurs, estimer un coût rendu à Tahiti, ou trouver des acheteurs aux États-Unis. Essayez : trouve-moi 2000 flacons pour mon monoï.' : 'I can find suppliers, estimate landed cost to Tahiti, or find US buyers. Try: find me 2000 glass bottles for my monoi.', calls, engine: 'offline-router' };
}
