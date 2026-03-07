#!/usr/bin/env node
/**
 * Manual exploration: see how Workfront exposes custom field display names.
 * ctgy (custom form) has categoryParameters; each has a parameter. We need
 * to map DE:xxx (parameter name/ID in parameterValues) to the display label.
 *
 * Run: node scripts/explore/parameter-display-names.js
 */
import "dotenv/config";
import { get } from "../../src/wf-client.js";

function toArray(res) {
  if (!res || typeof res !== "object") return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

async function main() {
  console.log("Fetching ctgy (custom forms) with categoryParameters:parameter...\n");

  // Try to get categories with their parameters (full parameter object to see fields)
  let categories = [];
  try {
    const res = await get("ctgy/search", {
      $$LIMIT: 5,
      fields: "name,description,categoryParameters:parameter:*",
    });
    categories = toArray(res);
  } catch (e) {
    console.log("ctgy/search with categoryParameters:parameter failed:", e.message);
    // Try without nested parameter
    try {
      const res = await get("ctgy/search", { $$LIMIT: 3, fields: "name,categoryParameters" });
      categories = toArray(res);
      console.log("Raw categoryParameters shape:", JSON.stringify(categories[0]?.categoryParameters?.slice?.(0, 2) ?? categories[0], null, 2));
    } catch (e2) {
      console.log(e2.message);
    }
    return;
  }

  if (categories.length === 0) {
    console.log("No categories returned.");
    return;
  }

  // Log first category and first few categoryParameters to see parameter object shape
  const cat = categories[0];
  const params = cat?.categoryParameters ?? [];
  console.log("First category name:", cat?.name);
  console.log("First 2 categoryParameter.parameter objects:\n");
  const slice = (Array.isArray(params) ? params : [params]).slice(0, 2);
  for (const cp of slice) {
    const p = cp?.parameter ?? cp;
    console.log(JSON.stringify(p, null, 2));
    console.log("");
  }

  // Build map of possible "name" (DE: id) -> display label if we see it
  const idToLabel = new Map();
  const allParams = Array.isArray(params) ? params : [params];
  for (const cp of allParams) {
    const p = cp?.parameter ?? cp;
    if (!p) continue;
    // Common patterns: name = API name (DE:xxx), description or label = display name
    const id = p.name ?? p.ID ?? p.id;
    const label = p.description ?? p.label ?? p.parameterDisplayName ?? p.displayName ?? p.name;
    if (id) idToLabel.set(id, label || id);
  }
  if (idToLabel.size > 0) {
    console.log("Inferred ID -> label (first 5):");
    for (const [id, label] of [...idToLabel.entries()].slice(0, 5)) {
      console.log(`  ${id} -> ${label}`);
    }
  }

  // Try param/search to see if we get DE: keys or param ID -> name/label
  console.log("\n--- param/search (first 3) ---");
  try {
    const pres = await get("param/search", { $$LIMIT: 3, fields: "ID,name,label,description" });
    const parr = toArray(pres);
    console.log(JSON.stringify(parr, null, 2));
  } catch (e) {
    console.log("param/search error:", e.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
