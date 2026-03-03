import { randomBytes, timingSafeEqual } from 'crypto';
import { Router, Request, Response, type RequestHandler } from 'express';
import { supabase } from '../supabase';
import type { AuthenticatedRequest, JwtUser } from '../types';
import { getCookieSecurity, type RuntimeEnvironment } from '../backend/runtimeEnvironment';

type AuthUrlQuery = {
  redirectUri?: string;
};

type OAuthCallbackQuery = {
  code?: string;
  state?: string;
};

type OAuthStatePayload = {
  redirectUri: string;
  nonce: string;
};

type DiscordTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  avatar: string | null;
};

type AuthRoutesDeps = {
  runtime: RuntimeEnvironment;
  isSupabaseConfigured: boolean;
  requireAuth: RequestHandler;
  requireCsrf: RequestHandler;
  issueAuthCookie: (res: Response, jwtPayload: JwtUser) => void;
  isAllowedRedirectUri: (redirectUri: string, req: Request) => boolean;
  authCookieName: string;
  csrfCookieName: string;
  oauthNonceCookieName: string;
  oauthNonceMaxAgeMs: number;
  defaultDiscordTokenExpiresInSec: number;
  discordOauthTokenUrl: string;
  discordApiMeUrl: string;
};

export const createAuthRouter = ({
  runtime,
  isSupabaseConfigured,
  requireAuth,
  requireCsrf,
  issueAuthCookie,
  isAllowedRedirectUri,
  authCookieName,
  csrfCookieName,
  oauthNonceCookieName,
  oauthNonceMaxAgeMs,
  defaultDiscordTokenExpiresInSec,
  discordOauthTokenUrl,
  discordApiMeUrl,
}: AuthRoutesDeps) => {
  const router = Router();
  const cookieSecurity = getCookieSecurity(runtime);

  router.get('/api/auth/url', (req: Request, res: Response) => {
    const query = req.query as AuthUrlQuery;
    const redirectUri = String(query.redirectUri || '').trim();
    if (!isAllowedRedirectUri(redirectUri, req)) {
      return res.status(400).json({ error: 'Invalid redirectUri' });
    }

    const nonce = randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64');

    res.cookie(oauthNonceCookieName, nonce, {
      secure: cookieSecurity.secure,
      sameSite: 'lax',
      httpOnly: true,
      maxAge: oauthNonceMaxAgeMs,
    });

    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });

    return res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
  });

  router.get(['/auth/callback', '/auth/callback/'], async (req: Request, res: Response) => {
    const { code, state } = req.query as OAuthCallbackQuery;
    let redirectUri = '';
    let nonce = '';

    try {
      const decodedState = JSON.parse(Buffer.from(String(state || ''), 'base64').toString('utf-8')) as OAuthStatePayload;
      redirectUri = decodedState.redirectUri;
      nonce = decodedState.nonce;
    } catch {
      return res.status(400).send('Invalid state parameter');
    }

    if (!isAllowedRedirectUri(redirectUri, req)) {
      return res.status(400).send('Invalid redirectUri');
    }

    let redirectOrigin = '';
    try {
      redirectOrigin = new URL(redirectUri).origin;
    } catch {
      return res.status(400).send('Invalid redirectUri');
    }

    const nonceCookie = req.cookies?.[oauthNonceCookieName];
    res.clearCookie(oauthNonceCookieName, {
      secure: cookieSecurity.secure,
      sameSite: 'lax',
      httpOnly: true,
    });

    if (!nonceCookie || !nonce) {
      return res.status(400).send('Invalid OAuth nonce');
    }

    const nonceFromState = Buffer.from(nonce, 'utf-8');
    const nonceFromCookie = Buffer.from(String(nonceCookie), 'utf-8');
    const nonceValid = nonceFromState.length === nonceFromCookie.length && timingSafeEqual(nonceFromState, nonceFromCookie);
    if (!nonceValid) {
      return res.status(400).send('OAuth nonce validation failed');
    }

    try {
      const tokenResponse = await fetch(discordOauthTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code: String(code || ''),
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;
      if (!tokenData.access_token) {
        return res.status(400).send('Failed to authenticate with Discord');
      }

      const userResponse = await fetch(discordApiMeUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = (await userResponse.json()) as DiscordUserResponse;

      if (isSupabaseConfigured) {
        await supabase.from('users').upsert({
          id: userData.id,
          username: userData.username,
          avatar: userData.avatar,
          updated_at: new Date().toISOString(),
        });
      }

      const tokenExpiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || defaultDiscordTokenExpiresInSec);

      const jwtPayload: JwtUser = {
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt,
      };

      issueAuthCookie(res, jwtPayload);

      const safeTargetOrigin = JSON.stringify(redirectOrigin);
      return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, ${safeTargetOrigin});
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: unknown) {
      console.error('OAuth error:', error);
      return res.status(500).send('Authentication failed. Please try again.');
    }
  });

  router.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const safeUser = {
      id: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar,
    };

    return res.json({
      user: safeUser,
      csrfToken: req.cookies?.[csrfCookieName] || null,
    });
  });

  router.post('/api/auth/logout', requireCsrf, (_req: Request, res: Response) => {
    res.clearCookie(authCookieName, {
      secure: cookieSecurity.secure,
      sameSite: cookieSecurity.sameSite,
      httpOnly: true,
    });
    res.clearCookie(csrfCookieName, {
      secure: cookieSecurity.secure,
      sameSite: cookieSecurity.sameSite,
      httpOnly: false,
    });
    return res.json({ success: true });
  });

  return router;
};
