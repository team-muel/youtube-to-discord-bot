import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FRED_PLAYGROUND_DEFAULT_SERIES,
  type FredCatalogItem,
  type FredSeriesData,
} from '../../config/fredPlayground';
import { useFredPlayground } from '../../hooks/useFredPlayground';

type CombinedPoint = Record<string, string | number | null> & { date: string };

interface FinanceChartPlaygroundProps {
  title: string;
  description: string;
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
  seriesById: Record<string, FredSeriesData>;
};

const SERIES_COLORS = ['#3ecf8e', '#2f7cf6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const FIND_RESULT_LIMIT = 100;

const getSearchScore = (item: FredCatalogItem, keyword: string) => {
  if (!keyword) {
    return 0;
  }

  const id = item.id.toLowerCase();
  const label = item.label.toLowerCase();
  const category = item.category.toLowerCase();

  if (id === keyword) return 120;
  if (id.startsWith(keyword)) return 90;
  if (id.includes(keyword)) return 70;
  if (label.startsWith(keyword)) return 55;
  if (label.includes(keyword)) return 40;
  if (category.includes(keyword)) return 20;
  return -1;
};

const renderHighlight = (text: string, keyword: string) => {
  if (!keyword) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const start = lowerText.indexOf(keyword);
  if (start < 0) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="finance-find-mark">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
};

const PlaygroundTooltip = ({ active, payload, label, seriesById }: TooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="finance-chart-tooltip" role="status" aria-live="polite">
      <p className="finance-chart-tooltip-label mono-data">{label}</p>
      {payload.map((entry) => {
        const id = entry.dataKey ?? '';
        const series = seriesById[id];
        if (!series || typeof entry.value !== 'number') {
          return null;
        }

        return (
          <p key={id} className="finance-chart-tooltip-value mono-data">
            {series.label} {entry.value.toFixed(2)} {series.unit}
          </p>
        );
      })}
    </div>
  );
};

