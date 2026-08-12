# FlowForge — Architecture Write-Up

## Schema Design

The data model follows a hierarchical structure: **Organization → Workflows → Steps/Triggers → Runs → Step Runs**. This mirrors real-world workflow platforms where multi-tenancy is fundamental.

**Key decisions:**
- `organizations` stores quota state (`quota_limit`, `quota_used`, `quota_period`) directly rather than in a separate table, simplifying atomic increments during execution.
- `workflow_steps.config` is JSONB, allowing each step type to define its own schema (LLM prompts, HTTP endpoints, condition expressions) without schema changes.
- `step_runs` tracks `attempt_count` and `max_attempts` to support retry logic, plus `approved_by`/`approved_at` for audit trails on approval gates.
- `workflow_runs.execution_state` stores arbitrary context passed between steps via template variables like `{{step_0.output.result}}`.
- Soft deletes (`deleted_at`) on organizations and workflows preserve data for audit while hiding from UI.

## Two Permission Layers

**Layer 1 — Org + Role Scoping (Hasura Permissions):** Every table's `select_permissions` filters rows through `org_members.user_id = X-Hasura-User-Id`. This means a viewer in Org A physically cannot see Org B's workflows, even by guessing IDs — the database engine enforces isolation before GraphQL resolves. Roles are checked at the mutation level: `owner` and `editor` can insert/update workflows; `viewer` is read-only.

**Layer 2 — Step-Level Gating (Action Handler):** Certain step types (`db_write`, `notify`, webhook triggers) can modify external state and require elevated privileges. The `triggerWorkflowRun` Action handler checks each step's type against the caller's role — only `owner` can add `db_write` or `notify` steps. This can't be a database permission alone because it's a runtime check during execution, not a row-level policy. The `approveStep` Action similarly verifies the approver is `owner` or `editor` before resuming a paused run.

## Approval Gate Pause/Resume

When the executor hits an `approval_gate` step:
1. The step's `ApprovalExecutor` returns `{ paused: true, required_role, message }`.
2. `workflowExecutor.ts` sets the step_run to `awaiting_approval`, the workflow_run to `paused`, and **returns immediately** — no further steps execute.
3. The frontend subscription detects the status change and renders Approve/Reject buttons.
4. On approve, the `approveStep` Action verifies the approver's role, then calls `resumeWorkflow()` which reloads the run from `current_step_index` and continues execution from where it stopped.
5. On reject, the run is marked `failed` and execution halts permanently.

## Execution Engine

The executor runs steps in a `while` loop with `currentIndex`. After each step completes:
- If the step is `conditional_branch`, `currentIndex` is set to `output.next_step_index` (branching).
- If the step is `approval_gate` and pauses, execution returns.
- Otherwise, `currentIndex++` advances linearly.

Each step runs through `executeWithRetry()` with exponential backoff. LLM calls hit Groq's API; HTTP requests go through SSRF validation; DB writes insert into whitelisted tables; notifications use Web3Forms (email) and corsproxy.io (Slack).

## Deployment

- Frontend: Next.js static export on Vercel
- Backend: Nhost Functions (triggerWorkflowRun, approveStep, webhookTrigger)
- Database: PostgreSQL with Hasura GraphQL Engine
- Auth: Nhost Auth (email/password)
- Subscriptions: WebSocket connections to Hasura for real-time step status
