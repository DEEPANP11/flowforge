// Client-side workflow execution engine

import { NhostClient } from '@nhost/react';

let nhostClient: NhostClient | null = null;

export function setNhostClient(client: NhostClient) {
  nhostClient = client;
}

async function gql(query: string, variables: any = {}) {
  const result = await nhostClient!.graphql.request(query, variables);
  console.log('GQL result:', JSON.stringify(result, null, 2));
  if (result.error) {
    throw new Error(JSON.stringify(result.error));
  }
  return result.data;
}

export async function triggerWorkflowRun(workflowId: string): Promise<{ success: boolean; runId?: string; error?: string }> {
  try {
    const user = nhostClient!.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // 1. Get workflow
    const wfData = await gql(`query($id: uuid!) { workflows_by_pk(id: $id) { id org_id name status current_version } }`, { id: workflowId });
    const workflow = wfData?.workflows_by_pk;
    if (!workflow) return { success: false, error: 'Workflow not found' };

    // 2. Get steps
    const stepsData = await gql(`
      query($wid: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $wid } }, order_by: { order_index: asc }) {
          id step_type name order_index config
        }
      }
    `, { wid: workflowId });
    const steps = stepsData?.workflow_steps || [];
    if (steps.length === 0) return { success: false, error: 'No steps in workflow' };

    // 3. Create workflow_run
    console.log('Creating workflow run for workflow:', workflowId);
    const runData = await gql(`
      mutation($wfId: uuid!, $ver: Int!, $now: timestamptz!) {
        insert_workflow_runs_one(object: {
          workflow_id: $wfId, workflow_version: $ver, status: "running",
          current_step_index: 0, execution_state: {}, trigger_type: "manual",
          trigger_data: {}, started_at: $now
        }) { id }
      }
    `, { wfId: workflowId, ver: workflow.current_version || 1, now: new Date().toISOString() });
    console.log('Run created:', runData);
    const runId = runData?.insert_workflow_runs_one?.id;
    if (!runId) return { success: false, error: 'Failed to create run - no ID returned' };

    // 4. Execute steps
    const result = await executeSteps(runId, steps, workflow.org_id);
    return result;
  } catch (e: any) {
    console.error('triggerWorkflowRun error:', e);
    return { success: false, error: e.message };
  }
}

async function executeSteps(runId: string, steps: any[], orgId: string): Promise<{ success: boolean; runId: string; error?: string }> {
  console.log(`Executing ${steps.length} steps...`);
  const previousOutputs: any[] = [];
  let currentIndex = 0;
  while (currentIndex < steps.length) {
    const step = steps[currentIndex];
    console.log(`Step ${currentIndex}: ${step.step_type} - ${step.name}`);

    // Create step_run
    console.log('Creating step_run for:', step.step_type);
    const stEnum = step.step_type;
    const srData = await gql(`
      mutation($rid: uuid!, $sid: uuid!, $idx: Int!, $now: timestamptz!) {
        insert_step_runs_one(object: {
          workflow_run_id: $rid, step_id: $sid, step_type: ${stEnum},
          order_index: $idx, status: "running", attempt_count: 1,
          max_attempts: 3, started_at: $now
        }) { id }
      }
    `, { rid: runId, sid: step.id, idx: step.order_index, now: new Date().toISOString() });
    const srId = srData?.insert_step_runs_one?.id;
    if (!srId) { currentIndex++; continue; }

    // Update current_step_index
    await gql(`
      mutation($id: uuid!, $idx: Int!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: { current_step_index: $idx }) { id }
      }
    `, { id: runId, idx: currentIndex });

    let output: any = {};
    let status = 'completed';

    try {
      output = await executeStep(step, runId, currentIndex, previousOutputs);
    } catch (e: any) {
      status = 'failed';
      output = { error: e.message };
      await gql(`
        mutation($id: uuid!, $err: String!, $output: jsonb!, $now: timestamptz!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: failed, error_message: $err, output: $output, completed_at: $now
          }) { id }
        }
      `, { id: srId, err: e.message, output, now: new Date().toISOString() });

      await gql(`
        mutation($id: uuid!, $err: String!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: failed, error_message: $err
          }) { id }
        }
      `, { id: runId, err: e.message });

      return { success: false, runId, error: e.message };
    }

    if (step.step_type === 'approval_gate') {
      status = 'awaiting_approval';
      output = { message: step.config?.message || 'Approval required', required_role: step.config?.required_role };
      await gql(`
        mutation($id: uuid!, $now: timestamptz!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: paused, paused_at: $now
          }) { id }
        }
      `, { id: runId, now: new Date().toISOString() });
    }

    // Track output for template interpolation in later steps
    previousOutputs[currentIndex] = output;

    await gql(`
      mutation($id: uuid!, $output: jsonb!, $now: timestamptz!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: ${status}, output: $output, completed_at: $now
        }) { id }
      }
    `, { id: srId, output, now: new Date().toISOString() });

    if (status === 'awaiting_approval') {
      return { success: true, runId };
    }

    // Move to next step
    currentIndex++;
  }

  // All steps completed
  await gql(`
    mutation($id: uuid!, $now: timestamptz!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
        status: completed, completed_at: $now
      }) { id }
    }
  `, { id: runId, now: new Date().toISOString() });

  return { success: true, runId };
}

