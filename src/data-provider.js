import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { get, getTask, getOptask } from "./wf-client.js";

/** Optional whitelist of DE: custom field names to include in customFields (env: WF_TASK_CUSTOM_FIELDS, comma-separated). If unset, all parameterValues are included. */
const CUSTOM_FIELDS_WHITELIST = (() => {
  const env = process.env.WF_TASK_CUSTOM_FIELDS;
  if (!env || typeof env !== "string") return null;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
})();

const WF_DISCOVERY_PATH = join(process.cwd(), ".wf-discovery.json");

function readWfDiscovery() {
  try {
    if (existsSync(WF_DISCOVERY_PATH)) {
      return JSON.parse(readFileSync(WF_DISCOVERY_PATH, "utf8"));
    }
  } catch {
    // ignore
  }
  return null;
}

/** Preferred DE: key for issue custom column (env WF_ISSUE_CUSTOM_FIELD, or from .wf-discovery.json written by scripts/explore/issues-custom-fields-discovery.js). Exported for server API. */
export function getPreferredIssueCustomFieldKey() {
  const env = process.env.WF_ISSUE_CUSTOM_FIELD;
  if (env && typeof env === "string" && env.trim().startsWith("DE:")) return env.trim();
  const data = readWfDiscovery();
  if (data?.issueDeKeyMostCommon) return data.issueDeKeyMostCommon;
  return null;
}

/** Display name for the preferred issue custom field (from .wf-discovery.json issueDeKeyDisplayName). Exported for server API. */
export function getPreferredIssueCustomFieldLabel() {
  const data = readWfDiscovery();
  if (data?.issueDeKeyDisplayName) return data.issueDeKeyDisplayName;
  return null;
}

const PREFERRED_ISSUE_DE_KEY = getPreferredIssueCustomFieldKey();

/**
 * Build customFields object from Workfront parameterValues (DE: keys).
 * Respects WF_TASK_CUSTOM_FIELDS whitelist when set.
 * @param {Record<string, unknown> | null | undefined} parameterValues
 * @returns {Record<string, unknown>}
 */
function buildCustomFields(parameterValues) {
  const customFields = {};
  if (!parameterValues || typeof parameterValues !== "object" || Array.isArray(parameterValues)) {
    return customFields;
  }
  for (const [key, value] of Object.entries(parameterValues)) {
    if (key.startsWith("DE:") && (CUSTOM_FIELDS_WHITELIST === null || CUSTOM_FIELDS_WHITELIST.includes(key))) {
      customFields[key] = value;
    }
  }
  return customFields;
}

/** Build customFields from issue parameterValues (all DE: keys; no whitelist). */
function buildIssueCustomFields(parameterValues) {
  const customFields = {};
  if (!parameterValues || typeof parameterValues !== "object" || Array.isArray(parameterValues)) {
    return customFields;
  }
  for (const [key, value] of Object.entries(parameterValues)) {
    if (key.startsWith("DE:")) customFields[key] = value;
  }
  return customFields;
}

/**
 * Normalize Workfront task-like object to the shape expected by our ReportSpec
 * (id, name, status, assignee, dueDate) plus customFields from custom form (DE:) values.
 * WF may use plannedCompletionDate, assignedTo, parameterValues, etc.
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
  const customFields = buildCustomFields(raw.parameterValues);
  const customFieldEntries = Object.entries(customFields);
  const firstCustom = customFieldEntries[0];
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? raw.taskName ?? "",
    status: raw.status ?? raw.statusLabel ?? raw.state ?? "",
    assignee: typeof assignee === "string" ? assignee : String(assignee ?? ""),
    dueDate: dueDate ? String(dueDate).slice(0, 10) : "",
    customFields,
    // At least one custom form value for default DLS: first DE: value and its key (for tables without nested key support)
    customField: firstCustom != null ? firstCustom[1] : "",
    customFieldKey: firstCustom != null ? firstCustom[0] : "",
  };
}

/**
 * Normalize Workfront project object to a row. Uses API fields: name, status,
 * plannedCompletionDate, owner (or ownerID), description.
 */
function mapProjectToRow(item) {
  if (!item || typeof item !== "object") return null;
  const raw = item;
  const owner =
    raw.owner?.name ?? raw.ownerName ?? (raw.ownerID ? String(raw.ownerID) : "");
  const plannedCompletion =
    raw.plannedCompletionDate ?? raw.plannedCompletion ?? "";
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? "",
    status: raw.status ?? raw.statusLabel ?? raw.state ?? "",
    plannedCompletionDate: plannedCompletion
      ? String(plannedCompletion).slice(0, 10)
      : "",
    owner: typeof owner === "string" ? owner : String(owner ?? ""),
    description: raw.description ?? "",
  };
}

