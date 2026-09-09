# Architecture Decision Records (ADRs)

ADRs capture **significant architectural decisions** — the choice, the context
that forced it, and the consequences. Same convention as the other Eldoggo
repositories: documentation and ADRs are first-class, kept in lockstep with the
code rather than written afterwards.

## When to write one

Add an ADR whenever you make or change a decision that is expensive to reverse or
shapes the toolkit: the site-config contract, where configs live, what may be
imported at runtime, how consumers get the code. Small behaviour changes to a
check or a formatter stay in the code and its tests.

## How

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-short-title.md` (next number).
2. Fill it in; set **Status** (Proposed → Accepted, or Superseded by ADR-XXXX).
3. Link it from the index below and reference it where relevant.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-site-config-is-the-contract.md) | A site is a JSON file, and it lives with the site | Accepted |

## Related decisions elsewhere

The reasoning that produced this repository lives in Cardjoon, where the toolkit
started:

- [cardjoon ADR-0012](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0012-operations-metrics-and-control.md) — metrics, kill switch, and the portable monitoring contract
- [cardjoon ADR-0013](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0013-self-hosted-ops-platform.md) — the Control Room and the watcher that runs these checks every 15 minutes
- [cardjoon ADR-0015](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0015-ops-toolkit-own-repository.md) — why this repository exists
