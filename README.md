# ops — monitoring, status, and the kill switch

A dependency-free operations toolkit shared by the Eldoggo properties. It knows
nothing about any of them: **a site is a JSON file**, and that file lives in the
property's own repository ([ADR-0001](docs/adr/0001-site-config-is-the-contract.md)).

Extracted from Cardjoon on 2026-09-09, when a second property needed the same
checks — see [cardjoon ADR-0015](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0015-ops-toolkit-own-repository.md)
for why, and [ADR-0012](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0012-operations-metrics-and-control.md)
for the monitoring contract it implements.

| Consumers |
|---|
| [cardjoon](https://github.com/BrandonDoggett/cardjoon) · [botjoon](https://github.com/BrandonDoggett/botjoon) |

## Install

```bash
npm i -D github:BrandonDoggett/ops
```

Then, from the property's repository root:

```jsonc
// package.json
"scripts": {
  "smoke":      "ops-smoke",
  "smoke:free": "ops-smoke --no-paid",
  "ops:status": "ops-status",
  "ops:switch": "ops-switch"
}
```

Every command reads `./ops/sites/*.json` by default, so nothing needs a flag.

The AWS SDK is an **optional peer dependency**, needed only by `ops-status` and
`ops-switch`. Install it where you use them:

```bash
npm i -D @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Daily smoke checks

```bash
ops-smoke                                  # every site config, including probes that spend money
ops-smoke --no-paid                        # skip the paid end-to-end probe
ops-smoke --site cardjoon --format json    # for an agent or a ticket
ops-smoke --format prom                    # Prometheus exposition format
ops-smoke --alert                          # publish failures to the site's SNS topic
ops-smoke --sites monitoring/              # configs somewhere other than ./ops/sites
```

Exit code is 1 on any **critical** failure, so any scheduler can use it as a
pass/fail signal. `warning` checks report but do not fail the run.

The suite deliberately probes the **protections**, not just availability — link
screening must return 422 and an oversized body must return 413. That is the
difference between "the guards are in the repo" and "the guards are in force".

### Running it without installing anything

The smoke path imports nothing outside `node:`, on purpose. A CI job can check
this repository out beside the property and run it directly, with **no
`npm install` at all**:

```yaml
- uses: actions/checkout@v7
- uses: actions/checkout@v7
  with: { repository: BrandonDoggett/ops, path: .ops-toolkit }
- run: node .ops-toolkit/run.mjs --format text --sites ops/sites
```

That is the point of the dependency-free rule: a broken lockfile in the product
must not be able to blind the product's own monitor. Keep it that way — a monitor
that shares a failure mode with the thing it monitors is not a monitor.

## Live status

```bash
ops-status                       # usage against budget + switch state
ops-status --format json         # same, for an agent
```

Reads the same counters the property's Lambdas write, so it is the live picture:
metered units today vs the daily ceiling, this month vs the budget, dollars spent
and remaining.

## Kill switch

```bash
ops-switch                                     # show current state
ops-switch compose off "runaway usage"         # stop AI spend
ops-switch saves off "incident"                # stop new writes
ops-switch all on
```

Takes effect within ~15 seconds in warm Lambda containers, with no deploy. Users
see a pause that explains what still works, not an error.

**Break glass** — if something is actively running away and 15 seconds is 15
seconds too many, cut the function off at the platform instead:

```bash
aws lambda put-function-concurrency --function-name <fn> \
  --reserved-concurrent-executions 0 --profile dogchase --region us-east-1
# restore with: aws lambda delete-function-concurrency --function-name <fn> ...
```

That takes effect immediately, but callers get errors rather than a friendly
pause — so it is the second choice, not the first.

## Choosing a site

With one config in the directory, every command uses it. With several,
`ops-smoke` runs them all, while `ops-status` and `ops-switch` **refuse to guess**
and ask for `--site <name>` — both write or read production state, and picking on
the operator's behalf is not a favour.

## Adding a property

1. In *that* repository, create `ops/sites/<name>.json` — copy
   [`sites/site.example.json`](sites/site.example.json).
2. Set `name`, `baseUrl`, `budgetUsdPerMonth`, the alert topic, and the `quota`
   block if the property meters spend.
3. Write checks: one that the site loads, one per critical API path, and **one
   negative check per protection worth proving**.

Nothing in this repository changes. That is the whole design.

## Development

```bash
npm install
npm test          # vitest, lib/**/*.test.mjs
```

Two rules that are not negotiable, both from
[ADR-0001](docs/adr/0001-site-config-is-the-contract.md):

- **Nothing here may name a property.** No defaults of `"cardjoon"`, no
  site-specific branches. If a check needs it, it belongs in the site config.
- **`run.mjs` and `lib/checks.mjs` import nothing outside `node:`.** The AWS SDK
  is confined to `status.mjs` and `switch.mjs` as an optional peer.
