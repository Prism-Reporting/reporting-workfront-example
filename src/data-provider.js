import { get } from "./wf-client.js";

/**
 * Normalize Workfront task-like object to the shape expected by our ReportSpec
 * (name, status, assignee, dueDate). WF may use plannedCompletionDate, assignedTo, etc.
 */
function mapTaskToRow(item) {
  if (!item || typeof item !== "object") return null;
  const raw = item;
  const assignee =
    raw.assignedTo?.name ??
    raw.assignedToName ??
    raw.assignee ??
    (raw.assignedToID ? String(raw.assignedToID) : "");
  const dueDate =
    raw.plannedCompletionDate ??
    raw.expectedCompletionDate ??
    raw.dueDate ??
    "";
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? raw.taskName ?? "",
    status: raw.status ?? raw.statusLabel ?? raw.state ?? "",
    assignee: typeof assignee === "string" ? assignee : String(assignee ?? ""),
    dueDate: dueDate ? String(dueDate).slice(0, 10) : "",
  };
}

/**
 * Extract array from WF API response (often { data: [...] } or { result: [...] }).
 */
function toArray(response) {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") {
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.result)) return response.result;
    if (Array.isArray(response.tasks)) return response.tasks;
  }
  return [];
}

/**
 * DataProvider that maps runQuery(name, params) to Workfront API calls.
 * Supports pagination (page, pageSize) and status filter.
 * @param {{ page?: number, pageSize?: number }} [opts] - Pagination: page (1-based), pageSize. Applied per request.
 */
export function createWfDataProvider(opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));

  return {
    async runQuery({ name, params = {} }) {
      if (name === "tasks") {
        // Workfront attask API: task/search. Only pass params the API supports (see verify-api.js).
        // V15_0 Task does NOT support tasksFrom, tasksTo, or status – filter client-side only.
        const first = (page - 1) * pageSize;
        const hasFilter = params.status || params.tasksFrom || params.tasksTo;
        const apiParams = hasFilter
          ? {}
          : { $$FIRST: first, $$LIMIT: pageSize };
        let response;
        let usedFallback = false;
        try {
          response = await get("task/search", apiParams);
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            response = await get("task/search", {});
            usedFallback = true;
          } else {
            throw e;
          }
        }
        let rows = toArray(response).map(mapTaskToRow).filter(Boolean);
        if (params.status) {
          rows = rows.filter((r) => String(r.status) === String(params.status));
        }
        if (params.tasksFrom) {
          rows = rows.filter((r) => r.dueDate >= String(params.tasksFrom));
        }
        if (params.tasksTo) {
          rows = rows.filter((r) => r.dueDate <= String(params.tasksTo));
        }
        if (hasFilter || usedFallback) {
          rows = rows.slice(first, first + pageSize);
        }
        return rows;
      }
      return [];
    },
  };
}
