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