export const FinanceChartPlayground = ({ title, description }: FinanceChartPlaygroundProps) => {
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>([...FRED_PLAYGROUND_DEFAULT_SERIES]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [manualId, setManualId] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const [idFeedback, setIdFeedback] = useState('Select or search FRED IDs below the chart.');

  const { payload, loading, error } = useFredPlayground(selectedSeriesIds, '10Y');

  const safeCatalog = useMemo(
    () => payload.catalog.filter((item) => Boolean(item.id && item.label && item.category)),
    [payload.catalog],
  );

  const safeSeries = useMemo(
    () => payload.series.filter((item) => Boolean(item.id && item.label && item.points?.length)),
    [payload.series],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 140);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const seriesById = useMemo(() => {
    return safeSeries.reduce<Record<string, FredSeriesData>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [safeSeries]);

  const chartData = useMemo<CombinedPoint[]>(() => {
    if (!safeSeries.length) {
      return [];
    }

    const dateSet = new Set<string>();
    safeSeries.forEach((series) => {
      series.points.forEach((point) => {
        dateSet.add(point.date);
      });
    });

    const sortedDates = Array.from(dateSet).sort();

    return sortedDates.map((date) => {
      const row: CombinedPoint = { date };

      safeSeries.forEach((series) => {
        const point = series.points.find((item) => item.date === date);
        row[series.id] = point ? point.value : null;
      });

      return row;
    });
  }, [safeSeries]);

  const filteredCatalog = useMemo(() => {
    const keyword = debouncedQuery.toLowerCase();

    const scored = safeCatalog
      .map((item) => ({ item, score: getSearchScore(item, keyword) }))
      .filter((entry) => (keyword ? entry.score >= 0 : true));

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.item.id.localeCompare(b.item.id);
    });

    return scored.slice(0, FIND_RESULT_LIMIT).map((entry) => entry.item);
  }, [debouncedQuery, safeCatalog]);

  useEffect(() => {
    setActiveResultIndex(0);
  }, [debouncedQuery]);

  useEffect(() => {
    if (!filteredCatalog.length) {
      setActiveResultIndex(0);
      return;
    }

    setActiveResultIndex((prev) => Math.min(prev, filteredCatalog.length - 1));
  }, [filteredCatalog]);

  useEffect(() => {
    if (!loading && !safeCatalog.length) {
      setIdFeedback('Catalog is empty. Check backend response or fallback connectivity.');
    }
  }, [loading, safeCatalog.length]);

  useEffect(() => {
    const focused = filteredCatalog[activeResultIndex];
    if (!focused) {
      return;
    }

    const target = document.getElementById(`finance-find-option-${focused.id}`);
    target?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex, filteredCatalog]);

  const toggleSeries = (item: FredCatalogItem) => {
    setSelectedSeriesIds((prev) => {
      if (prev.includes(item.id)) {
        if (prev.length === 1) {
          return prev;
        }

        return prev.filter((id) => id !== item.id);
      }

      if (prev.length >= 5) {
        return prev;
      }

      return [...prev, item.id];
    });
  };

  const addManualId = () => {
    const target = manualId.trim().toUpperCase();
    if (!target) {
      return;
    }

    const catalogItem = safeCatalog.find((item) => item.id.toUpperCase() === target);
    if (!catalogItem) {
      setIdFeedback(`ID ${target} is not available in current catalog.`);
      return;
    }

    setSelectedSeriesIds((prev) => {
      if (prev.includes(catalogItem.id)) {
        setIdFeedback(`${catalogItem.id} is already active.`);
        return prev;
      }

      if (prev.length >= 5) {
        setIdFeedback('Max 5 IDs can be active at once. Remove one and try again.');
        return prev;
      }

      setIdFeedback(`${catalogItem.id} added.`);
      return [...prev, catalogItem.id];
    });

    setManualId('');
  };

  const focusNextResult = () => {
    if (!filteredCatalog.length) {
      return;
    }

    setActiveResultIndex((prev) => (prev + 1) % filteredCatalog.length);
  };

  const focusPrevResult = () => {
    if (!filteredCatalog.length) {
      return;
    }

    setActiveResultIndex((prev) => (prev - 1 + filteredCatalog.length) % filteredCatalog.length);
  };

  const toggleFocusedResult = () => {
    const target = filteredCatalog[activeResultIndex];
    if (!target) {
      return;
    }

    toggleSeries(target);
    setIdFeedback(`${target.id} toggled from FIND.`);
  };

  return (
    <div className="finance-playground-board">
      <header className="finance-playground-head">
        <p className="finance-kicker">CHART PLAYGROUND</p>
        <h1 className="finance-title">{title} FRED Playground</h1>
        <p className="finance-playground-desc">{description}</p>
      </header>

      <div className="finance-chart-canvas finance-playground-chart" role="img" aria-label="fred chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 18, right: 18, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="rgb(95 99 104 / 13%)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#5f6368' }} dy={7} />
            <YAxis hide />
            <Tooltip content={<PlaygroundTooltip seriesById={seriesById} />} cursor={{ stroke: 'rgb(62 207 142 / 35%)', strokeWidth: 1 }} />
            <Legend />

            {payload.series.map((series, index) => {
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              return (
                <Line
                  key={series.id}
                  type="monotone"
                  name={series.label}
                  dataKey={series.id}
                  stroke={color}
                  strokeWidth={2.2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                  isAnimationActive
                  animationDuration={740 + index * 60}
                  animationEasing="ease-out"
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <section className="finance-toolbox-dock" aria-label="fred id settings">
        <article className="finance-toolbox-module finance-toolbox-module-explorer">
          <header className="finance-toolbox-module-head">
            <p className="finance-playground-picker-title">FRED ID Settings</p>
            <p className="finance-toolbox-module-meta mono-data">Active: {selectedSeriesIds.join(' | ')}</p>
          </header>

          <div className="finance-playground-series-head">
            <div className="finance-quick-access-row" aria-label="quick access indicators">
              {FRED_PLAYGROUND_DEFAULT_SERIES.map((id) => {
                const selected = selectedSeriesIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`finance-quick-series-chip ${selected ? 'is-active' : ''}`}
                    onClick={() => {
                      const item = safeCatalog.find((entry) => entry.id === id);
                      if (item) {
                        toggleSeries(item);
                      }
                    }}
                  >
                    {id}
                  </button>
                );
              })}
            </div>

            <div className="finance-id-manual-row">
              <input
                type="text"
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addManualId();
                    return;
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setManualId('');
                  }
                }}
                className="finance-playground-search"
                placeholder="Add FRED ID (e.g. CPIAUCSL)"
                aria-label="manual fred id input"
              />
              <button type="button" className="finance-quick-series-chip" onClick={addManualId}>Add</button>
            </div>

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={(event) => {
                if (isComposing) {
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusNextResult();
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusPrevResult();
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  toggleFocusedResult();
                  return;
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setSearchQuery('');
                  setDebouncedQuery('');
                }
              }}
              className="finance-playground-search"
              placeholder="FIND FRED IDs (Arrow Up/Down + Enter)"
              aria-label="series search"
            />
            <p className="finance-find-status mono-data" aria-live="polite">
              {filteredCatalog.length} results
              {filteredCatalog[activeResultIndex] ? ` · focus ${filteredCatalog[activeResultIndex].id}` : ''}
              {safeCatalog.length > FIND_RESULT_LIMIT ? ` · showing top ${FIND_RESULT_LIMIT}` : ''}
            </p>
          </div>

          <div className="finance-playground-series-grid" role="listbox" aria-label="find results">
            {filteredCatalog.map((item) => {
              const selected = selectedSeriesIds.includes(item.id);
              const focused = filteredCatalog[activeResultIndex]?.id === item.id;
              const keyword = searchQuery.trim().toLowerCase();
              return (
                <button
                  id={`finance-find-option-${item.id}`}
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={focused}
                  className={`finance-series-chip ${selected ? 'is-active' : ''} ${focused ? 'is-focused' : ''}`}
                  onClick={() => toggleSeries(item)}
                  aria-pressed={selected}
                  onMouseEnter={() => setActiveResultIndex(filteredCatalog.findIndex((entry) => entry.id === item.id))}
                >
                  <span>{renderHighlight(item.label, keyword)}</span>
                  <span className="mono-data">{renderHighlight(item.id, keyword)}</span>
                </button>
              );
            })}
          </div>

          {!filteredCatalog.length ? <p className="finance-playground-loading">No series matched your search.</p> : null}
          <p className={`finance-playground-source-note ${error ? 'is-error' : ''}`}>{idFeedback}</p>
        </article>
      </section>

      <p className="finance-playground-source-note">
        Source: {payload.source === 'backend' ? 'Backend FRED stream' : 'Fallback sample'}
        {error ? `, note: ${error}` : ''}
      </p>
      {loading ? <p className="finance-playground-loading">Loading series...</p> : null}
    </div>
  );
};
