# Devpost submission kit (copy-paste)

## Name
ManaLog: voice sourcing agent for island makers

## Tagline
Ask Alexa to source it: proven suppliers from customs data, landed cost to your island, and a quote request ready to approve.

## Tracks
- Primary: **Alexa+** (self-hosted MCP server, spec 2025-11-25, Streamable HTTP, plus a simulated Alexa+ voice console)
- Mini-challenges: **AWS Builder**, **Open Source**

## Inspiration
In French Polynesia, a monoï maker who needs 2,000 glass bottles has no purchasing department, sits 6,000 km from the nearest factory, and pays freight, customs duty, local development tax and VAT on top of the factory price. Finding a reliable supplier takes weeks of guesswork. Big companies use trade-data analysts; island makers use Facebook groups. We wanted the analyst in a voice.

## What it does
ManaLog gives Alexa+ an agentic import/export workflow through 13 MCP tools:
- **Sourcing missions:** one sentence triggers the full chain. It finds suppliers that have *actually shipped* the product (US customs bills of lading via ImportYeti), enriches and scores them 0–100 with reasons you can hear, estimates the **landed cost to the destination** (freight, insurance, stacked duties and taxes, brokerage, in USD and XPF), filters by budget, shortlists three and drafts an RFQ email with Amazon Bedrock.
- **Island products, not just container cargo:** the request is turned into precise English search terms and HS codes (Bedrock), so "fournitures de tatouage" or "coquillages" work. When US customs data is thin, ManaLog adds manufacturers found on the web (homepages read for contacts) and small-lot AliExpress offers with real prices, and weights the scores with official UN Comtrade statistics on where Tahiti actually imports each product from. Every supplier says where it came from.
- **State across sessions:** "compare them", "what did you find last time", "what's new with my suppliers" (DynamoDB).
- **Human-in-the-loop:** "send it" approves the RFQ and returns a one-tap email. Nothing reaches a supplier without approval.
- **Export prospecting:** "who buys vanilla in the US?" lists US importers of your product.
- **Supplier website reading:** robots.txt-aware, SSRF-hardened; Bedrock turns the page into a supplier card.
- **Screen cards:** an MCP App (`text/html;profile=mcp-app`) renders the shortlist on screen devices.
- **White-label:** one deployment serves many brands with their own names, voice personas, colors, verified tax rates, quotas and metering.

## How we built it
Node 22 on **AWS Lambda** (Function URL, arm64) using the official MCP TypeScript SDK's web-standard Streamable HTTP transport in stateless JSON mode, **DynamoDB** single-table storage, and **Amazon Bedrock** (Converse API with tool use) for the voice agent, RFQ drafting and page extraction. A single tool registry feeds both the MCP server and the Bedrock agent, so the console shows exactly what Alexa+ calls. Deployed with **AWS SAM**. Tested with `node:test` (11 tests) and an end-to-end run with the official MCP SDK client.

## Challenges
Running Streamable HTTP on Lambda (sessions don't survive between instances, so we went stateless with persistent state in DynamoDB); keeping voice answers short while cards stay rich; honest landed-cost numbers (every rate is flagged as an estimate until a broker verifies it); and scraping politely and safely.

## Accomplishments
A complete voice-to-RFQ loop in one sentence, explainable scoring, bilingual (EN/FR) voice flows, and an open-core business model that is ready on day one.

## What we learned
Voice agents need *explainable* numbers; "score 90" means nothing until you hear why. And MCP makes one backend usable from Alexa+, Claude, IDEs and our own console at once.

## What's next
Verified tariff profiles with Tahiti customs brokers, group purchasing (one mission shared by several artisans, consolidated through the ManaLog logistics hub), OAuth account linking, and more trade datasets (EU and Pacific).

## Built with
alexa-plus, model-context-protocol, aws-lambda, amazon-bedrock, amazon-dynamodb, aws-sam, node.js, claude, web-speech-api, importyeti, brave-search-api, aliexpress-api, un-comtrade

## Testing instructions
- Repo: https://github.com/Heya-56/manalog (AGPL-3.0)
- Local: `npm install && npm start`, then open http://localhost:8787 (no keys needed, demo data)
- Hosted console: https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/
- MCP endpoint: https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/mcp with header `x-api-key: <JUDGES_KEY>` (Pro plan, free until judging ends). The console accepts it as `?key=<JUDGES_KEY>`. Paste the real key (local file `.judges-key`) only in the private Devpost field, never in the repo.
- Demo script: "Find me 2000 glass bottles for my monoi" → "Compare the suppliers" → "Send it" → "Who buys vanilla in the US?"

## Open Source mini-challenge
- Contribution URL / repo URL: https://github.com/Heya-56/manalog
- GitHub username: Heya-56
- What & why: a new AGPL-3.0 MCP server that turns public customs trade data into an agentic, voice-first sourcing workflow for small importers and exporters. It includes a reusable Lambda pattern for Streamable HTTP MCP (stateless transport, DynamoDB state), a robots.txt-aware and SSRF-hardened scraping tool, and a pluggable landed-cost engine where anyone can contribute verified tariff profiles for their country.

## Product feedback (fill in during deployment)
**Tools, APIs and SDKs used and for what**
- MCP TypeScript SDK 1.30.1: Streamable HTTP server, tools, resources, prompts, MCP App resource
- Amazon Bedrock Converse API: agent tool-use loop, RFQ drafting, supplier-page extraction
- AWS Lambda Function URLs, DynamoDB, SAM: hosting, state and metering, infrastructure as code
- ImportYeti API: US customs bills of lading (proven exporters)
- UN Comtrade API (free preview): where the destination imports each product from, as a scoring bonus
- Brave Search API and AliExpress affiliate API: web manufacturers and priced small-lot offers when customs data is thin (enabled once their keys are set)
- *(Alexa+ developer tooling: fill in what you used to register and test)*

**What worked well:** *(e.g. web-standard transport ran unchanged on Lambda; Bedrock Converse tool-use maps 1:1 to MCP tool schemas via JSON Schema)*
**What needs work:** *(see docs/FRICTION_LOG.md)*
**Onboarding (zero to hello world):** *(time and notes)*
**Build again?** *(Yes/No + why)*

## Feature requests (optional)
- Official Alexa+ MCP reference deployment on Lambda · Important
- Test path for builders outside Alexa+ launch regions · Critical (our users are in French Polynesia)
