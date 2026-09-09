// The check runner. Deliberately dependency-free and site-agnostic: it takes a
// site config (ops/sites/*.json) and runs the HTTP probes it declares.
//
// Nothing in here knows what Cardjoon is. Adding a site is adding a JSON file,
// which is the whole point — the same runner has to cover every property.

/** Expand a check declaration into a concrete request. */
export function buildRequest(site, check) {
  const url = new URL(check.path, site.baseUrl).toString();
  const method = check.method ?? "GET";
  const headers = { ...(site.headers ?? {}), ...(check.headers ?? {}) };
  let body;
  if (check.body !== undefined) {
    body = JSON.stringify(check.body);
    headers["content-type"] = headers["content-type"] ?? "application/json";
  } else if (check.bodyRepeat) {
    // For probing size caps without carrying a huge literal in the config.
    body = check.bodyRepeat.text.repeat(check.bodyRepeat.count);
  } else if (check.bodyText !== undefined) {
    body = check.bodyText;
  }
  return { url, method, headers, body };
}

/** Compare a response against what the check expects. Returns failure reasons. */
export function evaluate(check, response) {
  const expect = check.expect ?? {};
  const failures = [];

  if (expect.status !== undefined && response.status !== expect.status) {
    failures.push(`expected status ${expect.status}, got ${response.status}`);
  }
  if (expect.statusIn && !expect.statusIn.includes(response.status)) {
    failures.push(`expected status in [${expect.statusIn}], got ${response.status}`);
  }
  if (expect.bodyIncludes && !String(response.body ?? "").includes(expect.bodyIncludes)) {
    failures.push(`body missing ${JSON.stringify(expect.bodyIncludes)}`);
  }
  for (const header of expect.headersPresent ?? []) {
    if (!response.headers?.[header.toLowerCase()]) failures.push(`missing header ${header}`);
  }
  if (expect.maxLatencyMs !== undefined && response.latencyMs > expect.maxLatencyMs) {
    failures.push(`slow: ${response.latencyMs}ms > ${expect.maxLatencyMs}ms`);
  }
  return failures;
}

/** Run one check. `fetchImpl` is injectable so this is testable offline. */
export async function runCheck(site, check, fetchImpl = fetch, now = () => Date.now()) {
  const request = buildRequest(site, check);
  const startedAt = now();
  try {
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    const body = await res.text();
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const response = { status: res.status, headers, body, latencyMs: now() - startedAt };
    const failures = evaluate(check, response);
    return {
      site: site.name,
      id: check.id,
      severity: check.severity ?? "critical",
      ok: failures.length === 0,
      status: response.status,
      latencyMs: response.latencyMs,
      failures,
    };
  } catch (err) {
    return {
      site: site.name,
      id: check.id,
      severity: check.severity ?? "critical",
      ok: false,
      status: 0,
      latencyMs: now() - startedAt,
      failures: [`request failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/** Checks to run, minus any excluded by flags (paid probes are opt-out). */
export function selectChecks(site, { includePaid = true } = {}) {
  return (site.checks ?? []).filter((c) => includePaid || !c.spendsMoney);
}

/** Run every selected check for a site, sequentially (these are probes, not load). */
export async function runSite(site, options = {}) {
  const results = [];
  for (const check of selectChecks(site, options)) {
    results.push(await runCheck(site, check, options.fetchImpl));
  }
  return results;
}
