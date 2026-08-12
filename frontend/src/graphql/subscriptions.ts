// GraphQL Subscriptions

export const WATCH_STEP_RUNS = `
  subscription WatchStepRuns($workflow_run_id: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflow_run_id } }
      order_by: { order_index: asc }
    ) {
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
`;

export const WATCH_WORKFLOW_RUN = `
  subscription WatchWorkflowRun($workflow_run_id: uuid!) {
    workflow_runs_by_pk(id: $workflow_run_id) {
      id
      status
      current_step_index
      started_at
      completed_at
      paused_at
      error_message
      trigger_type
    }
  }
`;

export const WATCH_WORKFLOW_RUNS = `
  subscription WatchWorkflowRuns($workflow_id: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflow_id } }
      order_by: { created_at: desc }
      limit: 10
    ) {
      id
      status
      started_at
      completed_at
      trigger_type
    }
  }
`;

export const WATCH_STEP_RUN = `
  subscription WatchStepRun($step_run_id: uuid!) {
    step_runs_by_pk(id: $step_run_id) {
      id
      step_type
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
`;
