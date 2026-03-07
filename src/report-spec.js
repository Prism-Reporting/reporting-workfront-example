/**
 * Legacy single-datasource spec: tasks only, with status and date filters.
 * Use this for a minimal "tasks by status" report.
 */
export const tasksOnlySpec = {
  id: "tasks-by-status",
  title: "Tasks by Status",
  layout: "singleColumn",
  dataSources: {
    tasks: { name: "tasks", query: "tasks" },
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
          { key: "customField", label: "Custom" },
        ],
      },
    },
  ],
};

/**
 * Default ReportSpec: complex Workfront reporting across Tasks, Projects, and Issues.
 * Uses two-column layout, multiple data sources, several filters, and table + KPI widgets.
 * Shape aligned with @reporting/core and the WF DataProvider (tasks, projects, issues).
 */
export const tasksByStatusSpec = {
  id: "workfront-overview",
  title: "Workfront Overview",
  layout: "twoColumn",
  dataSources: {
    tasks: {
      name: "tasks",
      query: "tasks",
    },
    projects: {
      name: "projects",
      query: "projects",
    },
    issues: {
      name: "issues",
      query: "issues",
    },
  },
  filters: [
    {
      type: "select",
      id: "taskStatus",
      label: "Task status",
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
      id: "taskDateRange",
      label: "Task due date",
      dataSource: "tasks",
      paramKeyFrom: "tasksFrom",
      paramKeyTo: "tasksTo",
    },
    {
      type: "select",
      id: "projectStatus",
      label: "Project status",
      dataSource: "projects",
      paramKey: "status",
      options: [
        { value: "CUR", label: "Current" },
        { value: "PLN", label: "Planning" },
        { value: "CPL", label: "Complete" },
        { value: "ON_HOLD", label: "On Hold" },
      ],
    },
    {
      type: "dateRange",
      id: "projectPlannedDate",
      label: "Project planned completion",
      dataSource: "projects",
      paramKeyFrom: "plannedFrom",
      paramKeyTo: "plannedTo",
    },
    {
      type: "select",
      id: "issueStatus",
      label: "Issue status",
      dataSource: "issues",
      paramKey: "status",
      options: [
        { value: "NEW", label: "New" },
        { value: "INP", label: "In Progress" },
        { value: "CPL", label: "Complete" },
      ],
    },
    {
      type: "select",
      id: "issuePriority",
      label: "Issue priority",
      dataSource: "issues",
      paramKey: "priority",
      options: [
        { value: "1", label: "Low" },
        { value: "2", label: "Normal" },
        { value: "3", label: "High" },
        { value: "4", label: "Urgent" },
      ],
    },
  ],
  widgets: [
    {
      type: "kpi",
      id: "tasks-kpi",
      title: "Tasks",
      dataSource: "tasks",
      config: {
        valueKey: "_count",
        label: "Total tasks",
        format: "number",
      },
    },
    {
      type: "kpi",
      id: "projects-kpi",
      title: "Projects",
      dataSource: "projects",
      config: {
        valueKey: "_count",
        label: "Total projects",
        format: "number",
      },
    },
    {
      type: "kpi",
      id: "issues-kpi",
      title: "Issues",
      dataSource: "issues",
      config: {
        valueKey: "_count",
        label: "Total issues",
        format: "number",
      },
    },
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
          { key: "dueDate", label: "Due Date", type: "date" },
          { key: "customField", label: "Custom" },
        ],
      },
    },
    {
      type: "table",
      id: "projects-table",
      title: "Projects",
      dataSource: "projects",
      config: {
        columns: [
          { key: "name", label: "Project" },
          { key: "status", label: "Status" },
          { key: "owner", label: "Owner" },
          { key: "plannedCompletionDate", label: "Planned completion", type: "date" },
        ],
      },
    },
    {
      type: "table",
      id: "issues-table",
      title: "Issues",
      dataSource: "issues",
      config: {
        columns: [
          { key: "referenceNumber", label: "Ref" },
          { key: "name", label: "Issue" },
          { key: "statusDisplay", label: "Status" },
          { key: "priorityDisplay", label: "Priority" },
          { key: "enteredBy", label: "Entered by" },
          { key: "customField", label: "Custom" },
        ],
      },
    },
  ],
};

/**
 * Grouping report: issues grouped by project. Uses table groupByKey so the
 * engine groups issue rows by projectName and the UI renders one section per project.
 */
export const issuesByProjectSpec = {
  id: "issues-by-project",
  title: "Issues by Project",
  layout: "singleColumn",
  dataSources: {
    issues: { name: "issues", query: "issues" },
  },
  filters: [
    {
      type: "select",
      id: "issueStatus",
      label: "Issue status",
      dataSource: "issues",
      paramKey: "status",
      options: [
        { value: "NEW", label: "New" },
        { value: "INP", label: "In Progress" },
        { value: "CPL", label: "Complete" },
      ],
    },
    {
      type: "select",
      id: "issuePriority",
      label: "Issue priority",
      dataSource: "issues",
      paramKey: "priority",
      options: [
        { value: "1", label: "Low" },
        { value: "2", label: "Normal" },
        { value: "3", label: "High" },
        { value: "4", label: "Urgent" },
      ],
    },
  ],
  widgets: [
    {
      type: "table",
      id: "issues-by-project-table",
      title: "Issues by Project",
      dataSource: "issues",
      config: {
        groupByKey: "projectName",
        groupLabelKey: "projectName",
        columns: [
          { key: "referenceNumber", label: "Ref" },
          { key: "name", label: "Issue" },
          { key: "statusDisplay", label: "Status" },
          { key: "priorityDisplay", label: "Priority" },
          { key: "enteredBy", label: "Entered by" },
          { key: "customField", label: "Custom" },
        ],
      },
    },
  ],
};
