import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_NUM_RESULTS } from "./config";
import { getExa } from "./exa-client";
import {
  FundingOpportunity,
  fundingOpportunitySchema,
} from "./funding-output-schema";
import { repairFundingSummary } from "./llm-repair";

export type FundingSearchOptions = {
  query?: string;
  countries?: string[];
  industry?: string;
  keywords?: string;
  ingredient?: string;
  numResults?: number;
};

const FUNDING_CACHE_PATH = resolve(__dirname, "funding_cache.json");

type FundingCacheEntry = {
  opportunities: FundingOpportunity[];
  cachedAt: string;
};

const fundingCache: Record<string, FundingCacheEntry> = loadFundingCache();

function loadFundingCache(): Record<string, FundingCacheEntry> {
  if (!existsSync(FUNDING_CACHE_PATH)) {
    return {};
  }
  try {
    const content = readFileSync(FUNDING_CACHE_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, FundingCacheEntry>;
    }
  } catch (error) {
    console.warn(
      "Failed to read funding cache; starting with empty cache.",
      error
    );
  }
  return {};
}

function persistFundingCache() {
  try {
    const dir = resolve(__dirname);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      FUNDING_CACHE_PATH,
      JSON.stringify(fundingCache, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Failed to persist funding cache:", error);
  }
}

function makeCacheKey(options: FundingSearchOptions): string {
  const query = options.query ?? buildFundingQuery(options);
  const countries = (options.countries ?? []).sort().join(",");
  return `${query}::${countries}::${options.industry ?? ""}::${
    options.keywords ?? ""
  }::${options.ingredient ?? ""}`;
}

const fundingSummarySchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Funding Opportunities",
  type: "object",
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Funding opportunity name" },
          website: { type: "string", description: "Link to the funding page" },
          applicableCountries: {
            type: "array",
            items: { type: "string" },
            description: "Countries where applicants are eligible",
          },
          relevantIndustry: { type: "string", description: "Industry focus" },
          fundingAmount: {
            type: "string",
            description: "Funding amount or range",
          },
          summary: {
            type: "string",
            description: "Short summary of the opportunity",
          },
        },
        required: ["name", "website", "summary"],
      },
    },
  },
  required: ["opportunities"],
} as const;

const DEFAULT_TEXT_OPTIONS = {
  text: { maxCharacters: 1500 },
  highlights: { numSentences: 3 },
};

function normalizeCountries(countries?: string[]): string[] {
  if (!countries) return [];
  return countries
    .map((country) => country.trim())
    .filter(Boolean)
    .map((country) => country.replace(/\s+/g, " "));
}

export function buildFundingQuery(options: FundingSearchOptions): string {
  const countries = normalizeCountries(options.countries);
  const countryFragment =
    countries.length > 0 ? `in ${countries.join(" or ")}` : "worldwide";
  const industryFragment =
    options.industry ??
    "sustainable agriculture, food processing, manufacturing";
  const ingredientFragment = options.ingredient
    ? `${options.ingredient} production or processing`
    : "ingredient production or processing";
  const keywordFragment = options.keywords ? ` ${options.keywords.trim()}` : "";

  return [
    `Funding for ${ingredientFragment} ${countryFragment}`,
    `covering ${industryFragment} with climate and sustainability focus`,
    '(grant OR subsidy OR "tax incentive" OR rebate OR "utility rebate" OR "carbon market" OR "innovation fund" OR "R&D funding")',
    "active programs",
    keywordFragment,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractOpportunityObjects(parsed: any): any[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.opportunities)) return parsed.opportunities;
  if (Array.isArray(parsed.fundingOpportunities))
    return parsed.fundingOpportunities;
  if (parsed.opportunity) return [parsed.opportunity];
  if (parsed.fundingOpportunity) return [parsed.fundingOpportunity];
  return [];
}

function parseSummary(summary: unknown): FundingOpportunity[] {
  if (typeof summary !== "string") return [];
  try {
    const parsed = JSON.parse(summary);
    const candidates = extractOpportunityObjects(parsed);
    const valid: FundingOpportunity[] = [];
    for (const candidate of candidates) {
      const result = fundingOpportunitySchema.safeParse(candidate);
      if (result.success) {
        valid.push(result.data);
      }
    }
    return valid;
  } catch (error) {
    console.error("Failed to parse Exa summary:", error);
    return [];
  }
}

function dedupe(opportunities: FundingOpportunity[]): FundingOpportunity[] {
  const seen = new Set<string>();
  const result: FundingOpportunity[] = [];
  for (const opp of opportunities) {
    const key = `${opp.name.toLowerCase()}::${opp.website.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(opp);
  }
  return result;
}

export async function findFundingOpportunities(
  options: FundingSearchOptions
): Promise<FundingOpportunity[]> {
  const cacheKey = makeCacheKey(options);
  const cached = fundingCache[cacheKey];

  // Return cached result if available
  if (cached) {
    console.log("Returning cached funding opportunities");
    return cached.opportunities;
  }

  const query = buildFundingQuery(options);
  const numResults = options.numResults ?? DEFAULT_NUM_RESULTS;
  const normalizedCountries = normalizeCountries(options.countries);
  const exa = getExa();

  const res = await exa.searchAndContents(query, {
    summary: { schema: fundingSummarySchema },
    numResults,
    livecrawl: "always",
    type: "keyword",
    ...DEFAULT_TEXT_OPTIONS,
    useAutoprompt: true,
  });

  const opportunities: FundingOpportunity[] = [];

  for (const r of res.results) {
    const structured = parseSummary((r as any).summary);
    if (structured.length > 0) {
      opportunities.push(...structured);
      continue;
    }

    // Repair using LLM when schema parsing fails.
    const repaired = await repairFundingSummary({
      summary: (r as any).summary,
      url: r.url,
      title: r.title ?? "",
      text:
        r.text ??
        (Array.isArray((r as any).highlights)
          ? (r as any).highlights.join(" ")
          : ""),
      countries: normalizedCountries,
      industry: options.industry,
    });

    opportunities.push(...repaired);
  }

  const deduped = dedupe(opportunities).slice(0, numResults);

  // Cache the results
  fundingCache[cacheKey] = {
    opportunities: deduped,
    cachedAt: new Date().toISOString(),
  };
  persistFundingCache();

  return deduped;
}
