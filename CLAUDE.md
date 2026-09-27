# ManaLog — instructions for Claude Code (CLI)

Project: Alexa+ MCP server (Node 22, ESM, no build step) on AWS Lambda + DynamoDB + Bedrock. Hackathon deadline: 2026-10-23 12:00 PT.
Owner speaks French — reply in French, keep code/docs in English.

## Commands
- `npm test` (node:test) · `npm start` (localhost:8787) · `npm run e2e [mcpUrl] [key]`
- Deploy: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 [-IyKey <key>]`

## When asked "déploie" / "deploy"
1. Check `aws sts get-caller-identity`; if it fails, guide `aws configure` (Access key from IAM user with AdministratorAccess for the hackathon, region us-east-1).
2. Check `sam --version`; if missing: `winget install Amazon.SAM-CLI`.
3. Run `scripts/deploy.ps1`. If Bedrock is not enabled, tell the owner to open Bedrock console → Model access → enable Anthropic Claude Sonnet, then re-run.
4. Paste ConsoleUrl + McpEndpoint into `docs/SUBMISSION.md` (Testing instructions), commit, push.
5. Append any problem met to `docs/FRICTION_LOG.md` (format already there) — it earns a judging bonus.

## Rules
- Never commit secrets (ImportYeti key goes only as a SAM parameter).
- Keep `test/` green before every push. Demo companies in `data/fixtures.js` stay fictional and marked "(demo)".
- Duty rates are illustrative (`verified:false`) — never present them as official.
