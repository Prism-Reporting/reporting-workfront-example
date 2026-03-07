#!/usr/bin/env node
/**
 * Verifies Workfront API connectivity using WF_BASE_URL and WF_API_KEY from .env.
 * Tries multiple endpoint paths and reports whether each returns JSON or HTML.
 * Run: npm run test:api   or   node scripts/verify-api.js
 */
import "dotenv/config";

const WF_BASE_URL = process.env.WF_BASE_URL;
const WF_API_KEY = process.env.WF_API_KEY;

function fullUrl(path, query = {}) {
  const base = WF_BASE_URL?.replace(/\/$/, "") ?? "";
  const pathPart = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${base}/${pathPart}`);
  if (WF_API_KEY) url.searchParams.set("apiKey", WF_API_KEY);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function probe(label, path, query = {}) {
  const url = fullUrl(path, query);
  try {
    const res = await fetch(url);
    const text = await res.text();
    const isHtml =
      text.trim().startsWith("<") || text.trim().toLowerCase().startsWith("<!doctype");
    let parsed = null;
    if (!isHtml && text.trim()) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = "(parse failed)";
      }
    }
    return {
      label,
      url,
      status: res.status,
      ok: res.ok,
      isHtml,
      contentType: res.headers.get("content-type") ?? "",
      sample: isHtml ? text.slice(0, 120).replace(/\s+/g, " ") : parsed,
    };
  } catch (err) {
    return { label, url, error: err.message };
  }
}

async function main() {
  console.log("Workfront API connectivity check\n");
  if (!WF_BASE_URL || !WF_API_KEY) {
    console.error("Missing WF_BASE_URL or WF_API_KEY in .env");
    process.exit(1);
  }
  console.log("WF_BASE_URL:", WF_BASE_URL);
  console.log("WF_API_KEY:", WF_API_KEY ? `${WF_API_KEY.slice(0, 8)}...` : "(not set)");
  console.log("");

  // Workfront attask API uses {object}/search (see project/search, task/search).
  const paths = [
    ["task/search", "task/search", {}],
    ["project/search", "project/search", {}],
  ];

  let anyJson = false;
  for (const [label, path, query] of paths) {
    const result = await probe(label, path, query);
    console.log("---", result.label, "---");
    console.log("URL:", result.url);
    if (result.error) {
      console.log("Error:", result.error);
    } else {
      console.log("Status:", result.status, result.ok ? "OK" : "NOT OK");
      console.log("Content-Type:", result.contentType || "(none)");
      if (result.isHtml) {
        console.log("Response: HTML (not JSON) – wrong URL or auth?");
        console.log("Sample:", result.sample);
      } else {
        anyJson = true;
        console.log("Response: JSON");
        if (result.sample && typeof result.sample === "object") {
          const keys = Object.keys(result.sample);
          console.log("Top-level keys:", keys.join(", "));
          if (result.sample.data && Array.isArray(result.sample.data)) {
            console.log("data.length:", result.sample.data.length);
          }
        } else {
          console.log("Sample:", result.sample);
        }
      }
    }
    console.log("");
  }

  if (!anyJson) {
    console.log("Result: API integration FAILED (no path returned valid JSON).");
    console.log("Try setting WF_BASE_URL to your instance’s REST base, e.g.:");
    console.log("  https://<your-host>/attask/api/v11.0");
    process.exit(1);
  }

  // --- Task search: which params does the API accept? (avoid 422 from unsupported fields) ---
  console.log("--- Task search params (used by the app) ---");
  const taskSearchParams = [
    ["task/search (no params)", "task/search", {}],
    ["task/search ($$FIRST, $$LIMIT)", "task/search", { $$FIRST: 0, $$LIMIT: 5 }],
    ["task/search (status=NEW)", "task/search", { status: "NEW" }],
    ["task/search (tasksFrom – expect 422)", "task/search", { tasksFrom: "2025-01-01" }],
  ];
  for (const [label, path, query] of taskSearchParams) {
    const result = await probe(label, path, query);
    const ok = result.ok && !result.isHtml;
    if (result.error) console.log(label, "Error:", result.error);
    else console.log(label, "Status:", result.status, ok ? "OK" : "NOT OK");
    if (!ok && result.sample?.error?.message) console.log("  Message:", result.sample.error.message);
  }
  console.log("Safe to pass to task/search: only $$FIRST and $$LIMIT (do not pass tasksFrom, tasksTo, or status – filter client-side).\n");

  console.log("Result: API integration OK (at least one path returned JSON).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
