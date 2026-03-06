import { type CSSProperties } from 'react';

export const FINANCE_THEME_TOKENS = {
  colors: {
    positive: '#0f8a5f',
    negative: '#d14343',
    ink: '#1a1f1d',
    muted: '#5f6864',
    line: '#dbe5e1',
    panel: '#fbfffd',
    soft: '#f3fbf7',
    link: '#2f9e6f',
    chartFinal: '#3ecf8e',
    chartIntermediate: '#2f7cf6',
  },
  radius: {
    card: '10px',
    panel: '11px',
    chip: '10px',
  },
} as const;

export const getFinanceThemeCssVars = (): CSSProperties => ({
  '--finance-green': FINANCE_THEME_TOKENS.colors.positive,
  '--finance-red': FINANCE_THEME_TOKENS.colors.negative,
  '--finance-ink': FINANCE_THEME_TOKENS.colors.ink,
  '--finance-muted': FINANCE_THEME_TOKENS.colors.muted,
  '--finance-line': FINANCE_THEME_TOKENS.colors.line,
  '--finance-panel': FINANCE_THEME_TOKENS.colors.panel,
  '--finance-soft': FINANCE_THEME_TOKENS.colors.soft,
  '--finance-link': FINANCE_THEME_TOKENS.colors.link,
  '--finance-chart-final': FINANCE_THEME_TOKENS.colors.chartFinal,
  '--finance-chart-intermediate': FINANCE_THEME_TOKENS.colors.chartIntermediate,
  '--finance-radius-card': FINANCE_THEME_TOKENS.radius.card,
  '--finance-radius-panel': FINANCE_THEME_TOKENS.radius.panel,
  '--finance-radius-chip': FINANCE_THEME_TOKENS.radius.chip,
} as CSSProperties);
