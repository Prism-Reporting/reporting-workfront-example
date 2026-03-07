export function getWorkfrontQueryCatalog() {
  return {
    queries: [
      {
        name: "tasks",
        description:
          "List Workfront tasks normalized for reporting. Returns id, name, status, assignee, dueDate, customFields (all custom form DE: values), and customField/customFieldKey (first custom value for default DLS).",
        fields: ["id", "name", "status", "assignee", "dueDate", "customFields", "customField", "customFieldKey"],
        params: ["status", "tasksFrom", "tasksTo", "page", "pageSize"],
        notes:
          "customFields is an object of Workfront custom form values (keys like DE:FieldName). customField is the first value and customFieldKey its key so default report spec can show at least one custom form value. Optional env WF_TASK_CUSTOM_FIELDS can restrict which DE: fields are included (comma-separated). Run scripts/explore/custom-forms-discovery.js to discover DE: keys in your instance.",
      },
      {
        name: "projects",
        description:
          "List Workfront projects. Returns id, name, status, plannedCompletionDate, owner, description.",
        fields: [
          "id",
          "name",
          "status",
          "plannedCompletionDate",
          "owner",
          "description",
        ],
        params: ["status", "plannedFrom", "plannedTo", "page", "pageSize"],
      },
      {
        name: "issues",
        description:
          "List Workfront issues (optasks). Returns id, name, status, statusDisplay, enteredBy, priority, priorityDisplay, referenceNumber, projectId, projectName, customFields, customField, customFieldKey. customField is the most commonly populated DE: value (from scripts/explore/issues-custom-fields-discovery.js or WF_ISSUE_CUSTOM_FIELD).",
        fields: [
          "id",
          "name",
          "status",
          "statusDisplay",
          "enteredBy",
          "priority",
          "priorityDisplay",
          "referenceNumber",
          "projectId",
          "projectName",
          "customFields",
          "customField",
          "customFieldKey",
        ],
        params: ["status", "priority", "page", "pageSize"],
        notes:
          "Run npm run explore:issues-custom to discover the most common issue DE: key and write .wf-discovery.json; the Custom column then shows that field.",
      },
      {
        name: "programs",
        description:
          "List Workfront programs. Returns id, name, description.",
        fields: ["id", "name", "description"],
        params: ["page", "pageSize"],
      },
      {
        name: "portfolios",
        description:
          "List Workfront portfolios. Returns id, name, description.",
        fields: ["id", "name", "description"],
        params: ["page", "pageSize"],
      },
    ],
  };
}
