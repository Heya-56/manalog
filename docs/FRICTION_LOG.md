# Friction log

> Submitting friction logs can add up to a 10% bonus. Keep adding entries as you hit issues during deployment and the demo recording. Format: task · steps · expected vs actual · severity · workaround · suggestion.

## 1. Confirming MCP spec 2025-11-25 support in the SDK
- **Task:** Make sure the server meets the required MCP version (2025-11-25) over Streamable HTTP.
- **Steps:** Installed `@modelcontextprotocol/sdk@1.30.1` and read the README/changelog for supported protocol versions.
- **Expected:** A clear statement of the default and supported protocol versions.
- **Actual:** Had to grep the compiled `types.js` to confirm that `2025-11-25` is supported and negotiated.
- **Severity:** Low
- **Workaround:** Wrote a test that asserts `initialize` returns `protocolVersion: "2025-11-25"` (`test/core.test.js`).
- **Suggestion:** Hackathon docs could list SDK versions known to implement 2025-11-25 for each language.

## 2. Hosting Streamable HTTP on AWS Lambda
- **Task:** Serve MCP from a Lambda Function URL.
- **Steps:** Looked for an official Lambda adapter for the MCP TypeScript SDK.
- **Expected:** A documented Lambda pattern (buffered vs response streaming, sessions).
- **Actual:** None in the hackathon resources. Buffered Lambda responses don't suit SSE, and sessions don't survive across instances.
- **Severity:** Medium
- **Workaround:** Used `WebStandardStreamableHTTPServerTransport` in **stateless** mode with `enableJsonResponse: true`, one server per request, and state in DynamoDB.
- **Suggestion:** Publish an Alexa+ MCP reference on Lambda (SAM template plus notes on sessions and streaming).

## 3. Registering a self-hosted MCP server with Alexa+
- **Task:** Connect the deployed `/mcp` endpoint to a real Alexa+ device and test it end to end.
- **Steps:** Deployed the server to a Lambda Function URL (us-west-2), then looked for a way to register a self-hosted MCP server with Alexa+ from our account in French Polynesia.
- **Expected:** A developer console page or simulator where a builder can paste an MCP endpoint and an auth header, then talk to it on an Echo device or a test simulator.
- **Actual:** We did not find a self-service path to attach our endpoint to an Alexa+ device from our account and region, so we could not run a real-device test before the deadline.
- **Severity:** High (it blocks testing on the target platform)
- **Workaround:** Followed the path the rules allow: (1) the official MCP SDK client (`npm run e2e`, run from AWS CloudShell) initializes, lists the 14 tools and calls them on the live Lambda endpoint with protocol 2025-11-25; (2) a browser voice console simulates the Alexa+ experience (Web Speech API + Bedrock agent) against the same tools. Both were tested repeatedly in voice mode and worked.
- **Suggestion:** Publish a step-by-step "bring your own MCP server to Alexa+" guide, with an Alexa+ simulator that accepts an MCP URL and API key, usable from any region.

## 4. Alexa+ access for builders and users outside the US (French Polynesia, Fiji)
- **Task:** Test with the people the product is for: small importers in Tahiti and Fiji.
- **Steps:** Looked for Alexa+ device and account options for our region and for a developer test path that does not depend on the device's country.
- **Expected:** A developer or beta path to test Alexa+ features regardless of where the builder lives.
- **Actual:** We found no such path for our region; our target users cannot try ManaLog through Alexa+ today.
- **Severity:** Medium
- **Workaround:** The browser voice console runs the same MCP tools in English and French, so Pacific users can test the experience now; the MCP endpoint is ready for Alexa+ when it is available to them.
- **Suggestion:** Document regional availability for builders and offer a region-independent test path (simulator or developer account).

