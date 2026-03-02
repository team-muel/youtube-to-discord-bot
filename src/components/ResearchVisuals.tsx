import { motion } from 'motion/react';
import { SurfaceCard } from './ui/SurfaceCard';
import { SECTION_MOTION_TOKENS } from '../config/experienceTokens';

type RadarMetric = { label: string; value: number };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const radarPoint = (index: number, total: number, radius: number, center: number, ratio = 1) => {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  const r = radius * ratio;
  return {
    x: center + Math.cos(angle) * r,
    y: center + Math.sin(angle) * r,
  };
};

interface RadarCardProps {
  title: string;
  subtitle: string;
  metrics: readonly RadarMetric[];
}

export const RadarResearchCard = ({ title, subtitle, metrics }: RadarCardProps) => {
  const center = 110;
  const radius = 74;

  const dataPolygon = metrics
    .map((metric, idx) => {
      const point = radarPoint(idx, metrics.length, radius, center, clamp(metric.value) / 100);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  return (
    <SurfaceCard hoverable className="research-card research-visual-card muel-interact">
      <div className="mono-data research-card-kicker">{subtitle}</div>
      <h3 className="research-card-title">{title}</h3>
      <div className="research-radar-layout">
        <div className="hover-media research-radar-shell">
          <svg viewBox="0 0 220 220" className="research-radar-svg">
            <motion.polygon
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: SECTION_MOTION_TOKENS.timing.drawDuration, ease: SECTION_MOTION_TOKENS.timing.ease }}
              points={dataPolygon}
              fill="var(--accent)"
              fillOpacity="0.16"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <circle className="research-radar-core" cx={center} cy={center} r="4" />
          </svg>
        </div>
        <ul className="research-row-list">
          {metrics.map((metric) => (
            <li key={metric.label} className="research-row-line research-row-item">
              <span>{metric.label}</span>
              <span className="mono-data research-row-value">{metric.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </SurfaceCard>
  );
};

interface TrendCardProps {
  title: string;
  subtitle: string;
  labels: readonly string[];
  values: readonly number[];
}

export const TrendResearchCard = ({ title, subtitle, labels, values }: TrendCardProps) => {
  const width = 420;
  const height = 172;
  const padX = 22;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values.map((value, idx) => {
    const x = padX + (idx / Math.max(1, values.length - 1)) * chartW;
    const y = height - padY - ((value - min) / range) * chartH;
    return { x, y };
  });

  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <SurfaceCard hoverable className="research-card research-visual-card muel-interact">
      <div className="mono-data research-card-kicker">{subtitle}</div>
      <h3 className="research-card-title">{title}</h3>

      <div className="hover-media research-chart-shell research-trend-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="research-trend-svg">
          <motion.polyline
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: SECTION_MOTION_TOKENS.timing.drawDuration, ease: SECTION_MOTION_TOKENS.timing.ease }}
            points={pointString}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="research-trend-meta-grid">
        {labels.map((label, idx) => (
          <div key={`${label}-${idx}`} className="mono-data research-trend-meta-item">
            {label}: {values[idx]}
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
};

interface PremiumCardProps {
  title: string;
  subtitle: string;
  lockLabel: string;
  rows: ReadonlyArray<{ label: string; value: string }>;
}

export const PremiumResearchCard = ({ title, subtitle, lockLabel, rows }: PremiumCardProps) => {
  return (
    <SurfaceCard hoverable className="research-card research-visual-card muel-interact">
      <div className="mono-data research-card-kicker">{subtitle}</div>
      <h3 className="research-card-title">{title}</h3>

      <div className="paywall-wrap research-chart-shell research-premium-shell">
        <div className="paywall-blur research-row-list research-premium-list">
          {rows.map((row) => (
            <div key={row.label} className="research-row-line research-premium-row">
              <span>{row.label}</span>
              <span className="mono-data research-row-value">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="paywall-overlay">
          <p className="mono-data research-lock-pill">{lockLabel}</p>
        </div>
      </div>
    </SurfaceCard>
  );
};
