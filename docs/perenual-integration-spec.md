# Perenual Integration Spec — Secondary Plant Knowledge Layer

Status: APPROVED for implementation (owner request, 2026-09-14)
Scope: n8n workflow `phytoai` only. No firmware changes. No Sheets header changes.

## 1. Purpose and role in the council

Perenual is a **secondary knowledge source**, never a decision-maker. It gives
the AI council species-level reference data (watering needs, sunlight, pests,
care difficulty) as a *prior*. The live sensor history, AgentNotes, and the
Decision Agent's own citation-of-history reasoning remain authoritative.

Hierarchy of evidence (strict order):

1. This plant's own measured history (Events, watering effects, user feedback)
2. AgentNotes accumulated from this plant
3. Perenual species reference (generic, this-environment-unverified)
4. Model's general training knowledge (lowest)

Perenual data is advisory context injected into prompts. It may NOT:

- trigger or block watering directly (guardrails stay untouched),
- override `dry_run_mode` or any Safety Guardrail,
- change species identity on its own (species logic stays most-confident-wins),
- be called when its result would change nothing (cache hit + same species).

## 2. Free-tier reality (design constraint #1)

- Free plan ≈ **100 requests/day**, shared across all endpoints.
- Owner has NO paid plan → some plants will return nothing, some
  endpoints are Supreme-only. The system must degrade silently.
- `species-care-guide-list` and `hardiness-map` are **Supreme (paid)** —
  DO NOT wire these. Phase 1 uses only the free endpoints.
- Consequence: **cache aggressively.** Once a species is identified, we
  fetch it ONCE and cache the parsed result in SystemConfig. Repeated
  calls for the same plant are forbidden — that is wasting quota for
  zero new information.

## 3. Endpoints (Phase 1 = free only)

Base URL: `https://perenual.com/api`  (auth via `?key=...` query param)

| Use | Endpoint | Notes |
|---|---|---|
| Species search | `GET /api/v2/species-list?key=KEY&q=monstera` | Returns data[]; take best name/scientific match, capture `id` |
| Species detail | `GET /api/v2/species/details/{id}?key=KEY` | watering, watering_general_benchmark, sunlight[], soil[], pest_susceptibility[], care_level, maintenance, growth_rate, poisonous_to_pets, drought_tolerant, indoor |
| Pest/disease ref | `GET /api/pest-disease-list?key=KEY&q=...` | Free, ~239 entries; useful for Judge/Treatment Advisor cross-ref |

Deliberately excluded (Supreme-only, would 4xx on this key):
`species-care-guide-list`, `hardiness-map`, all `xWatering*` detail fields,
`xSunlightDuration`.

## 4. Where it plugs into the workflow

### 4.1 Lazy species enrichment (new mini-branch, owner of the cache)

Trigger points (either):
a) Branch B, after Photo Analysis Agent updates `last_species_guess` to a
   NEW species (species changed or was `unknown`), OR how the owner prefers:
b) Branch A, inside `Build Context`'s context assembly — only when species
   is set AND no valid cache exists.

Node chain:

```
IF Species Changed / Cache Missing
  → HTTP: Perenual Species Search     (q = last_species_guess, timeout 8 s)
  → Code: Pick Best Match             (exact scientific > exact common > first hit; none → cache "not_found")
  → HTTP: Perenual Species Detail     (id from search, timeout 8 s)
  → Code: Compact Perenual Cache      (see §5 shape)
  → Sheets: Upsert SystemConfig       (perenual_* keys)
```

Both HTTP nodes: `Continue on fail` ON. Any failure, 4xx, or empty `data[]`
→ cache marked `lookup_failed_<reason>`, council proceeds without Perenual.

### 4.2 Consumers (prompt injection only, no new agent nodes)

- **Decision Agent (Branch A)** — `Compose Decision Prompt` appends a
  `PERENUAL REFERENCE (unverified library data)` section when cache is valid:
  watering benchmark days, watering level, sunlight, drought_tolerant,
  care_level, pest_susceptibility. Prompt addition, one paragraph:
  "This is generic library data for this species — a prior, not ground truth.
  This plant's own history outranks it. Use it mainly when history is thin."
