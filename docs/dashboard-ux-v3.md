# Dashboard UX v3 + n8n AI integration (2026-09-15)

Base: dashboard v2 (commit `399a624`). This pass adds app-style navigation, light/dark/system themes, the
Plant Doctor screen and an **n8n-backed assistant** whose endpoints are guarded server-side. Firmware, WROOM
safety logic, hardware constants, Google OAuth secrets and the spreadsheet schema were not modified.

## Phase 1 — Audit of the real workflow (`workflows/phytoai.json`)

1. **Existing webhook entry points (before this pass):** `POST core/sensor` (responseNode — synchronous
   decision), `POST core/photo` (multipart), `POST yolo-scan` (responseNode), `POST yolo-scan/done`,
   `GET config` (lastNode). All device-facing; none browser-facing.
2. **Existing response formats:** the 12-field decision JSON (`Build Decision Response` → `Respond
   Decision`), scan acks (`Respond Scan Check` / `Respond Scan Done`), `GET config` context (sun times,
   dry-run, flash + preheat values). None structured for dashboards.
3. **AI/model nodes and roles:** one shared model node `OpenRouter Gemma` (`google/gemma-4-26b-a4b-it`,
   temp 0.2) feeding six agents — History Analyst, Decision Agent, Photo Analysis Agent, Vision Analyst,
   Judge, Treatment Advisor — each with a structured output parser. Perenual HTTP lookups enrich species
   context (advisory cache).
4. **Sheets/Drive reads/writes:** reads SystemConfig / Events / Notifications / DiseaseScans / AgentNotes;
   writes Events (append + photo upsert), SystemConfig (upserts), Notifications, DiseaseScans, AgentNotes;
   Drive uploads daily photos + scan photos (file IDs persisted in rows).
5. **YOLO/image-analysis outputs:** `YOLO Analyst` (HTTP → `http://yolo:8090/predict`, low weight until
   fine-tuned) → `Build YOLO Opinion` → Judge; persisted inside `DiseaseScans.yolo_opinion` (JSON with
   `label`, `label_simple`, `confidence`), vision output in `vision_opinion`, verdict in `judge_verdict`.
6. **DiseaseScans and AgentNotes writers:** `Append DiseaseScans Row` (scan verdicts on the issue and
   monitor paths) and `Append AgentNotes` (History/Decision/Vision/Judge/Treatment/Perenual notes).
7. **Image ↔ detection linkage:** real for scans — `DiseaseScans.drive_links` holds the Drive link of the
   exact image the detection was made from (parsed to `image_id`); daily photos live in `Events.PhotoFileID`
   but have no detections. `detection_id` is **derived** (`ds-<timestamp>`), not stored.
8. **Endpoints safe to call from EdgeOne:** Google Sheets/Drive REST (already used, user OAuth) and the new
   dashboard webhooks (they carry CORS allow-origin + token verification). Device webhooks stay unreachable
   from the browser (no CORS, no auth semantics for them).
9. **CORS/auth requirements:** webhook nodes allow exactly `https://phytoai.edgeone.dev`; every request must
   carry `Authorization: Bearer <Google access token>`, verified via `oauth2/v1/tokeninfo` against the
   public OAuth client ID (+ expiry + spreadsheets scope). Per-token rate limits live in workflow static
   data (ask 12/min, overview/detection 30/min).
10. **Feature availability before this pass:** *persistently available* — telemetry, species, notifications,
   scan opinions, AgentNotes, images (all Sheets/Drive reads); *live only* — device decision JSON, firmware
   serial deltas (`ml_est` context, measured `wt_delta_g` log-only); *missing* — assistant answers, AI
   overview, normalized detections; *safe-unavailable* — anything requiring the model when the endpoint is
   off (UI shows an explicit reason, never a fake answer).

## Phase 2 — n8n contracts (added to `workflows/phytoai.json`, 217 nodes)

