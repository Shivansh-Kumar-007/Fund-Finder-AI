import "dotenv/config";
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  colorLabel,
  colorValue,
  DEFAULT_OUTPUT_PATH,
  formatError,
  formatInfo,
  formatSuccess,
  formatWarning,
  parseArgs,
} from "./config";
import { buildFundingQuery, findFundingOpportunities } from "./domain-search";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query =
    args.query ??
    buildFundingQuery({
      countries: args.countries,
      industry: args.industry,
      keywords: args.keywords,
      ingredient: args.ingredient,
      numResults: args.limit,
    });

  console.log(
    `${formatInfo("Searching for funding opportunities")}: ${colorValue(query)}`
  );
  if (args.countries.length > 0) {
    console.log(`${colorLabel("Target countries")}: ${colorValue(args.countries.join(", "))}`);
  }
  if (args.industry) {
    console.log(`${colorLabel("Industry focus")}: ${colorValue(args.industry)}`);
  }
  if (args.ingredient) {
    console.log(`${colorLabel("Ingredient focus")}: ${colorValue(args.ingredient)}`);
  }

  const opportunities = await findFundingOpportunities({
    query,
    countries: args.countries,
    industry: args.industry,
    keywords: args.keywords,
    ingredient: args.ingredient,
    numResults: args.limit,
  });

  if (opportunities.length === 0) {
    console.log(formatWarning("No funding opportunities found for this query."));
    return;
  }

  console.log(formatInfo(`Found ${opportunities.length} opportunities:`));
  opportunities.forEach((opp, index) => {
    console.log(
      [
        `${colorLabel(`#${index + 1} ${opp.name}`)}`,
        `  ${colorLabel("Website")}: ${colorValue(opp.website)}`,
        `  ${colorLabel("Countries")}: ${colorValue((opp.applicableCountries ?? []).join(", ") || "Not specified")}`,
        `  ${colorLabel("Industry")}: ${colorValue(opp.relevantIndustry)}`,
        opp.fundingAmount ? `  ${colorLabel("Funding amount")}: ${colorValue(opp.fundingAmount)}` : null,
        `  ${colorLabel("Summary")}: ${opp.summary}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
  });

  const outputPath = args.outputPath ?? DEFAULT_OUTPUT_PATH;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(opportunities, null, 2), "utf8");
  console.log(`${formatSuccess("Saved results to")}: ${colorValue(outputPath)}`);
}

void main().catch((error) => {
  console.error(formatError("Failed to find funding opportunities"), error);
  process.exitCode = 1;
});
