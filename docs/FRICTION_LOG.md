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
- **Task:** Connect the deployed `/mcp` endpoint to a real Alexa+ device.
- **Steps:** *(to complete during deployment: note which console or page you used, the auth options offered, and any region limits)*
- **Expected / Actual / Severity / Workaround / Suggestion:** *(fill in)*

## 4. Alexa+ availability outside the US (French Polynesia / France)
- **Task:** Test with the target users (artisans in Tahiti).
- **Steps:** *(to complete: check device and account availability for your region)*
- **Workaround:** The browser voice console simulates the Alexa+ experience against the same MCP tools (a path the rules allow).
- **Suggestion:** Document a test path (simulator or dev account) for builders outside Alexa+ launch regions.

## 5. Bedrock model access
- **Task:** Enable Claude on Bedrock for the agent loop.
- **Steps:** *(to complete: model access request, inference profile id, time to approval)*
