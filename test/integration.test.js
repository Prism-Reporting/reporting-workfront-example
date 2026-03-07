/**
 * Integration tests: hit the real Workfront API.
 * Run only when RUN_WF_INTEGRATION_TESTS=1 and .env has WF_BASE_URL and WF_API_KEY.
 * Usage: RUN_WF_INTEGRATION_TESTS=1 npm run test:integration
 */
import "dotenv/config";
import { describe, it, before } from "node:test";
import assert from "node:assert";

const runIntegration = process.env.RUN_WF_INTEGRATION_TESTS === "1";
const hasEnv =
  process.env.WF_BASE_URL && process.env.WF_API_KEY;

describe("data-provider integration (real Workfront API)", { skip: !runIntegration || !hasEnv }, () => {
  let createWfDataProvider;

  before(async () => {
    const mod = await import("../src/data-provider.js");
    createWfDataProvider = mod.createWfDataProvider;
  });

  it("runQuery('tasks', {}) returns an array and does not throw", async () => {
    const provider = createWfDataProvider({ page: 1, pageSize: 5 });
    const rows = await provider.runQuery({ name: "tasks", params: {} });
    assert(Array.isArray(rows));
    assert(rows.length <= 5);
    rows.forEach((row) => {
      assert(typeof row === "object" && row !== null);
      assert(typeof row.id === "string" || typeof row.id === "number");
      assert(typeof row.name === "string");
      assert(typeof row.status === "string");
      assert(typeof row.assignee === "string");
      assert(typeof row.dueDate === "string");
    });
  });
});
