export interface FredSeriesConfig {
  id: string;
  label: string;
  unit: string;
  precision: number;
}

export interface FredIndicatorValue {
  id: string;
  label: string;
  unit: string;
  value: number;
  previous: number;
  delta: number;
  positive: boolean;
}

export const FRED_API_BASE = 'https://api.stlouisfed.org/fred';

export const FRED_SERIES: FredSeriesConfig[] = [
  { id: 'UNRATE', label: '미국 실업률', unit: '%', precision: 1 },
  { id: 'CPIAUCSL', label: '미국 CPI', unit: 'index', precision: 1 },
  { id: 'FEDFUNDS', label: '기준금리', unit: '%', precision: 2 },
  { id: 'DGS10', label: '10년물 국채', unit: '%', precision: 2 },
];

export const FRED_FALLBACK_INDICATORS: FredIndicatorValue[] = [
  {
    id: 'UNRATE',
    label: '미국 실업률',
    unit: '%',
    value: 4.1,
    previous: 4,
    delta: 0.1,
    positive: false,
  },
  {
    id: 'CPIAUCSL',
    label: '미국 CPI',
    unit: 'index',
    value: 317.3,
    previous: 316.5,
    delta: 0.8,
    positive: false,
  },
  {
    id: 'FEDFUNDS',
    label: '기준금리',
    unit: '%',
    value: 4.5,
    previous: 4.5,
    delta: 0,
    positive: true,
  },
  {
    id: 'DGS10',
    label: '10년물 국채',
    unit: '%',
    value: 4.02,
    previous: 3.97,
    delta: 0.05,
    positive: false,
  },
];
