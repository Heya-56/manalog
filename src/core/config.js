// Central runtime configuration. Everything is driven by environment variables so the
// same code runs locally (in-memory, demo data) and on AWS Lambda (DynamoDB, Bedrock, live data).

const env = (k, d) => (process.env[k] ?? d);

export const config = {
  appName: env('MANALOG_APP_NAME', 'ManaLog'),
  // Data source: "live" uses the ImportYeti API (needs IY_API_KEY); "demo" uses bundled fictional fixtures.
  // MANALOG_DATA_MODE=demo forces demo data even if a key is still deployed ("pause"); "auto"/unset = live when a key exists.
  dataMode: ['demo', 'live'].includes(process.env.MANALOG_DATA_MODE) ? process.env.MANALOG_DATA_MODE : (process.env.IY_API_KEY ? 'live' : 'demo'),
  importYeti: {
    baseUrl: env('IY_BASE_URL', 'https://data.importyeti.com/v1.0'),
    apiKey: env('IY_API_KEY', ''),
    timeoutMs: Number(env('IY_TIMEOUT_MS', '12000')),
  },
  // Extra live sources (each one is skipped when its key is empty; none is called in demo mode).
  // Web search finds manufacturers and wholesalers worldwide (not only exporters to the US).
  webSearch: {
    apiKey: env('BRAVE_API_KEY', ''),
    baseUrl: env('BRAVE_BASE_URL', 'https://api.search.brave.com/res/v1/web/search'),
    timeoutMs: Number(env('WEB_SEARCH_TIMEOUT_MS', '8000')),
  },
  // AliExpress affiliate API: small-lot products with real prices (yarn, beads, shells, tattoo supplies...).
  aliexpress: {
    appKey: env('ALIEXPRESS_APP_KEY', ''),
    appSecret: env('ALIEXPRESS_APP_SECRET', ''),
    trackingId: env('ALIEXPRESS_TRACKING_ID', ''),
    baseUrl: env('ALIEXPRESS_BASE_URL', 'https://api-sg.aliexpress.com/sync'),
    timeoutMs: Number(env('ALIEXPRESS_TIMEOUT_MS', '8000')),
  },
  // UN Comtrade: which countries supply a product to the destination (free preview API works without a key).
  comtrade: {
    apiKey: env('COMTRADE_API_KEY', ''),
    baseUrl: env('COMTRADE_BASE_URL', 'https://comtradeapi.un.org'),
    timeoutMs: Number(env('COMTRADE_TIMEOUT_MS', '12000')),
  },
  // Storage: "dynamodb" on AWS, "memory" locally/tests.
  storage: env('MANALOG_STORAGE', process.env.MANALOG_TABLE ? 'dynamodb' : 'memory'),
  table: env('MANALOG_TABLE', ''),
  region: env('AWS_REGION', 'us-east-1'),
  bedrock: {
    enabled: env('BEDROCK_ENABLED', 'false') === 'true',
    modelId: env('BEDROCK_MODEL_ID', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    region: env('BEDROCK_REGION', env('AWS_REGION', 'us-east-1')),
    maxTokens: Number(env('BEDROCK_MAX_TOKENS', '1200')),
  },
  // Tenants (API keys → plan & brand). JSON array; see docs/WHITE_LABEL.md. A public demo key is always
  // available so hackathon judges can test for free.
  tenantsJson: env('MANALOG_TENANTS_JSON', ''),
  demoKey: env('MANALOG_DEMO_KEY', 'demo-judges-2026'),
  allowAnonymous: env('MANALOG_ALLOW_ANONYMOUS', 'true') === 'true',
  upgradeUrl: env('MANALOG_UPGRADE_URL', 'https://hinovadigitalcorp.com/manalog'),
  scraper: {
    userAgent: env('MANALOG_UA', 'ManaLogBot/0.1 (+https://github.com/Heya-56/manalog)'),
    maxBytes: Number(env('MANALOG_SCRAPE_MAX_BYTES', '800000')),
    timeoutMs: Number(env('MANALOG_SCRAPE_TIMEOUT_MS', '10000')),
  },
};
