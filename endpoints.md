# API Endpoints (local, default port 3000)

Ensure `EXA_API_KEY` and `OPENAI_API_KEY` are set. Port defaults to 3000 unless `PORT` is provided.

## Alternatives
`GET /alternatives`

Query params:
- `ingredient` (required)
- `location` (required)
- `productDescription` (optional)
- `ingredientFunction` (optional)

Example:
```
http://localhost:3000/alternatives?ingredient=skimmed%20milk%20powder&location=New%20Zealand&productDescription=ice%20cream&ingredientFunction=protein%20source
```

## Suppliers
`GET /suppliers`

Query params:
- `ingredient` (required)
- `countries` (optional CSV)
- `keywords` (optional)
- `limit` (optional)

Example:
```
http://localhost:3000/suppliers?ingredient=skimmed%20milk%20powder&countries=US,Canada&limit=5
```

## Costs (optionally include funding)
`GET /costs`

Query params:
- `ingredient` (required)
- `location` (required)
- `includeFunding` (optional, set to `true` to include funding search)

Example:
```
http://localhost:3000/costs?ingredient=skimmed%20milk%20powder&location=New%20Zealand&includeFunding=true
```

## Funding (direct)
`GET /funding`

Query params:
- `query` (optional)
- `countries` (optional CSV)
- `industry` (optional)
- `keywords` (optional)
- `limit` (optional)

Example:
```
http://localhost:3000/funding?countries=US,Canada&industry=healthcare%20AI&limit=8
```

## All-in-one (alternatives-style params, with chained lookups)
`GET /all`

Query params (same as `/alternatives`):
- `ingredient` (required)
- `location` (required)
- `productDescription` (optional)
- `ingredientFunction` (optional)

Flow:
1) Find alternatives for the requested ingredient/location.
2) For each alternative: fetch suppliers (scoped to that alternative’s country), fetch costs, and fetch funding based on that alternative.

Example:
```
http://localhost:3000/all?ingredient=skimmed%20milk%20powder&location=New%20Zealand&productDescription=ice%20cream&ingredientFunction=protein%20source
```

Response shape (per alternative bundle):
```jsonc
{
  "input": { "ingredient": "...", "location": "...", "productDescription": "...", "ingredientFunction": "..." },
  "results": {
    "count": 2,
    "alternatives": [
      {
        "alternative": { /* AlternativeResult */ },
        "suppliers": { "count": 3, "suppliers": [/* Supplier[] */], "error": null },
        "costs": {
          "estimate": { /* cost summary */ },
          "funding": { "count": 4, "opportunities": [/* FundingOpportunity[] */], "queryUsed": "..." , "error": null },
          "error": null
        }
      }
    ]
  }
}
```