### A. `POST /webhook/dashboard/ask`
```json
{ "plant_id": "default", "question": "when was the last watering?",
  "context": { "route": "overview", "client_time_utc": "2026-09-15T12:00:00Z" } }
```
Guard: token required → tokeninfo → audience check → per-token rate limit (12/min) → question bounds
(3–500 chars) → plant id check (SystemConfig `plant_id` when seeded; `default` accepted). Intents classified
deterministically: last watering, current status, recent change, sensor explanation, warning lookup, photo
lookup, detection lookup, care recommendation (fallback). Bounded context: system config + last events +
recent notifications + recent scans + recent care notes (sized, truncated; never the whole sheet).
Deterministic answers for the seven factual intents; the model is used only for care-recommendation/unknown
synthesis via the shared `OpenRouter Gemma` node with a structured parser. Response:
```json
{ "ok": true, "answer": "…", "answer_type": "deterministic|ai_summary",
  "generated_at_utc": "…", "data_as_of_utc": "…|null", "confidence": 0.9,
  "evidence": [{ "source": "Events", "id": "…", "label": "…" }],
  "warnings": [], "needs_more_data": false }
```
Failure/unavailable: `{ "ok": false, "answer": "I cannot answer that reliably from the available data.",
"answer_type": "unavailable", "needs_more_data": true, "warnings": ["reason"] }`.

### B. `GET /webhook/dashboard/overview?plant_id=<id>[&ai=1]`
Deterministic status (`thriving|ok|needs_attention|critical` from persisted facts + configured thresholds —
no numerical health score), `summary`, `what_changed`, `what_to_check`, freshness (`data_as_of_utc`),
`evidence`, `warnings`. With `ai=1` an AI summary may replace the summary text (`answer_type: ai_summary`);
if the model fails the deterministic summary is kept and `ai_unavailable` is added.

### C. `GET /webhook/dashboard/detection?plant_id=<id>[&detection_id=ds-…]`
Normalizes the newest (or requested) DiseaseScans row into the detection contract: derived `detection_id`,
`image_id`/`image_url` **only when a real Drive link exists**, label/confidence from the persisted YOLO
opinion, plain-language `observation` (explicitly *unverified visual hypothesis*), status mapping
(`issue→possible_issue`, `monitor→monitor`, healthy→`clear`, else `unknown`), `recommended_actions` parsed
from the stored treatment plan, `recommendation_basis` (species + latest conditions), `data_warnings`
(`ai_unverified`, `no_linked_image`, `treatment_text_unstructured`), `is_verified` from the owner's
verdict, `resolved` from the recorded outcome, plus a 5-item `history` list. No scans → `detection: null`
with `no_detections`. **Persistence changes: none** — the existing DiseaseScans schema carries all used
fields; `detection_id`/`resolved` are derived, not stored (documented, not silently added).

## Phase 3/4 — Dashboard (this commit)

- **Routes:** `#/overview`, `#/timeline`, `#/doctor`, `#/photos`, `#/insights`, `#/settings`.
  Desktop: top tabs. Mobile: bottom navigation (Overview, Timeline, Doctor, Photos, More) — secondary
  screens in a More sheet. Active screen marked with `aria-current`; hash routing is EdgeOne-safe.
- **Overview:** hero status sentence + flags, recommended next action (from the live overview response,
  falling back to deterministic rules), four essential vitals, latest event, latest alert, latest photo
  thumb, compact AI overview card, ask bar, links to deeper screens.
- **Plant Doctor:** latest detection (label, status chip, confidence, timestamp, verification/resolved
  state), **affected image only when `image_url`/`image_id` are real**, observation, suggested actions,
  recommendation basis, evidence, warnings, detection history, honest empty state.
- **Timeline:** prose-ified moments (watering/heating/tank/anomaly + notifications) plus the waiting-on-you
  notification center with answers.
- **Insights:** AI overview (bounded, labelled `AI GENERATED — UNVERIFIED`), what changed / what to check,
  freshness, expandable evidence, one-metric trend charts (7 d desktop / 24 h phone default, max 3 before
  “Show more charts”, smooth lines + gradient + hover values), ask bar.
- **Photos:** latest + filterable gallery + full-screen viewer; genuine empty states (unDraw).
- **Themes:** light / dark / system (manual toggle + Settings selector, `localStorage`
  `phytoai_mode`, live `prefers-color-scheme` listener) and plant-type accent themes from config —
  **themes never change thresholds**.
