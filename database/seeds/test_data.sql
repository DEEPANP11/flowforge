-- AI Agent Workflow Builder - Test Data
-- Run after migrations to populate test data

-- ============================================================================
-- TEST ORGANIZATIONS
-- ============================================================================

-- Organization A (for testing)
INSERT INTO organizations (id, name, quota_limit, quota_used, quota_period)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Acme Corporation', 1000, 0, 'monthly'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'TechStart Inc', 500, 0, 'monthly');

-- Note: Users must be created via Nhost Auth first, then link to org_members
-- Example after auth users exist:
-- INSERT INTO org_members (user_id, org_id, role) VALUES ('<auth-user-id>', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'owner');

-- ============================================================================
-- SAMPLE WORKFLOW (Customer Onboarding)
-- ============================================================================

-- Create a sample workflow
INSERT INTO workflows (id, org_id, name, description, status, created_by)
VALUES (
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Customer Onboarding',
    'Automated onboarding process for new customers',
    'active',
    NULL  -- Will be set when user is created
);

-- Add steps to the workflow
INSERT INTO workflow_steps (workflow_id, step_type, name, order_index, config, timeout_seconds, retry_count)
VALUES 
-- Step 1: Classify Customer with LLM
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'llm_call',
    'Classify Customer',
    0,
    '{
        "provider": "groq",
        "model": "llama-3.1-70b-versatile",
        "prompt": "Classify the following customer as enterprise or smb based on their data: {{previous.output.customer_data}}",
        "temperature": 0.3,
        "max_tokens": 100
    }',
    30,
    2
),
-- Step 2: Conditional Branch
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'conditional_branch',
    'Is Enterprise?',
    1,
    '{
        "condition": {
            "left": "{{previous.output.classification}}",
            "operator": "==",
            "right": "enterprise"
        },
        "true_next_step_index": 2,
        "false_next_step_index": 3
    }',
    10,
    1
),
-- Step 3: HTTP Request (Enterprise path)
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'http_request',
    'Create Enterprise Account',
    2,
    '{
        "method": "POST",
        "url": "https://api.example.com/accounts",
        "headers": {
            "Content-Type": "application/json"
        },
        "body": {
            "type": "enterprise",
            "customer": "{{previous.output.customer_data}}"
        }
    }',
    30,
    2
),
-- Step 4: Notify (SMB path)
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'notify',
    'Notify Sales Team',
    3,
    '{
        "channel": "slack",
        "webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "message_template": "New SMB customer: {{previous.output.customer_data}}"
    }',
    10,
    1
),
-- Step 5: Approval Gate
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'approval_gate',
    'Manager Approval',
    4,
    '{
        "required_role": "owner",
        "message": "Please approve onboarding for this customer",
        "timeout_hours": 24
    }',
    30,
    1
),
-- Step 6: DB Write
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'db_write',
    'Save Onboarding Record',
    5,
    '{
        "table": "onboarding_records",
        "operation": "insert",
        "columns": {
            "customer_data": "{{previous.output.customer_data}}",
            "status": "completed",
            "completed_at": "{{now}}"
        }
    }',
    10,
    1
);

-- Add triggers
INSERT INTO workflow_triggers (workflow_id, trigger_type, config, is_active)
VALUES 
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'manual',
    '{}',
    true
),
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'webhook',
    '{
        "secret": "webhook_secret_123",
        "allowed_ips": []
    }',
    true
);

-- Add workflow variables
INSERT INTO workflow_variables (workflow_id, variable_name, default_value, is_secret)
VALUES 
(
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'customer_data',
    '{"name": "", "email": "", "company": ""}',
    false
);
