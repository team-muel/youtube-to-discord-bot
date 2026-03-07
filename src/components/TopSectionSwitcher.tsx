import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sectionNavigationItems } from '../config/sectionNavigation';
import { BENCHMARK_EVENTS } from '../config/benchmarkEvents';

interface TopSectionSwitcherProps {
  compact?: boolean;
  includeExternal?: boolean;
  isAuthenticated?: boolean;
  isPresetAdmin?: boolean;
  username?: string | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

export const TopSectionSwitcher: React.FC<TopSectionSwitcherProps> = ({
  compact = true,
  includeExternal = true,
  isAuthenticated = false,
  isPresetAdmin = false,
  username,
  onLogin,
  onLogout,
}) => {
  const location = useLocation();
  const items = (includeExternal ? sectionNavigationItems : sectionNavigationItems.filter((item) => !item.external)).filter((item) => {
    if (item.access === 'public') {
      return true;
    }
    if (item.access === 'authenticated') {
      return isAuthenticated;
    }
    return isPresetAdmin;
  });

  return (
    <div className="kpay-topbar-nav" aria-label="top section switcher">
      <div className="kpay-locale kpay-locale-ghost" aria-hidden="true">
        <span className="kpay-locale-item">KOR</span>
        <span className="kpay-locale-item">ENG</span>
      </div>
      <nav className="kpay-menu-rail">
        {items.map((item) => {
          const isActive = !item.external && (location.pathname === item.to || (item.to === '/' && location.pathname === '/'));
          const label = compact ? (item.shortLabel ?? item.label) : item.label;

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.to}
                className={`kpay-menu-item ${isActive ? 'is-active' : ''}`}
                aria-label={`${item.label} 열기`}
                data-benchmark-event={BENCHMARK_EVENTS.navClick}
                data-benchmark-id={item.to}
                data-benchmark-label={item.label}
                data-benchmark-area="top-switcher"
              >
                <span className="kpay-menu-item-label">{label}</span>
              </a>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to}
              className={`kpay-menu-item ${isActive ? 'is-active' : ''}`}
              aria-label={`${item.label} 이동`}
              aria-current={isActive ? 'page' : undefined}
              data-benchmark-event={BENCHMARK_EVENTS.navClick}
              data-benchmark-id={item.to}
              data-benchmark-label={item.label}
              data-benchmark-area="top-switcher"
            >
              <span className="kpay-menu-item-label">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="kpay-locale" aria-label="language selector">
        <button type="button" className="kpay-locale-item is-active" aria-pressed="true">KOR</button>
        <button type="button" className="kpay-locale-item" aria-pressed="false">ENG</button>
      </div>
      <div className="kpay-auth-actions" aria-label="authentication actions">
        {isAuthenticated ? (
          <>
            <span className="kpay-auth-user" title={username || 'authenticated user'}>
              {username || 'Authenticated'}
            </span>
            {onLogout ? (
              <button type="button" className="kpay-auth-button" onClick={onLogout}>
                Logout
              </button>
            ) : null}
          </>
        ) : onLogin ? (
          <button type="button" className="kpay-auth-button" onClick={onLogin}>
            Login
          </button>
        ) : null}
      </div>
    </div>
  );
};
