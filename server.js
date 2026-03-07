import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createWfDataProvider, getPreferredIssueCustomFieldKey, getPreferredIssueCustomFieldLabel } from "./src/data-provider.js";
import { buildDashboardSpec } from "./src/agent/build-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

/**
 * POST /api/runQuery
 * Body: { name: string, params?: Record<string, unknown> }
 * Creates a WF DataProvider with page/pageSize from params and runs the query.
 * Returns { data: unknown[], hasMore: boolean } so the client can drive pagination UI.
 */
app.post("/api/runQuery", async (req, res) => {
  try {
    const { name, params = {} } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'name'" });
    }
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const dataProvider = createWfDataProvider({ page, pageSize: pageSize + 1 });
    const result = await dataProvider.runQuery({ name, params });
    const arr = Array.isArray(result) ? result : [result];
    const data = arr.slice(0, pageSize);
    const hasMore = arr.length > pageSize;
    res.json({ data, hasMore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /api/issue-custom-field-label
 * Returns the preferred issue custom field name (DE: key) for use as column label.
 */
app.get("/api/issue-custom-field-label", (req, res) => {
  const label = getPreferredIssueCustomFieldLabel() || getPreferredIssueCustomFieldKey() || "Custom";
  res.json({ label });
});

/**
 * POST /api/generateSpec
 * Body: { prompt: string }
 * Uses a server-side OpenAI agent that consumes the reporting MCP contract
 * to build and validate a ReportSpec. Returns { spec, validationMeta } or { error }.
 */
app.post("/api/generateSpec", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }
    const result = await buildDashboardSpec({ prompt: prompt.trim() });
    res.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
    res.status(status).json({ error: message });
  }
});

// Static SPA (built React app)
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// SPA fallback: serve index.html for non-API routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Reporting WF integration listening on http://localhost:${port}`);
});
