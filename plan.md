# Scenario Optimiser → Supplier Finder → Cost Finder → Fund Finder (work plan)

## Overview
Build an end-to-end pipeline:
1) Scenario Optimiser: takes ingredient + location input, suggests alternatives.
2) Supplier Finder: accepts the list from Scenario Optimiser, finds suppliers for each ingredient (no cost here).
3) Cost Finder: independently estimates costs for each ingredient + country (same inputs as supplier finder; not fed from supplier output).
4) Fund Finder: finds funding opportunities for the resulting ingredients/regions (uses existing fund-finder API/CLI).

## Next Steps (when resuming)
- Add code into `scenario-optimiser/` to accept ingredient + location, and emit alternative ingredients list.
- Wire `supplier-finder/` to consume Scenario Optimiser output and fetch suppliers for each ingredient.
- Build `cost-finder/` to take ingredient + country directly (same inputs as supplier finder), not from supplier output.
- Integrate `fund-finder` step to search funding for the final ingredient/location set.
- Define data contracts between steps (JSON schemas) so each stage can be tested independently.
- Add orchestration script/pipeline to run the stages in sequence and persist intermediate artifacts.

## Integration Notes
- Keep each component in its folder: `scenario-optimiser/`, `supplier-finder/`, `cost-finder/`, `fund-finder/`.
- Use JSON files or a shared interface for hand-offs (e.g., `output/alternatives.json`, `output/suppliers.json`, `output/costs.json`).
- Reuse fund-finder’s API/CLI to search funding for final ingredients/regions.
- Configure environment variables per service (e.g., EXA keys, OpenAI keys) and document in each folder.
