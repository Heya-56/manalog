// MCP server factory (spec 2025-11-25). One lightweight server per request = stateless & Lambda-friendly;
// user state lives in DynamoDB, keyed by tenant + user.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tools, MISSION_CARD_URI } from './tools.js';
import { hasFeature, meter, upgradeMessage } from '../core/tenants.js';
import { listDestinations } from '../core/landed-cost.js';

const cardHtml = readFileSync(new URL('../../public/mission-card.html', import.meta.url), 'utf8');

/** Run a tool with plan checks + metering. Shared by MCP and the Bedrock voice agent. */
export async function executeTool(ctx, name, rawArgs = {}) {
  const t = tools.find((x) => x.name === name);
  if (!t) return { error: true, speech: `Unknown tool ${name}`, data: null };
  if (t.feature && !hasFeature(ctx, t.feature)) return { error: true, speech: upgradeMessage(ctx, t.feature), data: { upgrade: true } };
  const m = await meter(ctx, name);
  if (!m.ok) return { error: true, speech: `Monthly limit reached (${m.limit} calls). ${upgradeMessage(ctx, 'more calls')}`, data: { upgrade: true } };
  const args = z.object(t.schema).parse(rawArgs);
  try {
    return await t.handler(ctx, args);
  } catch (e) {
    return { error: true, speech: `Sorry, that failed: ${e.message}`, data: null };
  }
}

export function buildServer(ctx) {
  const brand = ctx.tenant.brand;
  const server = new McpServer(
    { name: `${brand.name.toLowerCase().replace(/\s+/g, '-')}-mcp`, title: brand.name, version: '0.1.0', websiteUrl: 'https://github.com/Heya-56/manalog' },
    {
      capabilities: { logging: {} },
      instructions: `${brand.name} is a voice sourcing agent for small importers and exporters (built first for island makers in French Polynesia). ` +
        'Prefer start_sourcing_mission for open requests like "find me bottles for my monoi"; keep spoken answers short; always mention that landed costs are estimates. ' +
        'Never contact a supplier without approve_rfq. Default destination is PF (Tahiti) unless the user says otherwise.',
    },
  );

  for (const t of tools) {
    server.registerTool(t.name, {
      title: t.title,
      description: t.description,
      inputSchema: t.schema,
      annotations: { title: t.title, ...t.annotations },
      _meta: t.ui ? { ui: { resourceUri: t.ui }, 'openai/outputTemplate': t.ui } : undefined,
    }, async (args) => {
      const r = await executeTool(ctx, t.name, args);
      const structured = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? { speech: r.speech, ...r.data } : { speech: r.speech };
      return {
        content: [{ type: 'text', text: r.speech }, ...(r.data ? [{ type: 'text', text: '```json\n' + JSON.stringify(r.data).slice(0, 6000) + '\n```' }] : [])],
        structuredContent: structured,
        isError: !!r.error,
      };
    });
  }

  // MCP App (interactive card) for mission results — rendered by hosts that support MCP Apps.
  server.registerResource('mission-card', MISSION_CARD_URI, {
    title: 'Mission card', description: 'Interactive shortlist card for a sourcing mission', mimeType: 'text/html;profile=mcp-app',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/html;profile=mcp-app', text: cardHtml.replaceAll('{{BRAND_COLOR}}', brand.color).replaceAll('{{BRAND_NAME}}', brand.name) }] }));

  server.registerResource('destinations', 'manalog://destinations', {
    title: 'Destination profiles', description: 'Duty/tax profiles available for landed-cost estimates', mimeType: 'application/json',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(listDestinations(ctx.tenant.overrides ?? {}), null, 2) }] }));

  server.registerPrompt('sourcing_brief', {
    title: 'Sourcing brief', description: 'Guided brief for a new sourcing mission',
    argsSchema: { product: z.string(), quantity: z.string().optional(), destination: z.string().optional() },
  }, ({ product, quantity, destination }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Run a sourcing mission for ${quantity ?? '1000'} units of ${product} delivered to ${destination ?? 'PF'}. Then read me the top 3 with landed cost per unit, and wait for my approval before any RFQ is sent.` } }],
  }));

  return server;
}
