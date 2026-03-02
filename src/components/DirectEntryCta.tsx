import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ROUTES } from '../config/routes';
import { BENCHMARK_EVENTS } from '../config/benchmarkEvents';
import { commonText } from '../content/commonText';
import { UiButton } from './ui/UiButton';

interface DirectEntryRoute {
  to: typeof ROUTES.inApp | typeof ROUTES.home;
  label: string;
}

interface DirectEntryCtaProps {
  routes?: DirectEntryRoute[];
  className?: string;
}

const defaultRoutes: DirectEntryRoute[] = [
  { to: ROUTES.inApp, label: commonText.action.moveEmbedded },
  { to: ROUTES.home, label: commonText.action.moveDashboard },
];

export const DirectEntryCta: React.FC<DirectEntryCtaProps> = ({
  routes = defaultRoutes,
  className = '',
}) => {
  return (
    <div className={`direct-entry-shell ${className}`.trim()}>
      <div className="direct-entry-row">
        <p className="type-body direct-entry-text">{commonText.helper.directEntry}</p>
        <div className="direct-entry-actions">
          {routes.map((route) => (
            <UiButton
              key={route.to}
              to={route.to}
              variant="outline"
              size="lg"
              benchmarkEvent={BENCHMARK_EVENTS.ctaClick}
              benchmarkId={route.to}
              benchmarkLabel={route.label}
              benchmarkArea="direct-entry"
            >
              {route.label} <ArrowUpRight className="icon-16" />
            </UiButton>
          ))}
        </div>
      </div>
    </div>
  );
};
