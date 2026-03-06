export type FredPlaygroundRange = '1Y' | '3Y' | '5Y' | '10Y';

export interface FredCatalogItem {
  id: string;
  label: string;
  unit: string;
  category: string;
}

export interface FredSeriesPoint {
  date: string;
  value: number;
}

export interface FredSeriesData {
  id: string;
  label: string;
  unit: string;
  points: FredSeriesPoint[];
}

export interface FredPlaygroundPayload {
  source: 'backend' | 'fallback';
  catalog: FredCatalogItem[];
  series: FredSeriesData[];
}

export const FRED_PLAYGROUND_DEFAULT_SERIES = ['UNRATE', 'CPIAUCSL', 'FEDFUNDS'] as const;
export const FRED_PLAYGROUND_RANGES: FredPlaygroundRange[] = ['1Y', '3Y', '5Y', '10Y'];

export const FRED_FALLBACK_CATALOG: FredCatalogItem[] = [
  { id: 'GDPC1', label: 'Real GDP', unit: 'bn USD', category: 'Growth' },
  { id: 'PCE', label: 'Personal Consumption Expenditures', unit: 'bn USD', category: 'Growth' },
  { id: 'INDPRO', label: 'Industrial Production Index', unit: 'index', category: 'Growth' },
  { id: 'UNRATE', label: 'Unemployment Rate', unit: '%', category: 'Labor' },
  { id: 'PAYEMS', label: 'Nonfarm Payrolls', unit: 'k', category: 'Labor' },
  { id: 'JTSJOL', label: 'Job Openings', unit: 'k', category: 'Labor' },
  { id: 'CPIAUCSL', label: 'Consumer Price Index', unit: 'index', category: 'Inflation' },
  { id: 'PCEPILFE', label: 'Core PCE Price Index', unit: 'index', category: 'Inflation' },
  { id: 'PPIFIS', label: 'Producer Price Index: Finished Goods', unit: 'index', category: 'Inflation' },
  { id: 'FEDFUNDS', label: 'Federal Funds Rate', unit: '%', category: 'Policy' },
  { id: 'T10Y2Y', label: '10Y-2Y Treasury Spread', unit: '%', category: 'Policy' },
  { id: 'M2SL', label: 'M2 Money Stock', unit: 'bn USD', category: 'Policy' },
  { id: 'DGS10', label: '10Y Treasury Yield', unit: '%', category: 'Rates' },
  { id: 'RSAFS', label: 'Retail Sales', unit: 'bn USD', category: 'Demand' },
  { id: 'ICSA', label: 'Initial Jobless Claims', unit: 'k', category: 'Labor' },
];

const RANGE_POINT_COUNT: Record<FredPlaygroundRange, number> = {
  '1Y': 12,
  '3Y': 36,
  '5Y': 60,
  '10Y': 120,
};

const seriesSeed = (seriesId: string) => {
  return seriesId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
};

const unitBase = (unit: string) => {
  if (unit === '%') return 4.2;
  if (unit === 'k') return 210;
  if (unit === 'bn USD') return 980;
  return 100;
};

export const buildFallbackSeries = (
  catalog: FredCatalogItem[],
  selectedIds: string[],
  range: FredPlaygroundRange,
): FredSeriesData[] => {
  const pointCount = RANGE_POINT_COUNT[range];

  return selectedIds
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is FredCatalogItem => Boolean(item))
    .map((item) => {
      const seed = seriesSeed(item.id);
      const baseline = unitBase(item.unit) + (seed % 20) * 0.4;

      const points: FredSeriesPoint[] = Array.from({ length: pointCount }, (_, index) => {
        const trend = index * (0.03 + (seed % 7) * 0.002);
        const cycle = Math.sin(index / (2.2 + (seed % 5) * 0.35)) * (0.6 + (seed % 4) * 0.2);
        const noise = Math.cos(index * 0.41 + seed) * 0.16;
        const value = baseline + trend + cycle + noise;

        return {
          date: `T${String(index + 1).padStart(3, '0')}`,
          value: Number(value.toFixed(3)),
        };
      });

      return {
        id: item.id,
        label: item.label,
        unit: item.unit,
        points,
      };
    });
};
