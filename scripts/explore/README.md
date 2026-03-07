# Manual API exploration scripts

These scripts are **intended to be run manually** for experimentation and discovery. They are not part of the automated test suite.

Use them to:

- Validate API behaviour before coding against it
- Discover which custom forms and DE: fields exist in your Workfront instance
- Try new endpoints or parameters without touching production code

**Requirements:** Copy `.env.example` to `.env`, set `WF_BASE_URL` and `WF_API_KEY`, then run from project root:

```bash
node scripts/explore/<script-name>.js
```

**Scripts:**

- **custom-forms-discovery.js** – Tries `ctgy/search` and samples multiple tasks to collect all DE: custom form keys in your instance. Prints a suggested first key for default DLS or `WF_TASK_CUSTOM_FIELDS`.
- **tasks-with-custom-fields.js** – Fetches tasks with `parameterValues` and prints sample rows and DE: keys. Optional: `LIMIT=10 node scripts/explore/tasks-with-custom-fields.js`.
- **issues-custom-fields-discovery.js** – Fetches issues (optasks) with `parameterValues`, counts how often each DE: key has a value, and picks the most commonly populated field. Writes `.wf-discovery.json` with `issueDeKeyMostCommon` so the issues-by-project report Custom column shows that field. Run before using the app to get a robust default. Optional: `LIMIT=50 node scripts/explore/issues-custom-fields-discovery.js`.

You can also use npm scripts: `npm run explore:custom-forms`, `npm run explore:tasks`, `npm run explore:issues-custom`.
