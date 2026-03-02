import React from 'react';
import { BENCHMARK_EVENTS } from '../config/benchmarkEvents';

interface SectionFlowItem {
  id: string;
  label: string;
}

interface SectionFlowRailProps {
  items: SectionFlowItem[];
  activeSection: string;
  activeTextClassName?: string;
}

export const SectionFlowRail: React.FC<SectionFlowRailProps> = ({
  items,
  activeSection,
  activeTextClassName = 'section-flow-link-active',
}) => {
  return (
    <aside className="section-flow-rail">
      <div className="section-flow-rail-shell">
        <div className="mono-data section-flow-title">SCROLL FLOW</div>
        <nav className="section-flow-nav">
          {items.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`section-flow-link ${isActive ? activeTextClassName : ''}`.trim()}
                data-benchmark-event={BENCHMARK_EVENTS.sectionRailClick}
                data-benchmark-id={section.id}
                data-benchmark-label={section.label}
                data-benchmark-area="section-rail"
              >
                <span
                  className={`section-flow-dot ${isActive ? 'is-active' : ''}`.trim()}
                />
                <span className="mono-data section-flow-label">{section.label}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
