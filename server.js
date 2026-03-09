import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { createReportingMcpSessionManager } from "../reporting/packages/mcp-server/dist/http.js";
import { createWfDataProvider, getPreferredIssueCustomFieldKey, getPreferredIssueCustomFieldLabel } from "./src/data-provider.js";
import { getWorkfrontQueryCatalog } from "./src/query-catalog.js";
import { buildDashboardSpec } from "./src/agent/build-dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const reportingMcpPath = "/api/reporting-mcp";
const reportingMcpSessionManager = createReportingMcpSessionManager();

app.use(express.json());

app.post(reportingMcpPath, async (req, res) => {
  try {
    await reportingMcpSessionManager.handleNodeRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
});

app.get(reportingMcpPath, async (req, res) => {
  try {
    await reportingMcpSessionManager.handleNodeRequest(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
});

app.delete(reportingMcpPath, async (req, res) => {
  try {
    await reportingMcpSessionManager.handleNodeRequest(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
});

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

function getLastUserPrompt(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") {
      return typeof m.content === "string"
        ? m.content
        : Array.isArray(m.parts)
          ? (m.parts.find((p) => p.type === "text")?.text ?? "")
          : "";
    }
  }
  return "";
}

/**
 * POST /api/chat
 * Body: { messages } from useChat; optional { currentSpec }.
 * Runs the report agent and streams one assistant message + data-report-spec via AI SDK UI stream.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body ?? {};
    const messages = body.messages ?? [];
    const prompt = getLastUserPrompt(messages);
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "No user message found" });
    }
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          const result = await buildDashboardSpec(
            { prompt: prompt.trim() },
            {
              hostContext: {
                source: "reporting-workfront-example",
                tenantId: process.env.WF_API_HOST || "workfront-local",
                queryCatalog: getWorkfrontQueryCatalog(),
              },
              mcpUrl: `http://127.0.0.1:${port}${reportingMcpPath}`,
            }
          );
          const textId = "report-msg";
          writer.write({ type: "text-start", id: textId });
          writer.write({
            type: "text-delta",
            id: textId,
            delta: result.validationMeta
              ? `Report updated. ${result.spec?.title ?? "Spec"} is ready.`
              : "Report updated.",
          });
          writer.write({ type: "text-end", id: textId });
          writer.write({
            type: "data-report-spec",
            data: { spec: result.spec, validationMeta: result.validationMeta },
            transient: true,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writer.write({ type: "error", errorText: message });
        }
        writer.write({ type: "finish" });
      },
    });
    const response = createUIMessageStreamResponse({ stream });
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const reader = response.body.getReader();
      const pump = () =>
        reader.read().then(({ done, value }) => {
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          return pump();
        });
      pump().catch((err) => {
        console.error("Chat stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: String(err) });
        else try { res.end(); } catch (_) {}
      });
    } else {
      res.end();
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
      res.status(status).json({ error: message });
    }
  }
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
    const result = await buildDashboardSpec(
      { prompt: prompt.trim() },
      {
        hostContext: {
          source: "reporting-workfront-example",
          tenantId: process.env.WF_API_HOST || "workfront-local",
          queryCatalog: getWorkfrontQueryCatalog(),
        },
        mcpUrl: `http://127.0.0.1:${port}${reportingMcpPath}`,
      }
    );
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

async function shutdown() {
  await reportingMcpSessionManager.closeAllSessions().catch((err) => {
    console.error("Failed to close reporting MCP sessions:", err);
  });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
