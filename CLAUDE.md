# ManaLog — instructions for Claude Code (CLI)

Project: Alexa+ MCP server (Node 22, ESM, no build step) on AWS Lambda + DynamoDB + Bedrock. Hackathon deadline: 2026-10-23 12:00 PT.
Owner speaks French — reply in French, keep code/docs in English.

## Commands
- `npm test` (node:test) · `npm start` (localhost:8787) · `npm run e2e [mcpUrl] [key]`
- Deploy: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 [-IyKey <key>]`

## When asked "déploie" / "deploy"
1. Check `aws sts get-caller-identity`; if it fails, guide `aws configure` (Access key from IAM user with AdministratorAccess for the hackathon, region us-west-2 (Oregon — closest AWS US region to Tahiti via the Honotua cable)).
   `aws configure` is interactive: the owner must run it in a separate PowerShell window (the `!` prefix can't answer prompts). Verify `aws iam list-attached-user-policies --user-name <user>` shows `AdministratorAccess` (not `AdministratorAccess-Amplify`).
   If AWS calls fail with `SSL: CERTIFICATE_VERIFY_FAILED`, Avast HTTPS scanning is intercepting: export the "Avast Web/Mail Shield Root" cert from `Cert:\LocalMachine\Root` to PEM and set `AWS_CA_BUNDLE` and `NODE_EXTRA_CA_CERTS` to it for the session. Avast also corrupts chunked responses, so the e2e smoke test fails locally with `Invalid character in chunk size` until the owner adds an Avast exception for `*.on.aws` / `*.amazonaws.com` (or runs `npm run e2e` from AWS CloudShell).
2. Check `sam --version`; if missing, install the MSI (Windows 10 LTSC has no winget): AWS CLI https://awscli.amazonaws.com/AWSCLIV2.msi, SAM https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi
3. Run `scripts/deploy.ps1`, always with `-IyKey <key>` if live ImportYeti data is wanted (omitting it redeploys with an empty key). If Bedrock is not reachable (`AccessDeniedException`), first check IAM; otherwise the owner must submit the Anthropic use case form in the Bedrock console (the old "Model access" page no longer exists) and confirm Claude Sonnet answers in the us-west-2 playground, then re-run.
4. Paste ConsoleUrl + McpEndpoint into `docs/SUBMISSION.md` (Testing instructions), commit, push.
5. Append any problem met to `docs/FRICTION_LOG.md` (format already there) — it earns a judging bonus.

## Rules
- Never commit secrets (ImportYeti key goes only as a SAM parameter).
- Keep `test/` green before every push. Demo companies in `data/fixtures.js` stay fictional and marked "(demo)".
- Duty rates are illustrative (`verified:false`) — never present them as official.
