#!/usr/bin/env node
/**
 * Manual exploration: discover custom form (DE:) fields on issues (optasks) and
 * find which field has a value on most issues. Use this to choose a default
 * custom column for the issues-by-project report.
 *
 * Run: node scripts/explore/issues-custom-fields-discovery.js
 * Optional: LIMIT=50 node scripts/explore/issues-custom-fields-discovery.js
 *
 * Writes .wf-discovery.json (gitignored) with issueDeKeyMostCommon when found,
 * so the data provider can show that field in the default Custom column.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { get, getOptask } from "../../src/wf-client.js";

function toArrayParam(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

/** Resolve DE: key to display name via param/search (param.name = part after DE:, param.label = display name). */
async function resolveDisplayName(deKey) {
  if (!deKey || !deKey.startsWith("DE:")) return null;
  const name = deKey.slice(3).trim();
  if (!name) return null;
  try {
    const res = await get("param/search", {
      name,
      name_Mod: "eq",
      $$LIMIT: 1,
      fields: "label,name",
    });
    const arr = toArrayParam(res);
    const param = arr[0];
    return (param && (param.label ?? param.name)) || null;
  } catch {
    return null;
  }
}

function toArray(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.optasks)) return res.optasks;
  return [];
}

async function fetchIssuesWithParameterValues(limit = 30) {
  const safeLimit = Math.min(100, Math.max(5, limit));
  let items = [];
  try {
    const res = await get("optask/search", {
      fields: "ID,name,parameterValues",
      $$FIRST: 0,
      $$LIMIT: safeLimit,
    });
    items = toArray(res);
  } catch (e) {
    if (String(e.message || "").includes("422")) {
      const res = await get("optask/search", { $$FIRST: 0, $$LIMIT: safeLimit });
      items = toArray(res);
      for (let i = 0; i < items.length; i++) {
        const id = items[i].ID ?? items[i].id;
        if (!id) continue;
        try {
          const o = await getOptask(id, "parameterValues");
          const data = o?.data ?? o;
          if (data?.parameterValues) items[i].parameterValues = data.parameterValues;
        } catch {
          // skip
        }
      }
    } else {
      throw e;
    }
  }
  return items;
}

function countDeKeyFrequency(items) {
  const countByKey = new Map();
  for (const issue of items) {
    const pv = issue?.parameterValues;
    if (!pv || typeof pv !== "object" || Array.isArray(pv)) continue;
    for (const key of Object.keys(pv)) {
      if (!key.startsWith("DE:")) continue;
      const value = pv[key];
      const hasValue = value !== undefined && value !== null && value !== "";
      if (!hasValue) continue;
      countByKey.set(key, (countByKey.get(key) || 0) + 1);
    }
  }
  return countByKey;
}

async function main() {
  console.log("Workfront issue (optask) custom forms discovery\n");

  const limit = Math.min(100, Math.max(5, parseInt(process.env.LIMIT || "30", 10)));
  let items = [];
  try {
    items = await fetchIssuesWithParameterValues(limit);
  } catch (e) {
    console.error("Error fetching issues:", e.message);
    process.exit(1);
  }

  if (items.length === 0) {
    console.log("No issues returned.");
    return;
  }

  const countByKey = countDeKeyFrequency(items);
  const total = items.length;
  const sorted = [...countByKey.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, pct: ((count / total) * 100).toFixed(1) }));

  if (sorted.length === 0) {
    console.log("No DE: custom form keys with values found in sampled issues.");
    return;
  }

  console.log("Sampled", total, "issues. DE: keys with values (most common first):\n");
  for (const { key, count, pct } of sorted) {
    console.log(`  ${key}: ${count}/${total} (${pct}%)`);
  }

  const mostCommon = sorted[0];
  console.log("\nSuggested field for default DLS (most commonly populated):", mostCommon.key);
  console.log("Set WF_ISSUE_CUSTOM_FIELD=" + mostCommon.key + " to use this in the Custom column, or rely on .wf-discovery.json.");

  const displayName = await resolveDisplayName(mostCommon.key);
  if (displayName) console.log("Display name for column label:", displayName);

  const discoveryPath = join(process.cwd(), ".wf-discovery.json");
  const payload = {
    issueDeKeyMostCommon: mostCommon.key,
    ...(displayName && { issueDeKeyDisplayName: displayName }),
  };
  try {
    writeFileSync(discoveryPath, JSON.stringify(payload, null, 2));
    console.log("\nWrote", discoveryPath);
  } catch (e) {
    console.log("\nCould not write .wf-discovery.json:", e.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
