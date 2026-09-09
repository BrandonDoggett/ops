# ADR-0001: A site is a JSON file, and it lives with the site

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

This toolkit was extracted from the Cardjoon repository once a second property
(Botjoon) needed the same monitoring
([cardjoon ADR-0015](https://github.com/BrandonDoggett/cardjoon/blob/main/docs/adr/0015-ops-toolkit-own-repository.md)).
Extraction forced a question that never had to be answered while everything lived
in one repository: **where do site configs belong?**

Two options:

1. **Here.** One repository holds the runner and every property's config. Easy to
   see everything at once; a single `ops-smoke` covers the estate.
2. **With each property.** This repository holds only the runner; each property
   repository carries its own `ops/sites/<name>.json`.

## Decision

**Site configs live with the property they describe. This toolkit ships none.**

A site config declares that property's base URL, its endpoints, its budget and
its ceilings. Those numbers change when the property changes — a new endpoint, a
raised budget, a tightened ceiling — and in Cardjoon's case they are *asserted by
that repository's own unit test* against `src/lib/ops/policy.ts`, because a
monitor quoting a stale budget is worse than no monitor.

Putting the config here would separate three things that must change in one
commit: the code that enforces a limit, the test that pins it, and the config
that watches it. It would also mean a property could not be monitored without
write access to this repository, which is exactly backwards.

So the runner takes the directory rather than assuming one:

```
--sites <dir>   ·   OPS_SITES_DIR=<dir>   ·   default ./ops/sites (cwd-relative)
```

The default is the whole point: run any command from a property's repository root
and it finds that property's configs with no flag.

### Corollaries

- **Nothing here may name a property.** `status` and `switch` used to default to
  `"cardjoon"`; they now act on the only config in the directory and refuse to
  guess when there are several, because both write production state.
- **The smoke path stays dependency-free.** `run.mjs` and `lib/checks.mjs` import
  nothing outside `node:`. The AWS SDK is an *optional peer dependency*, needed
  only by `status` and `switch`. This is what lets a caller run the smoke probe
  straight from a git checkout with no `npm install` at all — which is the
  property that keeps a broken lockfile in a product repository from blinding its
  own monitor.
- **Tests are the exception to dependency-free.** `vitest` is a devDependency,
  matching house style across the properties. Dev tooling is not a runtime
  failure mode, and rewriting proven tests to avoid one dependency would have put
  new bugs into the thing that verifies the monitor.

## Consequences

**Easier.** A new property gets monitoring by writing one JSON file, which is
what the original design promised. Runner fixes reach every property at once. The
toolkit can be tested hard without inflating any product's test run.

**Harder.** There is no single command that sweeps the whole estate; that would
need a directory of directories, and with two properties it is not worth
inventing. Two repositories must be released together whenever the site-config
format changes — which is why that format is the only contract crossing this
boundary, and why it should change rarely.

**What would cause us to revisit.** A fourth or fifth property, or per-property
extensions to the config format, would make the format a real API deserving a
`version` field and a schema. Two properties do not justify that yet.
