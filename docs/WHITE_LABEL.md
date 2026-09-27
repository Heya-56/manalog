# White-label & tenants

One ManaLog deployment serves many brands. Each **tenant** is identified by its API key and carries a plan, a brand and (optionally) its own verified duty/freight rates.

```json
[
  {
    "id": "cci-tahiti",
    "apiKey": "long-random-secret",
    "plan": "whitelabel",
    "brand": { "name": "Fenua Import", "tagline": "Sourcing for Tahiti businesses", "color": "#C2410C", "voiceName": "Fenua", "locale": "fr-FR" },
    "overrides": {
      "dutyProfiles": {
        "PF": {
          "name": "Polynésie française (taux vérifiés)", "currency": "XPF", "fxPerUsd": 108, "verified": true,
          "notes": "Rates verified by <broker>, <date>.",
          "categories": { "packaging": [ { "name": "Droit de douane", "rate": 0.05 }, { "name": "TDL", "rate": 0.10 }, { "name": "TVA", "rate": 0.16, "compound": true } ],
                          "general":   [ { "name": "Droit de douane", "rate": 0.10 }, { "name": "TVA", "rate": 0.16, "compound": true } ] }
        }
      }
    }
  }
]
```

Set it with the `TenantsJson` SAM parameter (`MANALOG_TENANTS_JSON`). What the tenant gets:

- **Brand everywhere:** MCP server name and title, agent persona, console colors and name, the RFQ signature ("sent via Fenua Import").
- **Own rates:** `overrides.dutyProfiles` / `overrides.freightRates` replace the illustrative defaults, and `verified: true` removes the estimate disclaimer.
- **Quotas & features** follow `PLANS` in `src/core/tenants.js` when `MANALOG_ENFORCE_PLANS=true`.
- **Data isolation:** every DynamoDB key is prefixed `T#<tenant>#U#<user>`.

## Billing

Usage is metered per tenant and month (`USAGE#yyyymm` rows: total calls plus a per-tool breakdown). Connect those rows to your invoicing, or sell fixed plans through payment links (`MANALOG_UPGRADE_URL` is what the agent tells users when a feature or quota is exceeded).

## Who buys white-label

- Chambers of commerce and business support agencies (a "sourcing assistant" for their members)
- Artisan cooperatives and consolidated logistics hubs (group purchasing: one mission, many small buyers)
- Customs brokers and freight forwarders (lead generation: every RFQ becomes a shipment to handle)
- E-commerce agencies (bundled with shop builds)
