// GraphQL Mutations

export const CREATE_WORKFLOW = `
  mutation CreateWorkflow(
    $org_id: uuid!
    $name: String!
    $description: String
    $steps: [workflow_steps_insert_input!]!
    $triggers: [workflow_triggers_insert_input!]!
  ) {
    insert_workflows_one(object: {
      org_id: $org_id
      name: $name
      description: $description
      status: "draft"
      steps: { data: $steps }
      triggers: { data: $triggers }
    }) {
      id
      name
      status
      steps {
        id
        step_type
        name
        order_index
      }
      triggers {
        id
        trigger_type
      }
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow(
    $workflow_id: uuid!
    $name: String
    $description: String
    $status: String
  ) {
    update_workflows_by_pk(
      pk_columns: { id: $workflow_id }
      _set: {
        name: $name
        description: $description
        status: $status
      }
    ) {
      id
      name
      status
    }
  }
`;

export const DELETE_WORKFLOW = `
  mutation DeleteWorkflow($workflow_id: uuid!) {
    update_workflows_by_pk(
      pk_columns: { id: $workflow_id }
      _set: { deleted_at: "now()" }
    ) {
      id
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      success
      run_id
      message
    }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($step_run_id: uuid!, $approved: Boolean!) {
    approveStep(step_run_id: $step_run_id, approved: $approved) {
      success
      message
    }
  }
`;

export const CREATE_WORKFLOW_STEP = `
  mutation CreateWorkflowStep(
    $workflow_id: uuid!
    $step_type: String!
    $name: String!
    $order_index: Int!
    $config: jsonb!
  ) {
    insert_workflow_steps_one(object: {
      workflow_id: $workflow_id
      step_type: $step_type
      name: $name
      order_index: $order_index
      config: $config
    }) {
      id
      step_type
      name
      order_index
      config
    }
  }
`;

export const UPDATE_WORKFLOW_STEP = `
  mutation UpdateWorkflowStep(
    $step_id: uuid!
    $name: String
    $config: jsonb
    $order_index: Int
  ) {
    update_workflow_steps_by_pk(
      pk_columns: { id: $step_id }
      _set: {
        name: $name
        config: $config
        order_index: $order_index
      }
    ) {
      id
      step_type
      name
      order_index
      config
    }
  }
`;

export const DELETE_WORKFLOW_STEP = `
  mutation DeleteWorkflowStep($step_id: uuid!) {
    delete_workflow_steps_by_pk(id: $step_id) {
      id
    }
  }
`;

export const CREATE_WORKFLOW_TRIGGER = `
  mutation CreateWorkflowTrigger(
    $workflow_id: uuid!
    $trigger_type: String!
    $config: jsonb!
  ) {
    insert_workflow_triggers_one(object: {
      workflow_id: $workflow_id
      trigger_type: $trigger_type
      config: $config
    }) {
      id
      trigger_type
      config
    }
  }
`;

export const UPDATE_WORKFLOW_TRIGGER = `
  mutation UpdateWorkflowTrigger(
    $trigger_id: uuid!
    $config: jsonb
    $is_active: Boolean
  ) {
    update_workflow_triggers_by_pk(
      pk_columns: { id: $trigger_id }
      _set: {
        config: $config
        is_active: $is_active
      }
    ) {
      id
      trigger_type
      config
      is_active
    }
  }
`;

export const DELETE_WORKFLOW_TRIGGER = `
  mutation DeleteWorkflowTrigger($trigger_id: uuid!) {
    delete_workflow_triggers_by_pk(id: $trigger_id) {
      id
    }
  }
`;
