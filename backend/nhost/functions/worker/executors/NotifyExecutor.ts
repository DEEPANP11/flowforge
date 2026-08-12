// Notify Executor
// Handles execution of notification steps (Slack, Email, Webhook)

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';
import { safeFetch } from '../../../utils/ssrf';

interface NotifyConfig {
  channel: 'slack' | 'email' | 'webhook';
  webhook_url?: string;
  to?: string;
  subject?: string;
  message_template: string;
}

export class NotifyExecutor implements StepExecutor {
  async execute(config: NotifyConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.channel || !config.message_template) {
        return createFailedResult('Missing required notify config fields: channel, message_template');
      }

      // Resolve message template
      const message = this.resolveTemplate(config.message_template, context);

      let result: any;

      switch (config.channel) {
        case 'slack':
          result = await this.sendSlack(config.webhook_url!, message);
          break;
        case 'email':
          result = await this.sendEmail(config.to!, config.subject || 'Notification', message);
          break;
        case 'webhook':
          result = await this.sendWebhook(config.webhook_url!, message);
          break;
        default:
          return createFailedResult(`Unsupported notification channel: ${config.channel}`);
      }

      const metadata = {
        duration_ms: Date.now() - startTime,
      };

      return createSuccessResult(result, metadata);
    } catch (error) {
      return createFailedResult(`Notification failed: ${error.message}`);
    }
  }

  private resolveTemplate(template: string, context: ExecutionContext): string {
    // Simple template resolution
    let resolved = template;

    // Replace {{previous.output.field}}
    if (context.previousOutput) {
      resolved = resolved.replace(
        /\{\{previous\.output\.(\w+)\}\}/g,
        (_, field) => context.previousOutput[field] || ''
      );
    }

    // Replace {{now}}
    resolved = resolved.replace(/\{\{now\}\}/g, new Date().toISOString());

    return resolved;
  }

  private async sendSlack(webhookUrl: string, message: string): Promise<any> {
    if (!webhookUrl) {
      throw new Error('Slack webhook URL is required');
    }

    const payload = {
      text: message,
      unfurl_links: false,
      unfurl_media: false,
    };

    const response = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack webhook failed (${response.status}): ${errorText}`);
    }

    return {
      channel: 'slack',
      sent: true,
      timestamp: new Date().toISOString(),
    };
  }

  private async sendEmail(to: string, subject: string, message: string): Promise<any> {
    // Note: In production, you'd use a proper email service (SendGrid, SES, etc.)
    // This is a simplified implementation
    
    if (!to) {
      throw new Error('Email recipient is required');
    }

    // For now, just log the email
    console.log('Email notification:', {
      to,
      subject,
      message,
    });

    return {
      channel: 'email',
      sent: true,
      to,
      subject,
      timestamp: new Date().toISOString(),
    };
  }

  private async sendWebhook(webhookUrl: string, message: string): Promise<any> {
    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    const payload = {
      event: 'notification',
      message,
      timestamp: new Date().toISOString(),
    };

    const response = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed (${response.status}): ${errorText}`);
    }

    let responseBody: any;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      channel: 'webhook',
      sent: true,
      status: response.status,
      response: responseBody,
      timestamp: new Date().toISOString(),
    };
  }
}

// Stub Notify executor for testing
export class StubNotifyExecutor implements StepExecutor {
  async execute(config: NotifyConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate notification delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Generate mock result
    const output = {
      channel: config.channel,
      sent: true,
      message: this.resolveTemplate(config.message_template, context),
      stubbed: true,
      timestamp: new Date().toISOString(),
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
    };

    return createSuccessResult(output, metadata);
  }

  private resolveTemplate(template: string, context: ExecutionContext): string {
    let resolved = template;

    if (context.previousOutput) {
      resolved = resolved.replace(
        /\{\{previous\.output\.(\w+)\}\}/g,
        (_, field) => context.previousOutput[field] || ''
      );
    }

    resolved = resolved.replace(/\{\{now\}\}/g, new Date().toISOString());

    return resolved;
  }
}
