# Dashboard UX v2 — consumer-first rebuild (2026-09-15)

Owner feedback addressed: messy, everything visible at once, numbers feel unimportant, dev-tool look,
no life, overflowing on phones, full data dump on the home page.

**Frozen in this pass:** firmware, n8n workflow, and `docs/dashboard-data-contract-audit.md`. This rebuild
changes only **how** data is presented — never which data exists. No new fields, endpoints, history, image
URLs, health scores, or AI nodes. `ml_est` stays tagged **ESTIMATE**; measured `wt_delta_g` still reads
**“Device log only — not saved to history yet”**; dry-run and stale data remain loud.

## 1. Structure (progressive disclosure)

| Layer | Content | State on first load |
|---|---|---|
| Hero (not collapsible) | one status word (**Thriving / Looking OK / Needs attention / Critical**) + one sentence + loud flags + time-since-last-data + animated botanical art | fills the first screen (`fitHero()` sets an exact pixel height; `100dvh` is unreliable in embeds/URL bars) |
| `Today's vitals` | one plain sentence per metric + gauge/sparkline + raw value as secondary text | collapsed |
| `What happened lately` | prose timeline (“Watered 14 s yesterday evening…”), 8 newest + “Show older moments” | collapsed |
| `History` | one metric per chart (max 3, then “Show more charts”), smooth lines, gradient fill, sparse labels, hover/tap values, watering/heating/tank markers, gap badges; default range **7 d desktop / 24 h phone** | collapsed |
| `Photos` | latest photo + gallery + full-screen viewer; genuine empty state (unDraw) when nothing is persisted | collapsed |
| `Notes & alerts` | notifications with filters/answers, latest decision (saved AI output), AgentNotes (labelled unverified) | collapsed |
| `Settings & thresholds` | read-only backend values (SystemConfig + firmware constants) | collapsed |

Status mapping (presentation only, existing persisted fields — no new score math):
`critical` = tank empty **or** a pending critical notification; `attention` = any warning flag (stale data,
invalid reading, anomaly, camera quiet) **or** a pending warning; `thriving` = no flags **and** watered within
7 days **and** the newest scan verdict is not an issue; otherwise `ok`.

## 2. Icons — Iconify (Phosphor set), 12 shipped

All inlined as SVG at build time (no runtime icon requests, no tokens). Exact names:

| Iconify name | Used for |
|---|---|
| `ph:leaf` | brand mark + hero status icon + weight card |
| `ph:drop` | vitals section + tank card |
| `ph:thermometer` | soil/air temperature cards |
| `ph:sun` | light card |
| `ph:bell` | notes & alerts section + notification timeline entries |
| `ph:chart-line` | history section + last-watering card |
| `ph:warning` | warning chips (stale data, invalid sensor, anomaly) |
| `ph:sliders` | settings section + dry-run flag |
| `ph:camera` | photos section + camera-quiet flag |
| `ph:plug` | wired-only camera note (there is no battery to watch) |
| `ph:caret-down` | collapsible section chevrons (CSS mask) |
| `ph:list` | “What happened lately” section |

## 3. unDraw assets — self-hosted in `dashboard/assets/`

| File | Slot |
|---|---|
| `undraw-gardening.svg` | hero illustration (status-tinted via `currentColor`) |
| `undraw-images.svg` | empty photos state |
| `undraw-notifications.svg` | empty notifications state |
| `undraw-login.svg` | signed-out panel |

**License line:** “Illustrations from [unDraw](https://undraw.co/) — free to use without attribution; the
license only requires self-hosting (no hotlinking).” Source files: `balazser/undraw-svg-collection`
(mirror of unDraw), re-coloured to follow the active theme (`var(--primary-svg-color)` → `currentColor`).

Themes (`data-theme`, config-driven, by plant type / species hints) control palette + taglines only. They
never change safety limits, thresholds, watering or heater limits — those always render from SystemConfig.

## 4. Animation system (all gated behind `prefers-reduced-motion`)

- IntersectionObserver fade-ins on sections/cards (`.reveal` → `.in`)
- Count-up on metric values (requestAnimationFrame, animates from the previous value)
- Chart draw-in (stroke-dashoffset from the measured path length)
- Subtle leaf sway on the hero (CSS keyframes)
- `@media (prefers-reduced-motion: reduce)` removes every animation and transition, forces reveal/charts
  visible, and stops the sway — proven by the probe below.

## 5. Mobile-first overflow fix

Fluid everywhere: `clamp()` gutters, `minmax(min(100%, …), 1fr)` grids, `max-width: 100%` media,
`overflow-wrap: anywhere` on IDs/messages, no fixed pixel widths, viewer/gallery fluid, `100dvh` for the
hero height with the pixel-exact `fitHero()` fallback.

## 6. Validation evidence (2026-09-15)

1. **Layout probe — headless Chrome, five widths (320 / 390 / 768 / 1280 / 1920), signed-in shell with
   stubbed Sheets data:** zero horizontal overflow at every width (overflow-x temporarily re-enabled for
   measurement, per-element `right > clientWidth` check found no offender).
2. **First-load paint:** `main > details.card` = **6 sections, 0 open** at every width; hero bottom = 888 px
   in a 900 px viewport → hero only (+banner area) is on the first screen; collapsibles start closed.
3. **`node --check`** passes on `dashboard/app.js` and `dashboard/config.js`.
4. **Static smoke test — 8/8 HTTP 200:** `index.html`, `styles.css`, `app.js`, `config.js` and all four
   `assets/undraw-*.svg`.
5. **prefers-reduced-motion** (`--force-prefers-reduced-motion`, same probe): `reducedMotion=true`,
   hero leaf `animation-name: none`, `.reveal` opacity `1` — all animation paths off; layout unchanged.
6. **Secret scan on the staged diff:** clean — the inlined Iconify paths and unDraw SVGs contain no tokens,
   no keys, no URLs; the client ID (public) remains the only credential-shaped string, as permitted.
7. **Sheet-override regression:** `?sheet=<valid>` → “Test sheet active” banner visible; same profile
   without the parameter → banner still visible (localStorage); fresh profile with `?sheet=short` → banner
   hidden (invalid rejected). Behaviour from `b59b5fb` untouched.

## 7. What was NOT changed

`dashboard/config.js` keeps the production spreadsheet ID, the OAuth client ID, the login hint, and the
override precedence (`?sheet` > localStorage > config). No firmware, workflow, Sheets schema, or
data-contract file was touched. Known gaps stay visible in the UI itself: measured water delta is still
log-only, capture reason / per-photo light are not persisted, and the LDR remains a digital 0/1 reading.
