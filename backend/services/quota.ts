// Quota Service
// Handles usage tracking and quota enforcement

import { nhost } from '../utils/nhost';

export interface QuotaStatus {
  allowed: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  quotaPeriod: string;
  resetAt: string | null;
}

/**
 * Check if an organization has quota available
 */
export async function checkQuota(orgId: string): Promise<QuotaStatus> {
  const query = `
    query GetOrgQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        id
        quota_limit
        quota_used
        quota_period
        quota_reset_at
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(query, { orgId });

  if (error || !data?.organizations_by_pk) {
    return {
      allowed: false,
      quotaUsed: 0,
      quotaLimit: 0,
      quotaRemaining: 0,
      quotaPeriod: 'monthly',
      resetAt: null,
    };
  }

  const org = data.organizations_by_pk;
  const remaining = org.quota_limit - org.quota_used;
  const allowed = remaining > 0;

  return {
    allowed,
    quotaUsed: org.quota_used,
    quotaLimit: org.quota_limit,
    quotaRemaining: remaining,
    quotaPeriod: org.quota_period,
    resetAt: org.quota_reset_at,
  };
}

/**
 * Increment quota usage for an organization
 */
export async function incrementQuota(
  orgId: string,
  amount: number = 1
): Promise<{ success: boolean; newTotal: number }> {
  const mutation = `
    mutation IncrementQuota($orgId: uuid!, $amount: Int!) {
      update_organizations_by_pk(
        pk_columns: { id: $orgId }
        _inc: { quota_used: $amount }
      ) {
        id
        quota_used
        quota_limit
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(mutation, {
    orgId,
    amount,
  });

  if (error || !data?.update_organizations_by_pk) {
    return { success: false, newTotal: 0 };
  }

  return {
    success: true,
    newTotal: data.update_organizations_by_pk.quota_used,
  };
}

/**
 * Reset quota for an organization (called by scheduled job)
 */
export async function resetQuota(orgId: string): Promise<boolean> {
  const mutation = `
    mutation ResetQuota($orgId: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $orgId }
        _set: { 
          quota_used: 0,
          quota_reset_at: null
        }
      ) {
        id
        quota_used
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(mutation, { orgId });

  return !error && !!data?.update_organizations_by_pk;
}

/**
 * Check if a step type should increment quota
 */
export function isBillableStep(stepType: string): boolean {
  // Only LLM and HTTP calls are billable
  return ['llm_call', 'http_request'].includes(stepType);
}

/**
 * Get quota usage statistics for an organization
 */
export async function getQuotaStats(orgId: string) {
  const query = `
    query GetQuotaStats($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        id
        name
        quota_limit
        quota_used
        quota_period
        quota_reset_at
        workflows_aggregate {
          aggregate {
            count
          }
        }
        workflows {
          runs_aggregate {
            aggregate {
              count
            }
          }
        }
      }
    }
  `;

  const { data, error } = await nhost.graphql.request(query, { orgId });

  if (error || !data?.organizations_by_pk) {
    return null;
  }

  const org = data.organizations_by_pk;
  const totalWorkflows = org.workflows_aggregate?.aggregate?.count || 0;
  const totalRuns = org.workflows?.reduce(
    (sum, w) => sum + (w.runs_aggregate?.aggregate?.count || 0),
    0
  ) || 0;

  return {
    orgId: org.id,
    orgName: org.name,
    quotaUsed: org.quota_used,
    quotaLimit: org.quota_limit,
    quotaPeriod: org.quota_period,
    quotaResetAt: org.quota_reset_at,
    usagePercentage: org.quota_limit > 0 
      ? Math.round((org.quota_used / org.quota_limit) * 100) 
      : 0,
    totalWorkflows,
    totalRuns,
  };
}
