// Result formatting. Three outputs from one result set:
//   text  — for a human or an email body
//   json  — for an agent or a ticketing integration to consume
//   prom  — Prometheus exposition format, so a scrape/push target can ingest it
//           unchanged if we ever move off CloudWatch (see ADR-0012)

export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  const criticalFailed = failed.filter((r) => r.severity === "critical");
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    criticalFailed: criticalFailed.length,
    ok: criticalFailed.length === 0,
    sites: [...new Set(results.map((r) => r.site))],
    failures: failed,
  };
}

export function toText(results, summary = summarize(results)) {
  const lines = [];
  for (const r of results) {
    const mark = r.ok ? "ok  " : r.severity === "critical" ? "FAIL" : "warn";
    const detail = r.ok ? "" : ` — ${r.failures.join("; ")}`;
    lines.push(`${mark} ${r.site}/${r.id} (${r.status}, ${r.latencyMs}ms)${detail}`);
  }
  lines.push("");
  lines.push(
    summary.ok
      ? `All good: ${summary.passed}/${summary.total} checks passed.`
      : `${summary.criticalFailed} critical failure(s) of ${summary.total} checks.`,
  );
  return lines.join("\n");
}

export function toJson(results, summary = summarize(results)) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2);
}

function labels(obj) {
  return Object.entries(obj)
    // Label values are sanitized to a safe alphabet rather than escaped: check
    // ids and site names are ours, so anything else is a config mistake.
    .map(([k, v]) => `${k}="${String(v).replace(/[^A-Za-z0-9_.:/-]/g, "")}"`)
    .join(",");
}

export function toPrometheus(results) {
  const lines = [
    "# HELP site_check_up 1 when the check passed, 0 when it failed",
    "# TYPE site_check_up gauge",
  ];
  for (const r of results) {
    lines.push(`site_check_up{${labels({ site: r.site, check: r.id, severity: r.severity })}} ${r.ok ? 1 : 0}`);
  }
  lines.push("# HELP site_check_latency_ms Round-trip time of the check");
  lines.push("# TYPE site_check_latency_ms gauge");
  for (const r of results) {
    lines.push(`site_check_latency_ms{${labels({ site: r.site, check: r.id })}} ${r.latencyMs}`);
  }
  lines.push("# HELP site_up 1 when every critical check for the site passed");
  lines.push("# TYPE site_up gauge");
  for (const site of [...new Set(results.map((r) => r.site))]) {
    const bad = results.some((r) => r.site === site && !r.ok && r.severity === "critical");
    lines.push(`site_up{${labels({ site })}} ${bad ? 0 : 1}`);
  }
  return lines.join("\n") + "\n";
}

export function format(kind, results) {
  const summary = summarize(results);
  if (kind === "json") return toJson(results, summary);
  if (kind === "prom") return toPrometheus(results);
  return toText(results, summary);
}