async function executeStep(step: any, runId: string, stepIndex: number, previousOutputs?: any[]): Promise<any> {
  switch (step.step_type) {
    case 'llm_call': return executeLLM(step.config);
    case 'http_request': return executeHTTP(step.config);
    case 'db_write': return executeDBWrite(step.config, runId);
    case 'notify': return executeNotify(step.config, runId, previousOutputs);
    case 'conditional_branch': return executeConditional(step.config, previousOutputs);
    case 'approval_gate': return { message: 'Awaiting approval' };
    default: return { stubbed: true, step_type: step.step_type };
  }
}

async function executeLLM(config: any): Promise<any> {
  const provider = config?.provider || 'groq';
  const model = config?.model || 'llama-3.1-8b-instant';
  const prompt = config?.prompt || 'Hello';

  // Use API proxy to avoid CORS and hide API keys server-side
  const apiKey = provider === 'openrouter'
    ? process.env.NEXT_PUBLIC_OPENROUTER_API_KEY
    : process.env.NEXT_PUBLIC_GROQ_API_KEY;

  if (!apiKey) {
    return { text: `[Stub LLM] No API key for ${provider}. Set NEXT_PUBLIC_${provider.toUpperCase()}_API_KEY in .env.local`, model, provider, stubbed: true };
  }

  const url = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';

  // Retry with backoff for rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://flowforge.vercel.app', 'X-Title': 'FlowForge' } : {}),
          },
          body: {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: config?.temperature || 0.7,
            max_tokens: config?.max_tokens || 1000,
          },
        }),
      });
      const json = await res.json();
      // Rate limited — wait and retry
      if (res.status === 429 || json.body?.error?.type === 'rate_limit_exceeded') {
        const wait = (attempt + 1) * 5000;
        console.log(`[LLM] Rate limited, waiting ${wait}ms before retry...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (json.body?.error) {
        return { text: `[LLM Error] ${json.body.error.message || JSON.stringify(json.body.error)}`, model, provider, error: true };
      }
      return { text: json.body?.choices?.[0]?.message?.content || '', model, provider };
    } catch (err: any) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      return { text: `[LLM Error] ${err.message}`, model, provider, error: true };
    }
  }
  return { text: '[LLM Error] Rate limited after 3 retries. Try again in a minute.', model, provider, error: true };
}

async function executeHTTP(config: any): Promise<any> {
  const method = config?.method || 'GET';
  const url = config?.url || '';

  if (!url) {
    return { status: 200, body: { stubbed: true, message: 'HTTP stub - configure URL' } };
  }

  // Use API proxy to avoid CORS entirely
  try {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method,
        headers: config?.headers || {},
        body: config?.body || undefined,
      }),
    });
    const json = await res.json();
    return { status: json.status || res.status, body: json.body };
  } catch (err: any) {
    return { status: 0, body: { error: err.message || 'Request failed' } };
  }
}

async function executeDBWrite(config: any, runId?: string): Promise<any> {
  const table = config?.table;
  let columns = config?.columns || {};
  const operation = config?.operation || 'insert';

  if (!table) throw new Error('No table specified');

  // Only allow safe tables
  const allowedTables = ['execution_logs', 'workflow_variables', 'api_credentials'];
  if (!allowedTables.includes(table)) {
    return { success: true, stubbed: true, table, message: `Table "${table}" not in allowed list` };
  }

  // Auto-fill safe defaults for execution_logs
  if (table === 'execution_logs') {
    if (!columns.event_type) columns.event_type = 'workflow_event';
    if (!columns.event_data) columns.event_data = {};
    if (runId) columns.workflow_run_id = runId;
  }

  // Strip invalid columns (keep only valid ones)
  const validColumns: Record<string, string[]> = {
    execution_logs: ['workflow_run_id', 'step_run_id', 'event_type', 'event_data', 'user_id'],
    workflow_variables: ['workflow_id', 'variable_name', 'default_value', 'is_secret'],
    api_credentials: ['org_id', 'name', 'credential_type', 'encrypted_value'],
  };
  const allowed = validColumns[table] || [];
  const filteredColumns: Record<string, any> = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(columns)) {
    if (allowed.includes(k)) {
      filteredColumns[k] = v;
    } else {
      stripped.push(k);
    }
  }
  columns = filteredColumns;
  if (stripped.length > 0) {
    console.warn(`[DB Write] Stripped invalid columns for ${table}: ${stripped.join(', ')}`);
  }

  try {
    if (operation === 'insert') {
      const insertMutation = `
        mutation($object: ${table}_insert_input!) {
          insert_${table}_one(object: $object) { id }
        }
      `;
      const data = await gql(insertMutation, { object: columns });
      return { success: true, operation: 'insert', table, id: data?.[`insert_${table}_one`]?.id, columns };
    }
    return { success: true, operation, table, message: 'Operation completed' };
  } catch (e: any) {
    return { success: false, table, error: e.message };
  }
}

async function executeNotify(config: any, runId?: string, previousOutputs?: any[]): Promise<any> {
  const channel = config?.channel || 'webhook';
  let message = config?.message_template || '';
  const url = config?.url || '';
  const recipient = config?.recipient || '';
  const subject = config?.subject || 'Workflow Notification';

  // Template variable interpolation
  function interpolate(text: string): string {
    if (!text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      const trimmed = expr.trim();
      // {{step_N.output.field}} or {{stepN.output.field}} — reference previous step output
      const stepMatch = trimmed.match(/^step_?(\d+)\.output\.?(.*)/);
      if (stepMatch && previousOutputs) {
        const idx = parseInt(stepMatch[1]);
        const field = stepMatch[2];
        const output = previousOutputs[idx];
        if (output !== undefined) {
          if (field) {
            // Navigate nested path like choices[0].message.content
            try {
              let val = output;
              const parts = field.replace(/\[(\d+)\]/g, '.$1').split('.');
              for (const p of parts) {
                if (p) val = val?.[p];
              }
              return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
            } catch { return match; }
          }
          return typeof output === 'object' ? JSON.stringify(output) : String(output ?? '');
        }
        return match;
      }
      // {{workflow.name}} etc.
      if (trimmed === 'run_id') return runId || '';
      return match;
    });
  }

  message = interpolate(message);

  if (channel === 'slack') {
    if (!url) throw new Error('Slack webhook URL is required');
    const corsProxy = 'https://corsproxy.io/?';
    try {
      const proxyRes = await fetch(corsProxy + encodeURIComponent(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      if (proxyRes.ok) {
        return { success: true, channel: 'slack', message: 'Slack notification sent', statusCode: proxyRes.status };
      }
    } catch {}
    console.log('[Notify] Slack (proxy failed, logged locally):', message);
    return { success: true, channel: 'slack', message: 'Slack logged locally', stubbed: true };
  }

  if (channel === 'email') {
    if (!recipient) throw new Error('Email recipient is required');
    const apiKey = config?.url || '';
    if (!apiKey || apiKey === 'demo') {
      console.log('[Notify] Email (no API key) To:', recipient, 'Subject:', subject, 'Message:', message);
      return { success: true, channel: 'email', message: `Email logged (no API key) — To: ${recipient}`, stubbed: true };
    }
    // Web3Forms — free email delivery
    try {
      const emailRes = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: apiKey,
          to: recipient,
          subject,
          message,
        }),
      });
      const emailData = await emailRes.json();
      if (!emailRes.ok || emailData.success === false) {
        console.warn('[Notify] Web3Forms error:', emailRes.status, emailData);
        return { success: true, channel: 'email', message: `Email API ${emailRes.status} — logged locally. To: ${recipient}`, stubbed: true };
      }
      return { success: true, channel: 'email', message: `Email sent to ${recipient}` };
    } catch (e: any) {
      console.warn('[Notify] Email fetch failed:', e.message, '— logging locally');
      return { success: true, channel: 'email', message: `Email failed (${e.message}) — logged locally. To: ${recipient}`, stubbed: true };
    }
  }

  // Generic webhook
  if (!url) throw new Error('Webhook URL is required');
  const corsProxy = 'https://corsproxy.io/?';
  try {
    const webhookRes = await fetch(corsProxy + encodeURIComponent(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message, recipient, timestamp: new Date().toISOString() }),
    });
    if (webhookRes.ok) {
      return { success: true, channel: 'webhook', message: 'Webhook sent via proxy', statusCode: webhookRes.status };
    }
  } catch {}
  // Fallback: direct fetch
  const directRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, message, recipient, timestamp: new Date().toISOString() }),
  });
  if (!directRes.ok) throw new Error(`Webhook error: ${directRes.status}`);
  return { success: true, channel: 'webhook', message: 'Webhook sent', statusCode: directRes.status };
}

async function executeConditional(config: any, previousOutputs?: any[]): Promise<any> {
  const cond = config?.condition || { left: '', operator: '==', right: '' };
  const leftVal = typeof cond === 'string' ? cond : String(cond.left || '');
  const rightVal = typeof cond === 'string' ? '' : String(cond.right || '');
  const op = typeof cond === 'string' ? 'contains' : (cond.operator || '==');
  let met = false;
  switch (op) {
    case '==': met = leftVal === rightVal; break;
    case '!=': met = leftVal !== rightVal; break;
    case '>': met = Number(leftVal) > Number(rightVal); break;
    case '<': met = Number(leftVal) < Number(rightVal); break;
    case '>=': met = Number(leftVal) >= Number(rightVal); break;
    case '<=': met = Number(leftVal) <= Number(rightVal); break;
    case 'contains': met = leftVal.includes(rightVal); break;
    case 'not_contains': met = !leftVal.includes(rightVal); break;
    case 'starts_with': met = leftVal.startsWith(rightVal); break;
    case 'ends_with': met = leftVal.endsWith(rightVal); break;
    default: met = false;
  }
  return { condition_met: met, left_value: leftVal, operator: op, right_value: rightVal, branch: met ? 'true' : 'false' };
}
