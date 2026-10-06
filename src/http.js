// Web-standard router shared by AWS Lambda (Function URL) and the local Node server.
//   /mcp     → MCP Streamable HTTP endpoint (spec 2025-11-25, stateless, JSON responses)
//   /dashboard → read-only summary of the user's missions, usage and watchlist (no paid calls)
//   /document → read a photo/PDF of a trade document and run the customs check (POST, base64 JSON)
//   /agent   → voice agent (Bedrock tool-use loop) for the Alexa+ simulation console
//   /        → the voice console (public/index.html)
import { readFileSync } from 'node:fs';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildServer } from './mcp/server.js';
import { resolveContext } from './core/tenants.js';
import { runAgent } from './agent/agent.js';
import { dashboardSummary } from './core/dashboard.js';
import { executeTool } from './mcp/server.js';
import { bedrockEnabled } from './core/bedrock.js';
import { config } from './core/config.js';

const consoleHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-manalog-user, mcp-session-id, mcp-protocol-version, last-event-id',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

function ctxFrom(req) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization');
  const apiKey = (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ?? req.headers.get('x-api-key') ?? url.searchParams.get('key');
  const userHint = req.headers.get('x-manalog-user') ?? url.searchParams.get('user');
  return resolveContext({ apiKey, userHint });
}

export async function handle(req) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === '/health') {
    return json({ ok: true, name: config.appName, dataMode: config.dataMode, storage: config.storage, bedrock: bedrockEnabled(), mcpProtocol: '2025-11-25' });
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return new Response(consoleHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const ctx = ctxFrom(req);
  if (!ctx) return json({ error: 'Invalid API key' }, 401);

  if (url.pathname === '/mcp') {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const server = buildServer(ctx);
    await server.connect(transport);
    try {
      const res = await transport.handleRequest(req);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(await res.text(), { status: res.status, headers });
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  }

  if (url.pathname === '/dashboard' && req.method === 'GET') {
    try { return json(await dashboardSummary(ctx)); } catch (e) { console.error(e); return json({ error: e.message }, 500); }
  }

  if (url.pathname === '/document' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const r = await executeTool(ctx, 'read_trade_document', body ?? {}).catch((e) => ({ error: true, speech: e.message, data: null }));
    return json({ reply: r.speech, calls: [{ name: 'read_trade_document', args: { mediaType: body?.mediaType ?? null, file: body?.fileBase64 ? 'attached' : 'sample' }, speech: r.speech, data: r.data }] }, r.error ? 400 : 200);
  }

  if (url.pathname === '/agent' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body?.text || typeof body.text !== 'string' || body.text.length > 1000) return json({ error: 'text (1-1000 chars) required' }, 400);
    try {
      const r = await runAgent(ctx, { text: body.text, history: Array.isArray(body.history) ? body.history : [], lang: body.lang });
      return json({ ...r, brand: ctx.tenant.brand });
    } catch (e) {
      console.error(e);
      return json({ error: e.message }, 500);
    }
  }
  return json({ error: 'Not found' }, 404);
}
