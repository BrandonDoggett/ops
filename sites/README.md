# Site configs — the contract

This directory holds **only an example**. Real site configs live in the
repository of the property they describe, normally at `ops/sites/<name>.json`
([ADR-0001](../docs/adr/0001-site-config-is-the-contract.md)) — a config declares
that property's endpoints, budget and ceilings, so it changes when the property
changes and is often pinned by that property's own tests.

The runner knows nothing about any particular site. **Adding a site is adding a
file**, which is what makes one runner cover every property under the LLC.

## Schema

| Field | Meaning |
|---|---|
| `name` | Short id, used in metrics labels and alerts |
| `baseUrl` | Origin every check path resolves against |
| `budgetUsdPerMonth` | What the property is funded with (reported, not enforced here) |
| `alerts.snsTopicName` / `alerts.region` | Where failures are published by `--alert` |
| `headers` | Sent on every request (e.g. a synthetic-traffic marker) |
| `quota` | Read by `ops-status` and `ops-switch`; omit for a site with no metered spend |
| `checks[]` | The probes |

### `quota`

| Field | Meaning |
|---|---|
| `table`, `region`, `profile` | Where the live counters and the kill switch live |
| `dailyCeiling`, `monthlyCeiling` | Ceilings to report usage against |
| `composeCostUsd` | Marginal cost of one metered unit, for the spend figure |
| `aiMonthlyUsd` | The slice of the budget those units draw from |

### Check fields

| Field | Meaning |
|---|---|
| `id` | Stable name — it becomes a metric label, so do not rename it casually |
| `path`, `method`, `headers` | The request |
| `body` (object) / `bodyText` / `bodyRepeat: {text,count}` | Request body; `bodyRepeat` builds a large body for size-cap probes without a huge literal |
| `spendsMoney` | Skipped by `--no-paid`; use for probes that cost real money |
| `severity` | `critical` (default) fails the run, `warning` reports only |
| `expect` | `status`, `statusIn[]`, `bodyIncludes`, `headersPresent[]`, `maxLatencyMs` |

## Writing a good one

The useful pattern, in order:

1. **One check that the site loads** — status, a string only your site serves, and
   the security headers you claim to send.
2. **One check per critical API path** — the ones an outage would actually hurt.
3. **One negative check per protection worth proving.** This is the part people
   skip and the part that matters: assert that screening returns 422 and that an
   oversized body returns 413. That is the difference between "the guards are in
   the repository" and "the guards are in force".

Files ending `.example.json` are ignored by the runner, so this directory's
example never gets probed.
