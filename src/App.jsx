import { useMemo, useState, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
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
  const [input, setInput] = useState("");

  useEffect(() => {
    fetch("/api/issue-custom-field-label")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => d.label && setCustomFieldLabel(d.label))
      .catch(() => {});
  }, []);

  const chat = useChat({
    api: "/api/chat",
    onData: (dataPart) => {
      if (dataPart.type === "data-report-spec" && dataPart.data?.spec) {
        setSpec(dataPart.data.spec);
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    chat.append({ role: "user", content: text });
  };

  const loading = chat.status === "streaming" || chat.status === "submitted";
  const displayError = chat.error?.message ?? null;

  return (
    <div className="min-h-screen bg-transparent text-slate-900 antialiased">
      <header className="border-b border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">
              Workfront Reporting Example
            </h1>
            <p className="text-sm text-slate-600">
              Describe the report you want; the agent updates the report and streams the result.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the report (e.g. issues grouped by project, tasks by status)"
              disabled={loading}
              className="min-w-[16rem] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Generating…" : "Generate report"}
            </button>
          </form>
          {displayError && (
            <p className="text-sm text-red-700">{displayError}</p>
          )}
        </div>
      </header>
      {chat.messages?.length > 0 ? (
        <div className="mx-auto max-w-7xl border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
          <div className="flex flex-col gap-2">
            {chat.messages.map((message) => (
              <div
                key={message.id}
                className={`text-sm ${message.role === "user" ? "text-slate-700" : "text-slate-600"}`}
              >
                <span className="font-medium">{message.role === "user" ? "You: " : "Assistant: "}</span>
                {message.parts?.length
                  ? message.parts.map((part, i) =>
                      part.type === "text" ? part.text : null
                    ).filter(Boolean).join("")
                  : message.content ?? ""}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <ReportRenderer
            spec={specWithCustomFieldLabel(spec, customFieldLabel)}
            dataProvider={dataProvider}
            registry={defaultRegistry}
          />
        </div>
      </main>
    </div>
  );
}
