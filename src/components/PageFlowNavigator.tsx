import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BENCHMARK_EVENTS } from '../config/benchmarkEvents';
import { SurfaceCard } from './ui/SurfaceCard';
import { UiButton } from './ui/UiButton';

interface PageFlowNavigatorProps {
  current: number;
  total: number;
  title: string;
  description?: string;
  prevTo?: string;
  prevLabel?: string;
  nextTo?: string;
  nextLabel?: string;
}

export const PageFlowNavigator: React.FC<PageFlowNavigatorProps> = ({
  current,
  total,
  title,
  description,
  prevTo,
  prevLabel = '이전 화면',
  nextTo,
  nextLabel = '다음 화면',
}) => {
  return (
    <section className="page-flow-section">
      <SurfaceCard className="page-flow-card">
        <div className="mono-data page-flow-kicker">PAGE FLOW</div>
        <h2 className="type-h2 page-flow-title">{title}</h2>
        {description && <p className="type-body page-flow-desc">{description}</p>}
        <div className="page-flow-footer">
          <span className="mono-data page-flow-indicator">
            PAGE {current} / {total}
          </span>
          <div className="page-flow-actions">
            {prevTo && (
              <UiButton
                to={prevTo}
                variant="outline"
                benchmarkEvent={BENCHMARK_EVENTS.flowClick}
                benchmarkId={prevTo}
                benchmarkLabel={prevLabel}
                benchmarkArea="page-flow-prev"
              >
                <ArrowLeft className="icon-16" /> {prevLabel}
              </UiButton>
            )}
            {nextTo && (
              <UiButton
                to={nextTo}
                variant="accent"
                benchmarkEvent={BENCHMARK_EVENTS.flowClick}
                benchmarkId={nextTo}
                benchmarkLabel={nextLabel}
                benchmarkArea="page-flow-next"
              >
                {nextLabel} <ArrowRight className="icon-16" />
              </UiButton>
            )}
          </div>
        </div>
      </SurfaceCard>
    </section>
  );
};
