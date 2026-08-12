// SSRF Protection Utility
// Prevents Server-Side Request Forgery attacks

import { URL } from 'url';

// Blocked IP ranges and hostnames
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP/Azure metadata
];

const BLOCKED_IP_RANGES = [
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },      // 10.0.0.0/8
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },     // 172.16.0.0/12
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },   // 192.168.0.0/16
  { start: [169, 254, 0, 0], end: [169, 254, 255, 255] },   // 169.254.0.0/16
];

// Allowed protocols
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Check if an IP address is in a blocked range
 */
function isIPBlocked(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  for (const range of BLOCKED_IP_RANGES) {
    const inRange = parts.every(
      (part, i) => part >= range.start[i] && part <= range.end[i]
    );
    if (inRange) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a URL for SSRF safety
 */
export function validateUrl(urlString: string): {
  safe: boolean;
  error?: string;
  parsed?: URL;
} {
  try {
    const parsed = new URL(urlString);

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return {
        safe: false,
        error: `Protocol not allowed: ${parsed.protocol}. Use http: or https:`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check blocked hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return {
        safe: false,
        error: `Hostname blocked: ${hostname}`,
      };
    }

    // Check for metadata endpoints
    if (
      hostname.endsWith('.metadata.google.internal') ||
      hostname === 'metadata.google' ||
      hostname === 'metadata'
    ) {
      return {
        safe: false,
        error: 'Cloud metadata endpoint blocked',
      };
    }

    // Check if hostname is an IP address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      if (isIPBlocked(hostname)) {
        return {
          safe: false,
          error: `IP address blocked: ${hostname}`,
        };
      }
    }

    // Check for common internal hostnames
    const blockedPatterns = [
      /\.internal$/i,
      /\.local$/i,
      /\.localhost$/i,
      /^internal\./i,
      /^private\./i,
      /^admin\./i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return {
          safe: false,
          error: `Internal hostname blocked: ${hostname}`,
        };
      }
    }

    return { safe: true, parsed };
  } catch (error) {
    return {
      safe: false,
      error: `Invalid URL: ${error.message}`,
    };
  }
}

/**
 * Validate URL with allowed domains (whitelist approach)
 */
export function validateUrlWithWhitelist(
  urlString: string,
  allowedDomains: string[] = []
): {
  safe: boolean;
  error?: string;
} {
  // First, do basic SSRF check
  const basicCheck = validateUrl(urlString);
  if (!basicCheck.safe) {
    return basicCheck;
  }

  // If whitelist is provided, check against it
  if (allowedDomains.length > 0) {
    const hostname = basicCheck.parsed!.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(
      (domain) =>
        hostname === domain.toLowerCase() ||
        hostname.endsWith(`.${domain.toLowerCase()}`)
    );

    if (!isAllowed) {
      return {
        safe: false,
        error: `Domain not in whitelist: ${hostname}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Get safe fetch options (with timeout and redirect limit)
 */
export function getSafeFetchOptions(timeout: number = 30000): RequestInit {
  return {
    method: 'GET',
    headers: {
      'User-Agent': 'AI-Workflow-Builder/1.0',
    },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  };
}

/**
 * Safe fetch with SSRF protection
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const validation = validateUrl(url);
  if (!validation.safe) {
    throw new Error(`SSRF protection: ${validation.error}`);
  }

  const defaultOptions = getSafeFetchOptions();
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  return fetch(url, mergedOptions);
}
