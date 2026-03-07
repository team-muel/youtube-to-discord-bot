import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { API_BASE, ApiError, apiFetch, apiFetchJson } from './config';
import { Dashboard, EmbeddedApp, Playground, QuantCenter, StudioReference, SupportCenter } from './pages';
import { applySurfaceMode, getStoredSurfaceMode } from './surfaceMode';
import { SurfaceCard } from './components/ui/SurfaceCard';
import { ROUTES } from './config/routes';
import { BENCHMARK_EVENTS } from './config/benchmarkEvents';
import { trackBenchmarkEvent } from './lib/benchmarkTracker';
import { useBenchmarkSync } from './hooks/useBenchmarkSync';

interface User {
  id: string;
  username: string;
  avatar?: string | null;
  isPresetAdmin?: boolean;
}

type AuthMeResponse = {
  user: User;
  isPresetAdmin?: boolean;
  csrfToken?: string | null;
};

type AuthUrlResponse = {
  url: string;
};

type AuthFlowLevel = 'progress' | 'success' | 'error';

const resolveOAuthCallbackUri = () => {
  const fallback = `${window.location.origin}/auth/callback`;
  if (!API_BASE) {
    return fallback;
  }

  try {
    const apiBaseUrl = new URL(API_BASE, window.location.origin);
    return `${apiBaseUrl.origin}/auth/callback`;
  } catch {
    return fallback;
  }
};

const resolveOAuthMessageOrigins = () => {
  const origins = new Set<string>([window.location.origin]);
  if (!API_BASE) {
    return origins;
  }

  try {
    const apiBaseUrl = new URL(API_BASE, window.location.origin);
    origins.add(apiBaseUrl.origin);
  } catch {
    // Ignore malformed API base and keep current origin only.
  }

  return origins;
};

const RouteBenchmarkTracker = () => {
  const location = useLocation();

  useEffect(() => {
    trackBenchmarkEvent(BENCHMARK_EVENTS.routeView, {
      route: location.pathname,
    });
  }, [location.pathname]);

  return null;
};

const RouteScrollReset = () => {
  const location = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    const frame = requestAnimationFrame(reset);
    const timer = window.setTimeout(reset, 0);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [location.key, location.pathname, location.search]);

  return null;
};

