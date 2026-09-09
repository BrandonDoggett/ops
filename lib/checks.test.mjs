import { describe, it, expect } from "vitest";
import { buildRequest, evaluate, selectChecks, runCheck } from "./checks.mjs";

const SITE = { name: "example", baseUrl: "https://example.test", headers: { "x-probe": "1" } };

function response(over = {}) {
  return { status: 200, headers: {}, body: "", latencyMs: 10, ...over };
}

describe("buildRequest", () => {
  it("resolves paths against the site and merges headers", () => {
    const req = buildRequest(SITE, { id: "home", path: "/create/" });
    expect(req.url).toBe("https://example.test/create/");
    expect(req.method).toBe("GET");
    expect(req.headers["x-probe"]).toBe("1");
  });

  it("serializes a JSON body and sets the content type", () => {
    const req = buildRequest(SITE, { id: "x", method: "POST", path: "/api", body: { a: 1 } });
    expect(req.body).toBe(JSON.stringify({ a: 1 }));
    expect(req.headers["content-type"]).toBe("application/json");
  });

  // Size-cap probes need a big body without a big config file.
  it("expands bodyRepeat for size-cap probes", () => {
    const req = buildRequest(SITE, {
      id: "x",
      method: "POST",
      path: "/api",
      bodyRepeat: { text: "ab", count: 3 },
    });
    expect(req.body).toBe("ababab");
  });
});

describe("evaluate", () => {
  it("passes when everything matches", () => {
    const check = { expect: { status: 200, bodyIncludes: "hi", headersPresent: ["etag"], maxLatencyMs: 50 } };
    expect(evaluate(check, response({ body: "oh hi", headers: { etag: "x" } }))).toEqual([]);
  });

  it("reports each mismatch separately", () => {
    const check = { expect: { status: 201, bodyIncludes: "hi", headersPresent: ["etag"], maxLatencyMs: 5 } };
    expect(evaluate(check, response()).length).toBe(4);
  });

  it("supports a set of acceptable statuses", () => {
    expect(evaluate({ expect: { statusIn: [200, 204] } }, response({ status: 204 }))).toEqual([]);
    expect(evaluate({ expect: { statusIn: [200] } }, response({ status: 500 })).length).toBe(1);
  });
});

describe("selectChecks", () => {
  const site = { checks: [{ id: "free" }, { id: "paid", spendsMoney: true }] };

  it("can skip probes that cost real money", () => {
    expect(selectChecks(site).length).toBe(2);
    expect(selectChecks(site, { includePaid: false }).map((c) => c.id)).toEqual(["free"]);
  });
});

describe("runCheck", () => {
  const fakeFetch = (status, body = "") => async () => ({
    status,
    text: async () => body,
    headers: { forEach: () => {} },
  });

  it("returns a passing result with timing", async () => {
    let t = 0;
    const res = await runCheck(SITE, { id: "home", path: "/" }, fakeFetch(200), () => (t += 25));
    expect(res).toMatchObject({ site: "example", id: "home", ok: true, status: 200 });
    expect(res.latencyMs).toBe(25);
  });

  // A probe that throws must be a failed check, never a crashed run — one
  // unreachable site cannot be allowed to hide the health of the others.
  it("fails the check rather than throwing when the request errors", async () => {
    const boom = async () => {
      throw new Error("ECONNREFUSED");
    };
    const res = await runCheck(SITE, { id: "home", path: "/" }, boom);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.failures[0]).toContain("ECONNREFUSED");
  });
});
