import { useMemo, useState } from "react";
import { ReportRenderer, defaultRegistry } from "@reporting/react-ui";
import { tasksByStatusSpec } from "./report-spec.js";

function createDataProvider() {
  return {
    async runQuery({ name, params = {} }) {
      const res = await fetch("/api/runQuery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, params }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
  };
}

export default function App() {
  const dataProvider = useMemo(() => createDataProvider(), []);
  const [spec, setSpec] = useState(tasksByStatusSpec);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generateSpec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || res.statusText);
        return;
      }
      if (data.spec) setSpec(data.spec);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #eee", background: "#fafafa" }}>
        <form onSubmit={handleGenerate} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the report (e.g. tasks by status with date filter)"
            disabled={loading}
            style={{ flex: "1 1 200px", minWidth: 200, padding: "8px 12px", fontSize: 14 }}
          />
          <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Generating…" : "Generate report"}
          </button>
        </form>
        {error && (
          <p style={{ margin: "8px 0 0", color: "#c00", fontSize: 14 }}>{error}</p>
        )}
      </header>
      <main style={{ flex: 1 }}>
        <ReportRenderer
          spec={spec}
          dataProvider={dataProvider}
          registry={defaultRegistry}
        />
      </main>
    </div>
  );
}