- **Judge / Treatment Advisor (Branch C)** — when Judge verdict = issue,
  Treatment Advisor ALSO gets `pest_susceptibility` + (optional, on-demand)
  one `pest-disease-list&q=<suspected issue>` lookup for solution text.
  On-demand only, never every scan — quota.
- **Dashboard (later, no workflow change)** — SystemConfig cache is already
  readable; a "plant card" can show common name, watering benchmark, image.

## 5. Cache schema (SystemConfig keys, Values are typed strings)

| Key | Value | Written by |
|---|---|---|
| `perenual_species_id` | integer or empty | enrichment branch |
| `perenual_cached_species` | species name the cache belongs to | enrichment branch |
| `perenual_cached_utc` | ISO-8601 of last successful fetch | enrichment branch |
| `perenual_status` | `ok` / `not_found` / `lookup_failed_...` / empty | enrichment branch |
| `perenual_water_benchmark` | e.g. `5-7 days` or empty | enrichment branch |
| `perenual_care_json` | compact JSON: watering, sunlight[], soil[], pests[], care_level, drought_tolerant, indoor | enrichment branch |

Invalidation rule (in `Build Context`): cache is valid iff
`perenual_cached_species` equals current `last_species_guess` AND
`perenual_status == ok`. Species switch or `unknown` species →
cache ignored, enrichment re-runs once.

These are KEY additions to SystemConfig (upsert rows), NOT header/schema
changes — same mechanism as `scan_session_opened_utc`.

## 6. Quota budget (documented, not enforced by code beyond caching)

- species search:  1 request per species change
- species detail:  1 request per species change
- pest lookup:     ≤1 request per *issue* scan, only when Judge says issue
- realistic ceiling: <10 requests/month for one pot — nowhere near 100/day,
  and same-species caching keeps multi-year usage safe.

## 7. Failure semantics (must match existing patterns)

- All 4xx/5xx/timeout → `Continue on fail`, cache status updated, council
  runs as if Perenual never existed. NO workflow error, NO alert spam.
- `429` specifically → set `perenual_status=quota_exhausted`, suppress
  enrichment until UTC midnight + jitter; log one AgentNotes line.
- Plant not in DB (`data: []`) → `perenual_status=not_found` for that name;
  retry only on species-name change, never on schedule.
- No Perenual value may enter Safety Guardrails' inputs. Guard rails read
  only sensor data + SystemConfig guardrail keys.

## 8. Secrets handling

- API key lives in n8n as a credential pre-auth/query value or via a
  Header/Query Auth credential named `PhytoAI Perenual`.
- NEVER hardcode the key in workflow JSON, Code nodes, docs, git, or
  dashboard. Exported workflow JSON must not contain it before push —
  add to README Known-issues checklist ("scan workflow export for
  perenual key before commit").
- Owner note: the active key was shared in plaintext chat 2026-09-14.
  Recommend regenerating it on perenual.com once integration is verified,
  then setting the new one in the n8n credential only.

## 9. Verification checklist

1. Mock species `Monstera deliciosa`: enrichment writes all 7 keys,
   `perenual_status=ok`, Decision prompt contains PERENUAL REFERENCE block.
2. Species set to nonsense (`zzzzplant`): `perenual_status=not_found`,
   zero downstream impact, no error path triggered.
3. Key removed/invalid: workflow continues, guardrails identical,
   `perenual_status=lookup_failed_4xx`.
4. Same species three days in a row: exactly ZERO new Perenual calls
   (cache hit) — verify via n8n execution log.
5. Species switches away and back: re-fetch happens once per switch.
6. Branch C with Judge=issue: pest lookup fires at most once.
7. Full execution with Perenual disabled: results schema-identical to
   pre-integration runs (regression check).
8. STATUS.md updated: integration state + what was simulated vs real.
