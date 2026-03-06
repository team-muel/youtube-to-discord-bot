import { type CSSProperties } from 'react';
import { BackToTopButton } from '../components/BackToTopButton';
import { dashboardContent, type HubPageContent } from '../content/dashboardContent';
import { getFinanceThemeCssVars } from '../config/financeTheme';
import { AppHeader } from '../components/ui/AppHeader';
import { FinanceChartPlayground } from '../components/finance/FinanceChartPlayground';
import { MuelReveal } from '../components/ui/MuelReveal';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { getMuelMotionCssVars } from '../lib/getMuelMotionCssVars';

interface DashboardProps {
  user?: { id: string; username: string; avatar?: string | null } | null;
  onLogout?: () => void;
  content?: HubPageContent;
}

export const Dashboard = ({ user: _user, onLogout: _onLogout, content = dashboardContent }: DashboardProps) => {
  const { tokens } = useMuelMotion();
  const motionCssVars = getMuelMotionCssVars(tokens) as CSSProperties;
  const financeThemeCssVars = getFinanceThemeCssVars();
  const pageStyle = { ...motionCssVars, ...financeThemeCssVars } as CSSProperties;

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell finance-shell" style={pageStyle}>
      <AppHeader fixed animated={false} />

      <main id="dashboard-main" className="section-wrap section-v-80 finance-main-shell">
        <MuelReveal as="section" className="finance-board finance-playground-shell" delayMultiplier={0}>
          <FinanceChartPlayground
            title={content.header.title}
            description={content.hero.description}
          />
        </MuelReveal>
      </main>

      <BackToTopButton />
    </div>
  );
};