/** Known Workfront issue status codes -> display name (when API does not return statusLabel). */
const ISSUE_STATUS_DISPLAY = {
  NEW: "New",
  INP: "In Progress",
  CPL: "Complete",
  DED: "Done",
};
/** Known Workfront priority codes -> display name (when API does not return priorityLabel). */
const ISSUE_PRIORITY_DISPLAY = {
  0: "None",
  1: "Low",
  2: "Normal",
  3: "High",
  4: "Urgent",
};

/**
 * Normalize Workfront issue (optask) object to a row. Uses API fields: name,
 * status, enteredBy, priority, referenceNumber, projectID, project:name.
 * Keeps status/priority as codes for filtering; adds statusDisplay/priorityDisplay for table display.
 * Adds customFields and customField/customFieldKey (preferred from WF_ISSUE_CUSTOM_FIELD or .wf-discovery.json, else first).
 */
function mapIssueToRow(item) {
  if (!item || typeof item !== "object") return null;
  const raw = item;
  const enteredBy =
    raw.enteredBy?.name ??
    raw.enteredByName ??
    (raw.enteredByID ? String(raw.enteredByID) : "");
  const projectName =
    raw.project?.name ?? raw.projectName ?? (raw.projectID ? String(raw.projectID) : "");
  const statusCode = raw.status ?? raw.state ?? "";
  const priorityCode = raw.priority;
  const statusDisplay =
    raw.statusLabel ??
    (statusCode && ISSUE_STATUS_DISPLAY[String(statusCode).toUpperCase()]) ??
    statusCode;
  const priorityDisplay =
    raw.priorityLabel ??
    (priorityCode != null && ISSUE_PRIORITY_DISPLAY[Number(priorityCode)] != null
      ? ISSUE_PRIORITY_DISPLAY[Number(priorityCode)]
      : priorityCode != null && priorityCode !== ""
        ? String(priorityCode)
        : "");
  const customFields = buildIssueCustomFields(raw.parameterValues);
  const preferredKey = PREFERRED_ISSUE_DE_KEY && customFields[PREFERRED_ISSUE_DE_KEY] !== undefined ? PREFERRED_ISSUE_DE_KEY : null;
  const firstEntry = Object.entries(customFields)[0];
  const customFieldKey = preferredKey ?? (firstEntry != null ? firstEntry[0] : "");
  const customField = preferredKey ? customFields[preferredKey] : (firstEntry != null ? firstEntry[1] : "");
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? "",
    status: statusCode ? String(statusCode) : "",
    statusDisplay: typeof statusDisplay === "string" ? statusDisplay : String(statusDisplay ?? ""),
    enteredBy: typeof enteredBy === "string" ? enteredBy : String(enteredBy ?? ""),
    priority: priorityCode != null && priorityCode !== "" ? String(priorityCode) : "",
    priorityDisplay: typeof priorityDisplay === "string" ? priorityDisplay : String(priorityDisplay ?? ""),
    referenceNumber: raw.referenceNumber ?? "",
    projectId: raw.projectID != null ? String(raw.projectID) : "",
    projectName: typeof projectName === "string" ? projectName : String(projectName ?? ""),
    customFields,
    customField: customField !== undefined && customField !== null ? String(customField) : "",
    customFieldKey,
  };
}

/**
 * Normalize Workfront program object to a row. Uses API fields: name, description.
 */
function mapProgramToRow(item) {
  if (!item || typeof item !== "object") return null;
  const raw = item;
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
  };
}

/**
 * Normalize Workfront portfolio object to a row. Uses API fields: name, description.
 */
function mapPortfolioToRow(item) {
  if (!item || typeof item !== "object") return null;
  const raw = item;
  return {
    id: raw.id ?? raw.ID ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
  };
}

/**
 * Extract array from WF API response (often { data: [...] } or { result: [...] }).
 * Also handles object-specific keys (tasks, projects, optasks, programs, portfolios).
 */
