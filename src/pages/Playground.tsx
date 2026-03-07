import { type CSSProperties } from 'react';
import { BackToTopButton } from '../components/BackToTopButton';
import { dashboardContent } from '../content/dashboardContent';
import { playgroundContent } from '../content/playgroundContent';
import { getFinanceThemeCssVars } from '../config/financeTheme';
import { AppHeader } from '../components/ui/AppHeader';
import { FinanceChartPlayground } from '../components/finance/FinanceChartPlayground';
import { MuelReveal } from '../components/ui/MuelReveal';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { UiButton } from '../components/ui/UiButton';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { getMuelMotionCssVars } from '../lib/getMuelMotionCssVars';

interface PlaygroundProps {
  user?: { id: string; username: string; avatar?: string | null; isPresetAdmin?: boolean } | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export const Playground = ({ user, onLogin, onLogout }: PlaygroundProps) => {
  const { tokens } = useMuelMotion();
  const motionCssVars = getMuelMotionCssVars(tokens) as CSSProperties;
  const financeThemeCssVars = getFinanceThemeCssVars();
  const pageStyle = { ...motionCssVars, ...financeThemeCssVars } as CSSProperties;

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell finance-shell" style={pageStyle}>
      <AppHeader
        fixed
        animated={false}
        actions={
          <TopSectionSwitcher
            isAuthenticated={Boolean(user)}
            isPresetAdmin={Boolean(user?.isPresetAdmin)}
            username={user?.username}
            onLogin={onLogin ? () => void onLogin() : undefined}
            onLogout={onLogout ? () => void onLogout() : undefined}
          />
        }
      />

      <main id="playground-main" className="section-wrap section-v-80 section-cluster dashboard-kpay-flow dashboard-main-shell">
        <MuelReveal as="section" className="finance-board finance-playground-shell" delayMultiplier={0}>
          <FinanceChartPlayground
            title={dashboardContent.header.title}
            description={playgroundContent.chart.description}
          />
        </MuelReveal>

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={1}>
          <div className="hero-cta-stack">
            {playgroundContent.actions.map((action) => (
              <UiButton key={action.id} to={action.to} variant={action.variant} size={action.size}>{action.label}</UiButton>
            ))}
          </div>
        </MuelReveal>
      </main>

      <BackToTopButton />
    </div>
  );
};
