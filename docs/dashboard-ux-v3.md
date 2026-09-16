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

- **Endpoints are live:** the workflow was activated by the owner on 2026-09-16 and the deployed
  `POST /webhook/dashboard/ask` answered from the EdgeOne origin (CORS + HTTP verified; deny path costs no
  quota). Suggested confirmation for a signed-in user:
  `curl -H "Authorization: Bearer <token>" "https://n8n.mnsof.me/webhook/dashboard/overview?plant_id=default"`.
- Real-token verification (a live Google access token through `tokeninfo`) was not exercised in tests; the
  guard logic was tested with pinned tokeninfo responses (valid + wrong audience + error).
- Capture reason / per-photo light remain unpersisted; measured `wt_delta_g` stays device-log only; LDR
  scale semantics remain Q22.

## 2026-09-16 — request serialization + Assistant chat route (`7c7434d` workflow + this commit)

**Why:** the initial load fired 5 Sheets reads in parallel and then 3 assistant calls in parallel (measured peak
concurrency **5**), every ask execution read all 5 Sheets tabs regardless of intent, and route changes re-ran
loads — a few refreshes exhausted the Sheets per-minute quota. 429s were also retried by the next render.

**Dashboard — one serialized request pipeline (Part 1):**
- Every data request (Sheets, Drive, assistant, artwork, notification resume pings) runs through a FIFO
  scheduler (`CFG.scheduler`, `maxConcurrent: 1`). Identical pending requests share one promise (coalescing);
  assistant calls use a priority lane but never cancel an in-flight request.
- TTL caches keyed by sheet id: `SystemConfig` 300 s, other tabs 45 s, overview/detection 45 s, ask **never**
  cached (each question is its own request); explicit Refresh bypasses caches (still one at a time).
- A 429/quota response opens a cooldown gate (`quotaCooldownMs: 60000`) for that family — nothing auto-retries;
  UI shows exactly “Plant data is temporarily busy. Please try again in about a minute.”
- Observability: `window.PHYTOAI_STATS` (started / byLabel / cacheHits / coalesced / peakConcurrent); debug logs
  (enabled with `?debug=1`) contain safe labels only — never tokens, headers, sheet rows or response bodies.

**Assistant chat (Part 2):** new `#/assistant` route (order Overview / Timeline / Assistant / Doctor / Photos /
Insights / Settings; mobile primary nav = Overview, Assistant, Doctor, Photos + More, which holds Timeline,
Insights, Settings). Session-only chat (labelled “This session”): user/assistant bubbles with timestamps,
pending “Thinking…” state, classified failures, retry only where safe (never for auth/busy/inactive), clear
conversation, six suggested questions, Enter sends / Shift+Enter newline, one question at a time (send + input
disabled in flight), auto-scroll, evidence + warnings preserved from the documented contract.

**Handoffs (Part 3):** Overview / Insights / Doctor ask bars are now shortcuts — they pass the typed question
plus the origin route to the chat, which sends it exactly once with
`context: { route, client_time_utc }` preserved.

**Workflow read routing + quota handling (Part 4, `7c7434d`):** `Dash Ask Read Router` (Switch, `route_key`)
routes asks to intent-scoped read groups: status/last-watering → Config+Events (2 reads); change/sensor →
Events (1); warnings → Notifications (1); detection → Scans (1); photo → Events+Scans (2); AI care → all five
(5). Detection’s unused Notifications read was removed (4→3). All dashboard Sheets reads carry
`onError: continueRegularOutput`; Compose/Derive/Build detect error items and return
`{ok:false, warnings:["sheets_rate_limited"], retry_after_seconds:60}` (overview/detection include their busy
text), so quota never surfaces as fake data and is never retried automatically.

**Validation:**

| # | Item | Evidence |
|---|---|---|
| 1 | Peak concurrency before → after | HEAD baseline probe (same stub): peak **5** (5 Sheets parallel, then 3 assistant); new build: peak **1** (fetch-level + `PHYTOAI_STATS`) |
| 2 | Initial load = 5 Sheets + 2 overview + 1 detection, no ask | probe `byLabel` snapshot |
| 3 | Double refresh: 8 executions total, 8 coalesced | probe: started +8, coalesced 8 |
| 4 | Route storm (6 routes): 0 new data requests | probe `dataStartedDelta: 0` |
| 5 | One assistant question = exactly 1 request | chip, Enter, both handoffs: `askDelta === 1`, one user bubble each |
| 6 | Handoff preserves question + origin route + time | probe: last body `question` exact, `context.route` overview/doctor, `client_time_utc` set |
| 7 | One question at a time | slow question: send+input disabled, 2 extra click attempts = 0 extra requests; timeout classified with safe retry offered |
| 8 | Busy handling | 2xx `rate_limited` → exact busy message; follow-up blocked with cooldown note and **0** requests |
| 9 | Sheets quota | 429 stub: exact busy banner, 1 config attempt, gate blocks route-change retries (0 further reads) |
| 10 | Nav + chat layout | bottom nav = Overview/Assistant/Doctor/Photos/More; tabs 7 routes; no horizontal overflow and bubbles inside the log at 320/390/768/1280/1920 |
| 11 | Zero page errors | probe `__errCount === 0` |
| 12 | Workflow read routing | MCP `test_workflow` exec **780–799**: per-intent read counts 2/1/1/2/5 exactly, one execution per read, quota (429 stub) → `sheets_rate_limited` + `retry_after_seconds:60` with no AI call, overview/detection busy shapes — **42/42 checks** |
| 13 | Live workflow | `validate_workflow` valid (224 nodes); MCP `update_workflow` applied (`autoAssignedCredentials: []`) |
| 14 | Static/lint | `node --check` app.js + config.js pass; static forbidden-term scan clean |