- **Assistant client:** `Authorization: Bearer <user token>` to the n8n webhook base configured publicly in
  `dashboard/config.js`; 15 s timeout; every failure (404 inactive workflow, 401/403 denied, timeout,
  network/CORS, bad JSON, `ok:false`) renders an explicit honest state; AI answers are set with
  `textContent` (no HTML injection) and always labelled unverified.
- Icons remain the 12 Iconify Phosphor icons from v2; unDraw assets unchanged
  (`gardening/images/notifications/login`).

## Phase 5 — Security / static hosting

- No AI keys, n8n tokens or Google secrets in browser files — only public config (client ID, spreadsheet ID,
  webhook base URL). The token in each assistant request is the user's own Google access token, verified
  server-side (`tokeninfo` audience = the public OAuth client ID).
- CORS: webhook nodes allow exactly `https://phytoai.edgeone.dev`. Only the validated `?sheet=<id>` override
  is accepted for spreadsheet ids (shape-checked); arbitrary URLs/prompts are never forwarded — questions are
  bounded and context is built from Sheets, not from user text.
- Rate limiting via workflow static data; question/plant validation server-side.

## Validation (all executed)

| # | Item | Evidence |
|---|---|---|
| 1 | Assistant returns documented JSON | MCP `test_workflow` exec **742/743/744** — deterministic, AI (canned model), unavailable shapes all matched |
| 2 | Deterministic answers without model calls | exec **742**: `Plant Assistant` absent from runData; `answer_type=deterministic` |
| 3 | AI summary uses bounded context | exec **743**: prompt built from bounded context, length < 4.5 kB |
| 4 | AI failure → safe unavailable | exec **744**: `ok:false`, `answer_type:unavailable`, warnings present |
| 5 | Overview freshness + evidence | exec **746**: status `critical`, `data_as_of_utc` set, evidence + refill action; wrong-plant-id path returns `unknown` |
| 6 | Doctor renders detections only when source data exists | exec **748** (issue + image), **749** (no image → null), **750** (no scans → `detection:null`, `no_detections`) |
| 7 | Affected image only when image_url real | exec **748** image_url = persisted Drive link; **749** null + `no_linked_image`; probe: doctor empty state |
| 8 | Light/dark/system themes | probe: light bg `rgb(238,244,239)` vs dark `rgb(10,19,14)`; localStorage + system listener |
| 9 | Desktop/mobile navigation | probe: 6 routes switch with exactly 1 visible screen and correct `aria-current` at all 5 widths |
| 10 | No horizontal overflow 320/390/768/1280/1920 | probe: zero overflow on every route at every width |
| 11 | OAuth works | GIS token client initialised (hint applied); sign-in flow unchanged from v2 |
| 12 | `?sheet=` override | regression: visible → remembered → invalid rejected |
| 13 | Test sheet renders | probe runs the full app against the stubbed test data set |
| 14 | No browser secrets | staged diff secret scan clean |
| 15 | No firmware changes | git diff contains dashboard + docs only |
| 16 | `node --check` | app.js + config.js pass |
| 17 | Static asset smoke | 8/8 HTTP 200 incl. `assets/undraw-*.svg` |
| 18 | Zero uncaught console errors | real page + 5 probe iframes: 0 CONSOLE/Uncaught |
| 19 | prefers-reduced-motion | forced run: leaf `animation-name: none`, reveals visible, layout identical |
| 20 | Workflow export consistency | `validate_workflow` valid (217 nodes); live re-fetch identical to repo export |

Auth guard coverage: exec **745** (wrong audience denied before any Sheets read; respond ran), exec **751**
(over-length question rejected before reads). Assistant endpoint denial/empty paths verified at workflow
level.

## 2026-09-16 — assistant response-path fix (deployed symptom: success shown as failure)

**Symptom:** the n8n execution for `POST /dashboard/ask` completed with the correct reply, but the dashboard
showed the generic “assistant unreachable (network or CORS)” error; retries then pushed Sheets reads into
quota exhaustion.