export default function App() {
  useBenchmarkSync();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bootProgress, setBootProgress] = useState(8);
  const [authFlowMessage, setAuthFlowMessage] = useState<string | null>(null);
  const [authFlowLevel, setAuthFlowLevel] = useState<AuthFlowLevel>('progress');
  const authLoginIntentRef = useRef(false);
  const authMessageTimerRef = useRef<number | null>(null);

  const showAuthFlowMessage = useCallback((message: string | null, level: AuthFlowLevel, autoClearMs = 0) => {
    if (authMessageTimerRef.current !== null) {
      window.clearTimeout(authMessageTimerRef.current);
      authMessageTimerRef.current = null;
    }

    setAuthFlowLevel(level);
    setAuthFlowMessage(message);

    if (!message || autoClearMs <= 0) {
      return;
    }

    authMessageTimerRef.current = window.setTimeout(() => {
      setAuthFlowMessage(null);
      authMessageTimerRef.current = null;
    }, autoClearMs);
  }, []);

  const probePresetAdmin = useCallback(async () => {
    try {
      const response = await apiFetch('/api/trading/runtime');
      if (response.status === 200) {
        return true;
      }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return false;
      }
    } catch {
      return false;
    }

    return false;
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const data = await apiFetchJson<AuthMeResponse>('/api/auth/me');
      const inferredAdmin = typeof data.isPresetAdmin === 'boolean' ? data.isPresetAdmin : await probePresetAdmin();
      setUser({
        ...data.user,
        isPresetAdmin: inferredAdmin,
      });

      if (authLoginIntentRef.current) {
        authLoginIntentRef.current = false;
        showAuthFlowMessage(`${data.user.username} 계정으로 로그인되었습니다.`, 'success', 4500);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
      }
      setUser(null);

      if (authLoginIntentRef.current) {
        authLoginIntentRef.current = false;
        showAuthFlowMessage('로그인 세션 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error', 7000);
      }
    } finally {
      setAuthLoading(false);
    }
  }, [probePresetAdmin, showAuthFlowMessage]);

  const handleLogin = useCallback(async () => {
    if (authLoginIntentRef.current) {
      showAuthFlowMessage('이미 로그인 과정을 진행 중입니다.', 'progress', 3000);
      return;
    }

    const popupWidth = 560;
    const popupHeight = 740;
    const popupLeft = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
    const popupTop = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));

    // Open the popup synchronously to avoid popup blockers after async work.
    const popup = window.open(
      '',
      'muel_discord_oauth',
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop}`,
    );

    if (popup) {
      popup.document.title = 'MUEL Discord Login';
      popup.document.body.innerHTML = '<p style="font:14px sans-serif; padding: 16px;">Discord 인증 페이지를 준비하고 있습니다...</p>';
    }

    try {
      authLoginIntentRef.current = true;
      showAuthFlowMessage('Discord 로그인 창을 준비하고 있습니다...', 'progress');

      const redirectUri = resolveOAuthCallbackUri();
      const query = new URLSearchParams({ redirectUri });
      const data = await apiFetchJson<AuthUrlResponse>(`/api/auth/url?${query.toString()}`);

      if (!data.url) {
        throw new Error('OAuth URL is empty');
      }

      if (!popup) {
        showAuthFlowMessage('브라우저가 팝업을 차단해 현재 탭에서 인증을 진행합니다.', 'progress', 5000);
        window.location.href = data.url;
        return;
      }

      popup.location.href = data.url;
      showAuthFlowMessage('Discord 팝업에서 인증을 완료해 주세요.', 'progress');

      popup.focus();

      const watch = window.setInterval(() => {
        if (!popup.closed) {
          return;
        }

        window.clearInterval(watch);
        showAuthFlowMessage('팝업이 닫혀 인증 상태를 확인하고 있습니다...', 'progress');
        void checkAuth();
      }, 800);

      window.setTimeout(() => window.clearInterval(watch), 120000);
    } catch (error) {
      authLoginIntentRef.current = false;
      if (popup && !popup.closed) {
        popup.close();
      }

      if (error instanceof ApiError && error.status === 400) {
        showAuthFlowMessage('로그인을 시작할 수 없습니다. 서버의 OAuth redirect allowlist 설정을 확인해 주세요.', 'error', 9000);
      } else {
        showAuthFlowMessage('로그인 창을 열지 못했습니다. 팝업 차단 또는 네트워크 상태를 확인해 주세요.', 'error', 9000);
      }
      console.error('Failed to start OAuth login flow:', error);
    }
  }, [checkAuth, showAuthFlowMessage]);

  const handleLogout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  useEffect(() => {
    applySurfaceMode(getStoredSurfaceMode());
    trackBenchmarkEvent(BENCHMARK_EVENTS.appBootStart);
  }, []);

  useEffect(() => {
    checkAuth();
    const allowedOrigins = resolveOAuthMessageOrigins();
    
    const handleMessage = (event: MessageEvent) => {
      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        showAuthFlowMessage('인증 완료 신호를 수신했습니다. 세션을 동기화합니다...', 'progress');
        void checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkAuth, showAuthFlowMessage]);

  useEffect(() => {
    return () => {
      if (authMessageTimerRef.current !== null) {
        window.clearTimeout(authMessageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!authLoading) {
      setBootProgress(100);
      trackBenchmarkEvent(BENCHMARK_EVENTS.appBootComplete, {
        authenticated: Boolean(user),
      });
      return;
    }

    setBootProgress(8);
    const interval = window.setInterval(() => {
      setBootProgress((prev) => {
        if (prev >= 92) return prev;
        const increment = prev < 36 ? 9 : prev < 68 ? 5 : 2.2;
        return Math.min(92, prev + increment + Math.random() * 1.4);
      });
    }, 110);

    return () => window.clearInterval(interval);
  }, [authLoading, user]);

  useEffect(() => {
    const handleDelegatedClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const element = target.closest<HTMLElement>('[data-benchmark-event]');
      if (!element) {
        return;
      }

      const eventName = element.dataset.benchmarkEvent;
      if (!eventName) {
        return;
      }

      trackBenchmarkEvent(eventName, {
        id: element.dataset.benchmarkId,
        label: element.dataset.benchmarkLabel,
        area: element.dataset.benchmarkArea,
      });
    };

    document.addEventListener('click', handleDelegatedClick, { capture: true });
    return () => document.removeEventListener('click', handleDelegatedClick, { capture: true });
  }, []);

  useEffect(() => {
    const revealClass = 'io-reveal';
    const visibleClass = 'is-visible';

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(visibleClass);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    const observeTargets = () => {
      const targets = document.querySelectorAll<HTMLElement>(`.${revealClass}:not(.${visibleClass})`);
      targets.forEach((target) => observer.observe(target));
    };

    observeTargets();

    const mutationObserver = new MutationObserver(() => {
      observeTargets();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    let lastTime = performance.now();

    const applyRevealDurationByScrollSpeed = () => {
      const now = performance.now();
      const currentY = window.scrollY;
      const deltaY = Math.abs(currentY - lastY);
      const deltaT = Math.max(16, now - lastTime);
      const speed = deltaY / deltaT;
      const normalized = Math.min(1, speed / 2);
      const duration = 0.7 - normalized * 0.3;

      document.documentElement.style.setProperty('--reveal-duration', `${duration.toFixed(3)}s`);

      lastY = currentY;
      lastTime = now;
    };

    applyRevealDurationByScrollSpeed();
    window.addEventListener('scroll', applyRevealDurationByScrollSpeed, { passive: true });

    return () => {
      window.removeEventListener('scroll', applyRevealDurationByScrollSpeed);
    };
  }, []);

  const bootStep =
    bootProgress < 30
      ? 'SECURE HANDSHAKE'
      : bootProgress < 55
      ? 'AUTH CONTEXT SYNC'
      : bootProgress < 80
      ? 'PIPELINE VALIDATION'
      : 'DASHBOARD BOOTSTRAP';

  if (authLoading) {
    return (
      <div className="surface-page surface-bridge hud-grid app-boot-shell">
        <SurfaceCard className="quant-scan app-boot-card">
          <div className="mono-data app-boot-kicker">DISCORD WEBVIEW BOOT</div>
          <h1 className="app-boot-title">System Initializing...</h1>
          <p className="app-boot-desc">보안 컨텍스트와 운영 데이터를 동기화 중입니다.</p>

          <div className="app-boot-progress-shell">
            <div className="app-boot-progress-track">
              <div
                className="app-boot-progress-fill"
                style={{ width: `${bootProgress}%` }}
              />
            </div>
          </div>

          <div className="app-boot-meta">
            <span className="mono-data app-boot-step">{bootStep}</span>
            <span className="mono-data app-boot-percent">{Math.floor(bootProgress)}%</span>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <RouteBenchmarkTracker />
      <RouteScrollReset />
      {authFlowMessage ? (
        <div className={`auth-flow-toast is-${authFlowLevel}`} role={authFlowLevel === 'error' ? 'alert' : 'status'} aria-live="polite">
          {authFlowMessage}
        </div>
      ) : null}
      <Routes>
        <Route path={ROUTES.home} element={<Dashboard user={user} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path={ROUTES.playground} element={<Playground user={user} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path={ROUTES.inApp} element={<EmbeddedApp user={user} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route
          path={ROUTES.quant}
          element={user?.isPresetAdmin ? <QuantCenter user={user} onLogin={handleLogin} onLogout={handleLogout} /> : <Navigate to={ROUTES.home} replace />}
        />
        <Route path={ROUTES.embedded} element={<Navigate to={ROUTES.inApp} replace />} />
        <Route path={ROUTES.dashboard} element={<Navigate to={ROUTES.home} replace />} />
        <Route path={ROUTES.studio} element={<StudioReference user={user} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path={ROUTES.support} element={<SupportCenter user={user} onLogin={handleLogin} onLogout={handleLogout} />} />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </BrowserRouter>
  );
}



