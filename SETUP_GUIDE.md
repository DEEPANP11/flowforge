# Nhost Setup Guide

## Step 1: Create nhost Project

1. Go to https://app.nhost.io
2. Sign up / Log in
3. Click "New Project"
4. Enter project details:
   - Name: ai-workflow-builder
   - Region: eu-central-1 (or closest)
   - Plan: Free
5. Wait for project to be created (2-3 minutes)

## Step 2: Enable Services

In your nhost dashboard, ensure these are enabled:
- Hasura (GraphQL)
- Auth (Authentication)
- Storage (Files)
- Functions (Serverless)

## Step 3: Get Credentials

Go to Settings → General and copy:
- Subdomain: _______________
- Region: _______________

Go to Settings → Hasura and copy:
- Admin Secret: _______________

## Step 4: Configure Environment

Edit frontend/.env.local with your credentials:

NEXT_PUBLIC_NHOST_SUBDOMAIN=your-subdomain
NEXT_PUBLIC_NHOST_REGION=eu-central-1
NHOST_SUBDOMAIN=your-subdomain
NHOST_REGION=eu-central-1
HASURA_ADMIN_SECRET=your-admin-secret
HASURA_GRAPHQL_URL=https://your-subdomain.eu-central-1.nhost.app/v1/graphql

## Step 5: Run Database Migration

1. Go to Hasura Console (click "Hasura" in nhost dashboard)
2. Click "Data" tab
3. Click "SQL" tab
4. Paste contents of database/migrations/001_initial_schema.sql
5. Click "Run"

## Step 6: Track Tables

In Hasura Console → Data → Schema:
1. Click "Track all" or track each table manually:
   - organizations
   - org_members
   - workflows
   - workflow_steps
   - workflow_triggers
   - workflow_runs
   - step_runs
   - execution_logs
   - workflow_variables
   - api_credentials
   - job_queue

## Step 7: Create Permissions

For each table, create permissions for "user" role:

### organizations
- Select: org_members check (user belongs to org)
- Insert: No (created by system)
- Update: owner only
- Delete: owner only

### workflows
- Select: org_members check
- Insert: owner, editor
- Update: owner, editor
- Delete: owner only

### workflow_steps
- Select: org_members check (via workflow.org_id)
- Insert: owner, editor
- Update: owner, editor
- Delete: owner

(Continue for other tables...)

## Step 8: Deploy Functions

Option A: Using nhost CLI
```bash
npm install -g nhost-cli
cd backend
nhost deploy
```

Option B: Manual upload
- Go to Functions in nhost dashboard
- Create each function manually

## Step 9: Setup Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your credentials
npm run dev
```

## Step 10: Test

1. Open http://localhost:3000
2. Sign up for a new account
3. Create a workflow
4. Add steps
5. Run the workflow
6. Test approval gate
