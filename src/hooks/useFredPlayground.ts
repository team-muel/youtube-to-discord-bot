import { useEffect, useMemo, useState } from 'react';
import { apiFetchJson } from '../config';
import {
  buildFallbackSeries,
  FRED_FALLBACK_CATALOG,
  type FredCatalogItem,
  type FredPlaygroundPayload,
  type FredPlaygroundRange,
  type FredSeriesData,
} from '../config/fredPlayground';

type UseFredPlaygroundState = {
  payload: FredPlaygroundPayload;
  loading: boolean;
  error: string | null;
};

type BackendPoint = {
  date?: string;
  value?: number | string;
};

type BackendSeries = {
  id?: string;
  label?: string;
  unit?: string;
  points?: BackendPoint[];
};

type BackendCatalog = {
  id?: string;
  label?: string;
  unit?: string;
  category?: string;
};

type BackendPayload = {
  source?: string;
  catalog?: BackendCatalog[];
  series?: BackendSeries[];
};

const toSafeNumber = (value: number | string | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizePayload = (data: BackendPayload): FredPlaygroundPayload | null => {
  const catalog: FredCatalogItem[] = (data.catalog ?? [])
    .filter((item) => item.id && item.label && item.unit)
    .map((item) => ({
      id: item.id as string,
      label: item.label as string,
      unit: item.unit as string,
      category: item.category ?? 'Uncategorized',
    }));

  const series: FredSeriesData[] = (data.series ?? [])
    .filter((item) => item.id && item.label && item.unit)
    .map((item) => {
      const points = (item.points ?? [])
        .map((point) => {
          const value = toSafeNumber(point.value);
          if (!point.date || value === null) {
            return null;
          }

          return {
            date: point.date,
            value,
          };
        })
        .filter((point): point is { date: string; value: number } => Boolean(point));

      return {
        id: item.id as string,
        label: item.label as string,
        unit: item.unit as string,
        points,
      };
    })
    .filter((item) => item.points.length > 1);

  if (!catalog.length || !series.length) {
    return null;
  }

  return {
    source: 'backend',
    catalog,
    series,
  };
};

const buildFallbackPayload = (selectedIds: string[], range: FredPlaygroundRange, message?: string): UseFredPlaygroundState => {
  const series = buildFallbackSeries(FRED_FALLBACK_CATALOG, selectedIds, range);

  return {
    payload: {
      source: 'fallback',
      catalog: FRED_FALLBACK_CATALOG,
      series,
    },
    loading: false,
    error: message ?? null,
  };
};

export const useFredPlayground = (selectedIds: string[], range: FredPlaygroundRange) => {
  const [state, setState] = useState<UseFredPlaygroundState>(() => buildFallbackPayload(selectedIds, range));

  useEffect(() => {
    if (!selectedIds.length) {
      setState(buildFallbackPayload([], range, 'At least one series must be selected'));
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const params = new URLSearchParams({
          ids: selectedIds.join(','),
          range,
        });

        const data = await apiFetchJson<BackendPayload>(`/api/fred/playground?${params.toString()}`);
        const normalized = normalizePayload(data);

        if (!normalized) {
          throw new Error('Backend payload is missing required series data');
        }

        if (cancelled) {
          return;
        }

        setState({
          payload: normalized,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState(
          buildFallbackPayload(
            selectedIds,
            range,
            error instanceof Error ? error.message : 'FRED backend unavailable',
          ),
        );
      }
    };

    setState((prev) => ({ ...prev, loading: true }));
    void load();

    return () => {
      cancelled = true;
    };
  }, [range, selectedIds]);

  return useMemo(() => state, [state]);
};
