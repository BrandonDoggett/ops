// Where site configs live.
//
// The toolkit owns none of them. A site config declares a property's budget,
// endpoints and ceilings — it changes when that property changes, and it is
// usually asserted against that property's own policy code — so it belongs in
// that property's repository, not here (docs/adr/0001).
//
// Resolution order, most specific first:
//   1. an explicit --sites <dir>
//   2. OPS_SITES_DIR
//   3. ./ops/sites, relative to the current working directory
//
// The default is what makes `npm run smoke` work with no flag from any property
// repository, which is the common case.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const DEFAULT_SITES_DIR = "ops/sites";

/** Absolute path to the directory holding site configs. */
export function sitesDir(explicit) {
  const dir = explicit ?? process.env.OPS_SITES_DIR ?? DEFAULT_SITES_DIR;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** Throw with something actionable rather than a bare ENOENT. */
function requireDir(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      `No site configs at ${dir}\n` +
        `  Run this from a property's repository root, or point at the directory:\n` +
        `    --sites <dir>   or   OPS_SITES_DIR=<dir>`,
    );
  }
  return dir;
}

/** Every site config in `dir`, optionally filtered to one by name. */
export function loadSites(dir, only) {
  return readdirSync(requireDir(dir))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .filter((s) => !only || s.name === only);
}

/**
 * The site a single-site command should act on.
 *
 * With a name, that site. Without one, the only site in the directory — which
 * is the common case, since a property repository holds its own config and
 * nobody else's. Two or more and it refuses rather than guessing: `status` and
 * `switch` read and write production state, so picking a site on the operator's
 * behalf is not a favour.
 */
export function resolveSite(dir, name) {
  if (name) return loadSite(dir, name);
  const all = loadSites(dir);
  if (all.length === 1) return all[0];
  if (all.length === 0) {
    throw new Error(`No site configs in ${dir}\n  Add one, or point at another directory with --sites <dir>.`);
  }
  throw new Error(
    `${dir} holds ${all.length} site configs — name the one you mean:\n` +
      `    --site ${all.map((s) => s.name).join(" | ")}`,
  );
}

/** One site config by name. Throws naming what it looked for and what exists. */
export function loadSite(dir, name) {
  const path = join(requireDir(dir), name + ".json");
  if (!existsSync(path)) {
    const found = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    throw new Error(
      `No site config named "${name}" in ${dir}\n` +
        (found.length ? `  Available: ${found.join(", ")}` : "  That directory has no site configs."),
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
