import { useState, useEffect } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';

export default function Login() {
  const nhost = useNhostClient();
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setReady(true);
      if (nhost.auth.isAuthenticated()) router.push('/');
    };
    check();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: authError } = isSignUp
        ? await nhost.auth.signUp({ email, password })
        : await nhost.auth.signIn({ email, password });
      if (authError) setError(authError.message);
      else {
        // For new signups, check if user has an org; if not, create one
        if (isSignUp) {
          await new Promise(r => setTimeout(r, 1000)); // Wait for session to settle
          try {
            const user = nhost.auth.getUser();
            if (user) {
              const { data } = await nhost.graphql.request(
                `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id } }`,
                { uid: user.id }
              );
              const orgId = data?.org_members?.[0]?.org_id;
              if (!orgId) {
                // Create default org
                const orgName = email.split('@')[0] + "'s Organization";
                await nhost.graphql.request(
                  `mutation($uid: uuid!, $name: String!) {
                    insert_organizations_one(object: { name: $name }) {
                      id
                    }
                  }`,
                  { uid: user.id, name: orgName }
                ).then((r: any) => {
                  const newOrgId = r?.data?.insert_organizations_one?.id;
                  if (newOrgId) {
                    nhost.graphql.request(
                      `mutation($oid: uuid!, $uid: uuid!) {
                        insert_org_members_one(object: { org_id: $oid, user_id: $uid, role: owner }) { id }
                      }`,
                      { oid: newOrgId, uid: user.id }
                    ).then(() => {});
                  }
                });
              }
            }
          } catch (orgErr) {
            console.warn('Auto-org creation failed:', orgErr);
          }
        }
        router.push('/');
      }
    } catch (e) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #eff6ff 0%, #fff 50%, #eff6ff 100%)' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>⚡</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>FlowForge</h1>
          <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>{isSignUp ? 'Create your account' : 'Welcome back'}</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ fontSize: 13, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
