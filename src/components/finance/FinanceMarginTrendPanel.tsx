import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import {
  FINANCE_PERIOD_TABS,
  getFinanceMarginTrendByPeriod,
  type FinancePeriodTab,
} from '../../config/financeDashboard';
import { FinancePanel } from './FinancePanel';
import { FinanceSegmentedTabs } from './FinanceSegmentedTabs';

interface FinanceMarginTrendPanelProps {
  title: string;
  kicker: string;
  metrics: Array<{
    id: string;
    label: string;
    value: number;
    suffix: string;
    description: string;
  }>;
  metricsAriaLabel: string;
}

type TrendTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
};

const TrendTooltip = ({ active, payload, label }: TrendTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const finalMargin = payload.find((entry) => entry.name === 'Final Goods')?.value;
  const intermediateMargin = payload.find((entry) => entry.name === 'Intermediate Goods')?.value;

  return (
    <div className="finance-chart-tooltip" role="status" aria-live="polite">
      <p className="finance-chart-tooltip-label mono-data">P{label}</p>
      <p className="finance-chart-tooltip-value mono-data">Final {typeof finalMargin === 'number' ? `${finalMargin.toFixed(2)}%` : '-'}</p>
      <p className="finance-chart-tooltip-value mono-data">Inter {typeof intermediateMargin === 'number' ? `${intermediateMargin.toFixed(2)}%` : '-'}</p>
    </div>
  );
};

export const FinanceMarginTrendPanel = ({
  title,
  kicker,
  metrics,
  metricsAriaLabel,
}: FinanceMarginTrendPanelProps) => {
  const [activePeriodIndex, setActivePeriodIndex] = useState(2);
  const activePeriod = FINANCE_PERIOD_TABS[activePeriodIndex] as FinancePeriodTab;

  const trendData = useMemo(() => getFinanceMarginTrendByPeriod(activePeriod), [activePeriod]);

  return (
    <FinancePanel
      as="article"
      className="finance-panel-chart"
      kicker={kicker}
      title={title}
      action={(
        <FinanceSegmentedTabs
          items={FINANCE_PERIOD_TABS}
          activeIndex={activePeriodIndex}
          onChange={setActivePeriodIndex}
          ariaLabel="period selector"
          className="finance-mini-tabs"
        />
      )}
    >
      <div className="finance-chart-canvas" role="img" aria-label="final goods and intermediate goods margin trend chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="financeFinalFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--finance-chart-final)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--finance-chart-final)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(95 99 104 / 14%)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: '#5f6368' }}
              dy={6}
            />
            <YAxis hide domain={['dataMin - 0.8', 'dataMax + 0.8']} />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: 'rgb(62 207 142 / 36%)', strokeWidth: 1 }}
              animationDuration={180}
            />
            <Area
              type="monotone"
              dataKey="finalMargin"
              stroke="none"
              fill="url(#financeFinalFill)"
              fillOpacity={1}
              isAnimationActive
              animationDuration={760}
              animationEasing="ease-out"
            />
            <Line
              name="Final Goods"
              type="monotone"
              dataKey="finalMargin"
              stroke="var(--finance-chart-final)"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--finance-chart-final)' }}
              isAnimationActive
              animationDuration={760}
              animationEasing="ease-out"
            />
            <Line
              name="Intermediate Goods"
              type="monotone"
              dataKey="intermediateMargin"
              stroke="var(--finance-chart-intermediate)"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--finance-chart-intermediate)' }}
              isAnimationActive
              animationDuration={840}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="finance-chart-legend" aria-hidden="true">
        <span className="finance-legend-item">
          <i className="finance-legend-dot is-final" /> Final Goods Margin
        </span>
        <span className="finance-legend-item">
          <i className="finance-legend-dot is-intermediate" /> Intermediate Goods Margin
        </span>
      </div>

      <div className="finance-stat-row" aria-label={metricsAriaLabel}>
        {metrics.map((metric) => (
          <div key={metric.id} className="finance-stat">
            <p className="finance-stat-label">{metric.label}</p>
            <p className="finance-stat-value mono-data">
              {metric.value}
              {metric.suffix}
            </p>
            <p className="finance-stat-desc">{metric.description}</p>
          </div>
        ))}
      </div>
    </FinancePanel>
  );
};
