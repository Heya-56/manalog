# ManaLog Depot — warehouse software (branch `depot`)

Fulfillment for island sellers: inbound → customs → receive → put away → stock → order → pick → pack → label → ship → returns → monthly invoice in XPF.

- Core logic: `src/core/depot.js` (no AWS dependency, same single-table store as missions).
- REST API: `src/depot-api.js`, mounted at `/depot/*` (GET overview, stock, orders, inbound, bins, invoice; POST sku, bin, inbound, customs, receive, move, order, picklist, pick, pack, label, ship, deliver, cancel, return, tariff).
- Console (phone-first, for depot staff): `/depot` (`public/depot.html`).
- Voice/MCP tools: `depot_overview`, `depot_stock`, `depot_order_status` (plan feature `depot`: Pro and White-label; self-host unlocks all).
- Tests: `test/depot.test.js`.

Rules built in: import inbounds can't be received before customs clearance; orders reserve stock bin by bin (no double promise); steps must happen in order; damaged units go to QUARANTINE; every movement is written to a ledger and the invoice is computed from it. Shipping is re-invoiced at cost as disbursements (débours).

Carrier rates, cartons and the fulfillment tariff are illustrative (`verified:false`) until the operator saves its own via `POST /depot/tariff`.

Not merged into `main` before the hackathon deadline (23 Oct 2026) to keep the judged build unchanged.
