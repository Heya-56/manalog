# Security notes

- **Auth:** app-level API keys (`Authorization: Bearer`, `x-api-key` or `?key=`). Unknown keys get `401`. Anonymous access (Community plan) can be disabled with `MANALOG_ALLOW_ANONYMOUS=false`. Recommended next step for production Alexa+ account linking: OAuth 2.1 per the MCP authorization spec.
- **Tenant isolation:** every storage key is namespaced by tenant and user, so a user can never read another tenant's data.
- **SSRF:** the scraper only allows http(s), rejects credentials in URLs, resolves DNS and blocks private, loopback, link-local (incl. `169.254.169.254` metadata), CGNAT, multicast and IPv6 ULA ranges, and re-validates every redirect (max 3). Known limitation: a DNS-rebinding window between lookup and connect remains; pin the resolved IP with a custom agent for high-risk deployments.
- **Resource limits:** scraped pages capped at 800 KB with a 10 s timeout; agent input capped at 1,000 characters; MCP request body capped at 4 MiB by the SDK; the agent loop is capped at 6 Bedrock turns.
- **Least privilege:** the Lambda role can only CRUD its own table and invoke Bedrock models.
- **Secrets:** ImportYeti and tenant keys are `NoEcho` CloudFormation parameters. Prefer AWS Secrets Manager in production.
- **Human-in-the-loop:** there is no outbound email capability. Approved RFQs become a `mailto:` link the user sends themselves.
