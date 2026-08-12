// Nhost Client Utility
// Provides access to Nhost services

const NHOST_SUBDOMAIN = process.env.NHOST_SUBDOMAIN || 'your-subdomain';
const NHOST_REGION = process.env.NHOST_REGION || 'eu-central-1';
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || '';

const NHOST_BACKEND_URL = `https://${NHOST_SUBDOMAIN}.${NHOST_REGION}.nhost.app`;
const HASURA_GRAPHQL_URL = `${NHOST_BACKEND_URL}/v1/graphql`;

/**
 * Make a GraphQL request to Hasura
 */
export async function graphqlRequest<T = any>(
  query: string,
  variables: Record<string, any> = {},
  adminSecret?: string
): Promise<{ data: T | null; error: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Use admin secret if provided (for server-side operations)
  if (adminSecret || HASURA_ADMIN_SECRET) {
    headers['x-hasura-admin-secret'] = adminSecret || HASURA_ADMIN_SECRET;
  }

  try {
    const response = await fetch(HASURA_GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    if (result.errors) {
      return { data: null, error: result.errors };
    }

    return { data: result.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Execute a mutation
 */
export async function executeMutation<T = any>(
  mutation: string,
  variables: Record<string, any> = {}
): Promise<{ data: T | null; error: any }> {
  return graphqlRequest<T>(mutation, variables);
}

/**
 * Execute a query
 */
export async function executeQuery<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<{ data: T | null; error: any }> {
  return graphqlRequest<T>(query, variables);
}

/**
 * Get Nhost backend URL
 */
export function getBackendUrl(): string {
  return NHOST_BACKEND_URL;
}

/**
 * Get Hasura GraphQL URL
 */
export function getGraphQLUrl(): string {
  return HASURA_GRAPHQL_URL;
}
