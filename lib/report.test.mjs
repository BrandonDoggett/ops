import { describe, it, expect } from "vitest";
import { summarize, toText, toJson, toPrometheus } from "./report.mjs";

const RESULTS = [
  { site: "cardjoon", id: "home", severity: "critical", ok: true, status: 200, latencyMs: 120, failures: [] },
  { site: "cardjoon", id: "robots", severity: "warning", ok: false, status: 404, latencyMs: 90, failures: ["missing"] },
  {
    site: "cardjoon",
    id: "api",
    severity: "critical",
    ok: false,
    status: 500,
    latencyMs: 300,
    failures: ["expected status 200, got 500"],
  },
];

describe("summarize", () => {
  // Warnings are for the report; only critical failures should wake someone up.
  it("counts failures and fails the run only on critical ones", () => {
    expect(summarize(RESULTS)).toMatchObject({
      total: 3,
      passed: 1,
      failed: 2,
      criticalFailed: 1,
      ok: false,
    });
    expect(summarize([RESULTS[0], RESULTS[1]]).ok).toBe(true);
  });
});

describe("toText", () => {
  it("puts the reason next to the failing check", () => {
    const text = toText(RESULTS);
    expect(text).toContain("FAIL cardjoon/api");
    expect(text).toContain("expected status 200, got 500");
    expect(text).toContain("1 critical failure");
  });
});

describe("toJson", () => {
  it("emits a shape an agent or ticket system can consume", () => {
    const parsed = JSON.parse(toJson(RESULTS));
    expect(parsed.summary.criticalFailed).toBe(1);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("toPrometheus", () => {
  const text = toPrometheus(RESULTS);

  it("emits labelled gauges in exposition format", () => {
    expect(text).toContain("# TYPE site_check_up gauge");
    expect(text).toContain(`site_check_up{site="cardjoon",check="home",severity="critical"} 1`);
    expect(text).toContain(`site_check_latency_ms{site="cardjoon",check="api"} 300`);
  });

  it("rolls checks up into one gauge per site", () => {
    expect(text).toContain(`site_up{site="cardjoon"} 0`);
  });
});
