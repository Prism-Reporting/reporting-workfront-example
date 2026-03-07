#!/usr/bin/env node
/**
 * Manual exploration: discover custom forms (DE: fields) available in the
 * connected Workfront instance. Samples multiple tasks to build a robust list
 * of custom form field keys for use in default DLS, WF_TASK_CUSTOM_FIELDS, or
 * report spec columns.
 *
 * Run: node scripts/explore/custom-forms-discovery.js
 * Optional: LIMIT=30 node scripts/explore/custom-forms-discovery.js
 */
import "dotenv/config";
import { get, getTask } from "../../src/wf-client.js";

function toArray(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

async function tryEndpoint(label, path, query = {}) {
  try {
    const res = await get(path, query);
    const data = res?.data ?? res;
    const arr = Array.isArray(data) ? data : (data?.data ? (Array.isArray(data.data) ? data.data : [data.data]) : [data]);
    console.log(label, "-> status: OK, items:", arr?.length ?? 0);
    return { ok: true, data: res };
  } catch (e) {
    console.log(label, "-> error:", e.message || e);
    return { ok: false, error: e.message };
  }
}

/** Collect all DE: keys from tasks, with optional per-task enrichment if search omits parameterValues. */
async function discoverTaskDeKeys(sampleSize = 20) {
  const limit = Math.min(50, Math.max(5, sampleSize));
  let items = [];
  try {
    const res = await get("task/search", {
      fields: "ID,name,parameterValues",
      $$FIRST: 0,
      $$LIMIT: limit,
    });
    items = toArray(res);
  } catch (e) {
    if (String(e.message || "").includes("422")) {
      const res = await get("task/search", { $$FIRST: 0, $$LIMIT: limit });
      items = toArray(res);
      for (let i = 0; i < items.length; i++) {
        const id = items[i].ID ?? items[i].id;
        if (!id) continue;
        try {
          const t = await getTask(id, "parameterValues");
          const data = t?.data ?? t;
          if (data?.parameterValues) items[i].parameterValues = data.parameterValues;
        } catch {
          // skip
        }
      }
    } else {
      throw e;
    }
  }

  const allDeKeys = new Set();
  for (const task of items) {
    const pv = task?.parameterValues;
    if (pv && typeof pv === "object" && !Array.isArray(pv)) {
      for (const key of Object.keys(pv)) {
        if (key.startsWith("DE:")) allDeKeys.add(key);
      }
    }
  }
  return { items, deKeys: [...allDeKeys].sort() };
}

async function main() {
  console.log("Workfront custom forms discovery (manual exploration)\n");

  // Try ctgy/search – some API versions support searching categories (custom forms)
  await tryEndpoint("ctgy/search (no params)", "ctgy/search", {});
  await tryEndpoint("ctgy/search ($$LIMIT=20)", "ctgy/search", { $$LIMIT: 20 });

  // Try report endpoint for categories if your instance uses reports
  await tryEndpoint("report/ctgy (if supported)", "report", { objCode: "ctgy" });

  // Discover DE: keys from a sample of tasks (robust list for default DLS)
  const limit = Math.min(50, Math.max(5, parseInt(process.env.LIMIT || "20", 10)));
  console.log("\n--- DE: keys from task sample (limit=" + limit + ") ---");
  let items = [];
  let deKeys = [];
  try {
    const out = await discoverTaskDeKeys(limit);
    items = out.items;
    deKeys = out.deKeys;
  } catch (e) {
    console.log("Error:", e.message);
    return;
  }

  if (deKeys.length === 0) {
    console.log("No DE: custom form keys found in sampled tasks. Tasks may have no custom forms attached, or parameterValues was not returned.");
    return;
  }

  console.log("DE: keys found:", deKeys.length);
  console.log("Keys:", deKeys.join(", "));
  const firstKey = deKeys[0];
  console.log("\nSuggested first key for default DLS / WF_TASK_CUSTOM_FIELDS:", firstKey);
  console.log("Use in report spec column: key \"customField\" (first value) or \"customFields." + firstKey + "\" if UI supports nested keys.");
  console.log("\nExample WF_TASK_CUSTOM_FIELDS (comma-separated):", deKeys.slice(0, 5).join(","));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
