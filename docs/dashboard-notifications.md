# Dashboard notifications — audit and implementation (2026-09-16)

Scope: how planned n8n notifications reach the dashboard today, what the browser can
and cannot do, and the explicit browser-alert stage implemented in the dashboard.
No firmware, workflow, schema, OAuth or secret changes were made.

Evidence sources: `dashboard/app.js`, `dashboard/index.html`, `dashboard/config.js`,
`dashboard/styles.css`, `workflows/phytoai.json` (224 nodes, live-identical),
`docs/dashboard-data-contract-audit.md`, `docs/dashboard-ux-v3.md`, `STATUS.md`,
plus a headless end-to-end probe suite (`UX7`, 17/17) and a regression pass of the
previous suite (`UX6`, 30/30).

## 1. Which n8n nodes create notification rows

Rows in the `Notifications` tab are appended only by these workflow nodes (all
`googleSheets` / `append` with the Google Sheets Zaki credential):

| Writer node | Type written | Trigger flow (root) |
|---|---|---|
| `Append Tank Alert` | `alert_tank_empty` (status `pending`) | `Core Sensor Webhook` (`POST /core/sensor`) → decision agent → guardrails → tank-empty override |
| `Append Anomaly Alert` | `alert_anomaly` (`pending`) | `Daily Photo Webhook` (`POST /core/photo`) → photo analysis agent → `Anomaly Detected?` |
| `Append Watering Feedback` | `watering_feedback` (`pending`, resume URL) | same sensor-decision flow (`Was a Watering Decision Made?`) |
| `Append Verdict Notification` | `scan_verdict` (`pending`, resume URL) | `Scan Sweep Done` (`POST /yolo-scan/done`) → judge → HITL |
| `Append Followup Notification` | `scan_followup` (`pending`, resume URL) | after a verdict response |
| `Append Scan Scheduled` | `scan_scheduled` (status `done`) | `Weekly Scan` schedule trigger |
| `Append Scan Postponed` | `scan_postponed` (`pending`) | scan preconditions / camera paths |
| `Append Charge Camera` | `alert_battery_low` (`pending`) | legacy camera-battery path (camera is wired-only now) |
| `Append Smoke Test` | `smoke_test` (`pending`) | manual notifications smoke-test flow |
| `Append Session Timeout Notification` | `scan_postponed` (`done`) | `Scan Session Watchdog` schedule trigger |

Update/expire writers (no new rows): `Update Verdict Notification`,
`Expire Verdict Notification`, `Update Followup Notification`,
`Expire Followup Notification` (`appendOrUpdate`, keyed on `resume_url`).

**No other channel exists**: the workflow contains zero Telegram/Slack/Discord/email/
SMS/web-push nodes (verified by a node-type scan over the live-identical export).

## 2. Persisted fields (Notifications tab)

Header row (seed pack + all writers):

`timestamp, type, title, message, response_options, status, response, resume_url, context_ref`

- `timestamp` — ISO string, `$now.toISO()` at write time.
- `type` — one of the types above (drives dashboard severity/source labels).
- `title`, `message` — human text; tank/anomaly messages carry a `[DRY RUN]` prefix
  when dry-run mode is on.
- `response_options` — JSON array of button labels (e.g. `["Confirmed","Wrong"]`).
- `status` — workflow lifecycle: `pending` → answered/`done` or `expired`. Written by
  the workflow; the dashboard only writes `status`/`response` when the user answers.
- `response` — the user's answer text (dashboard writes it back).
- `resume_url` — `$execution.resumeUrl` for rows that wait on the user.
- `context_ref` — event id / scan timestamp reference when available.

There is **no read/unread field**: "read" is not persisted anywhere, so the dashboard
deliberately does not invent an unread state.

## 3. Which dashboard route reads and displays rows

- **Read path:** the boot `values:batchGet` bootstrap reads `Notifications!A1:I`
  (one of the five tabs) and the poll reads the same range; rows are normalised in
  `normalizeNotification()` (severity from `SEVERITY_BY_TYPE`, options parsed from
  `response_options`).
- **Timeline route (`#/timeline`)** is the notification centre: severity filter,
  status filter (All / Waiting on you / Answered / Expired), "waiting on you" badge,
  answer buttons + optional comment (writes `Notifications!F:G` and pings the resume
  URL), raw-row debug details.
- **Overview** uses rows for the "Latest alert" mini card, critical pending flags and
  the load-time toast (session-scoped "seen" timestamp).
