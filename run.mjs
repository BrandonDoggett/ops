#!/usr/bin/env node
// Smoke runner: probes live sites and reports.
//
//   ops-smoke                            every site in ./ops/sites
//   ops-smoke --site cardjoon            one site
//   ops-smoke --sites monitoring/        site configs live somewhere else
//   ops-smoke --no-paid                  skip probes that cost money
//   ops-smoke --format prom|json         machine output
//   ops-smoke --alert                    publish failures to the site SNS topic
//
// Site configs are not part of this toolkit — they belong to the property being
// watched (docs/adr/0001). By default they are read from ./ops/sites relative to
// the working directory, so running this from a property's repository root needs
// no flag.
//
// Exit code 1 on any critical failure, so any scheduler (cron, GitHub Actions,
// EventBridge) can treat it as a pass/fail signal without parsing the output.

import { execFileSync } from "node:child_process";
import { runSite } from "./lib/checks.mjs";
import { format, summarize } from "./lib/report.mjs";
import { loadSites, sitesDir } from "./lib/sites.mjs";

function parseArgs(argv) {
  const args = { format: "text", includePaid: true, alert: false, site: null, sites: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") args.site = argv[++i];
    else if (a === "--sites") args.sites = argv[++i];
    else if (a === "--format") args.format = argv[++i];
    else if (a === "--no-paid") args.includePaid = false;
    else if (a === "--alert") args.alert = true;
  }
  return args;
}

function publishAlert(site, text) {
  const topic = site.alerts?.snsTopicName;
  if (!topic) return;
  const region = site.alerts?.region ?? "us-east-1";
  const profile = process.env.AWS_PROFILE ?? "dogchase";
  try {
    const arn = execFileSync(
      "aws",
      ["sns", "create-topic", "--name", topic, "--region", region, "--profile", profile,
       "--query", "TopicArn", "--output", "text"],
      { encoding: "utf8" },
    ).trim();
    execFileSync(
      "aws",
      ["sns", "publish", "--topic-arn", arn, "--region", region, "--profile", profile,
       "--subject", "[" + site.name + "] smoke test failed", "--message", text],
      { encoding: "utf8" },
    );
    console.error("  alert published to " + topic);
  } catch (err) {
    console.error("  could not publish alert: " + err.message);
  }
}

const args = parseArgs(process.argv.slice(2));
const dir = sitesDir(args.sites);

let sites;
try {
  sites = loadSites(dir, args.site);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

if (sites.length === 0) {
  console.error(
    args.site
      ? "No site config named " + args.site + " in " + dir
      : "No site configs found in " + dir,
  );
  process.exit(2);
}

const all = [];
for (const site of sites) {
  const results = await runSite(site, { includePaid: args.includePaid });
  all.push(...results);
  if (!summarize(results).ok && args.alert) {
    publishAlert(site, format("text", results));
  }
}

console.log(format(args.format, all));
process.exit(summarize(all).ok ? 0 : 1);
