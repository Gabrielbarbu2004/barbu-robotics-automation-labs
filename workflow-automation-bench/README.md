# Workflow Automation Bench

An independent Barbu Robotics portfolio demonstration of deterministic service-request routing. It uses explicit keyword rules, not an LLM. All supplied sample data is fictional. This is not a claim of client delivery or measured business savings.

## Run

Serve this folder using any static web server, then open `index.html` over HTTP. No build step, package install, external APIs or dependencies are required. ES modules may be restricted when opening the page directly with `file://`.

For example, with Python installed:

```sh
python -m http.server 8080
```

Open `http://localhost:8080/`. The hosted integration path is `/demos/workflow-automation-bench/index.html`.

## Use

1. The fictional sample is validated on startup. Paste your own fictional CSV, choose a CSV file or reload the sample, then select **Validate CSV**.
2. Select **Classify current batch** to apply the displayed rules.
3. Read each item in the approval queue, choose its destination, then select **Approve routing**.
4. Select **Simulate processing**. Only requests that are ready will record a simulated dispatch.
5. Repeat processing or reimport the same request IDs to see replay protection. Export the routing results and full session audit trail as CSV.

Required columns: `request_id,customer,email,subject,description`. Optional `priority` accepts `low`, `normal`, `high` or `urgent`, and defaults to `normal`. Headers are case-insensitive. IDs accept 1–64 letters, numbers, dots, dashes and underscores. Empty required values, invalid email shapes, invalid priorities and inconsistent field counts are quarantined. The browser limits imports to 250 KB.

The CSV parser supports quoted commas, escaped double quotes, quoted multiline fields, CRLF/LF line endings and UTF-8 BOMs. Malformed CSV quoting rejects the import and leaves the previous batch intact. Duplicate IDs are case-insensitive. Identical duplicates are skipped; conflicting duplicate IDs block all versions from dispatch.

## Routing and safety boundaries

Single-category whole-word matches route to billing, support or operations. Multiple matches, no matches, urgent priority and sensitive keywords go to human review. Rules inspect the subject and description; they do not infer intent or understand language beyond the listed keywords. High priority alone does not force human review. No request in review can execute until the operator explicitly chooses a route and approves it.

Execution IDs combine the rule version, action and normalized request ID. One simulated dispatch is recorded per execution ID, even if a later import changes the route. The ledger is retained across imports in the same tab and clears on page reload. This is **session-scoped replay protection**, not a durable production idempotency store. A real service would require persistent storage, authenticated approvals, access controls, retention policies, service-specific retry behavior and transactional execution boundaries.

No email is sent and no external service is called. Data is held in tab memory; the demo does not use cookies, local storage, analytics or network uploads. CSV exports are user-triggered downloads. Potential spreadsheet formula prefixes are neutralized. Rendered user content uses `textContent` rather than HTML injection.

## Metrics and audit

All metrics are computed from the current import, except session executions, which count unique dispatches across imports. The default sample has 8 input rows, 6 valid unique IDs, 1 invalid row, 1 duplicate and 3 requests requiring review. It permits 3 immediate simulated dispatches. These are demonstration counts, not business performance claims.

The audit records imports, validation failures, duplicate detection, classification, human approval, simulated dispatch and skipped replays with timestamps and stable execution IDs. The screen shows the latest 30 events; the audit CSV includes the complete tab session.

## Test

Requires a Node.js version with the built-in test runner:

```sh
node --test engine.test.mjs
```

Tests cover CSV edge cases, malformed inputs, validation, exact/conflicting duplicates, routing, approvals, repeat runs, reimports, failed import recovery, sample metrics, audit outputs and safe CSV export.

## Files

- `index.html`: accessible responsive interface and project explanation.
- `styles.css`: dark navy and lime visual design.
- `app.mjs`: browser event handling, rendering and downloads.
- `engine.mjs`: CSV parser, validation, rules, approval state, execution ledger and exports.
- `engine.test.mjs`: dependency-free Node tests.

The files can be published as a standalone static project or included in a larger Barbu Robotics site.
