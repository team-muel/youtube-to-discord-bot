import { useEffect, useMemo, useState } from 'react';
import {
  FRED_API_BASE,
  FRED_FALLBACK_INDICATORS,
  FRED_SERIES,
  type FredIndicatorValue,
  type FredSeriesConfig,
} from '../config/fredIndicators';

type FredObservation = {
  value: string;
};

type FredSeriesResponse = {
  observations: FredObservation[];
};

type UseFredIndicatorsState = {
  indicators: FredIndicatorValue[];
  loading: boolean;
  source: 'live' | 'fallback';
  error: string | null;
};

const parseNumericObservations = (observations: FredObservation[]): [number, number] | null => {
  const numericValues = observations
    .map((entry) => Number.parseFloat(entry.value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length < 2) {
    return null;
  }

  return [numericValues[0] as number, numericValues[1] as number];
};

const fetchSeries = async (series: FredSeriesConfig, apiKey: string): Promise<FredIndicatorValue> => {
  const params = new URLSearchParams({
    series_id: series.id,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: '8',
  });

  const response = await fetch(`${FRED_API_BASE}/series/observations?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`FRED request failed (${response.status})`);
  }

  const data = (await response.json()) as FredSeriesResponse;
  const latestPair = parseNumericObservations(data.observations ?? []);

  if (!latestPair) {
    throw new Error(`Insufficient observations for ${series.id}`);
  }

  const [latest, previous] = latestPair;
  const delta = latest - previous;

  // Lower is better for unemployment and inflation indexes in this macro board.
  const lowerIsBetter = series.id === 'UNRATE' || series.id === 'CPIAUCSL';
  const positive = lowerIsBetter ? delta <= 0 : delta >= 0;

  return {
    id: series.id,
    label: series.label,
    unit: series.unit,
    value: latest,
    previous,
    delta,
    positive,
  };
};

export const useFredIndicators = (): UseFredIndicatorsState => {
  const [state, setState] = useState<UseFredIndicatorsState>({
    indicators: FRED_FALLBACK_INDICATORS,
    loading: true,
    source: 'fallback',
    error: null,
  });

  useEffect(() => {
    const apiKey = import.meta.env.VITE_FRED_API_KEY as string | undefined;

    if (!apiKey) {
      setState({
        indicators: FRED_FALLBACK_INDICATORS,
        loading: false,
        source: 'fallback',
        error: 'VITE_FRED_API_KEY not configured',
      });
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const indicators = await Promise.all(FRED_SERIES.map((series) => fetchSeries(series, apiKey)));
        if (cancelled) {
          return;
        }

        setState({
          indicators,
          loading: false,
          source: 'live',
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          indicators: FRED_FALLBACK_INDICATORS,
          loading: false,
          source: 'fallback',
          error: error instanceof Error ? error.message : 'Unknown FRED error',
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => state, [state]);
};
