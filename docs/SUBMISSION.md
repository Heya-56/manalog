# Devpost submission kit (copy-paste)

## Name
ManaLog: voice import-export copilot for Pacific Island businesses

## Tagline
Ask Alexa to source it and check it: proven suppliers from customs data, landed cost to your island, a quote request ready to approve, and a customs check of your paperwork.

## Tracks
- Primary: **Alexa+** (self-hosted MCP server, spec 2025-11-25, Streamable HTTP, plus a simulated Alexa+ voice console)
- Mini-challenges: **AWS Builder**, **Open Source**

## Inspiration
In French Polynesia, a monoï maker who needs 2,000 glass bottles has no purchasing department, sits 6,000 km from the nearest factory, and pays freight, customs duty, local development tax and VAT on top of the factory price. Finding a reliable supplier takes weeks of guesswork. Big companies use trade-data analysts; island makers use Facebook groups. We wanted the analyst in a voice.

## What it does
ManaLog gives Alexa+ an agentic import/export workflow through 15 MCP tools:
- **Sourcing missions:** one sentence triggers the full chain. It finds suppliers that have *actually shipped* the product (US customs bills of lading via ImportYeti), enriches and scores them 0–100 with reasons you can hear, estimates the **landed cost to the destination** (freight, insurance, stacked duties and taxes, brokerage, in USD and XPF), filters by budget, shortlists three and drafts an RFQ email with Amazon Bedrock.
- **Island products, not just container cargo:** the request is turned into precise English search terms and HS codes (Bedrock), so "fournitures de tatouage" or "coquillages" work. When US customs data is thin, ManaLog adds manufacturers found on the web (homepages read for contacts) and small-lot AliExpress offers with real prices, and weights the scores with official UN Comtrade statistics on where Tahiti actually imports each product from. Every supplier says where it came from.
- **Pacific customs check (Fiji and French Polynesia):** "check my invoice for Suva" verifies the invoice arithmetic, HS codes, importer TIN and the bill of lading (port, consignee, weight), then recomputes the charges with each territory's official rules: Fiji (FRCS: VAT 12.5% since 1 August 2025 on value + duty + excise) and French Polynesia (customs FAQ: VAT 16% on CIF + duty + other taxes, TEA 2%, toll 1.25%, statistical tax per 100 kg, IT fee per line, amounts in whole CFP francs). It flags a draft entry still using Fiji's old 15% VAT, or a Tahiti VAT computed on CIF only. The math is deterministic, in integer cents, from our new open-source library **pacific-customs-kit** (MIT); the LLM never computes a tax.
- **French Polynesia from the official tariff:** landed costs to Tahiti follow the rules of the *Tarif des douanes de Polynésie française* (VAT on CIF + all taxes except the local development tax, port toll by sea or Faa'a freight-station fee by air, statistical tax per started 100 kg or tonne) and use official tariff lines dated 1 January 2026 for the demo products (glass bottles, vanilla, paper bags, coconut oil, monoi), with standard and reduced customs duty. Rates come from the customs administration itself, not from the model.
- **Read a photo of the paperwork:** tap the camera, photograph an invoice on the wharf. Amazon Bedrock transcribes it with a strict JSON Schema (structured output by forced tool use, one automatic repair round if the answer breaks the schema, unreadable fields left empty instead of guessed), port names are mapped to UN/LOCODEs by code, then the same customs check runs. Sample: `docs/samples/sample-invoice-photo.jpg`.
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

## Business model (pricing hypothesis, to validate with first customers)
- **Free, forever:** landed-cost estimates, customs checks of typed or demo documents, the full demo on fictional data. These cost us nothing to run (pure computation), so they are the top of the funnel.
- **Prepaid credits** for actions that cost us money, priced at about 3x our cost:
  - photo/PDF reading by Amazon Bedrock: 1 credit (about 2 US cents of cost)
  - live buyer search: 2 credits; live supplier search: 4 credits (customs-data queries)
  - full sourcing mission (live data + AI + RFQ): 10 credits (about 0.40 to 0.60 USD of cost)
- **Packs:** Starter 9 USD = 50 credits (5 live missions) · Pro 29 USD = 200 credits · Business 79 USD = 600 credits. New accounts get 10 free credits.
- **Subscriptions for professionals** (customs agents, freight forwarders, importer co-ops in Fiji and French Polynesia): unlimited document checks and a monthly credit allowance, about 99 to 199 USD per month; white-label licences for chambers of commerce.
- **Margin lever:** customs-data results are cached per product for 30 days and shared across customers, so the second artisan who sources glass bottles costs us almost nothing.
- Payments via Stripe Checkout; the credit wallet extends the existing per-tenant metering in DynamoDB.

## Built with
alexa-plus, model-context-protocol, aws-lambda, amazon-bedrock, amazon-dynamodb, aws-sam, node.js, claude, web-speech-api, importyeti, brave-search-api, aliexpress-api, un-comtrade, zod, pacific-customs-kit

## Testing instructions
- Repo: https://github.com/Heya-56/manalog (AGPL-3.0)
- Local: `npm install && npm start`, then open http://localhost:8787 (no keys needed, demo data)
- Hosted console: https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/
- MCP endpoint: https://wp4itqxfeguy5geyvssszy3aa40mwrro.lambda-url.us-west-2.on.aws/mcp with header `x-api-key: <JUDGES_KEY>` (Pro plan, free until judging ends). The console accepts it as `?key=<JUDGES_KEY>`. Paste the real key (local file `.judges-key`) only in the private Devpost field, never in the repo.
- Demo script: "Find me 2000 glass bottles for my monoi" → "Compare the suppliers" → "Send it" → "Who buys vanilla in the US?" → "Check my invoice for Suva" (Fiji customs check on a fictional demo file; works without a key) → camera button with `docs/samples/sample-invoice-photo.jpg` (Bedrock reading, needs the judges' key)

## Open Source mini-challenge
- **Contribution URL (new open-source project created during the hackathon):** https://github.com/Heya-56/pacific-customs-kit (MIT)
- **Project repository URL:** https://github.com/Heya-56/manalog (AGPL-3.0)
- **GitHub username:** Heya-56
- **What we did:** a new library, pacific-customs-kit, with (1) customs profiles for Pacific Island states, Fiji first, where every figure carries an official source and a `verified` flag (VAT 12.5% since 1 Aug 2025, FRCS valuation formula, entry offices, trade lanes); (2) strict zod schemas for commercial invoices and bills of lading (HS codes, UN/LOCODEs, ISO currencies) that also generate JSON Schema for structured LLM output; (3) deterministic import-charge math in integer cents (fiscal duty and excise on CIF, VAT on CIF + duty + excise); (4) discrepancy checks between documents and against declared charges; 12 tests.
- **How it works:** pure Node.js, one dependency (zod). ManaLog installs it from GitHub and calls it from its `check_customs_documents` MCP tool and its Fiji landed-cost profile; a ManaLog test asserts both give the same figures.
- **Why it matters:** Pacific importers and customs agents work from scanned paperwork and island-specific tax rules that change (Fiji cut VAT from 15% to 12.5% in 2025, and old templates still circulate). The kit lets any developer, or any AI agent, check trade documents without letting a model invent tax figures, and new country profiles can be contributed with sources and tests.

## Product feedback
> DRAFT written from our build notes. Heya: read it, change anything that does not match your experience, then paste it into Devpost.

**Which developer tools, APIs and SDKs did you use and for what?**
- **MCP TypeScript SDK 1.30.1** (`@modelcontextprotocol/sdk`): the Alexa+ server. Streamable HTTP transport (spec 2025-11-25) in stateless JSON mode, 15 tools with structured output, an MCP App resource (`ui://manalog/mission-card.html`), a prompt and a resource. Also the SDK client for our end-to-end test.
- **Amazon Bedrock** (Converse API with tool use, Claude Sonnet 4.5 through the `us.` cross-region inference profile in us-west-2): the voice agent loop that calls the same 15 tools, quote-request drafting, supplier web-page extraction and product-to-HS-code planning.
- **AWS Lambda** (Node.js 22, arm64, Function URL): hosts the MCP endpoint, the voice agent and the console with one handler.
- **Amazon DynamoDB** (on-demand, single table): missions, watchlist and per-tenant usage metering, keyed by tenant + user.
- **AWS SAM / CloudFormation**: infrastructure as code and one-command deploys (`scripts/deploy.ps1`), including secret parameters (judges' key, data-source keys) and a pause mode.
- **AWS IAM**: a dedicated deployer user; a scoped Lambda role (CRUD on its own DynamoDB table, plus `bedrock:InvokeModel`).
- **Third-party data**: ImportYeti API (US customs bills of lading), UN Comtrade (official trade statistics), optional Brave Search and AliExpress affiliate APIs, all used under their own accounts and terms.

**What worked well?**
- The SDK's web-standard Streamable HTTP transport ran unchanged inside Lambda once we used stateless mode with JSON responses.
- Bedrock Converse tool use maps one-to-one to MCP tool schemas (both are JSON Schema), so a single tool registry serves Alexa+ and our Bedrock agent.
- SAM gave us repeatable deploys; Lambda + DynamoDB on-demand cost nothing while idle.

**What needs work?** (details and severity in docs/FRICTION_LOG.md)
- Bedrock: the old "Model access" page is gone and Anthropic models need a use-case form first; IAM denial and missing model access both surface as the same `AccessDeniedException`.
- No official reference for hosting an Alexa+ MCP server on Lambda (sessions, streaming, buffering).
- Windows onboarding: no winget on LTSC editions, antivirus HTTPS scanning breaks the AWS CLI, SAM and Node.
- Alexa+ availability and testing outside the US launch regions.

**How was your onboarding experience (zero to hello world)?**
- Local MCP server answering `tools/list` on day one. The first AWS deploy took longer than the code: IAM permissions, the Bedrock use-case form and antivirus TLS interception.

**Would you build with these devices and services again?**
- Yes: MCP lets one backend serve Alexa+, other AI clients and our own console, and Lambda + Bedrock + DynamoDB keep a small team's costs near zero until real usage.

**AWS Builder mini-challenge — AWS services and how we used them:** Lambda (Function URL hosting the MCP server, agent and console), Amazon Bedrock (Converse tool-use agent, RFQ drafting, page extraction, HS-code planning), DynamoDB (state and metering), SAM/CloudFormation (infrastructure as code with secret parameters), IAM (scoped execution role). Architecture diagram and service list: README, sections "Architecture" and "AWS services used".

## Feature requests (optional)
- Official Alexa+ MCP reference deployment on Lambda · Important
- Test path for builders outside Alexa+ launch regions · Critical (our users are in French Polynesia and Fiji)
- Bedrock: distinguish "model access not granted" from "IAM denied" in the error · Important
