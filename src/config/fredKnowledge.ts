export interface FredLibraryBucket {
  label: string;
  countText: string;
}

export interface MacroIndicatorKnowledge {
  id: string;
  label: string;
  meaning: string;
  whyItMatters: string;
  category: 'Growth' | 'Employment' | 'Inflation' | 'Money';
}

export interface MacroCategoryKnowledge {
  category: 'Growth' | 'Employment' | 'Inflation' | 'Money';
  theme: string;
  chain: string;
  indicators: string[];
}

export interface MacroPreset {
  id: string;
  label: string;
  description: string;
  indicators: string[];
}

export const FRED_LIBRARY_BUCKETS: FredLibraryBucket[] = [
  { label: 'U.S. Regional', countText: '460,000+' },
  { label: 'International', countText: '130,000+' },
  { label: 'Production & Business', countText: '83,000+' },
  { label: 'National Accounts', countText: '53,000+' },
  { label: 'Population & Employment', countText: '49,000+' },
];

export const MACRO_INDICATOR_KNOWLEDGE: MacroIndicatorKnowledge[] = [
  {
    id: 'GDPC1',
    label: 'Real GDP',
    meaning: 'Inflation-adjusted total value of domestic production.',
    whyItMatters: 'Direct proxy for expansion vs contraction of the economy.',
    category: 'Growth',
  },
  {
    id: 'PCE',
    label: 'Personal Consumption Expenditures',
    meaning: 'Household spending on goods and services.',
    whyItMatters: 'Consumption leads production and often leads GDP momentum.',
    category: 'Growth',
  },
  {
    id: 'INDPRO',
    label: 'Industrial Production Index',
    meaning: 'Real output of manufacturing, mining, and utilities.',
    whyItMatters: 'High-frequency read on the real economy supply side.',
    category: 'Growth',
  },
  {
    id: 'UNRATE',
    label: 'Unemployment Rate',
    meaning: 'Share of labor force without jobs.',
    whyItMatters: 'Core labor slack metric watched for recession signals.',
    category: 'Employment',
  },
  {
    id: 'PAYEMS',
    label: 'Nonfarm Payrolls',
    meaning: 'Total jobs created outside agriculture.',
    whyItMatters: 'Most followed monthly labor demand pulse.',
    category: 'Employment',
  },
  {
    id: 'JTSJOL',
    label: 'Job Openings',
    meaning: 'Unfilled positions firms are actively trying to hire for.',
    whyItMatters: 'Forward-looking labor tightness and hiring appetite.',
    category: 'Employment',
  },
  {
    id: 'CPIAUCSL',
    label: 'Consumer Price Index',
    meaning: 'Consumer basket price changes over time.',
    whyItMatters: 'Tracks household inflation pressure and purchasing power.',
    category: 'Inflation',
  },
  {
    id: 'PCEPILFE',
    label: 'Core PCE Price Index',
    meaning: 'PCE excluding food and energy.',
    whyItMatters: 'Fed-preferred inflation gauge for policy decisions.',
    category: 'Inflation',
  },
  {
    id: 'PPIFIS',
    label: 'Producer Price Index',
    meaning: 'Input and producer-side price pressure.',
    whyItMatters: 'Often leads consumer inflation trends.',
    category: 'Inflation',
  },
  {
    id: 'FEDFUNDS',
    label: 'Federal Funds Rate',
    meaning: 'Policy rate benchmark for financing conditions.',
    whyItMatters: 'Sets broad funding cost across the economy.',
    category: 'Money',
  },
  {
    id: 'T10Y2Y',
    label: '10Y-2Y Treasury Spread',
    meaning: 'Long-short yield curve slope.',
    whyItMatters: 'Inversion historically preceded major downturns.',
    category: 'Money',
  },
  {
    id: 'M2SL',
    label: 'M2 Money Stock',
    meaning: 'Cash and broad deposits in circulation.',
    whyItMatters: 'Measures liquidity backdrop and inflation tail risk.',
    category: 'Money',
  },
];

export const MACRO_CATEGORY_KNOWLEDGE: MacroCategoryKnowledge[] = [
  {
    category: 'Growth',
    theme: 'Production and consumption cycle',
    chain: 'PCE -> INDPRO -> GDPC1',
    indicators: ['GDPC1', 'PCE', 'INDPRO'],
  },
  {
    category: 'Employment',
    theme: 'Labor demand and slack balance',
    chain: 'JTSJOL -> PAYEMS -> UNRATE',
    indicators: ['UNRATE', 'PAYEMS', 'JTSJOL'],
  },
  {
    category: 'Inflation',
    theme: 'Pipeline from producer to consumer prices',
    chain: 'PPIFIS -> CPIAUCSL -> PCEPILFE',
    indicators: ['CPIAUCSL', 'PCEPILFE', 'PPIFIS'],
  },
  {
    category: 'Money',
    theme: 'Rates, liquidity, and recession signal',
    chain: 'FEDFUNDS + M2SL + T10Y2Y',
    indicators: ['FEDFUNDS', 'T10Y2Y', 'M2SL'],
  },
];

export const MACRO_PLAYGROUND_PRESETS: MacroPreset[] = [
  {
    id: 'core-cycle',
    label: 'Core Cycle',
    description: 'Growth, labor, inflation core pulse',
    indicators: ['GDPC1', 'UNRATE', 'CPIAUCSL', 'FEDFUNDS'],
  },
  {
    id: 'liquidity-stress',
    label: 'Liquidity Stress',
    description: 'Rates, curve inversion, money stock',
    indicators: ['FEDFUNDS', 'T10Y2Y', 'M2SL', 'ICSA'],
  },
  {
    id: 'inflation-watch',
    label: 'Inflation Watch',
    description: 'Consumer, core, producer sequence',
    indicators: ['CPIAUCSL', 'PCEPILFE', 'PPIFIS', 'PCE'],
  },
];
