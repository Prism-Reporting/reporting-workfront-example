/**
 * Tests for Workfront API integration: client and data provider with mocked fetch.
 * Run: npm test
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

let fetchCalls = [];
let fetchMock = null;

beforeEach(() => {
  process.env.WF_BASE_URL = "https://test.workfront.com/attask/api/v11.0";
  process.env.WF_API_KEY = "test-api-key";
  fetchCalls = [];
  fetchMock = (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });
  };
  globalThis.fetch = fetchMock;
});

describe("wf-client", () => {
  it("builds URL with base and apiKey query param", async () => {
    const { get } = await import("../src/wf-client.js");
    await get("task", { limit: 5 });

    assert.strictEqual(fetchCalls.length, 1);
    const url = fetchCalls[0].url;
    assert.ok(url.includes("https://test.workfront.com/attask/api/v11.0/task"));
    assert.ok(url.includes("apiKey=test-api-key"));
    assert.ok(url.includes("limit=5"));
  });

  it("returns parsed JSON when API returns valid JSON", async () => {
    const body = { data: [{ id: "1", name: "Task One", status: "NEW" }] };
    globalThis.fetch = (url) => {
      fetchCalls.push({ url });
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    };

    const { get } = await import("../src/wf-client.js");
    const result = await get("task");

    assert.deepStrictEqual(result, body);
  });

  it("throws clear error when API returns HTML", async () => {
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve("<!doctype html><html><body>Login</body></html>"),
      });

    const { get } = await import("../src/wf-client.js");
    await assert.rejects(
      () => get("task"),
      (err) => {
        assert.ok(err.message.includes("returned HTML instead of JSON"));
        assert.ok(err.message.includes("Requested:"));
        return true;
      }
    );
  });

  it("throws when response is not ok", async () => {
    globalThis.fetch = () =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

    const { get } = await import("../src/wf-client.js");
    await assert.rejects(
      () => get("task"),
      (err) => {
        assert.ok(err.message.includes("401"));
        return true;
      }
    );
  });
});

describe("data-provider", () => {
  it("returns normalized task rows when API returns task-like data", async () => {
    const apiResponse = {
      data: [
        {
          id: "abc123",
          name: "My Task",
          status: "INP",
          plannedCompletionDate: "2025-03-15",
          assignedTo: { name: "Jane Doe" },
        },
      ],
    };
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiResponse)),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "tasks" });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].name, "My Task");
    assert.strictEqual(rows[0].status, "INP");
    assert.strictEqual(rows[0].assignee, "Jane Doe");
    assert.strictEqual(rows[0].dueDate, "2025-03-15");
  });

  it("filters by status when params.status is provided", async () => {
    const apiResponse = {
      data: [
        { id: "1", name: "A", status: "NEW" },
        { id: "2", name: "B", status: "CPL" },
      ],
    };
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiResponse)),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "tasks", params: { status: "CPL" } });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "CPL");
  });

  it("returns empty array for unknown query name", async () => {
    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "other" });
    assert.strictEqual(fetchCalls.length, 0);
    assert.deepStrictEqual(rows, []);
  });

  it("does not send tasksFrom/tasksTo to API (unsupported by Workfront Task)", async () => {
    globalThis.fetch = (url) => {
      fetchCalls.push({ url });
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: [{ name: "T1", status: "NEW", plannedCompletionDate: "2025-06-01" }] })),
      });
    };
    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider({ page: 1, pageSize: 20 });
    await provider.runQuery({
      name: "tasks",
      params: { tasksFrom: "2025-01-01", tasksTo: "2025-12-31" },
    });
    assert.strictEqual(fetchCalls.length, 1);
    const url = fetchCalls[0].url;
    assert.ok(!url.includes("tasksFrom"), "API does not support tasksFrom");
    assert.ok(!url.includes("tasksTo"), "API does not support tasksTo");
  });
});
