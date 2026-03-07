/**
 * Data-provider tests: reliability (runQuery returns arrays, pagination, filters)
 * and human-readable output (rows have string/number values, no raw objects).
 * Uses mocked fetch; no real Workfront API. Run: npm test
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

let fetchCalls = [];

beforeEach(() => {
  process.env.WF_BASE_URL = "https://test.workfront.com/attask/api/v11.0";
  process.env.WF_API_KEY = "test-api-key";
  fetchCalls = [];
  globalThis.fetch = (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });
  };
});

describe("data-provider reliability", () => {
  it("runQuery('tasks', {}) returns an array and does not throw when backend responds correctly", async () => {
    const apiResponse = { data: [{ id: "1", name: "T1", status: "NEW" }] };
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiResponse)),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert(Array.isArray(rows), "runQuery must return an array");
    assert.strictEqual(rows.length, 1);
    assert.doesNotThrow(() => {});
  });

  it("runQuery('tasks', {}) returns empty array when API returns no data", async () => {
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: [] })),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert(Array.isArray(rows));
    assert.strictEqual(rows.length, 0);
  });

  it("runQuery with invalid/unknown name returns empty array", async () => {
    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();

    const rows = await provider.runQuery({ name: "invalidQueryName", params: {} });

    assert.strictEqual(fetchCalls.length, 0, "API should not be called for unknown query");
    assert(Array.isArray(rows));
    assert.deepStrictEqual(rows, []);
  });

  it("pagination: runQuery with page and pageSize returns at most pageSize items (no filter)", async () => {
    const pageSize = 10;
    const page = 2;
    const first = (page - 1) * pageSize; // 10
    const mockItems = Array.from({ length: pageSize }, (_, i) => ({
      id: `id-${first + i}`,
      name: `Task ${first + i}`,
      status: "NEW",
    }));
    globalThis.fetch = (url) => {
      fetchCalls.push({ url });
      return Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(JSON.stringify({ data: mockItems })),
      });
    };

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider({ page, pageSize });
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert.strictEqual(rows.length, pageSize);
    assert.strictEqual(rows.length, 10);
    const url = fetchCalls[0].url;
    assert.ok(
      url.includes("FIRST=10") || url.includes("%24%24FIRST=10"),
      "API should receive $$FIRST for pagination"
    );
    assert.ok(
      url.includes("LIMIT=10") || url.includes("%24%24LIMIT=10"),
      "API should receive $$LIMIT for pagination"
    );
  });

  it("pagination with filter: client-side slice returns at most pageSize items", async () => {
    const pageSize = 5;
    const page = 2;
    const first = (page - 1) * pageSize; // 5
    const mockItems = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      name: `Task ${i}`,
      status: i % 2 === 0 ? "NEW" : "CPL",
      plannedCompletionDate: "2025-06-15",
    }));
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: mockItems })),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider({ page, pageSize });
    const rows = await provider.runQuery({
      name: "tasks",
      params: { status: "NEW" },
    });

    assert(rows.length <= pageSize, "should return at most pageSize items");
    assert.strictEqual(rows.length, 5);
    rows.forEach((r) => assert.strictEqual(r.status, "NEW"));
  });

  it("filters tasksFrom and tasksTo are applied correctly", async () => {
    const apiResponse = {
      data: [
        { id: "1", name: "A", status: "NEW", plannedCompletionDate: "2025-01-15" },
        { id: "2", name: "B", status: "NEW", plannedCompletionDate: "2025-06-15" },
        { id: "3", name: "C", status: "NEW", plannedCompletionDate: "2025-12-31" },
      ],
    };
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiResponse)),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider({ page: 1, pageSize: 20 });
    const rows = await provider.runQuery({
      name: "tasks",
      params: { tasksFrom: "2025-02-01", tasksTo: "2025-11-01" },
    });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].dueDate, "2025-06-15");
  });
});

describe("data-provider human-readable output", () => {
  it("each row has only string or number values suitable for display", async () => {
    const apiResponse = {
      data: [
        {
          id: "abc",
          name: "My Task",
          status: "INP",
          plannedCompletionDate: "2025-03-15T00:00:00.000Z",
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
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert.strictEqual(rows.length, 1);
    const row = rows[0];
    const displayKeys = ["id", "name", "status", "assignee", "dueDate"];
    for (const key of displayKeys) {
      assert(key in row, `row should have ${key}`);
      const val = row[key];
      assert(
        val === undefined || typeof val === "string" || typeof val === "number",
        `${key} should be string or number, got ${typeof val}`
      );
      assert(val !== undefined, `${key} should not be undefined in output`);
    }
    assert.strictEqual(row.assignee, "Jane Doe");
    assert.strictEqual(row.dueDate.slice(0, 10), "2025-03-15");
  });

  it("assignee is a string (name), not a raw object", async () => {
    const apiResponse = {
      data: [
        {
          id: "1",
          name: "T1",
          status: "NEW",
          assignedTo: { name: "Alice", id: "u1" },
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
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert.strictEqual(typeof rows[0].assignee, "string");
    assert.strictEqual(rows[0].assignee, "Alice");
    assert.ok(!String(rows[0].assignee).includes("[object Object]"));
  });

  it("dueDate is a date string (e.g. YYYY-MM-DD)", async () => {
    const apiResponse = {
      data: [
        {
          id: "1",
          name: "T1",
          status: "NEW",
          plannedCompletionDate: "2025-12-25T14:30:00.000Z",
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
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert.strictEqual(typeof rows[0].dueDate, "string");
    assert.match(rows[0].dueDate, /^\d{4}-\d{2}-\d{2}$/, "dueDate should be YYYY-MM-DD");
    assert.strictEqual(rows[0].dueDate, "2025-12-25");
  });

  it("status is a string", async () => {
    const apiResponse = {
      data: [{ id: "1", name: "T1", status: "CPL", statusLabel: "Complete" }],
    };
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiResponse)),
      });

    const { createWfDataProvider } = await import("../src/data-provider.js");
    const provider = createWfDataProvider();
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    assert.strictEqual(typeof rows[0].status, "string");
    assert.strictEqual(rows[0].status, "CPL");
  });

  it("no undefined or [object Object] in row values", async () => {
    const apiResponse = {
      data: [
        {
          id: "1",
          name: "T1",
          status: "NEW",
          assignedTo: null,
          plannedCompletionDate: null,
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
    const rows = await provider.runQuery({ name: "tasks", params: {} });

    const row = rows[0];
    for (const [key, val] of Object.entries(row)) {
      assert(val !== undefined, `row.${key} must not be undefined`);
      // customFields is a documented object of DE: values; allow it. All other values must be displayable (no [object Object]).
      if (key !== "customFields") {
        assert(
          !String(val).includes("[object Object]"),
          `row.${key} must not stringify to [object Object]`
        );
      } else {
        assert(typeof val === "object" && val !== null && !Array.isArray(val), "row.customFields must be a plain object");
      }
    }
    assert.strictEqual(row.assignee, "");
    assert.strictEqual(row.dueDate, "");
    assert.deepStrictEqual(row.customFields, {});
  });
});
