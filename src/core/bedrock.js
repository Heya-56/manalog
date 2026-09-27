// Amazon Bedrock (Converse API) wrapper. Used for: RFQ drafting, scraped-page extraction,
// and the voice agent loop (tool use). When BEDROCK_ENABLED=false we fall back to deterministic
// templates so everything still works offline and in tests.
import { config } from './config.js';

let client, mod;
async function c() {
  if (!client) {
    mod = await import('@aws-sdk/client-bedrock-runtime');
    client = new mod.BedrockRuntimeClient({ region: config.bedrock.region });
  }
  return client;
}

export const bedrockEnabled = () => config.bedrock.enabled;

/** Single-shot text generation. */
export async function generate(system, prompt, { maxTokens = config.bedrock.maxTokens, temperature = 0.3 } = {}) {
  const cl = await c();
  const r = await cl.send(new mod.ConverseCommand({
    modelId: config.bedrock.modelId,
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens, temperature },
  }));
  return (r.output?.message?.content ?? []).map((b) => b.text ?? '').join('').trim();
}

/** Multi-turn converse with tools (raw Bedrock shapes). */
export async function converse({ system, messages, tools, maxTokens = config.bedrock.maxTokens }) {
  const cl = await c();
  return cl.send(new mod.ConverseCommand({
    modelId: config.bedrock.modelId,
    system: [{ text: system }],
    messages,
    toolConfig: tools?.length ? { tools } : undefined,
    inferenceConfig: { maxTokens, temperature: 0.2 },
  }));
}

/** Extract a JSON object from model text (tolerates code fences). */
export function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
