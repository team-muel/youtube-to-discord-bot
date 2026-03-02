import React from 'react';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { AppHeader } from '../components/ui/AppHeader';

export const StudioReference: React.FC = () => {
  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell">
      <AppHeader fixed animated={false} actions={<TopSectionSwitcher />} />
      <main className="section-wrap section-v-80 dashboard-kpay-flow" />
    </div>
  );
};
