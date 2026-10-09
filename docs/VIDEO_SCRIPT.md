# Demo video script — 2 min 55 s, English

> Rules: under 3 minutes; public on YouTube or Vimeo; show the project working; no third-party logos or trademarks on screen (saying a data source's name is fine, showing its logo is not); demo companies stay fictional "(demo)"; no copyrighted music (silence is fine).
>
> Before recording, deploy with `scripts/deploy.ps1 -DemoData`: Bedrock on (voice agent + photo reading), fictional demo suppliers, zero ImportYeti credits. Rehearse freely, then run once each: "Find me 1500 kraft paper bags at 25 cents each", "Find me 600 coconut oil" so the dashboard has data.
> Recording: the hosted console with the judges' key (`?key=…`), browser full screen, language EN. Title cards: `docs/video/01-intro.png`, `02-architecture.png`, `03-outro.png` (1920×1080).
> **VO** = voice-over to read. **SAY** = what you say to the console's microphone (or type). About 320 words of voice-over in total: read slowly, it fits.

---

## 1 · Hook — 0:00–0:15 · card `01-intro.png`
**VO:** "In Tahiti and Fiji, small businesses import everything across thousands of kilometres of ocean, with no purchasing team and no customs department. ManaLog gives them both, by voice."

## 2 · Sourcing mission — 0:15–1:05 · console, Live tab
- Click the mic. **SAY:** "Find me 2000 glass bottles for my monoi."
- **VO** (while it thinks): "One sentence starts an agentic workflow. Claude on Amazon Bedrock calls ManaLog's MCP tools: customs shipment records, supplier scoring, landed cost to Tahiti, and a quote request. In this demo, the companies are fictional."
- Point at the card: 3 suppliers, scores, XPF per unit landed. Open "Why this score".
- **VO:** "Every score is explainable, and every price includes freight, duties and VAT."
- **SAY:** "Compare the suppliers." → then **SAY:** "Send it."
- **VO:** "Nothing reaches a supplier without my approval: I get a ready email, and I send it myself. And the mission is remembered across sessions."

## 3 · Pacific customs check — 1:05–1:40 · console, camera button
- Click the camera, pick `sample-invoice-photo.jpg` (a fictional invoice photographed on the wharf).
- **VO:** "Now the paperwork. I photograph an invoice on the wharf in Suva. Bedrock reads it into a strict JSON schema, and flags what it could not read instead of guessing."
- Point at the red problem: VAT 1,696.82 vs 1,414.02 FJD.
- **VO:** "The handwritten draft still uses Fiji's old fifteen percent VAT. It has been twelve and a half percent since August 2025. The AI never computes a tax: the math comes from pacific-customs-kit, our new open-source library, with an official source for every rate."

## 4 · Export side — 1:40–1:55 · console
- **SAY:** "Who buys vanilla in the US?"
- **VO:** "The same data that finds suppliers also finds customers for Pacific exports."

## 5 · Dashboard — 1:55–2:15 · Dashboard tab
- Click "Dashboard". Show the KPIs and the chart.
- **VO:** "The dashboard shows every mission and what shipping and taxes really add. On small island orders, the delivered cost can be several times the factory price. ManaLog makes that visible before you order."

## 6 · Under the hood — 2:15–2:40 · card `02-architecture.png`
- **VO:** "ManaLog is a self-hosted MCP server, spec 2025-11-25, on AWS Lambda. Amazon Bedrock runs the agent and reads documents, DynamoDB keeps each customer's data separate. Alexa+ calls the same fifteen tools as this console."

## 7 · Business and close — 2:40–2:55 · card `03-outro.png`
- **VO:** "Demos and customs checks are free. Live searches use prepaid credits, and customs agents subscribe. ManaLog is open source. ManaLog: the import-export team every Pacific business deserves, one sentence away."

---

## Upload (YouTube)
- Title: `ManaLog — voice import-export copilot for Pacific Island businesses (Alexa+ MCP · AWS)`
- Visibility: **Public**. Description: the tagline, the two GitHub links, "Demo companies are fictional."
