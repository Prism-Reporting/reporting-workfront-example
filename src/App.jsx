import { useMemo } from "react";
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
  return (
    <ReportRenderer
      spec={tasksByStatusSpec}
      dataProvider={dataProvider}
      registry={defaultRegistry}
    />
  );
}
