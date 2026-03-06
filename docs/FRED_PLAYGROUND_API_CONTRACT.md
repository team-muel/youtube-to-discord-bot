# FRED Playground API Contract

Frontend target: `src/hooks/useFredPlayground.ts`
Endpoint: `GET /api/fred/playground?ids=UNRATE,CPIAUCSL,FEDFUNDS&range=3Y`

## Query

- `ids` (required): comma-separated FRED series IDs
- `range` (required): `1Y | 3Y | 5Y | 10Y`

## Response JSON

```json
{
  "source": "backend",
  "catalog": [
    {
      "id": "UNRATE",
      "label": "Unemployment Rate",
      "unit": "%",
      "category": "Labor"
    }
  ],
  "series": [
    {
      "id": "UNRATE",
      "label": "Unemployment Rate",
      "unit": "%",
      "points": [
        { "date": "2016-01", "value": 4.9 },
        { "date": "2016-02", "value": 4.9 }
      ]
    }
  ]
}
```

## Constraints

- `catalog` length >= 1
- `series` length >= 1
- each series `points` length >= 2
- `date` should be sorted ascending or sortable lexically
- `value` must be finite numeric

## Frontend Behavior

- If endpoint fails, frontend falls back to local sample data.
- Max series selection in UI: 5
- Value modes:
  - `Raw`: original values
  - `Indexed 100`: `(value / first) * 100`
  - `Delta`: `value - first`
- Chart modes:
  - `Line`
  - `Area`
