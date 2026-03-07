# Reporting Workfront integration

Thin integration that uses [@reporting/core](https://github.com/your-org/reporting-2) and [@reporting/react-ui](https://github.com/your-org/reporting-2) for the report UI, and the Workfront API for data. The app is a React SPA that mounts the shared report renderer; the server exposes a single data API and serves the built frontend.

## Prerequisites

- Node.js >= 18
- Built `@reporting/core` and `@reporting/react-ui`: from the **reporting-2** repo run `npm run build`, or from this repo run `npm run build` (it builds reporting-2 then the client).

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
   Do not commit `.env`; it is gitignored.

## Build

Builds the reporting-2 packages (core + react-ui) then the Vite client:

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

- **Backend** (port 3000): `npm run dev:server` — Express with `POST /api/runQuery`.
- **Frontend** (port 5173): `npm run dev:client` — Vite dev server with proxy to the backend for `/api`.

Run both:

```bash
npm run dev
```

Open http://localhost:5173. API requests are proxied to port 3000.

## API

- **POST /api/runQuery** — Body: `{ name: string, params?: Record<string, unknown> }`. The server creates a Workfront `DataProvider` with `page` and `pageSize` taken from `params` (defaults: page 1, pageSize 20), runs the query, and returns the result array as JSON. Used by the React app’s proxy DataProvider.

## Pagination and filtering

- **Status filter**: Use the "Status" dropdown (All, New, In Progress, Complete, Done). The report refetches with the selected status.
- **Date range**: Set "From" / "To" dates to filter by due date.
- **Pagination**: Use "Previous" and "Next" below the report. The client sends `page` and `pageSize` in `params` on each `/api/runQuery` call.

The Workfront API key is only used on the server; it is never sent to the browser.

## Tests

- **Unit tests** (mocked API): `npm test`
- **Real API connectivity**: `npm run test:api` — uses your `.env` to verify `WF_BASE_URL` and `WF_API_KEY`.

## How it works

- **Server**: Express serves static files from `dist/` (the built React app) and handles `POST /api/runQuery` by creating a WF DataProvider and returning query results as JSON.
- **Client**: React app that imports `ReportRenderer` and `defaultRegistry` from `@reporting/react-ui`, the report spec from this repo, and a proxy DataProvider that calls `/api/runQuery`. Pagination is a thin wrapper in this app that keeps `page` state and merges it into the query params.

### "Workfront API returned HTML instead of JSON"

The API client returns this when the response is HTML (e.g. a login or 404 page) instead of JSON. Fix it by using the correct API base URL for your instance:

- **Classic Workfront REST API** usually uses the `attask` path and a version number:
  ```env
  WF_BASE_URL=https://your-instance.workfront.com/attask/api/v11.0
  ```
  (Replace `your-instance` with your host and the version with the one your instance supports, e.g. `v11.0` or `v15.0`.)
