// HTTP Request Executor
// Handles execution of HTTP request steps with SSRF protection

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';
import { validateUrl, getSafeFetchOptions } from '../../../utils/ssrf';

interface HTTPRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
}

export class HTTPExecutor implements StepExecutor {
  async execute(config: HTTPRequestConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.url) {
        return createFailedResult('Missing required HTTP config field: url');
      }

      // Validate URL for SSRF
      const validation = validateUrl(config.url);
      if (!validation.safe) {
        return createFailedResult(`SSRF protection: ${validation.error}`);
      }

      // Prepare request options
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Workflow-Builder/1.0',
        ...config.headers,
      };

      const fetchOptions: RequestInit = {
        method: config.method || 'GET',
        headers,
        signal: AbortSignal.timeout(config.timeout || 30000),
      };

      // Add body for non-GET requests
      if (config.body && config.method !== 'GET') {
        fetchOptions.body = typeof config.body === 'string' 
          ? config.body 
          : JSON.stringify(config.body);
      }

      // Make request
      const response = await fetch(config.url, fetchOptions);

      // Parse response
      let responseBody: any;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Collect response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const output: HTTPResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      };

      const metadata = {
        duration_ms: Date.now() - startTime,
      };

      // Consider 2xx as success
      if (response.ok) {
        return createSuccessResult(output, metadata);
      } else {
        return createFailedResult(
          `HTTP request failed with status ${response.status}: ${response.statusText}`,
          output
        );
      }
    } catch (error) {
      const errorMessage = error.name === 'AbortTimeoutError'
        ? `HTTP request timed out after ${config.timeout || 30000}ms`
        : `HTTP request failed: ${error.message}`;

      return createFailedResult(errorMessage);
    }
  }
}

// Stub HTTP executor for testing
export class StubHTTPExecutor implements StepExecutor {
  async execute(config: HTTPRequestConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate mock response
    const output: HTTPResponse = {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        success: true,
        message: 'This is a stubbed HTTP response',
        request: {
          method: config.method,
          url: config.url,
        },
        timestamp: new Date().toISOString(),
      },
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
    };

    return createSuccessResult(output, metadata);
  }
}
