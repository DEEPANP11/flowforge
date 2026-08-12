# Hasura Permissions Setup Guide

## How to Set Permissions in Hasura Console

For EACH table, follow these steps:

### 1. Open Hasura Console
- Go to your nhost dashboard
- Click "Hasura" to open the console

### 2. For Each Table
- Go to **Data** → **Table Name**
- Click **Permissions** tab
- Click **Edit** for "user" role

### 3. Permission Rules

## Table: organizations

| Operation | Permission |
|-----------|------------|
| Select | `{"id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid()"}}}` |
| Insert | Allow |
| Update | `{"id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role = 'owner'"}}}` |

## Table: org_members

| Operation | Permission |
|-----------|------------|
| Select | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid()"}}}` |
| Insert | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role = 'owner'"}}}` |
| Update | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role = 'owner'"}}}` |
| Delete | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role = 'owner'"}}}` |

## Table: workflows

| Operation | Permission |
|-----------|------------|
| Select | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid()"}}}` |
| Insert | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role IN ('owner','editor')"}}}` |
| Update | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role IN ('owner','editor')"}}}` |
| Delete | `{"org_id": {"_in": {"query": "SELECT org_id FROM org_members WHERE user_id": "auth.uid() AND role = 'owner'"}}}` |

## Table: workflow_steps

| Operation | Permission |
|-----------|------------|
| Select | `{"workflow_id": {"_in": {"query": "SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id": "auth.uid())"}}}` |
| Insert | Same as Select with role check |
| Update | Same as Select with role check |
| Delete | Same as Select with owner role |

## Table: workflow_runs

| Operation | Permission |
|-----------|------------|
| Select | `{"workflow_id": {"_in": {"query": "SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id": "auth.uid())"}}}` |
| Insert | Same |
| Update | Same |
| Delete | Same |

## Table: step_runs

| Operation | Permission |
|-----------|------------|
| Select | `{"workflow_run_id": {"_in": {"query": "SELECT wr.id FROM workflow_runs wr JOIN workflows w ON w.id = wr.workflow_id WHERE w.org_id IN (SELECT org_id FROM org_members WHERE user_id": "auth.uid())"}}}` |
| Insert | Same |
| Update | Same |
| Delete | Same |

## Quick Setup Using Hasura SQL

Paste this in Hasura SQL editor:

```sql
-- Enable auth.uid() function
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT null::uuid;
$$ LANGUAGE sql STABLE;
```

Then set permissions using the Hasura UI (Data → Table → Permissions).
