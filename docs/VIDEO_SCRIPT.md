# Demo video script (under 3 min, English, no copyrighted music)

**0:00–0:20 · Hook** (b-roll of artisan products, or plain title cards)
"In Tahiti, a monoï maker who needs 2,000 glass bottles is 6,000 km from any factory, with no purchasing team. This is ManaLog."

**0:20–1:25 · The mission** (screen: voice console, speak into the mic)
- Say: *"Find me 2000 glass bottles for my monoi."*
- Show the agent trace (`tools/call → start_sourcing_mission`), then the card: 3 suppliers, scores, **XPF per unit landed**, the RFQ draft.
- Open "Why this score" and "Agent steps (6)": customs data → enrich → score → landed cost → re-rank → RFQ.
- Say: *"Compare the suppliers."* This shows state persisting across turns and sessions.
- Say: *"Send it."* → "RFQ approved", one tap to email. "Nothing is sent without me."

**1:25–1:50 · Export side**
- Say: *"Who buys vanilla in the US?"* → US importers card. "The same data that finds suppliers finds customers."
- Optional: say it in French: *"Trouve-moi 1500 flacons pour mon monoï."*

**1:50–2:25 · Under the hood** (architecture diagram from the README plus the terminal)
- `npm run e2e`: the official MCP SDK client lists the 13 tools on the Lambda endpoint (protocol 2025-11-25).
- "Alexa+ connects to this same endpoint. Bedrock runs the agent, DynamoDB remembers missions, Lambda hosts it all."
- If you have Alexa+ access: 10 seconds of the real device calling ManaLog.

**2:25–2:50 · Business & open source**
- Show `my_account` and the white-label brand switch (tenant JSON → new name and color).
- "Open source under AGPL. Self-host for free, or take the white-label plan for chambers of commerce, co-ops and customs brokers."

**2:50–3:00 · Close**
"ManaLog: the sourcing analyst every island maker deserves, one sentence away."
