import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ROUTES } from '../../config/routes';
import {
  FINANCE_COMPARE_TABS,
  FINANCE_LABELS,
  FINANCE_MARKET_COMPARE,
  FINANCE_MARKET_TICKER,
  FINANCE_SEARCH_SHORTCUTS,
} from '../../config/financeDashboard';
import { FinanceSegmentedTabs } from './FinanceSegmentedTabs';

interface FinanceMarketOverviewProps {
  title: string;
  browseFeaturesLabel: string;
}

export const FinanceMarketOverview = ({ title, browseFeaturesLabel }: FinanceMarketOverviewProps) => {
  const [activeCompareIndex, setActiveCompareIndex] = useState(2);

  return (
    <>
      <div className="finance-utility-row">
        <label className="finance-search-box" aria-label={FINANCE_LABELS.searchPlaceholder}>
          <Search size={14} />
          <input type="text" placeholder={FINANCE_LABELS.searchPlaceholder} />
        </label>
        <div className="finance-search-shortcuts" aria-label="market shortcut strip">
          {FINANCE_SEARCH_SHORTCUTS.map((item) => (
            <div key={item.id} className="finance-search-pill">
              <span>{item.label}</span>
              <span className="mono-data">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <header className="finance-topline">
        <div>
          <p className="finance-kicker">{FINANCE_LABELS.marketKicker}</p>
          <h1 className="finance-title">
            {title} {FINANCE_LABELS.marketDeskSuffix}
          </h1>
        </div>
        <div className="finance-topline-actions">
          <Link to={ROUTES.inApp} className="finance-quick-link micro-underline">{browseFeaturesLabel}</Link>
        </div>
      </header>

      <div className="finance-ticker-rail">
        {FINANCE_MARKET_TICKER.map((item) => (
          <article key={item.symbol} className="finance-chip">
            <p className="finance-chip-symbol">{item.symbol}</p>
            <p className="finance-chip-value mono-data">{item.value}</p>
            <p className={`finance-chip-change ${item.positive ? 'is-positive' : 'is-negative'}`}>{item.change}</p>
          </article>
        ))}
      </div>

      <div className="finance-compare-shell" aria-label="market compare">
        <FinanceSegmentedTabs
          items={FINANCE_COMPARE_TABS}
          activeIndex={activeCompareIndex}
          onChange={setActiveCompareIndex}
          ariaLabel="market region tabs"
          className="finance-compare-tabs"
        />
        <div className="finance-compare-cards">
          {FINANCE_MARKET_COMPARE.map((item) => (
            <article key={item.id} className="finance-compare-card">
              <p className="finance-compare-name">{item.name}</p>
              <p className="finance-compare-value mono-data">{item.value}</p>
              <p className={item.positive ? 'is-positive' : 'is-negative'}>{item.changeText}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
};
