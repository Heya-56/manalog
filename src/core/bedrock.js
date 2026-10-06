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

/**
 * Structured output: force the model to answer by calling ONE tool whose input schema is our JSON Schema,
 * so the reply is always a JSON object of that shape (no free text to parse).
 * @param {object} o
 * @param {string} o.system
 * @param {Array} o.content  user content blocks (text, image, document)
 * @param {string} o.name    tool name
 * @param {object} o.schema  JSON Schema (type: object)
 */
export async function structured({ system, content, name, description, schema, maxTokens = 4000, history = [] }) {
  const cl = await c();
  const r = await cl.send(new mod.ConverseCommand({
    modelId: config.bedrock.modelId,
    system: [{ text: system }],
    messages: [...history, { role: 'user', content }],
    toolConfig: { tools: [{ toolSpec: { name, description, inputSchema: { json: schema } } }], toolChoice: { tool: { name } } },
    inferenceConfig: { maxTokens, temperature: 0 },
  }));
  const msg = r.output?.message;
  const use = (msg?.content ?? []).find((b) => b.toolUse)?.toolUse;
  return { input: use?.input ?? null, message: msg, usage: r.usage };
}

/** Extract a JSON object from model text (tolerates code fences). */
export function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
