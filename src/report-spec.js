/**
 * Hardcoded ReportSpec for the tasks-by-status report.
 * Shape aligned with @reporting/core and the WF DataProvider output (name, status, assignee, dueDate).
 */
export const tasksByStatusSpec = {
  id: "tasks-by-status",
  title: "Tasks by Status",
  layout: "singleColumn",
  dataSources: {
    tasks: {
      name: "tasks",
      query: "tasks",
    },
  },
  filters: [
    {
      type: "select",
      id: "status",
      label: "Status",
      dataSource: "tasks",
      paramKey: "status",
      options: [
        { value: "NEW", label: "New" },
        { value: "INP", label: "In Progress" },
        { value: "CPL", label: "Complete" },
        { value: "DED", label: "Done" },
      ],
    },
    {
      type: "dateRange",
      id: "dateRange",
      label: "Due Date",
      dataSource: "tasks",
      paramKeyFrom: "tasksFrom",
      paramKeyTo: "tasksTo",
    },
  ],
  widgets: [
    {
      type: "table",
      id: "tasks-table",
      title: "Tasks",
      dataSource: "tasks",
      config: {
        columns: [
          { key: "name", label: "Task" },
          { key: "status", label: "Status" },
          { key: "assignee", label: "Assignee" },
          { key: "dueDate", label: "Due Date" },
        ],
      },
    },
  ],
};
