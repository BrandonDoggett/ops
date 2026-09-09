#!/usr/bin/env node
// What is happening right now: usage against the budget, and the switch state.
//
//   ops-status                        human summary (the only site, or --site <name>)
//   ops-status --format json          for an agent or a dashboard
//   ops-status --sites monitoring/    site configs live somewhere else
//
// Reads the same counters the Lambdas write (ADR-0011), so this is the live
// picture, not a reconstruction from logs.

import { resolveSite, sitesDir } from "./lib/sites.mjs";
import { loadDynamo } from "./lib/aws.mjs";


function parseArgs(argv) {
  const args = { site: null, format: "text", sites: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--site") args.site = argv[++i];
    else if (argv[i] === "--format") args.format = argv[++i];
    else if (argv[i] === "--sites") args.sites = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
let site;
try {
  site = resolveSite(sitesDir(args.sites), args.site);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const quota = site.quota;
if (!quota) {
  console.error("Site " + site.name + " has no quota block; nothing to report.");
  process.exit(2);
}

// The AWS CLI takes --profile; the SDK only reads the environment. Default it
// from the site config so `npm run ops:status` works without ceremony.
process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? quota.profile ?? "default";

const { DynamoDBClient, DynamoDBDocumentClient, GetCommand, UpdateCommand } = await loadDynamo();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: quota.region ?? "us-east-1" }));

async function counter(key) {
  const res = await ddb.send(new GetCommand({ TableName: quota.table, Key: { k: key } }));
  return Number(res.Item?.n ?? 0);
}

async function control() {
  const res = await ddb.send(new GetCommand({ TableName: quota.table, Key: { k: "control#site" } }));
  const item = res.Item ?? {};
  return {
    composeEnabled: item.composeEnabled !== false,
    savesEnabled: item.savesEnabled !== false,
    note: item.note,
  };
}

const now = new Date();
const day = now.toISOString().slice(0, 10);
const month = now.toISOString().slice(0, 7);

const [today, thisMonth, switches] = await Promise.all([
  counter("compose#all#site#" + day),
  counter("compose#all#site#" + month),
  control(),
]);

const spentUsd = thisMonth * quota.composeCostUsd;
const report = {
  site: site.name,
  generatedAt: now.toISOString(),
  compose: {
    today,
    dailyCeiling: quota.dailyCeiling,
    dayUsedPct: Math.round((today / quota.dailyCeiling) * 100),
    month: thisMonth,
    monthlyCeiling: quota.monthlyCeiling,
    monthUsedPct: Math.round((thisMonth / quota.monthlyCeiling) * 100),
  },
  budget: {
    aiMonthlyUsd: quota.aiMonthlyUsd,
    spentUsd: Number(spentUsd.toFixed(2)),
    remainingUsd: Number((quota.aiMonthlyUsd - spentUsd).toFixed(2)),
  },
  control: switches,
};

if (args.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  const c = report.compose;
  const b = report.budget;
  console.log(site.name + " — " + day + " (UTC)");
  console.log("  compose today   " + c.today + " / " + c.dailyCeiling + "   (" + c.dayUsedPct + "%)");
  console.log("  compose month   " + c.month + " / " + c.monthlyCeiling + "   (" + c.monthUsedPct + "%)");
  console.log("  AI budget       $" + b.spentUsd + " spent, $" + b.remainingUsd + " left of $" + b.aiMonthlyUsd);
  console.log(
    "  switches        compose " + (switches.composeEnabled ? "ON" : "OFF") +
      ", saves " + (switches.savesEnabled ? "ON" : "OFF") +
      (switches.note ? "  (" + switches.note + ")" : ""),
  );
}
