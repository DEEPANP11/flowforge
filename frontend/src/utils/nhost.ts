// Nhost Configuration

import { NhostClient } from '@nhost/react';

export const NHOST_SUBDOMAIN = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
export const NHOST_REGION = process.env.NEXT_PUBLIC_NHOST_REGION || 'eu-central-1';

// Create Nhost client
export const nhost = new NhostClient({
  subdomain: NHOST_SUBDOMAIN,
  region: NHOST_REGION,
});

export const graphqlUrl = `https://${NHOST_SUBDOMAIN}.${NHOST_REGION}.nhost.app/v1/graphql`;
export const backendUrl = `https://${NHOST_SUBDOMAIN}.${NHOST_REGION}.nhost.app`;
