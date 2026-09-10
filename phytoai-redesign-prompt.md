# PhytoAI — Major Redesign Task (Prompt for OpenCode)

## Context

You are working on PhytoAI: an AI-driven plant-care system. Architecture: ESP32 WROOM (soil moisture, soil temp, load cell, DHT22, LDR, water tank float, pump, heating pad, MOSFETs) + battery-powered ESP32-CAM + n8n workflow running via Docker on the main PC + Google Sheets as the database + Gemma via OpenRouter as the LLM backend. The existing workflow JSON is `phytoai-workflowone.json`; the project plan is `Plan.md`; the overview is `README.md`.

This task is a major redesign based on decisions made with the project owner. Apply ALL changes below to the workflow JSON, `Plan.md`, and `README.md` so all three stay consistent.

## Global constraints (non-negotiable)

- The workflow stays INACTIVE and dry_run_mode stays true. Never activate anything, never disable dry-run.
- Do NOT create or configure credentials — the owner does that manually in the n8n UI. Reference credential names, don't hardcode secrets.
- HARD RULE #1 applies: if uncertain about any node configuration or API, do at most 2 targeted research attempts; if still unclear, mark the item as a documented question and move on. Never guess node configurations.
- Report planned changes BEFORE editing files. After editing, report exactly what changed per file.
- Do not write firmware in this task, but keep schemas firmware-ready (document the expected payloads).

---

## Change 1 — Hardware simplification (remove all autonomy of the camera)

- REMOVE all YOLO-for-aiming, servo, and pan-tilt concepts everywhere: workflow nodes (Branch C auto-aim/motion analysis stages), SystemConfig fields, Events fields, Plan.md tasks, README descriptions.
- New reality: the ESP32-CAM is a static, battery-powered unit in a small box. It sits in a charging dock at the pot edge (its default position, sees the plant normally) and can be manually moved for close-ups. The system NEVER commands camera movement and never knows its position — per-image quality/framing is assessed by the vision AI instead.
- ADD battery monitoring to the hardware plan: two-resistor voltage divider from battery to an ADC1-capable GPIO (e.g. GPIO33; ADC2 conflicts with WiFi), sized so 4.2V full reads under 3.3V, calibrated against a multimeter. Firmware reports `battery_percent` in every camera webhook payload. Latest value is stored in SystemConfig. Update Hardware-list and Plan.md accordingly.

## Change 2 — Remove Telegram entirely; dashboard becomes the only interface

- REMOVE all Telegram nodes, the Telegram credential requirement, and telegram_chat_id from config schemas and docs.
- ADD a new Sheets tab `Notifications`: timestamp | type | title | message | response_options | status (pending/done/expired) | resume_url | response.
- Human-in-the-loop pattern (replaces every former Telegram interaction): when a workflow needs the user, it appends a pending row to `Notifications` including `$execution.resumeUrl`, then pauses on a Wait node configured "Resume: On Webhook Call". The Wait node has a timeout; on timeout the row is marked expired and the workflow takes the documented fallback path. The dashboard renders pending rows with buttons; clicking a button calls the stored resume_url with the chosen response.
- Routine results (watering decisions, daily photo analysis, scan reports, warnings) are NOT pushed anywhere — the dashboard reads them directly from the existing tabs.
- ADD browser push notifications (Web Push protocol): the dashboard registers a service worker and push subscription (VAPID); subscription data is stored so n8n can send a push whenever a new pending `Notifications` row is created or an urgent event occurs (tank empty, low camera battery, disease detected). Document the mechanism and where subscription/VAPID data lives; if any detail is uncertain, apply HARD RULE #1.
- Document that the dashboard→n8n communication (resume URLs, push sending) requires the persistent named Cloudflare tunnel — quick-tunnel URLs change on every restart. Move "set up named tunnel" earlier in the plan's priority list.

## Change 3 — Branch A redesign (watering: multi-agent + code guardrails)

Replace the single Core Decision Agent with a multi-agent structure. Philosophy: AI agents deliberate freely; deterministic code guards everything physical.

