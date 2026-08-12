# AI Agent Workflow Builder

A mini n8n-style workflow automation platform for chaining AI agent steps, built with nhost, Hasura, PostgreSQL, and Next.js.

## Features

- **Workflow Builder**: Create workflows with multiple step types (LLM, HTTP, DB Write, Notify, Conditional, Approval)
- **Real-time Execution**: Live step-by-step progress via GraphQL subscriptions
- **Permission System**: Two-layer permissions (org-level + step-level gating)
- **Multiple Triggers**: Manual, Webhook, Scheduled, and Database Event triggers
- **Approval Gates**: Pause workflow execution for manual approval

## Tech Stack

- **Frontend**: Next.js + Nhost React SDK
- **Backend**: nhost (PostgreSQL + Hasura + Auth + Functions)
- **API**: GraphQL (Queries, Mutations, Subscriptions)
- **LLM**: Groq API (free tier)

## Project Structure

```
ai-workflow-builder/
├── frontend/                 # Next.js frontend
│   ├── src/
│   │   ├── pages/           # Next.js pages
│   │   ├── components/      # React components
│   │   ├── graphql/         # GraphQL queries/mutations/subscriptions
│   │   └── utils/           # Utility functions
│   └── package.json
├── backend/
│   └── nhost/
│       └── functions/       # Nhost serverless functions
│           ├── triggerWorkflowRun/
│           ├── approveStep/
│           ├── webhookTrigger/
│           └── worker/      # Background job processor
├── database/
│   ├── migrations/          # SQL migrations
│   └── seeds/               # Test data
└── docs/                    # Documentation
```

## Setup Instructions

### Prerequisites

1. Create an nhost project at [app.nhost.io](https://app.nhost.io)
2. Enable Hasura, Auth, Storage, and Functions

### Database Setup

1. Run the migration file in Hasura Console:
   ```sql
   -- Copy contents of database/migrations/001_initial_schema.sql
   ```

2. Track all tables in Hasura Console

3. Set up permissions (see docs/PERMISSIONS.md)

### Backend Setup

1. Install nhost CLI:
   ```bash
   npm install -g nhost-cli
   ```

2. Configure environment variables:
   ```bash
   cp backend/.env.example backend/.env
   # Edit .env with your nhost credentials
   ```

3. Deploy functions:
   ```bash
   cd backend
   nhost deploy
   ```

### Frontend Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your nhost credentials
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

## Step Types

| Type | Description | Permission Required |
|------|-------------|---------------------|
| `llm_call` | Call LLM API (Groq/OpenRouter/Gemini) | Editor+ |
| `http_request` | Generic HTTP requests | Editor+ |
| `db_write` | Write to database | Owner only |
| `notify` | Send notifications (Slack/Email) | Owner only |
| `conditional_branch` | If/else based on previous output | Editor+ |
| `approval_gate` | Pause for manual approval | Editor+ |

## Trigger Types

| Type | Description |
|------|-------------|
| `manual` | User clicks "Run" button |
| `webhook` | External API call |
| `scheduled` | Cron-based scheduling |
| `database_event` | Row change in watched table |

## Permission System

### Layer 1: Org + Role Scoping
- Every query checks `org_members` table
- Users can only access data in their organization
- Roles: `owner`, `editor`, `viewer`

### Layer 2: Step-Level Gating
- Sensitive steps (`db_write`, `notify`) require owner role
- Enforced in Action handlers, not just database policies

## GraphQL Operations

### Queries
- `GetOrgWorkflows` - List workflows for an organization
- `GetWorkflow` - Get single workflow with steps/triggers
- `GetRun` - Get workflow run with step runs
- `GetOrgQuota` - Get organization quota usage

### Mutations
- `CreateWorkflow` - Create new workflow
- `TriggerWorkflowRun` - Start workflow execution
- `ApproveStep` - Approve/reject approval gate

### Subscriptions
- `WatchStepRuns` - Live step progress updates
- `WatchWorkflowRun` - Live run status updates

## Development

### Running Locally

1. Start frontend:
   ```bash
   cd frontend
   npm run dev
   ```

2. Deploy backend functions:
   ```bash
   cd backend
   nhost dev
   ```

### Testing

1. Create test organization and users
2. Build a workflow with multiple step types
3. Trigger workflow manually
4. Test approval gate flow
5. Verify cross-org isolation

## Deployment

1. Deploy frontend to Vercel:
   ```bash
   cd frontend
   vercel deploy
   ```

2. Deploy backend to nhost:
   ```bash
   cd backend
   nhost deploy
   ```

## License

MIT
