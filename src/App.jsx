import { useMemo, useState, useEffect } from "react";
import { ReportRenderer, defaultRegistry } from "@reporting/react-ui";
import { issuesByProjectSpec } from "./report-spec.js";

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

/** Set column label for columns with key "customField" to the actual field name. */
function specWithCustomFieldLabel(spec, customFieldLabel) {
  if (!spec || customFieldLabel === "Custom") return spec;
  const widgets = spec.widgets?.map((w) => {
    if (w.type !== "table" || !Array.isArray(w.config?.columns)) return w;
    const columns = w.config.columns.map((col) =>
      col.key === "customField" ? { ...col, label: customFieldLabel } : col
    );
    return { ...w, config: { ...w.config, columns } };
  });
  return { ...spec, widgets };
}

export default function App() {
  const dataProvider = useMemo(() => createDataProvider(), []);
  const [spec, setSpec] = useState(issuesByProjectSpec);
  const [customFieldLabel, setCustomFieldLabel] = useState("Custom");

  useEffect(() => {
    fetch("/api/issue-custom-field-label")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => d.label && setCustomFieldLabel(d.label))
      .catch(() => {});
  }, []);
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
            placeholder="Describe the report (e.g. issues grouped by project, tasks by status)"
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
          spec={specWithCustomFieldLabel(spec, customFieldLabel)}
          dataProvider={dataProvider}
          registry={defaultRegistry}
        />
      </main>
    </div>
  );
}
