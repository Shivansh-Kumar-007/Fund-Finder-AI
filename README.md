# Fund Finder

CLI that uses Exa to surface AI-related funding opportunities and prints/saves the results.

## Prerequisites

- Node.js 18+ (for native ESM).
- An Exa API key in `EXA_API_KEY`.

## Install

```bash
npm install
```

## Run

```bash
EXA_API_KEY=your_key npm start -- --countries "US,Canada" --industry "healthcare AI" --limit 10
```

Flags:

- `--query "custom query"`: override the auto-built query.
- `--countries "US,Canada"`: comma-separated list to bias results.
- `--industry "healthcare AI"`: industry focus text.
- `--keywords "early stage grants"`: extra keywords appended to the query.
- `--limit 20`: cap results (default 12).
- `--output path/to/file.json`: path for saved results (default `funding-opportunities.json`).

Results are printed to stdout and written as JSON.