function toArray(response) {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") {
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.result)) return response.result;
    if (Array.isArray(response.tasks)) return response.tasks;
    if (Array.isArray(response.projects)) return response.projects;
    if (Array.isArray(response.optasks)) return response.optasks;
    if (Array.isArray(response.programs)) return response.programs;
    if (Array.isArray(response.portfolios)) return response.portfolios;
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
        // Workfront attask API: task/search. Request standard fields plus parameterValues (custom form DE: fields).
        // V15_0 Task does NOT support tasksFrom, tasksTo, or status – filter client-side only.
        const first = (page - 1) * pageSize;
        const hasFilter = params.status || params.tasksFrom || params.tasksTo;
        const fieldsParam =
          "ID,name,status,plannedCompletionDate,assignedTo:name,parameterValues";
        const apiParams = {
          fields: fieldsParam,
          ...(hasFilter ? {} : { $$FIRST: first, $$LIMIT: pageSize }),
        };
        let response;
        let usedFallback = false;
        let items = [];
        try {
          response = await get("task/search", apiParams);
          items = toArray(response);
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            // Some API versions may reject fields=parameterValues on search; retry without then enrich per task.
            try {
              response = await get("task/search", hasFilter ? {} : { $$FIRST: first, $$LIMIT: pageSize });
              items = toArray(response);
              usedFallback = true;
            } catch (e2) {
              throw e;
            }
          } else {
            throw e;
          }
        }
        // If we fell back to search without parameterValues, enrich each task with GET task/<id>?fields=parameterValues.
        if (usedFallback && items.length > 0) {
          const enriched = await Promise.all(
            items.map(async (task) => {
              const id = task.ID ?? task.id;
              if (!id) return task;
              try {
                const taskRes = await getTask(id, "parameterValues");
                const data = taskRes?.data ?? taskRes;
                if (data && typeof data === "object" && data.parameterValues) {
                  return { ...task, parameterValues: data.parameterValues };
                }
              } catch {
                // keep task without custom form data
              }
              return task;
            })
          );
          items = enriched;
        }
        let rows = items.map(mapTaskToRow).filter(Boolean);
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

      /** project/search: projects with optional status and planned date range (client-side filtered). */
      if (name === "projects") {
        const first = (page - 1) * pageSize;
        const hasFilter = params.status || params.plannedFrom || params.plannedTo;
        const apiParams = hasFilter
          ? {}
          : { $$FIRST: first, $$LIMIT: pageSize };
        let response;
        let usedFallback = false;
        try {
          response = await get("project/search", apiParams);
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            response = await get("project/search", {});
            usedFallback = true;
          } else {
            throw e;
          }
        }
        let rows = toArray(response).map(mapProjectToRow).filter(Boolean);
        if (params.status) {
          rows = rows.filter((r) => String(r.status) === String(params.status));
        }
        if (params.plannedFrom) {
          rows = rows.filter(
            (r) => r.plannedCompletionDate >= String(params.plannedFrom)
          );
        }
        if (params.plannedTo) {
          rows = rows.filter(
            (r) => r.plannedCompletionDate <= String(params.plannedTo)
          );
        }
        if (hasFilter || usedFallback) {
          rows = rows.slice(first, first + pageSize);
        }
        return rows;
      }

      /** optask/search: issues (optasks) with optional status and priority (client-side filtered). Request projectID, project:name, and parameterValues for custom form. */
      if (name === "issues") {
        const first = (page - 1) * pageSize;
        const hasFilter = params.status || params.priority;
        const fieldsParam =
          "ID,name,status,enteredBy:name,priority,referenceNumber,projectID,project:name,parameterValues";
        const apiParams = {
          fields: fieldsParam,
          ...(hasFilter ? {} : { $$FIRST: first, $$LIMIT: pageSize }),
        };
        let response;
        let usedFallback = false;
        let items = [];
        try {
          response = await get("optask/search", apiParams);
          items = toArray(response);
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            response = await get("optask/search", hasFilter ? {} : { $$FIRST: first, $$LIMIT: pageSize });
            items = toArray(response);
            usedFallback = true;
            for (let i = 0; i < items.length; i++) {
              const id = items[i].ID ?? items[i].id;
              if (!id) continue;
              try {
                const o = await getOptask(id, "parameterValues");
                const data = o?.data ?? o;
                if (data?.parameterValues) items[i].parameterValues = data.parameterValues;
              } catch {
                // keep issue without custom form data
              }
            }
          } else {
            throw e;
          }
        }
        let rows = items.map(mapIssueToRow).filter(Boolean);
        if (params.status) {
          rows = rows.filter((r) => String(r.status) === String(params.status));
        }
        if (params.priority) {
          rows = rows.filter(
            (r) => String(r.priority) === String(params.priority)
          );
        }
        if (hasFilter || usedFallback) {
          rows = rows.slice(first, first + pageSize);
        }
        return rows;
      }

      /** program/search: programs; pagination via $$FIRST/$$LIMIT or client-side slice on 422. */
      if (name === "programs") {
        const first = (page - 1) * pageSize;
        let response;
        let usedFallback = false;
        try {
          response = await get("program/search", {
            $$FIRST: first,
            $$LIMIT: pageSize,
          });
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            response = await get("program/search", {});
            usedFallback = true;
          } else {
            throw e;
          }
        }
        let rows = toArray(response).map(mapProgramToRow).filter(Boolean);
        if (usedFallback) {
          rows = rows.slice(first, first + pageSize);
        }
        return rows;
      }

      /** portfolio/search: portfolios; pagination via $$FIRST/$$LIMIT or client-side slice on 422. */
      if (name === "portfolios") {
        const first = (page - 1) * pageSize;
        let response;
        let usedFallback = false;
        try {
          response = await get("portfolio/search", {
            $$FIRST: first,
            $$LIMIT: pageSize,
          });
        } catch (e) {
          if (String(e.message || "").includes("422")) {
            response = await get("portfolio/search", {});
            usedFallback = true;
          } else {
            throw e;
          }
        }
        let rows = toArray(response).map(mapPortfolioToRow).filter(Boolean);
        if (usedFallback) {
          rows = rows.slice(first, first + pageSize);
        }
        return rows;
      }

      return [];
    },
  };
}
