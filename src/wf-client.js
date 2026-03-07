/**
 * Workfront API client. Uses WF_BASE_URL and WF_API_KEY from process.env.
 * All requests include the API key (query param) and return parsed JSON.
 */

const baseUrl = () => {
  const url = process.env.WF_BASE_URL;
  if (!url) throw new Error("WF_BASE_URL is required");
  return url.replace(/\/$/, "");
};

const apiKey = () => {
  const key = process.env.WF_API_KEY;
  if (!key) throw new Error("WF_API_KEY is required");
  return key;
};

/**
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path - e.g. "/tasks" or "/search" (no leading slash required)
 * @param {Record<string, string|number|undefined>} [queryParams]
 * @returns {Promise<unknown>} Parsed JSON response (often { data: ... })
 */
export async function request(method, path, queryParams = {}) {
  const base = baseUrl();
  const pathPart = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${base}/${pathPart}`);
  url.searchParams.set("apiKey", apiKey());
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { method });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Workfront API ${res.status}: ${text || res.statusText}`);
  }
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("<") || trimmed.toLowerCase().startsWith("<!doctype")) {
    throw new Error(
      `Workfront API returned HTML instead of JSON. The URL may be wrong. ` +
        `Requested: ${url.origin}${url.pathname}. ` +
        `Check WF_BASE_URL: some instances use .../attask/api/v11.0/ (object names are singular, e.g. "task" not "tasks").`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Workfront API invalid JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * GET request to a path with optional query params.
 * @param {string} path
 * @param {Record<string, string|number|undefined>} [queryParams]
 */
export async function get(path, queryParams = {}) {
  return request("GET", path, queryParams);
}

/**
 * GET a single task by ID with optional field set. Used to enrich task/search
 * results with custom form data (e.g. parameterValues) when not requested in search.
 * @param {string} taskId - Workfront task ID
 * @param {string} [fields] - Comma-separated fields (e.g. "parameterValues" or "parameterValues:*")
 * @returns {Promise<unknown>} API response (often { data: { ... } })
 */
export async function getTask(taskId, fields) {
  const path = `task/${taskId}`;
  const queryParams = fields ? { fields } : {};
  return get(path, queryParams);
}

/**
 * GET a single issue (optask) by ID with optional field set. Used to enrich
 * optask/search results with custom form data (e.g. parameterValues).
 * @param {string} optaskId - Workfront optask/issue ID
 * @param {string} [fields] - Comma-separated fields (e.g. "parameterValues")
 * @returns {Promise<unknown>} API response (often { data: { ... } })
 */
export async function getOptask(optaskId, fields) {
  const path = `optask/${optaskId}`;
  const queryParams = fields ? { fields } : {};
  return get(path, queryParams);
}
