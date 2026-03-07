#!/usr/bin/env node
/**
 * Manual exploration: fetch a few tasks with parameterValues and print them.
 * Use this to see which DE: custom field keys exist in your instance.
 *
 * Run: node scripts/explore/tasks-with-custom-fields.js
 * Optional: LIMIT=10 node scripts/explore/tasks-with-custom-fields.js
 */
import "dotenv/config";
import { get, getTask } from "../../src/wf-client.js";

function toArray(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

async function main() {
  const limit = Math.min(50, Math.max(1, parseInt(process.env.LIMIT || "5", 10)));
  console.log("Fetching up to", limit, "tasks with parameterValues...\n");

  let items = [];
  try {
    const res = await get("task/search", {
      fields: "ID,name,status,parameterValues",
      $$FIRST: 0,
      $$LIMIT: limit,
    });
    items = toArray(res);
  } catch (e) {
    if (String(e.message || "").includes("422")) {
      console.log("task/search with fields=parameterValues returned 422; fetching tasks then enriching per task.\n");
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

  if (items.length === 0) {
    console.log("No tasks returned.");
    return;
  }

  const allDeKeys = new Set();
  for (const task of items) {
    const pv = task.parameterValues;
    if (pv && typeof pv === "object" && !Array.isArray(pv)) {
      for (const key of Object.keys(pv)) {
        if (key.startsWith("DE:")) allDeKeys.add(key);
      }
    }
  }

  console.log("DE: keys seen across sampled tasks:", [...allDeKeys].sort().join(", ") || "(none)");
  console.log("\n--- Sample tasks (first 3) ---\n");
  for (const task of items.slice(0, 3)) {
    console.log(JSON.stringify({
      ID: task.ID ?? task.id,
      name: task.name,
      status: task.status,
      parameterValues: task.parameterValues ?? {},
    }, null, 2));
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
