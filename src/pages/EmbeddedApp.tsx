
import { useEffect, useState } from 'react';
import { ResearchPageLayout } from '../components/sections/ResearchPageLayout';
import { apiFetch, buildApiUrl } from '../config';

interface EmbeddedAppProps {
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export const EmbeddedApp = ({ user, onLogin, onLogout }: EmbeddedAppProps) => {
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [sdkUser, setSdkUser] = useState<{ id: string; username: string; avatar: string | null } | null>(null);

  useEffect(() => {
    const isEmbeddedSurface = window.self !== window.top;
    if (!isEmbeddedSurface) {
      setAuthStatus('web_surface');
      return;
    }

    let mounted = true;
    const doAuthenticate = async () => {
      try {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        const sdk = new DiscordSDK('');
        await sdk.ready();
        const result = await sdk.commands.authenticate({});
        const code = (result as any)?.code as string | undefined;

        if (mounted && (result as any)?.user) {
          const sdkUser = (result as any).user;
          const avatarUrl = sdkUser.avatar
            ? `https://cdn.discordapp.com/avatars/${sdkUser.id}/${sdkUser.avatar}.png`
            : null;
          setSdkUser({
            id: sdkUser.id,
            username: sdkUser.username,
            avatar: avatarUrl,
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
      <ResearchPageLayout presetKey="embedded" user={user} onLogin={onLogin} onLogout={onLogout} />
      {sdkUser && (
        <div style={{ position: 'fixed', bottom: 8, right: 8, background: '#eef', padding: 8, borderRadius: 6 }}>
          <strong>{sdkUser.username}</strong>
          {sdkUser.avatar && <img src={buildApiUrl(sdkUser.avatar)} alt="avatar" style={{ width: 24, height: 24, marginLeft: 8, borderRadius: 4 }} />}
        </div>
      )}
      {authStatus === 'ok' && !sdkUser && <div style={{ display: 'none' }} />}
      {authStatus && authStatus !== 'ok' && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, background: '#fee', padding: 8 }}>
          Auth status: {authStatus}
        </div>
      )}
    </>
  );
};