- **Doctor/Insights** show scan context but not the notification centre.

## 4. Notification.requestPermission() before this change

**Not invoked anywhere.** A repo-wide scan of `dashboard/*.js|html|css` found zero
occurrences of `requestPermission`, `Notification`, service workers or push code.

## 5. Service worker

**None.** There is no `sw.js`, no `navigator.serviceWorker` registration, and no
build step that could produce one.

## 6. Web Push subscriptions

**None.** No `PushManager`, no subscription rows; the planned `PushSubscriptions`
tab (Plan.md §2.4) does not exist in any sheet fixture, the seed pack, or the
workflow. SystemConfig has an empty `push_vapid_public_key` row documented as
"Web Push not built".

## 7. Can notifications arrive while the site is closed?

**No.** Today every path requires an open, signed-in tab: rows are read from Sheets
by the dashboard itself (boot batchGet / poll) or answered interactively. With the
site closed, nothing executes in the browser, and n8n writes rows silently to the
sheet. There is no push sender and no service worker, so no system notification can
reach the device while the site is closed.

## 8. Existing Telegram / email / other channels

**None.** Telegram was explicitly removed in `docs/Plan.md` ("the dashboard is the
only user interface"); the workflow export contains no messaging or mail nodes. The
only "channels" today are: the sheet row (system of record), the in-app centre, the
overview flags/toasts, and — after this change — optional in-page browser alerts.

## 9. Gaps between "row written to Sheets" and "browser notification delivered"

1. **No automatic transport:** the browser must be open, authenticated and polling
   (or loading) to learn about the row — there is no server→browser path.
2. **Permission:** browsers require user-granted permission per origin; it is never
   requested implicitly (correctly so), and can be denied/unsupported.
3. **Closed site:** impossible without Web Push (service worker + VAPID + a sender
   in n8n) — see the staged plan below.
4. **`alert_battery_low` is legacy:** the wired-only camera no longer reports a
   battery; the type is displayed but excluded from system alerts.
5. **No read state:** the sheet only tracks workflow status; the dashboard shows
   that honestly instead of a fabricated unread counter.
6. **Resume URLs** only work while the named tunnel URL is valid (M1 open item);
   alerts about pending rows do not depend on this.

## Implemented now (this commit): explicit, opt-in in-page alerts

### A. In-app notification centre (retained, clarified)

- Unchanged mechanics; no invented read/unread state — the context line now states
  that pending/done/expired comes from the workflow and the app keeps no separate
  read state.
- Each card shows **severity chip** (Critical / Warning / Info / Legacy — derived
  from the type map that already existed), **time**, **source** (flow label derived
  from the type, e.g. "Tank safety check"), **plant context** (configured plant name
  + species from SystemConfig), and the raw-row debug details.
- The empty state is unchanged (unDraw art + "Nothing needs you right now") and now
  points at the Settings switch for system alerts.

### B. Browser alerts while the page is open (Settings → "Enable browser alerts")

- `Notification.requestPermission()` runs **only** from the button click — never on
  load, never on route changes, never on refresh.
- States rendered explicitly: **unsupported**, **not requested**, **granted**
  (allowed, not enabled here yet / on), **denied** (button disabled with
  instructions). The opt-in is remembered in `localStorage`
  (`phytoai_browser_alerts`), separate from browser permission.
- When active, a system notification is raised only for **newly observed** rows that
  are `status = pending`, `severity = critical`, or `warning` **and** explicitly
  selected (`notifications.alertWarningTypes: alert_anomaly, scan_verdict`), and no
  older than `alertFreshHours: 24`. Everything else stays in-app.
- Duplicate control: a stable key (`context_ref | timestamp | type | title`) is
  stored in a bounded `localStorage` list (`phytoai_notified_keys`, 200 entries) and
  also used as the browser `tag`, so a row alerts **at most once**, including across
  reloads and repeated refreshes.
- Clicking the alert focuses the tab and routes to the relevant screen
  (scan verdict/follow-up → `#/doctor`, otherwise `#/timeline`).
- Denied/unsupported permission leaves the in-app centre fully functional.
- Browser permission is **not** treated as backend authorization: every row is still
  fetched with the user's Google token; the permission only controls display.

### C. Notification polling

- One serialized `Notifications!A1:I` read per `notifications.pollMs: 60000`, only
  after boot, only while `document.visibilityState === 'visible'`, only when no
  quota countdown is running, never on route changes (route loaders do not touch
  notifications).
- On becoming visible again, one catch-up poll runs if the interval elapsed.
- Quota impact: ≤ 1 Sheets read/minute (~60/hour) — under 2 % of the documented
  60-reads/minute per-user budget, and it shares the single-request scheduler with
  everything else. New critical rows update the badge and (only when the user is not
  typing in the centre) the timeline list.

### D. Closed-site notifications (deferred, not implemented)

Nothing here pretends a closed site can receive alerts. Web Push is a separate
future phase and was deliberately **not** started (no service worker, no VAPID, no
subscription storage).

## Validation (executed)

`UX7` headless suite — 17/17 PASS (stubbed transport, three app instances):

| # | Check | Result |
|---|---|---|
| 1 | No permission request and no system notification at boot | 0 / 0 |
| 2 | Startup still exactly 2 data requests, peak concurrency 1 | pass |
| 3 | Default Settings state "not requested", button enabled | pass |
| 4 | One click → exactly 1 `requestPermission()`; state "on"; flag stored | pass |
| 5 | New critical row → exactly one system notification with dedupe tag | pass |
| 6 | Repeat refresh → no repeat | pass |
| 7 | Centre shows severity + source + plant context; no assistant ask from route storm | pass |
| 8 | Route storm adds no unexpected requests | pass |
| 9 | Reload: dedupe survives, zero fresh deliveries, opt-in persists | pass |
| 10 | Visible: ~2 polls in 130 s, serialized peak 1 | pass |
| 11 | Hidden: zero polls | pass |
| 12 | Visible again: exactly one catch-up poll | pass |
| 13 | Theme cycling: zero requests | pass |
| 14 | Assistant chat still one-request | pass |
| 15 | Denied: state denied, button disabled, no request/delivery, centre still shows rows | pass |
| 16 | Unsupported: explicit state, button disabled, centre still shows rows | pass |
| 17 | Zero console errors in all instances | pass |

Regression: `UX6` suite re-run against this build — **30/30 PASS** (startup counts,
route scoping, quota flow, charts at 5 widths, `?sheet=` override, reduced-motion
type checks). `node --check` passes; static smoke 8/8; no secrets staged.

## Closed-site Web Push — full plan for a future phase (design only)

To be clear: none of this exists yet. When it is proposed, implement it in this
order and stop at the review gate below.

**Architecture**
1. **Storage:** new `PushSubscriptions` sheet (per Plan §2.4) with
   `created_at, endpoint, p256dh, auth, user_agent, active, last_ok_utc` and a
   `user_id`/device label; dashboard writes subscriptions with the user's Google
   token; n8n reads them when sending.
2. **Dashboard:** register `sw.js` (scope `/`) handling `push` and
   `notificationclick`; subscribe via `PushManager.subscribe({ applicationServerKey:
   VAPID public })` **only from the same Settings control**; store the subscription
   in `PushSubscriptions`; support unsubscribe and expiry pruning (410/404).
3. **n8n sender:** new workflow branch (or sub-workflow) that maps notification
   rows → push payload and sends via VAPID. Options: a `web-push` npm dependency in
   a Code node (not available by default in n8n Cloud — verify first), an external
   small relay (Node `web-push` service on the VPS, called by n8n over HTTPS), or
   n8n's own push support if the instance has it. The relay option matches the
   existing VPS pattern and keeps secrets off the workflow.
4. **Keys & secrets:** VAPID keypair generated offline; only the **public** key goes
   to `SystemConfig.push_vapid_public_key` (client-visible by design); the private
   key lives only in n8n credentials or the relay environment. Never in the repo,
   never in chat.

**Security**
- Same audience/expiry Google-token verification as the dashboard webhooks; the
  sender reads subscriptions only from the sheet (no open subscription endpoint).
- Payloads contain only `title`, short `body`, `tag`, and a route hint — never
  tokens, sheet URLs, plant photos, or private notes.
- Rate-limit and dedupe at the sender (one push per row key), honouring the same
  critical + selected-warning allowlist as the in-page stage.
- 410/404 responses disable that subscription row; re-subscription is explicit.

**Review gate:** before any service-worker/VAPID code lands, the owner confirms:
sender choice (relay vs Code-node dependency), the `PushSubscriptions` schema, and
the fact that closed-site push is not testable without a real device.