## 5. Bedrock model access
- **Task:** Enable Claude on Bedrock for the agent loop.
- **Steps:** Probed `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (cross-region inference profile) in us-west-2 with `aws bedrock-runtime converse` from `scripts/deploy.ps1`.
- **Expected:** A clear "model access not enabled" vs "IAM not allowed" signal.
- **Actual:** Both cases surface as `AccessDeniedException`; ours was first IAM (`no identity-based policy allows the bedrock:InvokeModel action`). The Bedrock console no longer has the "Model access" page that our runbook and many tutorials point to; instead, Anthropic models require submitting the Anthropic **use case form** before first use. Only after that form did Claude Sonnet 4.5 answer in the us-west-2 playground. Separately, the probe crashed the script on Windows PowerShell 5.1: under `$ErrorActionPreference = "Stop"`, stderr from a native command piped with `2>&1` becomes a terminating error, so the intended `BedrockEnabled=false` fallback never ran.
- **Severity:** Medium
- **Workaround:** Relaxed `$ErrorActionPreference` around the probe so a failed probe falls back to `BedrockEnabled=false`.
- **Suggestion:** Distinct error codes (or a hint in the message) for missing model access vs missing IAM permission, and a pointer to the Anthropic use case form in the `AccessDeniedException` text now that the Model access page is gone.

## 6. IAM user created without permissions
- **Task:** Deploy with `sam deploy` from a fresh IAM user (`manalog-deployer`).
- **Steps:** Created the user and access key, ran `aws configure`, then `scripts/deploy.ps1`.
- **Expected:** Deploy succeeds, or fails up front with a clear permission message.
- **Actual:** `aws sts get-caller-identity` succeeds without any policy, so the identity check passed; `sam deploy` then failed at `cloudformation:CreateChangeSet` on `aws-sam-cli-managed-default`. It took two console attempts: the policy search for "AdministratorAccess" also lists `AdministratorAccess-Amplify`, which was picked first and does not grant CloudFormation/IAM rights for SAM.
- **Severity:** Medium
- **Workaround:** Attached AdministratorAccess to the user (hackathon only) and verified with `aws iam list-attached-user-policies`.
- **Suggestion:** SAM CLI could run a permissions pre-flight (e.g. IAM policy simulator) before creating the managed stack; the IAM console could flag near-identical managed policy names.

## 7. Antivirus HTTPS scanning breaks AWS CLI, SAM and Node on Windows
- **Task:** Run the AWS CLI, SAM and the e2e MCP client from a Windows 10 LTSC machine with Avast.
- **Steps:** `aws sts get-caller-identity`; later `node test/e2e-mcp-client.mjs <url>/mcp`.
- **Expected:** TLS works like in the browser.
- **Actual:** Avast Web Shield re-signs TLS with its own root, so the AWS CLI (bundled CA store) fails with `SSL: CERTIFICATE_VERIFY_FAILED`. It also rewrites chunked HTTP responses from the Lambda Function URL, so Node's fetch fails with `HTTPParserError: Invalid character in chunk size` although the server returned a valid MCP response (checked with `curl --raw`).
- **Severity:** High (blocks deployment with an opaque error)
- **Workaround:** Exported the Avast root from the Windows store to PEM and set `AWS_CA_BUNDLE` / `NODE_EXTRA_CA_CERTS` for the session; the e2e parse error needs an Avast exception for `*.amazonaws.com` / `*.on.aws`.
- **Suggestion:** AWS CLI v2 on Windows could optionally trust the OS certificate store, and the TLS error could mention interception proxies.

## 8. winget missing on Windows 10 Enterprise LTSC
- **Task:** Install the AWS SAM CLI with `winget install Amazon.SAM-CLI`, as the runbook said.
- **Steps:** Ran `winget` on Windows 10 Enterprise LTSC 2021.
- **Expected:** winget available, as on consumer Windows 10/11.
- **Actual:** LTSC ships without the Microsoft Store / App Installer, so `winget` does not exist.
- **Severity:** Low
- **Workaround:** Installed the AWS CLI and SAM CLI from their MSI installers (links now printed by `scripts/deploy.ps1`).
- **Suggestion:** AWS install docs could lead with the MSI for Windows and mention LTSC/Server editions lacking winget.

## 9. ImportYeti live response shape differs from what we coded against
- **Task:** Score live suppliers (country, 12-month shipments, last shipment date, website).
- **Steps:** Called `GET /v1.0/product/glass%20bottle/suppliers?page_size=3`, `GET /v1.0/supplier/{slug}` and `GET /v1.0/product/vanilla/companies?page_size=3` with the `IYApiKey` header.
- **Expected:** The fields our normalizer guessed (`country`, `shipments_last_12m`, `most_recent_shipment`, `slug`), consistent across endpoints.
- **Actual:** Every live supplier came back without country, volume or date, so all scored 15/100. The real fields are: search rows → `supplier_link` (slug inside a path), `supplier_country_code` (ISO code, not a name), `supplier_total_shipments` (all-time), and no 12-month count or last-shipment date at all; profile → `address_country`, `companies_table[].shipments_12m` (12-month volume only as a per-customer breakdown), `recent_bols[].date_formatted` and `date_range.end_date` in `DD/MM/YYYY`, and a `website` that can be truncated (`"o-i."`) while `other_websites[]` holds the real domain; companies search → `company_link`, `company_total_shipments`, `matching_shipments`, no state or origin countries. Our mission enrichment also let null profile fields overwrite known search fields.
- **Severity:** High (live scoring silently degraded; demo mode hid it)
- **Workaround:** Normalizer rewritten against the real payloads (ISO code → country name via `Intl.DisplayNames`, 12-month sum from `companies_table`, DD/MM/YYYY → ISO, website fallback), null-safe merge, and a unit test built from anonymized real responses. Profiles cost 1 credit each, so only the top 3 of a mission are enriched.
- **Suggestion:** Publish a response schema (field names, date format, units) per endpoint; we could not load docs.importyeti.com from our tooling (HTTP 403) to cross-check. Adding `shipments_12m` and `most_recent_shipment` to search rows would avoid a paid profile call per supplier.

## 10. UN Comtrade free preview: one year per request, ~1 request per second
- **Task:** Find which countries supply a product to French Polynesia (reporter 258), to weight supplier scores.
- **Steps:** `GET https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=258&period=2025,2024,2023&cmdCode=3215&flowCode=M`.
- **Expected:** Several years in one call, as on the keyed `/data/v1/get` endpoint.
- **Actual:** `{"error":"Maximum number of periods for preview is 1"}` returned as a generic HTTP 400, and back-to-back calls get `429 Rate limit is exceeded. Try again in 1 seconds.` Results also include a "World" total and "Areas, nes" buckets that are not countries, and country names that differ from common usage ("USA", "Türkiye", "Viet Nam").
- **Severity:** Medium (looked like a malformed query until we read the body)
- **Workaround:** Walk back one year at a time from the latest, retry 429s with a short backoff, filter out World and "nes" rows, rename to our country names. With a subscription key the adapter switches to one multi-year call.
- **Suggestion:** Put the preview limits in the error status/message consistently (the 400 body says it, the status line does not) and document them next to the endpoint.

## 11. US customs data misses what island makers actually buy
- **Task:** Source yarn, seashells and tattoo supplies for small shops in Tahiti.
- **Steps:** Live missions on ImportYeti with "yarn", "tattoo", "shells".
- **Expected:** A useful shortlist like for glass bottles or coconut oil.
- **Actual:** US bills of lading only cover ocean freight into the US. Small-lot craft supplies bought by island shops (often by post, from China, New Zealand or France) are mostly absent, and the API matches only English shipping-document wording, so French requests found nothing.
- **Severity:** High for our target users
- **Workaround:** Search planning (Bedrock → English terms + HS codes), then web search, AliExpress small-lot offers and UN Comtrade origin statistics as additional sources, each labelled in the answer.
- **Suggestion:** A trade-data API covering postal/courier imports or non-US customs at a small-business price would fill this gap.
