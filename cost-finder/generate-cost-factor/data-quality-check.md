# Data Quality Scoring Reference

This doc explains how we calculate the deterministic data quality score for cost factors and shows a concrete example.

## Components and Weights

- `recency` (30%)
- `source` (25%)
- `estimation` (20%)
- `consistency` (15%)
- `proximity` (10%)
- Composite score = weighted sum; band: `high` (>=80), `medium` (>=60), `low_medium` (>=40), else `low`.

## Inputs we expect per source

- `type`: one of `commodity_index`, `major_vendor`, `trade_stats`, `supplier_quote`, `industry_report`, `web_secondary`, `anecdotal`.
- `ageMonths`: months since observation (use `observedAt` date to derive if available).
- `observedAt`: ISO date `YYYY-MM` or `YYYY-MM-DD` (used to derive `ageMonths` when present).
- `rawPriceUsdPerKg`: normalized price for consistency spread.

## Scoring rules (simplified)

- Recency (months): <=1 -> 100, <=3 -> 80, <=6 -> 50, <=12 -> 35, else 20.
- Source type: mapped from the type (e.g., `commodity_index`=80, `major_vendor`=75, ...).
- Estimation: `direct_local`=100, `direct_regional`=85, `inferred_regional`=70, `inferred_material_analog`=60, `heuristic`=40.
- Consistency: relative spread (stdev/mean) of prices -> <=5%:100, 5-15%:80, 15-30%:60, >30%:30. One price -> 70 (neutral-ish).
- Proximity: `same_cluster`=100, `same_country_same_market`=80, `same_country_different_market`=60, `neighboring_country`=45, `same_region`=30, `different_region`=15.

## Example

Two sources for refined sunflower oil in Argentina:

- Source A: Selina Wamucii, type `commodity_index`, observedAt `2025-10`, rawPriceUsdPerKg 0.49
- Source B: Tridge, type `commodity_index`, observedAt `2025-11-15`, rawPriceUsdPerKg 1.07
- Derivation: `direct_local`
- Proximity: `same_country_same_market`

Derived recency:

- A: observed ~2 months ago -> recency 80
- B: observed ~1 month ago -> recency 100
- Recency component = avg(80,100) = 90

Other components:

- Source: both `commodity_index` -> 80
- Estimation: `direct_local` -> 100
- Consistency: prices [0.49, 1.07]; high spread -> 30
- Proximity: `same_country_same_market` -> 80

Composite:

```
0.30*recency(90) +
0.25*source(80) +
0.20*estimation(100) +
0.15*consistency(30) +
0.10*proximity(80)
= 0.30*90 + 0.25*80 + 0.20*100 + 0.15*30 + 0.10*80
= 27 + 20 + 20 + 4.5 + 8
= 79.5
```

Band: `medium` (>=60 and <80).

Example JSON snippet from a dry run:

```json
{
  "qualityScore": 79.5,
  "qualityBand": "medium",
  "qualityBreakdown": {
    "recency": 90,
    "source": 80,
    "estimation": 100,
    "consistency": 30,
    "proximity": 80,
    "composite": 79.5
  },
  "sources": [
    {
      "label": "Selina Wamucii: Argentina sunflower oil wholesale prices",
      "url": "https://www.selinawamucii.com/insights/prices/argentina/sunflower-oil/",
      "type": "commodity_index",
      "observedAt": "2025-10",
      "ageMonths": 2,
      "rawPriceUsdPerKg": 0.49
    },
    {
      "label": "Tridge: Refined sunflower oil global wholesale price",
      "url": "https://www.tridge.com/intelligences/sunflower-oil/price",
      "type": "commodity_index",
      "observedAt": "2025-11-15",
      "ageMonths": 1,
      "rawPriceUsdPerKg": 1.07
    }
  ],
  "derivationType": "direct_local",
  "geoProximity": "same_country_same_market"
}
```
