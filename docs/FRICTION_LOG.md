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
- **Steps:** Probed `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (cross-region inference profile) in us-west-2 with `aws bedrock-runtime converse` from `scripts/deploy.ps1`.
- **Expected:** A clear "model access not enabled" vs "IAM not allowed" signal.
- **Actual:** Both cases surface as `AccessDeniedException`; ours was IAM (`no identity-based policy allows the bedrock:InvokeModel action`). Once the deploy user had AdministratorAccess the probe passed with no separate model-access request. Separately, the probe crashed the script on Windows PowerShell 5.1: under `$ErrorActionPreference = "Stop"`, stderr from a native command piped with `2>&1` becomes a terminating error, so the intended `BedrockEnabled=false` fallback never ran.
- **Severity:** Medium
- **Workaround:** Relaxed `$ErrorActionPreference` around the probe so a failed probe falls back to `BedrockEnabled=false`.
- **Suggestion:** Distinct error codes (or a hint in the message) for missing model access vs missing IAM permission.

## 6. IAM user created without permissions
- **Task:** Deploy with `sam deploy` from a fresh IAM user (`manalog-deployer`).
- **Steps:** Created the user and access key, ran `aws configure`, then `scripts/deploy.ps1`.
- **Expected:** Deploy succeeds, or fails up front with a clear permission message.
- **Actual:** `aws sts get-caller-identity` succeeds without any policy, so the identity check passed; `sam deploy` then failed at `cloudformation:CreateChangeSet` on `aws-sam-cli-managed-default`. It took two console attempts before AdministratorAccess was actually attached to the right user.
- **Severity:** Medium
- **Workaround:** Attached AdministratorAccess to the user (hackathon only) and verified with `aws iam list-attached-user-policies`.
- **Suggestion:** SAM CLI could run a permissions pre-flight (e.g. IAM policy simulator) before creating the managed stack.

## 7. Antivirus HTTPS scanning breaks AWS CLI, SAM and Node on Windows
- **Task:** Run the AWS CLI, SAM and the e2e MCP client from a Windows 10 LTSC machine with Avast.
- **Steps:** `aws sts get-caller-identity`; later `node test/e2e-mcp-client.mjs <url>/mcp`.
- **Expected:** TLS works like in the browser.
- **Actual:** Avast Web Shield re-signs TLS with its own root, so the AWS CLI (bundled CA store) fails with `SSL: CERTIFICATE_VERIFY_FAILED`. It also rewrites chunked HTTP responses from the Lambda Function URL, so Node's fetch fails with `HTTPParserError: Invalid character in chunk size` although the server returned a valid MCP response (checked with `curl --raw`).
- **Severity:** High (blocks deployment with an opaque error)
- **Workaround:** Exported the Avast root from the Windows store to PEM and set `AWS_CA_BUNDLE` / `NODE_EXTRA_CA_CERTS` for the session; the e2e parse error needs an Avast exception for `*.amazonaws.com` / `*.on.aws`.
- **Suggestion:** AWS CLI v2 on Windows could optionally trust the OS certificate store, and the TLS error could mention interception proxies.
