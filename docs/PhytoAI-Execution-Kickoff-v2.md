You previously produced `.opencode/plans/Plan.md` in plan mode for the Smart Pot / `PhytoAI` project, and a prior execution attempt stalled on excessive self-verification. This is a fresh session. Read `Plan.md`, `SmartPot-Full-Engineering-Spec-PRD.md`, and `PhytoAI-Deployment-Prompt.md` in full before starting, so the context is complete. You are in build mode — you are authorized to actually create/edit nodes in the live `phytoai` n8n workflow and, where possible, the Google Sheet, per the rules below.

# HARD RULE #1 — Research depth cap (read this first, this is why the last attempt failed)

A previous execution attempt on this exact task got stuck in a loop trying to perfectly verify an under-documented n8n implementation detail (how the Merge v3 node reattaches binary data after an AI Agent node) by repeatedly fetching raw GitHub source files. It never finished. **Do not repeat this.**

For any n8n implementation detail not clearly and immediately answered by the MCP's own type definitions, SDK reference, or your own existing knowledge of n8n: you get **at most one** verification attempt — one search, one fetch, or one `get_node_types`/`get_sdk_reference` call on that specific question. If that one attempt doesn't fully resolve it, **stop researching immediately**, choose the most reasonable engineering default yourself, implement it, and write down the assumption you made in your final report as a flagged item for the user to review. Do not fetch raw GitHub source files to inspect node internals under any circumstances — this is explicitly banned, not just discouraged. Do not chain multiple searches or fetches on the same underlying question. Treat "I need to keep verifying this to be sure" as a warning sign that you should stop and proceed with your best judgment instead.

This rule overrides any instinct toward thoroughness on implementation-level details. Hardware facts and safety constraints (Section "Preserve every hard requirement" below) are not subject to this cap — those must be followed exactly, not approximated. This cap is specifically about node-internals/API-shape uncertainty, not about the spec's actual requirements.

# CRITICAL CORRECTION — webhook URL

`Plan.md` Section 3.0 and Section 4 record the `phytoai` workflow's webhook base URL as `https://linking-newspaper-extensive-findarticles.trycloudflare.com/`. **This is stale.** The user has confirmed that when n8n was last run, the trigger nodes were not updated to match the current tunnel, and the live tunnel is `https://shopper-low-cup-inch.trycloudflare.com`.

Before building or testing anything:
1. Re-verify the `phytoai` workflow's actual current webhook URLs directly via the n8n MCP (inspect the live workflow's trigger nodes). Apply HARD RULE #1 to this too: **one** verification pass via the MCP is enough — do not loop on this.
2. Correct any hardcoded/cached reference to the old URL to match whatever the live n8n instance reports as current.
3. Confirm whether `https://shopper-low-cup-inch.trycloudflare.com` serves both the n8n dashboard AND the webhook triggers, or only one of the two — one check, then proceed with whatever you find.
4. Update every webhook contract in your final report with the actually-verified current base URL.
5. Flag clearly in your final report that Cloudflare quick tunnel URLs are ephemeral and change on every n8n restart unless a persistent/named tunnel is configured, and recommend the user set one up before connecting real firmware later.

Do not proceed with webhook-dependent testing (Plan.md Section 3.9) until this is resolved — but resolve it in minutes, not in an extended research loop.

# Decisions on open questions (Plan.md Section 8)

1. **Q1 — Sheets MCP permission:** Attempt the Sheets MCP calls. If the permission error persists after one retry, stop — do not troubleshoot further. Fall back to producing the exact `SystemConfig`/`Events`/`BranchMap`/`DiseaseScans` tab structures (headers, seeded keys, values) as a clearly labeled section in your final report so the user can paste them in manually. Do not block the rest of the build on this.
2. **Q2 — existing spreadsheet content:** Resolved by whichever path Q1 takes.
3. **Q3 / CP4 — existing `Webhook` node in `phytoai`:** Full discretion — repurpose, replace, or restructure as you judge best. Document your choice and reasoning in the final report.
4. **Q4 — OpenRouter model variant:** Use the paid `google/gemma-4-26b-a4b-it` (not `:free`) in every AI Agent node's `lmChatOpenAi` subnode.
5. **Q5 — Telegram language:** English, for every message template in every branch.
6. **Q6 — dry-run Telegram visibility:** While `dry_run_mode=true`, Telegram messages still send, each prefixed `[DRY RUN]` — not suppressed.

# Execution rules

- **Follow `Plan.md` as the primary blueprint**, with the URL correction above taking priority over its Section 3.0/4 content. Where the plan grants discretion, use engineering judgment without asking — subject to HARD RULE #1's cap on how much verification that judgment call is allowed to consume.
- **Preserve every hard requirement** from `SmartPot-Full-Engineering-Spec-PRD.md`: history-aware watering (never a single snapshot — must use recent `Events` history, `last_watered_utc` elapsed time, and species), the tank-empty hard IF-override beating the AI's decision, no fixed thresholds beyond the two sanctioned safety constants (600s heater cap, 12h alert cooldown), and full `SystemConfig` read/write persistence across stateless runs.
- **CP1 (Sheets):** confirm no tab-name collisions before writing, if the Sheets MCP works.
- **CP2 (Activation):** build and test `phytoai`, but leave it **inactive** at the end of this run. Do not activate it.
- **CP3 (Telegram):** dry-run messages (prefixed `[DRY RUN]`) are pre-approved — send freely during testing. Do NOT flip `dry_run_mode` to `false` yourself.
- **Manual prerequisites (Telegram bot token, n8n Google credentials, OpenRouter credential, Drive folder authorization) are not your job to create.** Build every node that depends on them, reference the expected credential by name, and list exactly what the user still needs to do in your final report.
- **Verification testing (Plan.md Section 3.9):** before declaring the Core Daily Logic branch done, seed mock `Events` history + mock `last_watered_utc`, send two contrasting test payloads to the sensor webhook (using the corrected URL), and confirm the AI's decision and `reasoning_summary` actually differ between the two scenarios and explicitly cite history/species/timing. Also test the tank-empty override and dry-run zeroing. If any single test step requires more than one debugging attempt to get working, apply HARD RULE #1 — fix it with your best judgment and note it, don't loop.

# What to report back when finished

1. The correct, verified current webhook base URL, and the tunnel-persistence risk note.
2. What you built, branch by branch, and any deviations from `Plan.md` with reasoning — including every assumption you made under HARD RULE #1's one-attempt cap.
3. Whether the Sheets MCP fallback was needed, and if so, the manual tab/header/seed-value content for the user to paste in.
4. What you decided for the existing `Webhook` node and why.
5. Results of the Section 3.9 verification tests, run against the corrected URL.
6. The full list of manual prerequisites still outstanding, with exactly what the user needs to do for each.
7. Confirmation that the workflow remains inactive and no live Telegram/pump/heater actions were triggered outside dry-run/test conditions.

Do not activate the workflow, do not disable dry-run mode, and do not perform any action beyond what's described above without pausing to ask first. If you find yourself about to research the same question a second time, stop and apply HARD RULE #1 instead.
