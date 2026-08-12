-- AI Agent Workflow Builder - Complete Database Schema
-- Migration 001: Initial Schema

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Workflow status enum
CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- Workflow run status enum
CREATE TYPE workflow_run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');

-- Step run status enum
CREATE TYPE step_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'awaiting_approval', 'skipped', 'cancelled');

-- Step type enum
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');

-- Trigger type enum
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');

-- Org role enum
CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- 1. Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quota_limit INTEGER NOT NULL DEFAULT 1000,
    quota_used INTEGER NOT NULL DEFAULT 0,
    quota_period TEXT NOT NULL DEFAULT 'monthly' CHECK (quota_period IN ('daily', 'weekly', 'monthly')),
    quota_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 2. Organization Members
CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, org_id)
);

-- 3. Workflows
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status workflow_status NOT NULL DEFAULT 'draft',
    current_version INTEGER NOT NULL DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 4. Workflow Steps
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    step_type step_type NOT NULL,
    name TEXT NOT NULL,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    config JSONB NOT NULL DEFAULT '{}',
    timeout_seconds INTEGER NOT NULL DEFAULT 30,
    retry_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workflow_id, order_index)
);

-- 5. Workflow Triggers
CREATE TABLE workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    trigger_type trigger_type NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Workflow Runs
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    workflow_version INTEGER NOT NULL DEFAULT 1,
    status workflow_run_status NOT NULL DEFAULT 'pending',
    current_step_index INTEGER NOT NULL DEFAULT 0,
    execution_state JSONB NOT NULL DEFAULT '{}',
    trigger_type TEXT,
    trigger_data JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Step Runs
CREATE TABLE step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    step_type step_type NOT NULL,
    order_index INTEGER NOT NULL,
    status step_run_status NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Execution Logs (Audit Trail)
CREATE TABLE execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
    step_run_id UUID REFERENCES step_runs(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_data JSONB,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Workflow Variables
CREATE TABLE workflow_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    variable_name TEXT NOT NULL,
    default_value JSONB,
    is_secret BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workflow_id, variable_name)
);

-- 10. API Credentials
CREATE TABLE api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    credential_type TEXT NOT NULL CHECK (credential_type IN ('api_key', 'oauth', 'webhook_url')),
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Job Queue (for background execution)
CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    next_retry_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Organizations
CREATE INDEX idx_organizations_name ON organizations(name) WHERE deleted_at IS NULL;

-- Org Members
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);

-- Workflows
CREATE INDEX idx_workflows_org_id ON workflows(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_status ON workflows(status) WHERE deleted_at IS NULL;

-- Workflow Steps
CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_order ON workflow_steps(workflow_id, order_index);

-- Workflow Triggers
CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);

-- Workflow Runs
CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at DESC);

-- Step Runs
CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_status ON step_runs(status);
CREATE INDEX idx_step_runs_order ON step_runs(workflow_run_id, order_index);

-- Execution Logs
CREATE INDEX idx_execution_logs_workflow_run_id ON execution_logs(workflow_run_id);
CREATE INDEX idx_execution_logs_created_at ON execution_logs(created_at DESC);

-- Job Queue
CREATE INDEX idx_job_queue_status_priority ON job_queue(status, priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_job_queue_next_retry ON job_queue(next_retry_at) WHERE status = 'failed';

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_steps_updated_at BEFORE UPDATE ON workflow_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_triggers_updated_at BEFORE UPDATE ON workflow_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_credentials_updated_at BEFORE UPDATE ON api_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate quota reset time
CREATE OR REPLACE FUNCTION calculate_quota_reset(period TEXT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN CASE period
        WHEN 'daily' THEN date_trunc('day', now() + INTERVAL '1 day')
        WHEN 'weekly' THEN date_trunc('week', now() + INTERVAL '1 week')
        WHEN 'monthly' THEN date_trunc('month', now() + INTERVAL '1 month')
        ELSE date_trunc('month', now() + INTERVAL '1 month')
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for org usage statistics
CREATE VIEW org_usage_stats AS
SELECT 
    o.id as org_id,
    o.name as org_name,
    o.quota_limit,
    o.quota_used,
    o.quota_period,
    CASE 
        WHEN o.quota_limit > 0 THEN ROUND((o.quota_used::DECIMAL / o.quota_limit) * 100, 2)
        ELSE 0
    END as usage_percentage,
    COUNT(DISTINCT w.id) as total_workflows,
    COUNT(DISTINCT wr.id) as total_runs,
    COUNT(DISTINCT CASE WHEN wr.status = 'completed' THEN wr.id END) as successful_runs,
    COUNT(DISTINCT CASE WHEN wr.status = 'failed' THEN wr.id END) as failed_runs
FROM organizations o
LEFT JOIN workflows w ON w.org_id = o.id AND w.deleted_at IS NULL
LEFT JOIN workflow_runs wr ON wr.workflow_id = w.id
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.name, o.quota_limit, o.quota_used, o.quota_period;

-- View for workflow run statistics
CREATE VIEW workflow_run_stats AS
SELECT 
    wr.id as run_id,
    wr.workflow_id,
    w.name as workflow_name,
    wr.status,
    wr.started_at,
    wr.completed_at,
    CASE 
        WHEN wr.completed_at IS NOT NULL AND wr.started_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
        ELSE NULL
    END as duration_seconds,
    COUNT(DISTINCT sr.id) as total_steps,
    COUNT(DISTINCT CASE WHEN sr.status = 'completed' THEN sr.id END) as completed_steps,
    COUNT(DISTINCT CASE WHEN sr.status = 'failed' THEN sr.id END) as failed_steps
FROM workflow_runs wr
JOIN workflows w ON w.id = wr.workflow_id
LEFT JOIN step_runs sr ON sr.workflow_run_id = wr.id
GROUP BY wr.id, wr.workflow_id, w.name, wr.status, wr.started_at, wr.completed_at;

-- ============================================================================
-- SEED DATA (for testing)
-- ============================================================================

-- Insert a test organization
INSERT INTO organizations (id, name, quota_limit, quota_used, quota_period)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Test Organization', 1000, 0, 'monthly');

-- Note: Users will be created via Nhost Auth, and org_members will be linked via application code
