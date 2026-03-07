import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createWfDataProvider } from "./src/data-provider.js";

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
