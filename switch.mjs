#!/usr/bin/env node
// The kill switch. Turns a money-spending path off (or back on) in about a
// minute, with no deploy and no code change (ADR-0012).
//
//   ops-switch status
//   ops-switch compose off "runaway usage, investigating"
//   ops-switch saves on
//   ops-switch all off "incident"
//
// Acts on the only site in ./ops/sites; --site <name> and --sites <dir> select
// another. It writes production state, so with several configs it refuses to guess.
//
// Effect is bounded by the control cache (60s) in warm Lambda containers.

import { resolveSite, sitesDir } from "./lib/sites.mjs";
import { loadDynamo } from "./lib/aws.mjs";

const CONTROL_KEY = "control#site";
const TARGETS = ["compose", "saves", "all"];

// Flags may sit anywhere; whatever is left over is positional.
const argv = process.argv.slice(2);
let siteName = process.env.OPS_SITE ?? null;
let sitesOverride = null;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--site") siteName = argv[++i];
  else if (argv[i] === "--sites") sitesOverride = argv[++i];
  else rest.push(argv[i]);
}
const [target, state, ...noteParts] = rest;
let site;
try {
  site = resolveSite(sitesDir(sitesOverride), siteName);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const quota = site.quota;
if (!quota) {
  console.error("Site " + site.name + " has no quota block.");
  process.exit(2);
}

// The AWS CLI takes --profile; the SDK only reads the environment.
process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? quota.profile ?? "default";

const { DynamoDBClient, DynamoDBDocumentClient, GetCommand, UpdateCommand } = await loadDynamo();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: quota.region ?? "us-east-1" }));

async function show() {
  const res = await ddb.send(new GetCommand({ TableName: quota.table, Key: { k: CONTROL_KEY } }));
  const item = res.Item ?? {};
  console.log("compose " + (item.composeEnabled !== false ? "ON" : "OFF"));
  console.log("saves   " + (item.savesEnabled !== false ? "ON" : "OFF"));
  if (item.note) console.log("note    " + item.note);
  if (item.updatedAt) console.log("updated " + item.updatedAt);
}

if (!target || target === "status") {
  await show();
  process.exit(0);
}

if (!TARGETS.includes(target) || !["on", "off"].includes(state)) {
  console.error("usage: ops-switch [status|compose|saves|all] [on|off] [note] [--site <name>] [--sites <dir>]");
  process.exit(2);
}

const enabled = state === "on";
const note = noteParts.join(" ").trim();
const fields = {};
if (target === "compose" || target === "all") fields.composeEnabled = enabled;
if (target === "saves" || target === "all") fields.savesEnabled = enabled;

const names = { "#u": "updatedAt", "#n": "note" };
const values = { ":u": new Date().toISOString(), ":n": note || (enabled ? "" : "switched off") };
const sets = ["#u = :u", "#n = :n"];
let i = 0;
for (const [field, value] of Object.entries(fields)) {
  const nk = "#f" + i;
  const vk = ":f" + i;
  names[nk] = field;
  values[vk] = value;
  sets.push(nk + " = " + vk);
  i++;
}

await ddb.send(
  new UpdateCommand({
    TableName: quota.table,
    Key: { k: CONTROL_KEY },
    UpdateExpression: "SET " + sets.join(", "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }),
);

console.log(target + " -> " + state + (note ? "  (" + note + ")" : ""));
console.log("Takes effect within ~15s in warm containers.");
await show();
