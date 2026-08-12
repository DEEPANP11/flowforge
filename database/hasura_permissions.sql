-- ============================================================
-- HASURA PERMISSIONS & RELATIONSHIP TRACKING
-- Run this in Hasura Console → Data → SQL tab
-- ============================================================

-- 1. TRACK TABLES (if not already tracked by Hasura)
-- Go to Data tab and manually track these if not tracked:
--   workflows
--   workflow_steps
--   workflow_runs
--   step_runs
--   org_members
--   organizations

-- 2. CREATE HASURA PERMISSIONS FOR USER ROLE

-- Organizations: user can only see orgs they belong to
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'organizations', 'user', 'select', '{"columns": "*", "filter": {"id": {"_in": "(SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid)"}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;

-- Workflows: user can CRUD workflows in their orgs
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'workflows', 'user', 'select', '{"columns": "*", "filter": {"org_id": {"_in": "(SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid)"}}}'),
  ('public', 'workflows', 'user', 'insert', '{"columns": "*", "check": {"org_id": {"_in": "(SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid)"}}}'),
  ('public', 'workflows', 'user', 'update', '{"columns": "*", "filter": {"org_id": {"_in": "(SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid)"}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;

-- Workflow Steps: user can CRUD steps for their workflows
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'workflow_steps', 'user', 'select', '{"columns": "*", "filter": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}'),
  ('public', 'workflow_steps', 'user', 'insert', '{"columns": "*", "check": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}'),
  ('public', 'workflow_steps', 'user', 'update', '{"columns": "*", "filter": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;

-- Workflow Runs: user can see runs for their workflows
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'workflow_runs', 'user', 'select', '{"columns": "*", "filter": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}'),
  ('public', 'workflow_runs', 'user', 'insert', '{"columns": "*", "check": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}'),
  ('public', 'workflow_runs', 'user', 'update', '{"columns": "*", "filter": {"workflow_id": {"_in": "(SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))"}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;

-- Step Runs: user can see step runs for their workflow runs
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'step_runs', 'user', 'select', '{"columns": "*", "filter": {"workflow_run_id": {"_in": "(SELECT id FROM workflow_runs WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))")}}}'),
  ('public', 'step_runs', 'user', 'insert', '{"columns": "*", "check": {"workflow_run_id": {"_in": "(SELECT id FROM workflow_runs WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting(''hasura.user.id'', true)::uuid))")}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;

-- Org Members: user can see their own memberships
INSERT INTO hdb_catalog.hdb_permission_agg(table_schema, table_name, role_name, permission_type, permission_def)
VALUES
  ('public', 'org_members', 'user', 'select', '{"columns": "*", "filter": {"user_id": {"_eq": "current_setting(''hasura.user.id'', true)::uuid"}}}')
ON CONFLICT (table_schema, table_name, role_name, permission_type) DO UPDATE SET permission_def = EXCLUDED.permission_def;
