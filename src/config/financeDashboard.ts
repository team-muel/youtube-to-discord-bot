import { type HubPageContent } from '../content/dashboardContent';

export interface FinanceTickerItem {
  symbol: string;
  value: string;
  change: string;
  positive: boolean;
}

export interface FinanceWatchlistRow {
  id: string;
  name: string;
  subtitle: string;
  price: string;
  change: string;
  positive: boolean;
}

export interface FinanceMoverRow {
  id: string;
  label: string;
  value: string;
  move: number;
  positive: boolean;
}

export interface FinanceInlineCard {
  id: string;
  kicker: string;
  title: string;
  description: string;
}

export interface FinanceMarketCompareItem {
  id: string;
  name: string;
  value: string;
  changeText: string;
  positive: boolean;
}

export interface FinanceTopSearchShortcut {
  id: string;
  label: string;
  value: string;
}

export interface FinanceTrendPoint {
  label: string;
  finalMargin: number;
  intermediateMargin: number;
}

export const FINANCE_LABELS = {
  marketKicker: 'MARKETS TODAY',
  marketDeskSuffix: 'Market Desk',
  watchlistTitle: 'Watchlist',
  watchlistAction: 'Manage',
  watchlistGuide: 'Alert setup guide',
  moversTitle: 'Top Movers',
  realtime: 'Realtime',
  macroTitle: '거시경제 지표 (FRED)',
  newsTitle: '오늘의 금융 뉴스',
  studioAction: 'Open Studio',
  followTitle: '관심 있을 만한 주식 정보',
  followAction: '더 알아보기',
  expansionNote: 'Next expansion phase enabled',
  discreetIntegration: 'integration',
  searchPlaceholder: '티커, 시장, 뉴스 검색',
} as const;

export const FINANCE_PERIOD_TABS = ['1D', '5D', '1M', '6M', 'YTD', '1Y'] as const;
export type FinancePeriodTab = (typeof FINANCE_PERIOD_TABS)[number];

export const FINANCE_COMPARE_TABS = ['미국', '유럽', '아시아', '통화', '암호화폐', '선물'] as const;

export const FINANCE_NEWS_FILTERS = ['주요 뉴스', '국내 주식 시장', '세계 시장'] as const;

export const FINANCE_SEARCH_SHORTCUTS: FinanceTopSearchShortcut[] = [
  { id: 's-1', label: 'KOSPI', value: '+0.84%' },
  { id: 's-2', label: 'KRW/USD', value: '-0.31%' },
  { id: 's-3', label: 'WTI', value: '-0.45%' },
];

export const FINANCE_MARGIN_TREND: FinanceTrendPoint[] = [
  { label: '01', finalMargin: 17.9, intermediateMargin: 13.2 },
  { label: '02', finalMargin: 17.6, intermediateMargin: 13.2 },
  { label: '03', finalMargin: 17.4, intermediateMargin: 13.1 },
  { label: '04', finalMargin: 17.1, intermediateMargin: 13.1 },
  { label: '05', finalMargin: 16.8, intermediateMargin: 13.0 },
  { label: '06', finalMargin: 16.5, intermediateMargin: 13.0 },
  { label: '07', finalMargin: 16.2, intermediateMargin: 12.9 },
  { label: '08', finalMargin: 15.9, intermediateMargin: 12.9 },
  { label: '09', finalMargin: 15.7, intermediateMargin: 12.8 },
  { label: '10', finalMargin: 15.5, intermediateMargin: 12.8 },
  { label: '11', finalMargin: 15.2, intermediateMargin: 12.7 },
  { label: '12', finalMargin: 14.9, intermediateMargin: 12.7 },
  { label: '13', finalMargin: 14.7, intermediateMargin: 12.6 },
  { label: '14', finalMargin: 14.5, intermediateMargin: 12.6 },
  { label: '15', finalMargin: 14.2, intermediateMargin: 12.5 },
];

const PERIOD_POINT_COUNT: Record<FinancePeriodTab, number> = {
  '1D': 8,
  '5D': 10,
  '1M': 12,
  '6M': 15,
  YTD: 15,
  '1Y': 15,
};

export const getFinanceMarginTrendByPeriod = (period: FinancePeriodTab): FinanceTrendPoint[] => {
  const count = PERIOD_POINT_COUNT[period];
  return FINANCE_MARGIN_TREND.slice(-count);
};

export const FINANCE_MARKET_TICKER: FinanceTickerItem[] = [
  { symbol: 'KOSPI', value: '2,825.91', change: '+0.84%', positive: true },
  { symbol: 'KOSDAQ', value: '905.42', change: '+1.12%', positive: true },
  { symbol: 'KRW/USD', value: '1,317.20', change: '-0.31%', positive: false },
  { symbol: 'US 10Y', value: '4.02%', change: '+0.08%', positive: true },
  { symbol: 'WTI', value: '$79.21', change: '-0.45%', positive: false },
  { symbol: 'BTC', value: '$93,820', change: '+2.06%', positive: true },
];

export const FINANCE_MARKET_COMPARE: FinanceMarketCompareItem[] = [
  {
    id: 'nikkei',
    name: '닛케이 평균주가',
    value: '55,669.43',
    changeText: '+391.37 (0.71%)',
    positive: true,
  },
  {
    id: 'shanghai',
    name: '상해종합주가지수',
    value: '4,121.50',
    changeText: '+12.93 (0.31%)',
    positive: true,
  },
  {
    id: 'hangseng',
    name: '항셍지수',
    value: '25,706.35',
    changeText: '+385.01 (1.52%)',
    positive: true,
  },
  {
    id: 'sensex',
    name: 'BSE 센섹스',
    value: '79,514.00',
    changeText: '-501.90 (0.63%)',
    positive: false,
  },
];

export const buildFinanceWatchlist = (content: HubPageContent): FinanceWatchlistRow[] =>
  content.features.map((feature, index) => {
    const basePrice = 91 + index * 3.6;
    const move = index % 2 === 0 ? 1.74 + index * 0.12 : -0.93 - index * 0.08;

    return {
      id: feature.id,
      name: feature.token,
      subtitle: feature.title,
      price: basePrice.toFixed(2),
      change: `${move > 0 ? '+' : ''}${move.toFixed(2)}%`,
      positive: move > 0,
    };
  });

export const buildFinanceMovers = (content: HubPageContent): FinanceMoverRow[] =>
  content.metrics.map((metric, index) => {
    const move = index % 2 === 0 ? 2.1 + index * 0.5 : -1.3 - index * 0.4;

    return {
      id: metric.id,
      label: metric.label,
      value: `${metric.value}${metric.suffix}`,
      move,
      positive: move > 0,
    };
  });

export const buildFinanceInlineCards = (content: HubPageContent): FinanceInlineCard[] =>
  content.quickHighlights.concat(content.quickHighlights).map((item, index) => ({
    id: `${item.id}-${index}`,
    kicker: index % 2 === 0 ? 'BRIEF' : 'OPS',
    title: item.title,
    description: item.description,
  }));

export const buildFinanceFollowIdeas = (content: HubPageContent): FinanceInlineCard[] =>
  content.features.map((feature, index) => ({
    id: `follow-${feature.id}`,
    kicker: index % 2 === 0 ? '지수' : '종목',
    title: feature.title,
    description: feature.subtitle,
  }));
