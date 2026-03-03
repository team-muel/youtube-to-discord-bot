
import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { ResearchPageLayout } from '../components/sections/ResearchPageLayout';

export const EmbeddedApp = () => {
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string; avatar: string | null } | null>(null);

  useEffect(() => {
    const sdk = new DiscordSDK('');
    let mounted = true;
    const doAuthenticate = async () => {
      try {
        await sdk.ready();
        // 먼저 SDK로 현재 사용자를 가져와 세션을 동기화 시도
        try {
          const u = (await sdk.commands.getUser()) as any;
          if (u && mounted) {
            setUser({ id: u.id, username: u.username, avatar: u.avatar ?? null });
            setAuthStatus('ok');
            // (선택) 서버와 동기화하려면 인증 코드 흐름도 실행할 수 있음
            return;
          }
        } catch (e) {
          // getUser may fail in some contexts; fall back to authenticate
        }

        // fallback: perform authenticate flow to exchange code on server
        const result = await sdk.commands.authenticate();
        const code = (result as any)?.code as string | undefined;
        if (!code) {
          if (mounted) setAuthStatus('no_code');
          return;
        }

        const resp = await fetch('/api/auth/sdk', {
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



