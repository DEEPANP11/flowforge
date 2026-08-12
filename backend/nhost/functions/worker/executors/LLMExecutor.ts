// LLM Executor
// Handles execution of LLM call steps

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';

interface LLMCallConfig {
  provider: 'groq' | 'openrouter' | 'gemini';
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMExecutor implements StepExecutor {
  async execute(config: LLMCallConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.provider || !config.model || !config.prompt) {
        return createFailedResult('Missing required LLM config fields: provider, model, prompt');
      }

      // Get API key from environment
      const apiKey = this.getApiKey(config.provider);
      if (!apiKey) {
        return createFailedResult(`API key not configured for provider: ${config.provider}`);
      }

      // Build messages
      const messages: Array<{ role: string; content: string }> = [];

      if (config.system_prompt) {
        messages.push({ role: 'system', content: config.system_prompt });
      }

      messages.push({ role: 'user', content: config.prompt });

      // Call LLM API
      const response = await this.callLLM(config, messages, apiKey);

      if (!response) {
        return createFailedResult('No response from LLM API');
      }

      // Parse response
      const output = {
        text: response.choices[0]?.message?.content || '',
        finish_reason: response.choices[0]?.finish_reason || 'unknown',
        model: config.model,
        provider: config.provider,
      };

      const metadata = {
        duration_ms: Date.now() - startTime,
        tokens: response.usage ? {
          prompt: response.usage.prompt_tokens,
          completion: response.usage.completion_tokens,
          total: response.usage.total_tokens,
        } : undefined,
      };

      return createSuccessResult(output, metadata);
    } catch (error) {
      return createFailedResult(`LLM execution failed: ${error.message}`);
    }
  }

  private getApiKey(provider: string): string | undefined {
    switch (provider) {
      case 'groq':
        return process.env.GROQ_API_KEY;
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY;
      case 'gemini':
        return process.env.GEMINI_API_KEY;
      default:
        return undefined;
    }
  }

  private async callLLM(
    config: LLMCallConfig,
    messages: Array<{ role: string; content: string }>,
    apiKey: string
  ): Promise<LLMResponse | null> {
    const baseUrl = this.getBaseUrl(config.provider);
    const endpoint = this.getEndpoint(config.provider);

    const requestBody = {
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.max_tokens ?? 1000,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Provider-specific headers
    if (config.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://ai-workflow-builder.com';
      headers['X-Title'] = 'AI Workflow Builder';
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private getBaseUrl(provider: string): string {
    switch (provider) {
      case 'groq':
        return 'https://api.groq.com';
      case 'openrouter':
        return 'https://openrouter.ai';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private getEndpoint(provider: string): string {
    switch (provider) {
      case 'groq':
        return '/openai/v1/chat/completions';
      case 'openrouter':
        return '/api/v1/chat/completions';
      case 'gemini':
        return '/v1beta/models/gemini-pro:generateContent';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

// Stub LLM executor for testing without API key
export class StubLLMExecutor implements StepExecutor {
  async execute(config: LLMCallConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate mock response based on prompt
    const mockResponse = this.generateMockResponse(config.prompt);

    const output = {
      text: mockResponse,
      finish_reason: 'stop',
      model: config.model,
      provider: config.provider,
      stubbed: true,
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
      tokens: {
        prompt: Math.floor(config.prompt.length / 4),
        completion: Math.floor(mockResponse.length / 4),
        total: Math.floor((config.prompt.length + mockResponse.length) / 4),
      },
    };

    return createSuccessResult(output, metadata);
  }

  private generateMockResponse(prompt: string): string {
    // Simple mock responses based on prompt content
    if (prompt.toLowerCase().includes('classify')) {
      return JSON.stringify({
        classification: 'enterprise',
        confidence: 0.92,
        reasoning: 'Large company with multiple departments',
      });
    }

    if (prompt.toLowerCase().includes('summarize')) {
      return 'This is a summary of the provided content. The key points are: (1) Main topic, (2) Supporting details, (3) Conclusion.';
    }

    if (prompt.toLowerCase().includes('sentiment')) {
      return JSON.stringify({
        sentiment: 'positive',
        score: 0.85,
        keywords: ['great', 'excellent', 'satisfied'],
      });
    }

    return 'This is a mock LLM response. In production, this would be a real response from the configured LLM provider.';
  }
}
