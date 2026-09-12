# PhytoAI — Changes 10–11 (camera scheduling + placement/care review)

Both changes extend the camera/photo behavior and land in the **Phase-5 workflow change list** (doc-only until then). Branch C and Branch B respectively; no live workflow edits now.

---

## Change 10 — Scheduled camera captures, no permission gates

### Context

The weekly scan currently gates on a human: a pending "position camera" Notifications row with a resume URL, a Wait node (60 min), and a postponed-on-timeout path. Owner decision: the camera never asks permission. The owner's standing responsibility is to keep the CAM docked facing the plant; the system announces captures ahead of time and simply takes them.

The daily photo loop already works this way (CAM wakes on schedule and POSTs `/core/photo` autonomously). This change makes the weekly scan follow the same model.

### 10.1 Weekly scan scheduler path (replaces the HITL gate)

**Timing (canonical):** the weekly capture is **Mon 06:00 UTC**. A single schedule trigger fires **Mon 05:30 UTC (T−30)** for the announcement + session open; `next_scan_utc` = trigger + 30 min, computed and exposed via `GET /config`; the CAM wakes at `next_scan_utc`.

At the **T−30** trigger (Weekly Scan schedule trigger):

1. Read SystemConfig (`camera_battery_percent`, `scan_session_active`).
2. Battery below `camera_battery_min_percent` → informational notification `charge camera` (type `alert_battery_low`), log "scan postponed", end. (Unchanged.)
3. Otherwise: **if `scan_session_active` is already `true`, the previous session never closed — log `stale scan session reset` (log line only, no notification) and continue.** `flag=true` at trigger time is stale by definition because the cron fires weekly and the close path clears the flag. Then set `scan_session_active=true` and append an **informational** Notifications row — new type `scan_scheduled`: *"Weekly scan photo will be taken at {time} — make sure the camera is docked facing the plant."* **No `response_options`, no `resume_url`, no Wait node.** The row is created with `status=done` (nothing to answer); it is an announcement, not a question. The close path is unchanged.
4. The paused-execution machinery for positioning is **removed**: `Wait Camera Positioned`, its timeout/expire branch, and the `scan_position` interactive row type are deleted. The `scan_postponed` type stays (battery path).

### 10.2 Scheduled capture (firmware)

- `GET /config` gains `next_scan_utc` (computed from the weekly-scan schedule).
- The CAM wakes at `next_scan_utc`, captures, and POSTs `/yolo-scan` as today. The photo path's `scan_session_active` gate is unchanged — the flag is now set at T−30 by the scheduler instead of by a human confirmation.
- The manual capture button stays for ad-hoc close-ups; uploads outside a session keep getting `{"status":"no_active_session"}` (daily `/core/photo` is unaffected).

### 10.3 Quality safety net (replaces the human positioning step)

The Vision Analyst's `framing_quality` assessment becomes the check the human used to provide: if framing is poor, append an informational notification (type **`scan_quality`** — approved, `status=done`, no buttons) *"scan photo quality was poor — check the camera is docked facing the plant."* The scan still completes and is logged either way.

### 10.4 Cleanup

- Remove the standard "return camera to charging dock" post-scan notification — the owner is never asked to move the camera anymore; docking is the standing default.
- Open question Q3 (long-Wait execution timeouts) narrows to the verdict/follow-up Waits (7 days), which remain genuinely interactive and unchanged.
- Plan §3.3 scheduler path, §8 Q3, and the Notifications type list get updated; **README is also affected** — Branch C steps 2/3/8 and the council agent list still describe the permission gate and must be updated in the Phase-6 docs sync (tracked in `phytoai-firmware-changes-7-8-9.md` §10).

### 10.5 What does not change

- Verdict and follow-up HITLs (`scan_verdict`, `scan_followup`) stay interactive with Wait nodes — those need human judgment, not human presence.
- Battery check and postpone path.
- The panel itself (Vision Analyst, YOLO stub, Judge, Treatment Advisor), the DiseaseScans schema, and all safety layers.
- Daily photo loop (already permissionless).

