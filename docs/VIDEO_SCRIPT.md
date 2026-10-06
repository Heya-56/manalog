# Demo video script (under 3 min, English, no copyrighted music)

> Rules: public on YouTube or Vimeo; show the project working; no third-party logos or trademarks on screen (no ImportYeti, AliExpress, FRCS or ASYCUDA logos; saying a data source's name is fine, showing its logo is not); demo companies stay fictional "(demo)"; no copyrighted music (silence or royalty-free with a licence you hold).

**0:00–0:20 · Hook** (b-roll of artisan products, or plain title cards)
"In Tahiti or Fiji, a small business that imports 2,000 glass bottles is thousands of kilometres from any factory, with no purchasing team and no customs department. This is ManaLog."

**0:20–1:25 · The mission** (screen: voice console, speak into the mic)
- Say: *"Find me 2000 glass bottles for my monoi."*
- Show the agent trace (`tools/call → start_sourcing_mission`), then the card: 3 suppliers, scores, **XPF per unit landed**, the RFQ draft.
- Open "Why this score" and "Agent steps (6)": customs data → enrich → score → landed cost → re-rank → RFQ.
- Say: *"Compare the suppliers."* This shows state persisting across turns and sessions.
- Say: *"Send it."* → "RFQ approved", one tap to email. "Nothing is sent without me."

**1:25–1:55 · Pacific customs check (Fiji)**
- Tap the camera and photograph the printed sample invoice (`docs/samples/sample-invoice-photo.jpg`), or pick the file.
- Show the card: "Read by Amazon Bedrock (strict JSON Schema)", the hard-to-read spots, then the problems. "The handwritten draft entry still uses Fiji's old 15% VAT; it has been 12.5% since August 2025." Then say *"Check my invoice for Suva"* to show the full file with the bill of lading issued for the wrong port (Lautoka).
- "The model never computes a tax: the math comes from pacific-customs-kit, our new open-source library, with an official source for every rate."

**1:55–2:10 · Export side**
- Say: *"Who buys vanilla in the US?"* → US importers card. "The same data that finds suppliers finds customers."

**2:10–2:35 · Under the hood** (architecture diagram from the README plus the terminal)
- `npm run e2e`: the official MCP SDK client lists the 15 tools on the Lambda endpoint (protocol 2025-11-25).
- "Alexa+ connects to this same endpoint. Bedrock runs the agent, DynamoDB remembers missions, Lambda hosts it all."
- If you have Alexa+ access: 10 seconds of the real device calling ManaLog.

**2:35–2:52 · Business & open source**
- Show `my_account` and the white-label brand switch (tenant JSON → new name and color).
- "Open source: ManaLog under AGPL, pacific-customs-kit under MIT. Self-host for free, or take the white-label plan for chambers of commerce, co-ops and customs brokers."

**2:52–2:59 · Close**
"ManaLog: the import-export team every Pacific business deserves, one sentence away."
