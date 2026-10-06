# Devpost rules checklist — Build, Ship, Shape: Amazon Developer Hackathon

Deadline: **Friday 23 Oct 2026, 12:00 PT** (Thursday 22 Oct, 09:00 Tahiti). Judging 9–20 Nov 2026.
Status: ✅ done · 🟡 needs the owner · ⬜ to do

## Project requirements
- ✅ Alexa+ track: self-hosted MCP server, spec 2025-11-25, Streamable HTTP (`src/http.js`, test "Lambda handler speaks MCP 2025-11-25")
- ✅ MCP SDK imported and called at runtime, not only named in the README (`src/mcp/server.js`)
- ✅ Optional simulated Alexa+ experience in a web app (`public/index.html`, `/agent`)
- ✅ New project: first commit 27 Sep 2026, after the submission period opened (31 Aug)
- ✅ Third-party data used through our own accounts and keys (ImportYeti, UN Comtrade, optional Brave Search and AliExpress)
- 🟡 Owner to confirm the ImportYeti plan terms allow use in a public demo app

## Repository
- ✅ Public, open-source licence detected by GitHub (AGPL-3.0)
- ✅ Clear setup and run instructions (README: Quick start, Deploy to AWS, Connect an MCP client)
- ✅ All source, assets and instructions in the repo; no secrets committed (`.judges-key` is gitignored)
- ✅ Everything in English
- 🟡 GitHub "About" box: replace the description "Platform logistic" with the tagline and add topics (alexa, mcp, aws-lambda, amazon-bedrock, pacific, customs). Settings can only be changed by the owner.

## Submission form (docs/SUBMISSION.md)
- ✅ Text description of features
- ✅ Primary track (Alexa+) and mini-challenges (AWS Builder, Open Source) named
- ✅ AWS Builder: AWS services and how they are used, inside the Product Feedback answer
- ✅ Open Source: contribution URL (pacific-customs-kit, new MIT repo), project repo URL, GitHub username, what / how / why
- 🟡 Product feedback: draft written, owner to review and adjust to her own experience
- ✅ Feature requests (optional) with priority
- ✅ Friction log (up to 10% bonus): 11 complete entries

## Demo video
- ⬜ Under 3 minutes, in English (script: docs/VIDEO_SCRIPT.md)
- ⬜ Shows the project working: voice console + MCP client against the Lambda endpoint
- ⬜ No third-party logos or trademarks on screen, no copyrighted music, demo companies fictional
- ⬜ Public on YouTube or Vimeo, link in the form

## Testing by judges
- ✅ Judges' key is secret (SAM parameter `JudgesKey`), given only in the private Devpost testing instructions
- ✅ Without a key, the hosted console runs on demo data at zero cost (cost guard), so judges can always try it
- ⬜ After submitting: redeploy in full mode (Bedrock + live data) for the judges' key, and keep it running until 20 Nov 2026
- ⬜ Paste the judges' key in the private testing-instructions field

## Owner admin
- ⬜ AWS promotional credits form before **21 Oct 2026, 12:00 PT**
- ⬜ AWS "Zero spend" budget alert