---

## Change 11 — Placement & daily care review (thinker + judge in the daily photo loop)

### Context

The daily Photo Analysis Agent currently covers species refinement, visual anomalies, and watering review only. Owner requirement: the system must also judge **whether the plant's placement needs changing** — e.g. sustained high temperature plus direct sun exposure means "move it away from the window" — and more generally reason about what the plant needs, beyond any template. Reliability requirement: dangerous conditions must not be missed.

Design rule preserved: **no fixed numeric thresholds in code** (spec-wide rule). The code layer computes stress *signals as facts*; the AI reasons about them per species and season. All advice text is AI-generated from evidence — never template strings.

### 11.1 Photo Analysis Agent — extended to thinker role (Branch B)

New output fields alongside the existing ones:

- `placement_ok` (bool)
- `placement_recommendation` (string|null) — concrete, physical: e.g. "move ~1 m away from the south window", "rotate 90° for even growth"
- `placement_urgency` ("none" | "soon" | "urgent")
- `care_needs` (array of strings) — anything else the plant appears to need (dusty leaves, pot size, support, etc.)

Prompt rules: reason from species needs (best-known guess + confidence), the photo itself (sun patches, leaf orientation, scorch marks), the light level, air/soil temperature, humidity, and recent trends. Be conservative; state low confidence explicitly; never invent requirements.

### 11.2 Build Multimodal Context — stress-signal fact block (code, no AI)

Computes and attaches, as plain facts for the thinker: sustained high air temperature pattern, direct-sun light signature (sustained maxed LDR around solar noon), soil temperature vs. species comfort, humidity extremes, rapid moisture drop. These are *inputs*, not decisions — no threshold in code triggers any action by itself.

### 11.3 NEW "Placement Reviewer" — judge role (conditional)

Runs **only** when the thinker flags something (`placement_ok=false` OR `placement_urgency≠none` OR non-trivial `care_needs`). Receives the thinker's output + full plant context + its own AgentNotes; cross-checks independently; outputs:

- `placement_change_recommended` (bool), `urgency`, `recommendation`, `reasoning` — with explicit disagreement allowed ("thinker over-read a temporary heat spike").

Conditional execution keeps cost near zero on normal days — **the IF gates the entire chain** (AgentNotes reader → agent → parser → notes writer → advice append), so nothing executes on clean days. Same shared LM node + own structured parser (**`Placement Parser`**, name confirmed). This is agent #7 in the shared-LM wiring.

### 11.4 Output path — advisory, never a command

- Confirmed placement need → Notifications row, new type `placement_advice`, **informational** (`status=done`, no buttons): title + recommendation + urgency. `urgent` marks the row urgent (future push).
- Logged in the event's `ai_notes` — **merge point: extend `Build Photo Update Row` (approved)**; both agents may append AgentNotes (UNVERIFIED HYPOTHESES labeling applies).
- The system advises; the owner moves the plant. No actuation, no Wait gate.

### 11.5 Guardrails

- Advisory only — no physical claims, no automatic action.
- Species unknown → generic conservative guidance + explicit low-confidence statement.
- Extreme readings still pass through the sensor sanity flags first (impossible values are flagged as sensor faults, not plant emergencies).

### 11.6 Phase-5 workflow additions

- Photo Analysis Agent: prompt + parser schema gain the four new fields.
- Build Multimodal Context: stress-signal fact block.
- IF node + Placement Reviewer agent + `Placement Parser` (`outputParserStructured`), conditional on thinker flags — **the IF gates the entire chain** (reader → agent → parser → notes writer → advice append).
- Notifications type list gains `placement_advice` (and `scan_quality` from Change 10).
- Plan §3.2/§5.6 updated; README council description gains one line about placement advice.

### 11.7 What does not change

Daily capture stays permissionless (Change 10). Watering, heating, scan panel, schemas (no new columns — `ai_notes` + Notifications carry it), all safety layers.
