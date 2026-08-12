import { useEffect, useState } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';

interface Credential {
  id: string;
  name: string;
  credential_type: string;
  encrypted_value: string;
  created_at: string;
}

export default function Credentials() {
  const nhost = useNhostClient();
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', credential_type: 'api_key', encrypted_value: '' });
  const [saving, setSaving] = useState(false);
  const [revealMap, setRevealMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setReady(true);
      if (!nhost.auth.isAuthenticated()) router.push('/login');
    };
    check();
  }, []);

  useEffect(() => {
    if (ready && nhost.auth.getUser()) loadCredentials();
  }, [ready]);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) throw new Error('GraphQL request failed');
    return data;
  }

  async function loadCredentials() {
    setLoading(true);
    try {
      const user = nhost.auth.getUser();
      if (!user) return;

      const membershipData = await gqlFetch(
        `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id } }`,
        { uid: user.id }
      );
      const orgId = membershipData?.org_members?.[0]?.org_id;
      if (!orgId) return;

      const credData = await gqlFetch(
        `query($oid: uuid!) {
          api_credentials(where: { org_id: { _eq: $oid } }, order_by: { created_at: desc }) {
            id name credential_type encrypted_value created_at
          }
        }`,
        { oid: orgId }
      );
      setCredentials(credData?.api_credentials || []);
    } catch (e) {
      console.error('loadCredentials error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const user = nhost.auth.getUser();
      if (!user) return;

      const membershipData = await gqlFetch(
        `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id } }`,
        { uid: user.id }
      );
      const orgId = membershipData?.org_members?.[0]?.org_id;
      if (!orgId) return;

      await gqlFetch(
        `mutation($oid: uuid!, $name: String!, $type: credential_type!, $val: String!) {
          insert_api_credentials_one(object: {
            org_id: $oid, name: $name, credential_type: $type, encrypted_value: $val
          }) { id }
        }`,
        { oid: orgId, name: form.name, type: form.credential_type, val: form.encrypted_value }
      );

      setShowForm(false);
      setForm({ name: '', credential_type: 'api_key', encrypted_value: '' });
      loadCredentials();
    } catch (e) {
      console.error('createCredential error:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this credential?')) return;
    try {
      await gqlFetch(`mutation($id: uuid!) { delete_api_credentials_by_pk(id: $id) { id } }`, { id });
      loadCredentials();
    } catch (e) {
      console.error('deleteCredential error:', e);
    }
  }

  function typeIcon(type: string) {
    if (type === 'api_key') return '🔑';
    if (type === 'oauth') return '🔐';
    return '🔗';
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>API Credentials</h1>
        </div>
      </header>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Manage API keys and credentials for your workflows</p>
          <button onClick={() => setShowForm(!showForm)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Add Credential
          </button>
        </div>

        {showForm && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>New Credential</h3>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} placeholder="e.g., Groq API Key" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Type</label>
                  <select value={form.credential_type} onChange={(e) => setForm({ ...form, credential_type: e.target.value })} style={inputStyle}>
                    <option value="api_key">API Key</option>
                    <option value="oauth">OAuth Token</option>
                    <option value="webhook_url">Webhook URL</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Value</label>
                <input type="password" value={form.encrypted_value} onChange={(e) => setForm({ ...form, encrypted_value: e.target.value })} required style={inputStyle} placeholder="Enter the credential value" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : credentials.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 64, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>No credentials yet</h3>
            <p style={{ color: '#64748b', marginBottom: 20 }}>Add API keys and tokens to use in your workflows</p>
            <button onClick={() => setShowForm(true)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Add Your First Credential</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {credentials.map((cred) => (
              <div key={cred.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 28 }}>{typeIcon(cred.credential_type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{cred.name}</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b', marginTop: 2 }}>
                    {revealMap[cred.id] ? cred.encrypted_value : cred.encrypted_value.substring(0, 4) + '••••' + cred.encrypted_value.substring(cred.encrypted_value.length - 4)}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{cred.credential_type} · {new Date(cred.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setRevealMap({ ...revealMap, [cred.id]: !revealMap[cred.id] })} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                    {revealMap[cred.id] ? 'Hide' : 'Reveal'}
                  </button>
                  <button onClick={() => handleDelete(cred.id)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