**Live capture (curl against the deployed endpoint, `Origin: https://phytoai.edgeone.dev`, no token → deny
path runs before any Sheets read so it costs no quota):**
- `OPTIONS /webhook/dashboard/ask` → `204`, `access-control-allow-origin: https://phytoai.edgeone.dev`,
  `access-control-allow-headers: authorization,content-type`, `access-control-allow-methods: OPTIONS, POST`.
- `POST` → `200`, `Content-Type: application/json; charset=utf-8`,
  `access-control-allow-origin: https://phytoai.edgeone.dev`.
- Body is a plain JSON object (documented shape), e.g.
  `{"ok":false,"denied":true,"answer":"I cannot answer that reliably…","answer_type":"unavailable","needs_more_data":true,"warnings":["missing_authorization"],"generated_at_utc":"…"}`.
- Success path body (captured from execution `743`, the exact `Dash Ask Respond` input): plain object with
  all nine documented fields (`ok`, `answer`, `answer_type`, `generated_at_utc`, `data_as_of_utc`,
  `confidence`, `evidence`, `warnings`, `needs_more_data`) — no nesting, no double-encoding, no array.

**Root causes (frontend, not n8n):**
1. **Client aborted at 15 s** while the AI path legitimately takes ~20–60 s — the browser rejected the
   request, the workflow kept working and finished successfully. (`assistantTimeoutMs: 15000`.)
2. **Generic error masking:** every non-timeout fetch rejection rendered “unreachable (network or CORS)”,
   hiding the real condition.
3. **Shape check too strict after the fix:** requiring `answer` on every endpoint rejected the documented
   overview (`summary`) and detection (`detection`) shapes — found by the regression probe and made
   route-aware.

**Fix (dashboard only; no n8n contract change):**
- Timeouts aligned to real latency, hard caps: `assistantTimeouts: { ask: 60000, overview: 25000, detection: 25000 }`.
- Full failure taxonomy: 2xx valid JSON renders; 2xx invalid/missing-shape → “replied in an unexpected
  format”; 401/403 and the workflow's 2xx `warning: missing_authorization|wrong_audience` denials →
  “session expired — reconnect”; 404 → “workflow is not published at this endpoint”; 429 and the workflow's
  `rate_limited` warning → “temporarily busy; try again in a minute”; 5xx → “workflow failed; see the
  execution”; fetch `TypeError` → “Browser could not access the endpoint”; abort → “still working (longer
  than N s)” with a pointer to the execution.
- Send button + input disabled while a request is in flight (single-flight guard also blocks Enter-key
  duplicates); client cooldown after failures (`failure 15 s`, `busy 60 s`) so retries cannot create a
  Sheets read storm; no tokens, headers, sheet data or private responses are logged.

**Validation:** scenario-driven headless suite (stubbed transport, 1.2 s timeout override) — valid JSON
renders the answer; malformed JSON, 401, 403, 404, 429, 500, blocked fetch, 2xx deny, busy cooldown,
duplicate-click and delayed-response-timeout all render their exact classified messages; duplicate clicks
increment the request count by exactly **1**; cooldown blocks retries with **0** new requests; 0 console
errors. Full v3 layout probe re-run: PASS (all routes, 5 widths, themes, reduced motion). Static smoke
8/8. Live CORS/HTTP verified from the EdgeOne origin.

## Still missing / not yet real

- **The endpoints are not reachable over HTTP until the workflow is activated** — the dashboard currently
  shows the honest “workflow is inactive” state. Owner steps: publish the workflow, then
  `curl -H "Authorization: Bearer <token>" "https://n8n.mnsof.me/webhook/dashboard/overview?plant_id=default"`
  to confirm CORS/HTTP end-to-end from the deployed origin.
- Real-token verification (a live Google access token through `tokeninfo`) was not exercised in tests; the
  guard logic was tested with pinned tokeninfo responses (valid + wrong audience + error).
- Capture reason / per-photo light remain unpersisted; measured `wt_delta_g` stays device-log only; LDR
  scale semantics remain Q22.
