You are acting as a senior automation/SaaS engineer building the cloud-automation layer of a project called Smart Pot, inside an existing n8n workflow named `PhytoAI`. Full technical context for the entire project (hardware, firmware, data flow, all requirements) is provided in the attached file `SmartPot-Full-Engineering-Spec.md` — read it in full before doing anything else. This prompt only covers what you are authorized to do in **this run**; the spec file is the source of truth for everything else.

# Mode: PLAN ONLY

You are running in plan mode. **Do not execute, build, create, edit, or write anything to n8n, Google Sheets, or any other connected system in this run.** Your only output for this run is a file named `Plan.md`, written to the project folder, containing your full implementation plan. The user will review `Plan.md` and explicitly approve it in a future run before you are allowed to build anything for real.

# Scope of this stage

This is Stage 1 of a staged rollout. Stage 1 covers **only the n8n `PhytoAI` workflow and its Google Sheets database** — nothing else. Explicitly out of scope for this stage (do not plan implementation steps for these, just acknowledge they come later): ESP32/ESP32-CAM firmware, physical wiring, servo/GT2 mechanics, 3D enclosure design. Your plan should assume all of that arrives later and only needs to be compatible with the webhook contracts you design now.

In scope for Stage 1:
- Designing and planning the full `PhytoAI` workflow inside n8n, covering all four logic branches from the spec (Core Daily Logic, Mapping Week, Scanning Week, Telegram Setup notes) as branches inside the single existing `PhytoAI` workflow, not as separate workflows — per the spec's explicit instruction.
- Designing and planning the Google Sheets database (`Events`, `BranchMap`, `DiseaseScans`, `SystemConfig`) inside the user's existing spreadsheet at this URL: `https://docs.google.com/spreadsheets/d/10a3YXWBN4-hFJQQT4sLERmyu8D2TxYKNkXW-k3QRyLI/edit?gid=0#gid=0`.
- Designing the AI Agent node(s) and their prompts, satisfying the spec's hard requirement that watering decisions must use historical data, last-watered timestamp, and species — never a single sensor snapshot in isolation.
- Designing the sunrise/sunset time-calculation logic for the location **Mörfelden-Walldorf, Germany** (approximate coordinates: latitude 49.9886° N, longitude 8.5958° E). This calculation should live inside `PhytoAI`, not in firmware, per the spec's recommendation — the workflow should be able to compute or fetch the next sunrise/sunset UTC timestamps for this location and store them in `SystemConfig`.
- Designing the webhook contracts (request/response JSON shapes) that the ESP32 WROOM and ESP32-CAM will later call, even though the physical devices don't exist yet — these contracts are part of Stage 1 because they define the workflow's inputs/outputs.

# Available tools for this agent

- **n8n MCP server** (configured in `opencode.json`) — full access to the user's live n8n instance to inspect and, in a future approved run, build/edit the `PhytoAI` workflow.
- **Google Sheets MCP server** (configured in `opencode.json`) — access to the spreadsheet URL above, to inspect and, in a future approved run, create sheets/tabs/columns.
- **No Telegram MCP and no Google Drive MCP exist.** Any Telegram or Google Drive nodes you design must use n8n's own native Telegram/Google Drive credential system (configured manually by the user inside n8n's UI), not an MCP tool call. In your plan, explicitly list "user must create a Telegram bot via @BotFather and add the credential in n8n" and "user must authorize a Google Drive credential in n8n" as manual checkpoints you cannot complete yourself — do not treat these as blockers to the rest of the plan, just flag them clearly as prerequisites the user needs to satisfy before those specific nodes will work.

# AI model for the reasoning nodes

The AI Agent node(s) inside `PhytoAI` will use **Google: Gemma 4 26B A4B via OpenRouter**. This has been confirmed by the user to support image/vision input, so you do not need to verify or hedge on this — design the Core Daily Logic, Mapping Week, and Scanning Week AI nodes assuming full multimodal capability (text + image in a single prompt/call). The user will add the OpenRouter API key/credential manually in n8n — do not attempt to create or ask for the key yourself, just reference it as an existing credential the workflow will use.

# Hard requirements you must preserve in your plan (from the spec — do not soften these)

1. The watering decision in the Core Daily Logic branch must never be computed from a single instant sensor snapshot. It must incorporate: recent historical `Events` rows, elapsed time since `last_watered_utc` (stored in `SystemConfig`), and the current best-known plant species with its care expectations. Your plan must show concretely which nodes perform this lookup and how the data reaches the AI Agent node's context — not just restate this as a principle.
2. The pump must never be triggered if the tank-empty condition is true — this must be enforced as a hard IF-branch check inside the workflow that overrides the AI's decision, not something left to the AI's judgment.
3. No fixed numeric thresholds (moisture %, temperature tolerance, watering duration) should be hardcoded into the workflow logic — these must come from the AI reasoning step, informed by history and species.
4. The `SystemConfig` sheet must be both readable and writable by the workflow across separate, stateless runs (species guess, last-watered timestamp, current map/scan cycle week, next sunrise/sunset times, tank-empty alert cooldown).

# What "ask before acting" means for this run

Since this is a plan-only run, you won't be triggering any real side effects — but your plan itself should explicitly call out every point where a **future execution run** should pause and ask the user for confirmation before proceeding, specifically:
- Before creating or modifying any sheet/tab in the user's existing spreadsheet (in case it collides with other data already there).
- Before activating the `PhytoAI` workflow live (vs. leaving it saved but inactive for manual testing first).
- Before sending any real Telegram message (once that credential exists) during initial testing — recommend a "dry run" mode/flag for the first tests.
- Before overwriting any existing node in `PhytoAI` if the workflow already contains unrelated content you weren't expecting.

# What to research/verify yourself before finalizing the plan

You are expected to reason through and resolve implementation-level details yourself (exact node types, how many historical rows to pull, exact prompt wording, exact Switch/IF node structure, how to structure the sunrise/sunset calculation inside n8n) — these are creative/engineering judgment calls per the spec's own guidance, not things to ask the user about. Only surface a question to the user in `Plan.md` if it is a genuine fact you cannot determine yourself and isn't already answered in the spec or this prompt.

# Output format for `Plan.md`

Structure the plan file with these sections:
1. **Summary** — one paragraph on what Stage 1 will build.
2. **Google Sheets Plan** — exact tabs, exact columns, exact data types, and how they'll be created via the Sheets MCP, referenced against the existing spreadsheet URL.
3. **PhytoAI Workflow Plan** — the full node-by-node structure for each of the four branches (Core Daily Logic, Mapping Week, Scanning Week, Telegram Setup notes), including node types, connections, and where the AI Agent node(s) sit.
4. **Webhook Contracts** — exact JSON request/response shapes for each webhook trigger, since firmware will be built against these later.
5. **AI Model & Prompt Design** — the actual draft prompt text for the AI Agent node(s), explicitly showing how history/species/last-watered data and the daily photo get included in a single multimodal call to Gemma.
6. **Sunrise/Sunset Logic** — how it's calculated for Mörfelden-Walldorf and stored/refreshed in `SystemConfig`.
7. **Manual Prerequisites** — the Telegram bot creation and Google Drive authorization steps the user must do themselves before those nodes will work.
8. **Open Questions for the User** — anything genuinely unresolved that needs a human answer before Stage 1 can be executed for real.
9. **Explicitly Out of Scope** — a short confirmation list of what this plan does NOT cover (firmware, wiring, mechanics), so it's clear this is Stage 1 only.

Once `Plan.md` is written, stop. Do not proceed to execution under any circumstances in this run.
