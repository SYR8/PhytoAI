# Workflow customization guide (n8n)

The n8n workflow is PhytoAI's integration hub. This guide explains how to navigate it and how to
replace individual services **without rewriting the system** — while keeping the contracts that the
firmware, the dashboard, and the documentation rely on.

## Two workflow files, one system

| File | What it is |
|---|---|
| `workflows/phytoai.json` | The proven production export (224 nodes). Use this to import and run PhytoAI. |
| `workflows/phytoai.annotated.json` | The **same workflow** plus 11 navigation sticky notes (annotation only — no node, connection, parameter, trigger, or credential changes). Use this for reading and learning. |

Both validate as n8n workflows. The annotated copy is not a different behaviour — it is the original
with notes placed next to the relevant areas.

## Navigating the workflow

The workflow already contains six large branch banners: **Branch A** (core daily logic), **Branch B**
(daily photo), **Branch C** (weekly scan + scan panel), **Branch E** (scheduler + `GET /config`), and
the **One-Time Setup**. The annotated copy adds these navigation notes:

| Note | Meaning |
|---|---|
| `NAV — Core Sensor Webhook` | ENTRY: device sensor or camera payload arrives here. |
| `NAV — Normalize Decision Output` | NORMALIZE: hardware input becomes the stable internal format. |
| `NAV — Safety Guardrails` | SAFETY / VALIDATION: malformed or unsafe values are checked before actuation. |
| `NAV — Append Event Row` | STORAGE: Sheets rows are written here. Swap the database here. |
| `NAV — Upload Daily Photo` | IMAGE STORAGE: images go to Drive here. Swap the file store here. |
| `NAV — YOLO Analyst` | VISION SPECIALIST: the YOLO/image-analysis branch. |
| `NAV — Plant Assistant` | AI ASSISTANT: interprets, summarizes, answers observations. |
| `NAV — Append Tank Alert` | NOTIFICATIONS: notification records are created here. Swap the channel here. |
| `NAV — Dash Overview Read Config` | DASHBOARD SOURCE: the dashboard reads this storage path. |
| `NAV — Read SystemConfig` | OWNER CONFIG: spreadsheet, folder, and service references are read here. |
| `NAV — Dash Ask Webhook` | DO NOT RENAME: nodes or credentials referenced by documentation. |

## What you can realistically swap

| Responsibility | Where to look in the workflow | Swap options | Keep in mind |
|---|---|---|---|
| Event/data storage | Google Sheets append/read nodes (`Append Event Row`, `Read SystemConfig`, `Append DiseaseScans Row`, …) | PostgreSQL, MySQL, Supabase, Airtable, CSV, another n8n database node | Keep the row field names the workflow and dashboard expect (see `docs/Plan.md` §2). |
| Image storage | Drive upload nodes (`Upload Daily Photo`, scan upload) | S3-compatible, Dropbox, Nextcloud, local filesystem | The dashboard reads images through the Drive API today; a different store needs a matching dashboard connector or link format. |
| Notifications | `Append * Notification/Alert` nodes + dashboard webhooks | Telegram, Discord, email, Matrix, Slack, Web Push | The dashboard notification center reads the `Notifications` tab; extra channels can run **in addition**. |
| Vision analysis | `YOLO Analyst` HTTP node (`yolo-service`, `/predict`) | Another local model, cloud vision API, OpenAI-compatible endpoint | Preserve the response contract: `status`, `label`, `label_simple`, `confidence`, `top3`. `notyettrained`/`unavailable` must stay graceful. |
| Assistant response | Agent nodes (`Plant Assistant`, `History Analyst`, `Decision Agent`, …) with the LLM sub-node | Another LLM provider or local model | Keep strict-JSON parsing and the documented response fields. |
| Dashboard source | `Dash *` read nodes and endpoints | Another connector | Preserve the normalized response format documented in `docs/dashboard-ux-v3.md`. |
| Automation engine | n8n itself | Keep n8n and replace individual nodes | n8n remains the hub; replace pieces, not the orchestration. |

**Important:** these are **customization paths, not already-tested alternatives**. The default
implementation is the verified path; anything you swap is your own experiment. You must create your
own credentials for any replacement service.

## Contracts you must not break

1. **Webhook paths** (`/webhook/core/sensor`, `/webhook/core/photo`, `/webhook/yolo-scan`,
   `/webhook/yolo-scan/done`, `/webhook/config`, `/webhook/dashboard/*`) — firmware and the dashboard
   address them by path.
2. **Response fields** the firmware executes (decision JSON) — renaming fields silently disables
   actuation or safety checks.
3. **Sheet field names** — the dashboard and the workflow both read columns by header name.
4. **Node names referenced by documentation** — guides, resume URLs, and dashboard contracts point at
   them; the `NAV — Dash Ask Webhook` note marks the most sensitive cluster.
5. **Credentials by name** — the export references credentials only by name; keep those names or
   re-select credentials after importing.

## Import and verify

1. In n8n: **Workflows → Import from File** → choose `phytoai.json` (production) or
   `phytoai.annotated.json` (with notes).
2. Create the credentials in the n8n UI (Google Sheets OAuth2, Google Drive OAuth2, OpenRouter,
   optional Perenual Query-Auth with parameter `key`).
3. Set your spreadsheet and folder IDs in `SystemConfig`.
4. Keep `dry_run_mode = TRUE` until the bench checks pass (`docs/hw-bench-2026-09-15.md`).
5. Run the workflow with test payloads first; the dashboard test-sheet mode (`?sheet=`) is ideal for
   a safe end-to-end check.

## Safety rules (unchanged by customization)

- The deterministic **Safety Guardrails** code path must stay between AI output and actuation. Never
  let a replacement node bypass it.
- Firmware hard limits (40.0 °C cutoff, 39.5 °C refuse, 120 s actuator cap, 8 s watchdog) apply
  regardless of workflow changes.
- Do not enable real actuation before the bench and dry-run checks pass.

## Privacy

Workflow exports contain **no credential values** — only names and node settings. Before sharing any
modified export, scan it:

```powershell
Select-String -Path workflows\phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'
```

Never put real spreadsheet IDs, webhook hosts, tokens, or personal data into a shared export.
