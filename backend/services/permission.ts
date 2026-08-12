// Permission Service
// Handles authorization checks for workflow operations

import { nhost } from '../utils/nhost';

export type OrgRole = 'owner' | 'editor' | 'viewer';

export interface MembershipCheck {
  hasAccess: boolean;
  role: OrgRole | null;
  orgId: string | null;
}

/**
 * Check if a user has access to an organization
 */
export async function checkOrgMembership(
  userId: string,
  orgId: string
): Promise<MembershipCheck> {
  const query = `
    query CheckOrgMembership($userId: uuid!, $orgId: uuid!) {
      org_members(where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }) {
        id
        role
        org_id
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(query, {
    userId,
    orgId,
  });

  if (error || !data?.org_members?.length) {
    return { hasAccess: false, role: null, orgId: null };
  }

  const membership = data.org_members[0];
  return {
    hasAccess: true,
    role: membership.role as OrgRole,
    orgId: membership.org_id,
  };
}

/**
 * Check if a user can trigger a workflow
 */
export async function canTriggerWorkflow(
  userId: string,
  workflowId: string
): Promise<{ allowed: boolean; orgId: string }> {
  const query = `
    query GetWorkflowOrg($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        org_id
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(query, {
    workflowId,
  });

  if (error || !data?.workflows_by_pk) {
    return { allowed: false, orgId: '' };
  }

  const orgId = data.workflows_by_pk.org_id;
  const membership = await checkOrgMembership(userId, orgId);

  // Only owner and editor can trigger workflows
  const allowed = membership.hasAccess && 
    (membership.role === 'owner' || membership.role === 'editor');

  return { allowed, orgId };
}

/**
 * Check if a user can approve a step
 */
export async function canApproveStep(
  userId: string,
  stepRunId: string
): Promise<{ allowed: boolean; orgId: string }> {
  const query = `
    query GetStepRunOrg($stepRunId: uuid!) {
      step_runs_by_pk(id: $stepRunId) {
        id
        status
        step_type
        workflow_run {
          id
          workflow {
            id
            org_id
          }
        }
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(query, {
    stepRunId,
  });

  if (error || !data?.step_runs_by_pk) {
    return { allowed: false, orgId: '' };
  }

  const stepRun = data.step_runs_by_pk;

  // Must be an approval_gate step
  if (stepRun.step_type !== 'approval_gate') {
    return { allowed: false, orgId: '' };
  }

  // Must be awaiting approval
  if (stepRun.status !== 'awaiting_approval') {
    return { allowed: false, orgId: '' };
  }

  const orgId = stepRun.workflow_run.workflow.org_id;
  const membership = await checkOrgMembership(userId, orgId);

  // Only owner and editor can approve
  const allowed = membership.hasAccess && 
    (membership.role === 'owner' || membership.role === 'editor');

  return { allowed, orgId };
}

/**
 * Check if a user can add a specific step type
 */
export async function canAddStepType(
  userId: string,
  orgId: string,
  stepType: string
): Promise<boolean> {
  // Sensitive steps require owner role
  const sensitiveSteps = ['db_write', 'notify'];
  
  if (!sensitiveSteps.includes(stepType)) {
    // Non-sensitive steps can be added by owner or editor
    const membership = await checkOrgMembership(userId, orgId);
    return membership.hasAccess && 
      (membership.role === 'owner' || membership.role === 'editor');
  }

  // Sensitive steps require owner role
  const membership = await checkOrgMembership(userId, orgId);
  return membership.hasAccess && membership.role === 'owner';
}

/**
 * Get user's role in an organization
 */
export async function getUserRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const membership = await checkOrgMembership(userId, orgId);
  return membership.role;
}
