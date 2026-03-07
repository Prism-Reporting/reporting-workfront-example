export function getWorkfrontQueryCatalog() {
  return {
    queries: [
      {
        name: "tasks",
        description:
          "List Workfront tasks normalized for reporting. Returns id, name, status, assignee, and dueDate.",
        fields: ["id", "name", "status", "assignee", "dueDate"],
        params: ["status", "tasksFrom", "tasksTo", "page", "pageSize"],
      },
    ],
  };
}
