import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, method = 'GET', headers = {}, body } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Retry with backoff for 429 rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...headers,
          'User-Agent': 'FlowForge/1.0',
        },
      };

      if (method !== 'GET' && method !== 'HEAD' && body) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const contentType = response.headers.get('content-type') || '';
      let responseBody;

      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Rate limited — wait and retry
      if (response.status === 429) {
        const wait = (attempt + 1) * 5000;
        console.log(`[Proxy] 429 rate limited, retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      return res.status(response.ok ? 200 : response.status).json({
        status: response.status,
        body: responseBody,
      });
    } catch (err: any) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      return res.status(500).json({
        status: 0,
        body: { error: err.message || 'Request failed' },
      });
    }
  }

  return res.status(429).json({ status: 429, body: { error: 'Rate limited after 3 retries' } });
}
