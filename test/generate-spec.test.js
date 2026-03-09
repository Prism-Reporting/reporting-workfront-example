import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDashboardSpec } from "../src/agent/build-dashboard.js";

describe("buildDashboardSpec", () => {
  it("builds a valid Workfront report through the build_report tool", async () => {
    let capturedContext = null;
    let capturedUrl = null;
    let connectCalls = 0;
    let closeCalls = 0;

    const spec = {
      id: "wf-projects-generated",
      title: "Workfront Projects",
      layout: "singleColumn",
      dataSources: {
        projects: {
          name: "projects",
          query: "projects",
        },
      },
      filters: [],
      widgets: [
        {
          type: "table",
          id: "projects-table",
          title: "Projects",
          dataSource: "projects",
          config: {
            columns: [
              { key: "name", label: "Project" },
              { key: "owner", label: "Owner" },
              { key: "status", label: "Status" },
            ],
          },
        },
      ],
    };

    const fakeMcpServer = {
      async connect() {
        connectCalls += 1;
      },
      async close() {
        closeCalls += 1;
      },
      async listTools() {
        return [];
      },
      async invalidateToolsCache() {},
      async callTool(toolName, args = {}) {
        if (toolName === "validate_report_spec") {
          assert.equal(args.spec.id, "wf-projects-generated");
          return [
            {
              type: "text",
              text: JSON.stringify({ valid: true, diagnostics: [] }),
            },
          ];
        }
        throw new Error(`Unexpected tool: ${toolName}`);
      },
    };

    const result = await buildDashboardSpec(
      { prompt: "show workfront projects" },
      {
        agentModel: {},
        model: "fake-model",
        createReportingMcpServer: (hostContext, mcpUrl) => {
          capturedContext = hostContext;
          capturedUrl = mcpUrl;
          return fakeMcpServer;
        },
        runAgent: async (agent, input, options) => {
          assert.equal(input, "show workfront projects");
          assert.equal(options.maxTurns, 25);

          const buildReportTool = agent.tools.find((candidate) => candidate.name === "build_report");
          assert.ok(buildReportTool);

          return {
            finalOutput: await buildReportTool.invoke(
              {},
              JSON.stringify({ dsl: JSON.stringify(spec) })
            ),
            rawResponses: [{ id: "turn-1" }],
          };
        },
      }
    );

    assert.equal(result.spec.id, "wf-projects-generated");
    assert.equal(result.validationMeta.attempts, 1);
    assert.equal(result.validationMeta.model, "fake-model");
    assert.equal(result.validationMeta.mcpServerUrl, "http://127.0.0.1:3000/api/reporting-mcp");
    assert.equal(result.validationMeta.maxTurns, 25);
    assert.equal(capturedUrl, "http://127.0.0.1:3000/api/reporting-mcp");
    assert.equal(capturedContext.queryCatalog.queries.length, 5);
    assert.deepEqual(
      capturedContext.queryCatalog.queries.map((query) => query.name),
      ["tasks", "projects", "issues", "programs", "portfolios"]
    );
    assert.equal(connectCalls, 1);
    assert.equal(closeCalls, 1);
  });
});
