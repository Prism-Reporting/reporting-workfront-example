# Reporting Workfront integration

This is the advanced real-integration example. If you want the easiest repo to demo or learn the reporting flow without external system knowledge, start with `reporting-portfolio-example` first.

Thin integration that uses [@reporting/core](https://github.com/Prism-Reporting/reporting) and [@reporting/react-ui](https://github.com/Prism-Reporting/reporting) for the report UI, and the Workfront API for data. The app is a React SPA that mounts the shared report renderer; the server exposes the data API and a server-side AI agent endpoint for generating report specs from natural language. A chat in the header lets you describe a report (e.g. "tasks by status with date filter") and render the generated spec.

## Prerequisites

- Node.js >= 18
- Built `@reporting/core` and `@reporting/react-ui`: from the **reporting** repo run `npm run build`, or from this repo run `npm run build` (it builds reporting then the client).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment: create a `.env` file in the project root with:
   ```env
   WF_API_KEY=your_workfront_api_key
   WF_BASE_URL=https://your-instance.workfront.com/api/v1
   ```
   **Custom form fields (tasks):** Task query results include all Workfront custom form (DE:) values under `customFields`. To restrict which custom fields are returned, set optional:
   ```env
   WF_TASK_CUSTOM_FIELDS=DE:CustomText,DE:CustomNumber
   ```
   For the **dashboard-building agent**, add:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   ```
   The agent also starts the local reporting MCP server over stdio. By default it uses:
   ```env
   REPORTING_MCP_SERVER_PATH=../reporting/packages/mcp-server/dist/index.js
   ```
   Override that only if your MCP server build lives somewhere else.
   Do not commit `.env`; it is gitignored.

## Build

Builds the reporting packages (core, react-ui, mcp-server) then the Vite client:

```bash
npm run build
```

## Run

```bash
npm start
```

Then open http://localhost:3000. The server serves the built React app and the data API.

## Development

Two servers (recommended for fast frontend feedback):

- **Backend** (port 3000): `npm run dev:server` — Express with `POST /api/runQuery` and `POST /api/generateSpec` (for MCP-driven dashboard generation).
- **Frontend** (port 5173): `npm run dev:client` — Vite dev server with proxy to the backend for `/api`.

Run both:

```bash
npm run dev
```

Open http://localhost:5173. API requests are proxied to port 3000.

## API

- **POST /api/runQuery** — Body: `{ name: string, params?: Record<string, unknown> }`. The server creates a Workfront `DataProvider` with `page` and `pageSize` taken from `params` (defaults: page 1, pageSize 20), runs the query, and returns the result array as JSON. Used by the React app’s proxy DataProvider.
- **POST /api/generateSpec** — Body: `{ prompt: string }`. Runs a server-side OpenAI agent that reads the reporting MCP resources, drafts a ReportSpec, validates it through MCP, and retries if needed. Returns `{ spec, validationMeta }` or `{ error }`. Used by the in-app chat.

The example models how a customer app can own its own agent while treating the reporting MCP server as the source of truth for DSL guidance and validation.

## Pagination and filtering

- **Status filter**: Use the "Status" dropdown (All, New, In Progress, Complete, Done). The report refetches with the selected status.
- **Date range**: Set "From" / "To" dates to filter by due date.
- **Pagination**: Use "Previous" and "Next" below the report. The client sends `page` and `pageSize` in `params` on each `/api/runQuery` call.

The Workfront API key is only used on the server; it is never sent to the browser.

## Tests

- **Unit tests** (mocked API, no credentials needed): `npm test` — runs all tests in `test/` with `fetch` mocked so the Workfront API is never called. Fast and safe for CI.
- **Integration tests** (real Workfront API): set `RUN_WF_INTEGRATION_TESTS=1` and ensure `.env` has `WF_BASE_URL` and `WF_API_KEY`, then run `RUN_WF_INTEGRATION_TESTS=1 npm run test:integration`. The integration suite is skipped when the env var is not set.
- **Real API connectivity**: `npm run test:api` — uses your `.env` to verify `WF_BASE_URL` and `WF_API_KEY`.

### Manual API exploration

Scripts in `scripts/explore/` are for **manual runs only** (experimentation, discovery). They use your `.env` and are not part of the test suite. Examples:

- `npm run explore:tasks` — fetch a few tasks with `parameterValues` and print DE: custom field keys seen.
- `npm run explore:custom-forms` — try ctgy/report endpoints to list custom forms; infer DE: keys from the first task.

Use these to validate API behaviour or to see which custom forms/fields exist before changing the default DLS. See `scripts/explore/README.md` for details.

## How it works

- **Server**: Express serves static files from `dist/` (the built React app), handles `POST /api/runQuery` by creating a WF DataProvider and returning query results as JSON, and handles `POST /api/generateSpec` by running a server-side OpenAI agent that consumes the reporting MCP server over stdio.
- **Client**: React app that imports `ReportRenderer` and `defaultRegistry` from `@reporting/react-ui`, the report spec from this repo, and a proxy DataProvider that calls `/api/runQuery`. Pagination is a thin wrapper in this app that keeps `page` state and merges it into the query params.
- **Agent**: Reads `report-spec://v1/...` resources from the reporting MCP server, uses a Workfront query catalog for grounding, calls `validate_report_spec`, and repairs invalid drafts before returning the final spec to the UI.

### "Workfront API returned HTML instead of JSON"

The API client returns this when the response is HTML (e.g. a login or 404 page) instead of JSON. Fix it by using the correct API base URL for your instance:

- **Classic Workfront REST API** usually uses the `attask` path and a version number:
  ```env
  WF_BASE_URL=https://your-instance.workfront.com/attask/api/v11.0
  ```
  (Replace `your-instance` with your host and the version with the one your instance supports, e.g. `v11.0` or `v15.0`.)
