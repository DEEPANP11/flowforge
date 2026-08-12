// GraphQL Queries

export const GET_ORG_WORKFLOWS = `
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(
      where: { 
        org_id: { _eq: $org_id }
        deleted_at: { _is_null: true }
      }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      status
      current_version
      created_at
      updated_at
      steps(order_by: { order_index: asc }) {
        id
        step_type
        name
        order_index
        config
      }
      triggers {
        id
        trigger_type
        config
        is_active
      }
      runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW = `
  query GetWorkflow($workflow_id: uuid!) {
    workflows_by_pk(id: $workflow_id) {
      id
      org_id
      name
      description
      status
      current_version
      created_at
      updated_at
      steps(order_by: { order_index: asc }) {
        id
        step_type
        name
        order_index
        config
        timeout_seconds
        retry_count
      }
      triggers {
        id
        trigger_type
        config
        is_active
      }
      variables {
        id
        variable_name
        default_value
        is_secret
      }
    }
  }
`;

export const GET_RUN = `
  query GetRun($run_id: uuid!) {
    workflow_runs_by_pk(id: $run_id) {
      id
      status
      current_step_index
      execution_state
      started_at
      completed_at
      paused_at
      error_message
      trigger_type
      trigger_data
      workflow {
        id
        name
        org_id
      }
      step_runs(order_by: { order_index: asc }) {
        id
        step_id
        step_type
        order_index
        status
        input
        output
        error_message
        attempt_count
        approved_by
        approved_at
        started_at
        completed_at
      }
    }
  }
`;

export const GET_ORG_QUOTA = `
  query GetOrgQuota($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id
      name
      quota_limit
      quota_used
      quota_period
      quota_reset_at
    }
  }
`;

export const GET_ORG_MEMBERS = `
  query GetOrgMembers($org_id: uuid!) {
    org_members(
      where: { org_id: { _eq: $org_id } }
    ) {
      id
      user_id
      role
      created_at
    }
  }
`;

export const GET_USER_MEMBERSHIPS = `
  query GetUserMemberships($user_id: uuid!) {
    org_members(
      where: { user_id: { _eq: $user_id } }
    ) {
      id
      org_id
      role
      organization {
        id
        name
      }
    }
  }
`;