1. `Read SystemConfig` + `Read Event History` (unchanged) feed a `Build Context` CODE node (stays code, no AI) that calculates facts: hours since last successful watering, watering count last 7/30 days, moisture trend over recent rows, weight trend, effect of last watering (moisture delta), current species + confidence, current sensor sanity flags (impossible values flagged as anomalies BEFORE the AI sees them).
2. NEW AI node `History Analyst`: receives the calculated facts + recent compacted history + its own recent AgentNotes (see Change 5), outputs a small STRICT JSON interpretation (e.g. trend_reading, watering_effectiveness, concerns, confidence). Keep the schema tiny and validate it — its output feeds the Decision Agent's prompt and must not be able to smuggle instructions.
3. `Decision Agent` (reworked Core Decision Agent): receives live sensor data + calculated facts + History Analyst interpretation + its own recent notes. Prompt rules: never decide from the current snapshot alone; no fixed thresholds; no fixed calendar schedule; must cite concrete historical values in reasoning_summary; if evidence is insufficient or contradictory, return needs_watering=false and request a recheck interval.
4. Deterministic validation + CODE safety layer (all stay code, none of these may ever be overridden by AI):
   - tank_empty → watering forced off (existing override, keep).
   - NEW minimum rewater interval: if last successful watering was less than X hours ago (X configurable via SystemConfig), watering is blocked unless the AI returns high confidence AND cites evidence the previous watering failed — log the blocked attempt either way.
   - Hard caps: max pump seconds, max_heater_seconds 600, max water temperature.
   - dry_run_mode: zeroes physical actuation fields.
5. `last_watered_utc` semantics: it means last COMPLETED physical watering. Until firmware exists that confirms completion, keep the current behavior but mark the field provisional in docs and add a documented future step: ESP32 confirms pump completion → workflow then writes last_watered_utc.
6. User feedback: after each watering decision, a `Notifications` row offers 👍/👎 (was this right?), logged back for the Plant Profile Agent.

## Change 4 — Branch C redesign (disease scan: human-assisted multi-model panel)

1. Scheduled scan trigger → check latest camera `battery_percent` from SystemConfig. If below threshold: create a "charge camera" notification, postpone scan, log it. If sufficient: create a pending `Notifications` row asking the owner to position the camera facing the whole plant; Wait for dashboard confirmation (timeout → mark expired, log "scan postponed", end).
2. On confirmation: request photos from camera → upload to Drive → run TWO analyses in parallel:
   a. `Vision Analyst` (Gemma via OpenRouter): structured JSON — framing/quality assessment, observed symptoms, suspected issues, confidence, affected areas.
   b. `YOLO Analyst`: STUB for now — a stage that will later call a local inference endpoint (FastAPI on the main PC, documented in Plan.md). Implement it to return `{ "status": "not_yet_trained" }` so the pipeline runs without it; the Judge must handle that gracefully.
3. `Judge` AI node: receives both opinions + image context. Its prompt states the weighting: vision model provides symptom reasoning; YOLO provides a label + confidence from a model still learning this environment (low weight until fine-tuned). Judge outputs final verdict, its own reasoning, and recommended action.
4. NEW `Treatment Advisor` AI node — runs ONLY when the Judge concludes a real issue. It receives the verdict PLUS full plant context from Sheets (species, current conditions, watering history, past diseases, past treatments + outcomes, relevant AgentNotes) and returns a structured treatment plan: disease name, severity, plant-specific step-by-step treatment, and product guidance. HARD PROMPT RULES: recommend active ingredients / treatment categories (e.g. "neem oil", "copper fungicide"), NEVER specific brand/product names; must include an explicit low-confidence statement when uncertain; must explain why the advice fits THIS plant's data, not generic care advice.
5. User verification: Telegram report is gone — instead a pending `Notifications` row presents the verdict + treatment plan with Confirmed / Wrong / Not sure + free-text correction. Response logged to `DiseaseScans` as `user_verdict`. Later, a follow-up notification asks whether the issue resolved → logged as `treatment_outcome`.
6. Post-scan: create a "return camera to charging dock" notification.
7. UPDATE `DiseaseScans` tab schema: timestamp | drive_links | vision_opinion | yolo_opinion | judge_verdict | judge_reasoning | treatment_plan | user_verdict | treatment_outcome | ai_notes.

