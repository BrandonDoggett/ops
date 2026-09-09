import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SITES_DIR, sitesDir, loadSites, loadSite } from "./sites.mjs";

const made = [];
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "ops-sites-"));
  made.push(root);
  const dir = join(root, "sites");
  mkdirSync(dir);
  for (const [name, body] of Object.entries(files)) {
    // A string is written verbatim, so a fixture can include a non-JSON file.
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body), "utf8");
  }
  return dir;
}

afterEach(() => {
  delete process.env.OPS_SITES_DIR;
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});

describe("sitesDir", () => {
  it("prefers the explicit directory over the environment", () => {
    process.env.OPS_SITES_DIR = "/from/env";
    expect(sitesDir("/from/flag")).toBe("/from/flag");
  });

  it("falls back to OPS_SITES_DIR, then to ./ops/sites", () => {
    process.env.OPS_SITES_DIR = "/from/env";
    expect(sitesDir()).toBe("/from/env");
    delete process.env.OPS_SITES_DIR;
    expect(sitesDir()).toBe(join(process.cwd(), DEFAULT_SITES_DIR));
  });

  it("resolves a relative directory against the working directory", () => {
    expect(sitesDir("monitoring")).toBe(join(process.cwd(), "monitoring"));
  });
});

describe("loadSites", () => {
  it("loads every config and skips *.example.json", () => {
    const dir = fixture({
      "a.json": { name: "a" },
      "b.json": { name: "b" },
      "template.example.json": { name: "template" },
      "notes.md": "not a site config",
    });
    const names = loadSites(dir).map((s) => s.name).sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("filters to one site by name", () => {
    const dir = fixture({ "a.json": { name: "a" }, "b.json": { name: "b" } });
    expect(loadSites(dir, "b").map((s) => s.name)).toEqual(["b"]);
  });

  it("explains how to fix a missing directory instead of throwing ENOENT", () => {
    expect(() => loadSites("/no/such/place")).toThrow(/--sites <dir>/);
  });
});

describe("loadSite", () => {
  it("returns the named config", () => {
    const dir = fixture({ "cardjoon.json": { name: "cardjoon", baseUrl: "https://x.test" } });
    expect(loadSite(dir, "cardjoon").baseUrl).toBe("https://x.test");
  });

  it("lists what is available when the name is wrong", () => {
    const dir = fixture({ "cardjoon.json": { name: "cardjoon" }, "botjoon.json": { name: "botjoon" } });
    expect(() => loadSite(dir, "typo")).toThrow(/Available: .*cardjoon/);
  });
});
