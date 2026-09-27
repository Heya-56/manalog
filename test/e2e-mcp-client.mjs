// End-to-end check with the OFFICIAL MCP TypeScript SDK client over Streamable HTTP.
// Usage: node test/e2e-mcp-client.mjs [serverUrl] [apiKey]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] ?? 'http://localhost:8787/mcp';
const key = process.argv[3] ?? 'demo-judges-2026';
const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { 'x-api-key': key, 'x-manalog-user': 'e2e' } } });
const client = new Client({ name: 'manalog-e2e', version: '1.0.0' });
await client.connect(transport);
const v = client.getServerVersion();
console.log('✓ connected:', v.name, v.version, '| protocol', transport.protocolVersion ?? '(negotiated)');
const { tools } = await client.listTools();
console.log('✓ tools:', tools.map((t) => t.name).join(', '));
const { resources } = await client.listResources();
console.log('✓ resources:', resources.map((r) => r.uri).join(', '));
const { prompts } = await client.listPrompts();
console.log('✓ prompts:', prompts.map((p) => p.name).join(', '));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name} failed: ${r.content?.[0]?.text}`);
  console.log(`✓ ${name}: ${r.content[0].text.slice(0, 160)}`);
  return r.structuredContent;
};
const m = await call('start_sourcing_mission', { product: 'glass bottle', quantity: 2000, destination: 'PF' });
await call('get_mission', { missionId: m.id });
await call('approve_rfq', { missionId: m.id });
await call('find_buyers', { product: 'vanilla' });
await call('estimate_landed_cost', { unitPriceUsd: 0.34, quantity: 2000, origin: 'Vietnam', destination: 'PF', product: 'glass bottle' });
await call('watch_supplier', { supplierSlug: 'saigon-glass-vn' });
await call('check_watchlist', {});
await call('list_missions', {});
await call('my_account', {});
const card = await client.readResource({ uri: 'ui://manalog/mission-card.html' });
console.log('✓ MCP App resource mimeType:', card.contents[0].mimeType);
await client.close();
console.log('ALL GOOD');
