import { Agent, MCPServerStreamableHttp, run, tool } from "@openai/agents";
import { OpenAIProvider } from "@openai/agents-openai";
import { validateReportSpec } from "@reporting/core";
import { getWorkfrontQueryCatalog } from "../query-catalog.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_AGENT_TURNS = 25;
const REPORTING_HOST_CONTEXT_HEADER = "x-reporting-host-context";

export function serializeReportingHostContext(hostContext) {
  return Buffer.from(JSON.stringify(hostContext), "utf8").toString("base64url");
}

export function extractJsonObject(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Model did not return a valid JSON object");
  }
}

export function formatDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return "No diagnostics provided.";
  }

  return diagnostics
    .map((diagnostic) =>
      [
        `- path: ${diagnostic.path}`,
        `  code: ${diagnostic.code}`,
        `  message: ${diagnostic.message}`,
        diagnostic.suggestion ? `  suggestion: ${diagnostic.suggestion}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
}

function getValidationContext(queryCatalog) {
  return {
    availableQueries: queryCatalog.queries.map((query) => query.name),
    availableFields: Object.fromEntries(
      queryCatalog.queries.map((query) => [query.name, query.fields ?? []])
    ),
  };
}

function parseMcpJsonContent(content, toolName) {
  const textContent = content.find((item) => item.type === "text");
  if (!textContent) {
    throw new Error(`Tool ${toolName} did not return text content`);
  }
  return JSON.parse(textContent.text);
}

async function validateFinalSpec({ mcpServer, queryCatalog, spec }) {
  const validation = parseMcpJsonContent(
    await mcpServer.callTool("validate_report_spec", { spec }),
    "validate_report_spec"
  );

  if (!validation.valid) {
    throw new Error(
      `build_report rejected invalid ReportSpec: ${formatDiagnostics(validation.diagnostics)}`
    );
  }

  const localValidation = validateReportSpec(spec, getValidationContext(queryCatalog));
  if (!localValidation.valid) {
    throw new Error(
      `Spec passed MCP validation but failed local validation: ${localValidation.errors.join("; ")}`
    );
  }

  return validation;
}

export function createReportingMcpServer(hostContext, mcpUrl) {
  return new MCPServerStreamableHttp({
    url: mcpUrl,
    name: "reporting-workfront-mcp",
    requestInit: {
      headers: {
        [REPORTING_HOST_CONTEXT_HEADER]: serializeReportingHostContext(hostContext),
      },
    },
  });
}

export function createBuildReportTool({ mcpServer, queryCatalog, model, mcpUrl }) {
  return tool({
    name: "build_report",
    description:
      "Submit the final Prism Reporting ReportSpec JSON object. Call this only when the spec is complete and valid.",
    parameters: {
      type: "object",
      properties: {
        dsl: {
          type: "string",
          description: "A JSON string containing the final ReportSpec object.",
        },
      },
      required: ["dsl"],
      additionalProperties: false,
    },
    async execute({ dsl }) {
      const spec = extractJsonObject(dsl);
      const validation = await validateFinalSpec({ mcpServer, queryCatalog, spec });

      return JSON.stringify({
        spec,
        validationMeta: {
          model,
          mcpServerUrl: mcpUrl,
          validation,
        },
      });
    },
  });
}

export function createReportingAgent({ model, mcpServer, buildReportTool }) {
  return new Agent({
    name: "Prism Reporting Author",
    instructions: [
      "You are a dashboard authoring agent for Prism Reporting.",
      "Use the reporting MCP tools to inspect the available queries, supported widgets and filters, and example specs before drafting a report.",
      "Do not answer in prose.",
      "When the report is ready, call build_report with the final ReportSpec JSON object.",
      "If build_report rejects the spec, fix the issues and call build_report again.",
      "Prefer the smallest correct spec that satisfies the user request.",
    ].join("\n"),
    model,
    mcpServers: [mcpServer],
    tools: [buildReportTool],
    toolUseBehavior: (_context, toolResults) => {
      const lastResult = toolResults.at(-1);
      if (
        lastResult?.type === "function_output" &&
        lastResult.tool.name === "build_report" &&
        typeof lastResult.output === "string"
      ) {
        try {
          const payload = extractJsonObject(lastResult.output);
          if (payload?.spec && payload?.validationMeta?.validation) {
            return {
              isFinalOutput: true,
              finalOutput: lastResult.output,
            };
          }
        } catch {
          // Let the model inspect the tool output and repair the spec.
        }
      }

      return {
        isFinalOutput: false,
      };
    },
  });
}

export async function buildDashboardSpec({ prompt }, overrides = {}) {
  const trimmedPrompt = prompt?.trim();
  if (!trimmedPrompt) {
    throw new Error("prompt is required");
  }

  const apiKey = overrides.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !overrides.agentModel) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const queryCatalog = overrides.queryCatalog ?? getWorkfrontQueryCatalog();
  const hostContext = overrides.hostContext ?? {
    source: "reporting-workfront-example",
    queryCatalog,
  };
  const modelName = overrides.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const mcpUrl =
    overrides.mcpUrl ??
    process.env.REPORTING_MCP_URL ??
    "http://127.0.0.1:3000/api/reporting-mcp";
  const openaiProvider =
    overrides.openaiProvider ?? new OpenAIProvider({ apiKey });
  const agentModel =
    overrides.agentModel ?? (await openaiProvider.getModel(modelName));
  const createMcpServer =
    overrides.createReportingMcpServer ?? createReportingMcpServer;
  const mcpServer =
    overrides.mcpServer ?? createMcpServer(hostContext, mcpUrl);
  const buildReportTool =
    overrides.buildReportTool ??
    createBuildReportTool({
      mcpServer,
      queryCatalog,
      model: modelName,
      mcpUrl,
    });
  const createAgent =
    overrides.createReportingAgent ?? createReportingAgent;
  const agent =
    overrides.agent ??
    createAgent({
      model: agentModel,
      mcpServer,
      buildReportTool,
    });
  const runAgent = overrides.runAgent ?? run;

  await mcpServer.connect();

  try {
    const result = await runAgent(agent, trimmedPrompt, {
      maxTurns: MAX_AGENT_TURNS,
    });
    const outputText =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);
    const payload = extractJsonObject(outputText);

    if (!payload?.spec || !payload?.validationMeta?.validation) {
      throw new Error("Agent did not finish by calling build_report");
    }

    return {
      spec: payload.spec,
      validationMeta: {
        ...payload.validationMeta,
        attempts: Array.isArray(result.rawResponses) ? result.rawResponses.length : undefined,
        maxTurns: MAX_AGENT_TURNS,
      },
    };
  } finally {
    await mcpServer.close();
    if (!overrides.openaiProvider && !overrides.agentModel) {
      await openaiProvider.close().catch(() => undefined);
    }
  }
}