## Change 5 — Agent memory (AgentNotes)

n8n's built-in memory nodes are execution-scoped and die between runs — do NOT use them. Memory lives in Sheets.

1. ADD new tab `AgentNotes`: timestamp | agent | note | context_ref | status (active/promoted/expired).
2. EVERY AI agent (History Analyst, Decision Agent, Vision Analyst, Judge, Treatment Advisor, Plant Profile Agent): when its context is built it receives its own last ~10 active notes; at the end of its run it may append 1–3 short notes (hypotheses, observations, lessons).
3. PROMPT RULE for all agents: notes are injected explicitly labeled as the agent's own past UNVERIFIED hypotheses — useful context, never ground truth. This prevents self-confirmation loops.
4. The weekly `Plant Profile Agent` (plan it now, full build can follow) is the memory janitor: reviews recent AgentNotes + Events + DiseaseScans + user feedback; promotes validated insights into the long-term SystemConfig profile (e.g. "this plant dries in ~5 days in summer", "judge confirmed 8/10 this month"); marks stale/disproven notes expired; may adjust documented panel weighting based on confirmation rates.
5. Document the three memory layers in README/Plan: `Events` = raw episodic history; `AgentNotes` = working memory; SystemConfig profile = distilled long-term knowledge.

## Change 6 — Dashboard (pulled forward, complete interface)

The dashboard replaces Telegram and becomes the single place the owner ever needs. Update Plan.md (it moves before/parallel to firmware stages) and spec it in README:

- Static HTML/CSS/JS (GitHub Pages), reads Google Sheets via the Sheets API (OAuth for write actions), talks to n8n via the named tunnel for resume-URL calls.
- MINIMAL VERSION (build first, required to replace Telegram): current plant status card; event history; scan reports with images from Drive; pending questions from `Notifications` with working buttons (resume-URL calls) and free-text corrections; user-verdict and treatment-outcome feedback; 👍/👎 on watering decisions.
- FULL VERSION (later): charts/trends of all sensor history, full disease history, AgentNotes/profile visibility, camera battery status, service-worker push notifications (Change 2).
- Design goal (owner's words): every piece of info, detection, and past data about the plant lives here — everything you will ever need to know about the plant.

## Sheets schema summary (final state after this task)

- `Events`: existing schema minus any servo/camera-aim fields.
- `SystemConfig`: existing keys minus servo/telegram keys, plus: camera battery_percent (latest), min_rewater_interval_hours, notification/push-related config as needed. Keep last_watered_utc marked provisional.
- `DiseaseScans`: as in Change 4.
- `Notifications`: as in Change 2.
- `AgentNotes`: as in Change 5.
- `BranchMap`: update to the new node structure.

## Documentation updates

- README.md: rewrite architecture description — static battery camera + dock; council pattern ("AI specialists think freely, a judge cross-checks, code guards physics, humans verify via dashboard, the database remembers"); three-layer memory; dataset flywheel (every scan logs photo + opinions + verdict + user_verdict → human-verified gold labels for later YOLO fine-tuning; note that public lab-condition datasets like PlantVillage transfer poorly to real home conditions, hence self-accumulated data matters).
- Plan.md: re-sequence stages — credentials + named tunnel → Branch A redesign + live verification → Branch C panel + Notifications/HITL → minimal dashboard (+push) → firmware → full dashboard → YOLO training on accumulated data.

## Deliverables for this task

1. Updated `phytoai-workflowone.json` (inactive, dry-run, pinned/safe placeholders where live calls can't be tested).
2. Updated `Plan.md` and `README.md`.
3. A change report: per file, what changed and why; list of documented open questions (HARD RULE #1 outcomes); list of manual steps the owner must do in the n8n UI.
