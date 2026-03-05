
import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { ResearchPageLayout } from '../components/sections/ResearchPageLayout';
import { apiFetch } from '../config';

export const EmbeddedApp = () => {
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string; avatar: string | null } | null>(null);

  useEffect(() => {
    const sdk = new DiscordSDK('');
    let mounted = true;
    const doAuthenticate = async () => {
      try {
        await sdk.ready();
        const result = await sdk.commands.authenticate({});
        const code = (result as any)?.code as string | undefined;

        if (mounted && (result as any)?.user) {
          const sdkUser = (result as any).user;
          setUser({
            id: sdkUser.id,
            username: sdkUser.username,
            avatar: sdkUser.avatar ?? null,
          });
        }

        if (!code) {
          if (mounted) setAuthStatus('no_code');
          return;
        }

        const resp = await apiFetch('/api/auth/sdk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (resp.ok) {
          if (mounted) setAuthStatus('ok');
        } else {
          const body = await resp.json().catch(() => null);
          if (mounted) setAuthStatus(body?.error || 'error');
        }
      } catch (err) {
        console.error('EmbeddedApp auth error', err);
        if (mounted) setAuthStatus('error');
      }
    };

    doAuthenticate();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <ResearchPageLayout presetKey="embedded" />
      {user && (
        <div style={{ position: 'fixed', bottom: 8, right: 8, background: '#eef', padding: 8, borderRadius: 6 }}>
          <strong>{user.username}</strong>
          {user.avatar && <img src={user.avatar} alt="avatar" style={{ width: 24, height: 24, marginLeft: 8, borderRadius: 4 }} />}
        </div>
      )}
      {authStatus === 'ok' && !user && <div style={{ display: 'none' }} />}
      {authStatus && authStatus !== 'ok' && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, background: '#fee', padding: 8 }}>
          Auth status: {authStatus}
        </div>
      )}
    </>
  );
};