**Still not real:** serialization is per browser tab — it does not make the n8n workflow globally single-threaded
across devices/users (that would need queueing inside n8n); the quota gate is client-side; a real-token live
end-to-end ask against the deployed origin was not exercised in this pass (MCP pinned-token tests cover the
workflow side; live CORS/HTTP was verified earlier from the EdgeOne origin).

## 2026-09-16 - startup request storm fix, charts visibility, botanical polish (this commit)

**Symptom:** a hard refresh produced **3 n8n webhook executions** (overview, overview?ai=1, detection), each
reaching several Sheets nodes -> intermittent quota. Separately, the owner reported charts were "not visibly
available".

**Root causes (dashboard only; no workflow change needed):**
1. `loadAll()` called `loadAssistantPanels()`, which fired **all three** assistant endpoints at boot regardless of
   the active route.
2. The five persisted tabs were read as **five separate Sheets requests**.
3. Range switches rebuilt chart cards **without re-attaching the reveal observer** (`.chart-card .chart` stays
   `opacity: 0` until the `in` class is added); IntersectionObserver callbacks can also be throttled/dropped in
   embedded or background contexts. Full charts also lived only on Insights, with nothing on the home screen.

**Fix:**
- **Boot state machine** `auth_pending -> authenticated -> bootstrapping -> routing -> ready`; each transition
  once per load, exposed as `PHYTOAI_STATS.bootPhase`; `hashchange` is ignored during boot; the initial hash is
  normalized with `history.replaceState` (no event, no second loader).
- **One bootstrap request:** `values:batchGet` for SystemConfig/Events/Notifications/DiseaseScans/AgentNotes.
  A non-quota failure degrades to per-tab reads (still serialized); a 429 opens the quota state instead.
- **Route-scoped panel loading** (`ensureRouteData`, called only from the router): Overview -> `/overview`,
  Insights -> `/overview?ai=1`, Doctor -> `/detection`; Photos/Timeline/Settings/Assistant load no workflow data.
  Loaded/loading guards make revisits and route changes free (TTL caches still apply).
- **Quota state:** one banner with a live retry-after countdown ("retry available in N s"), route requests are
  suppressed while it runs, and when it ends the UI offers a manual retry (`Refresh` highlight) - nothing
  retries automatically, and a failed manual refresh does not cascade into route requests.
- **Instrumentation:** `PHYTOAI_STATS.startupRequests` (data requests counted while booting),
  `routeRequests` (per-route), `coalesced`, `activeRoute`, `bootPhase`, plus a bounded 200-entry `netLog`
  (endpoint path, route, reason label, coalesced flag, boot phase). No tokens, headers, sheet rows or response
  bodies are ever recorded or logged.
- **Charts:** Overview gains a **"Plant trend"** card (7-day, automatic metric pick with 2-point minimum,
  event markers, legend, plain-language caption, "View full history" -> Insights). Insights shows **four full
  charts** (soil moisture, gross weight, water temperature, soil temperature) with friendly per-chart empty
  states ("at least two readings... nothing is invented"), gradient area fill, glow line, last-point dot and
  markers. `renderChartsBlock` re-observes reveals after every rebuild; a 1.5 s fallback marks reveals `in` so
  content can never stay invisible when the observer is throttled.
- **Visual system:** layered deep-forest dark tokens and a warm botanical light palette (pale green surfaces,
  deep forest text, moss accents, amber/coral alerts), layered gradient body backgrounds, gradient surfaces and
  primary CTA, clearer panel/hero/action hierarchy, bottom-nav active glow, and the Settings wall-of-numbers
  moved behind a collapsed "Safety thresholds & configuration" details. Overview now shows exactly three vitals
  (soil moisture, water temp, tank).

**Validation (all executed, this commit):**
- Headless end-to-end suite (stubbed transport, one page with main + quota + test-sheet instances): **30/30
  PASS**, and **30/30 PASS** again with `--force-prefers-reduced-motion` (animations verified off). Includes:
  boot endpoint audit, one-active-request peak, theme-change zero-request check, six-route storm with exactly
  one detection / one ai-overview request, chart dimensions at 320/390/768/1280/1920, quota countdown and
  manual retry, test-sheet override, assistant chat single-request.
- `node --check` app.js/config.js pass; static smoke 8/8 over HTTP; zero console errors in every iframe.
- Personal-data-safe instrumentation verified: netLog contains only endpoint paths, labels and flags.

**Hard-refresh endpoint counts (identical stub, before = `00532a9`, after = this commit):**

| Request | Before | After |
|---|---|---|
| Sheets per-tab reads | 5 (SystemConfig, Events, Notifications, DiseaseScans, AgentNotes) | 0 |
| Sheets `values:batchGet` | 0 | 1 (5 ranges) |
| `/webhook/dashboard/overview` | 1 | 1 (active route only) |
| `/webhook/dashboard/overview?ai=1` | 1 | 0 |
| `/webhook/dashboard/detection` | 1 | 0 |
| **Total data requests** | **8** | **2** |
| Static art assets (same-origin, cached) | 2 | 2 |
| Max concurrent | 1 | 1 |

**Still not real:** the batchGet covers the five documented tabs; adding a new tab requires updating
`SHEET_TABS`. Quota state is client-side (per tab) and the countdown is presentational - the n8n workflow still
has no server-side queue.
