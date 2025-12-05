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
  numResults?: number;
};

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
  const industryFragment = options.industry
    ? `for ${options.industry}`
    : "for AI startups and research companies";
  const keywordFragment = options.keywords ? ` ${options.keywords}` : "";

  return `AI startup and research funding: grants, non-dilutive subsidies, accelerator stipends, and government programs ${industryFragment} ${countryFragment}${keywordFragment} with application deadlines and eligibility`;
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
  const query = options.query ?? buildFundingQuery(options);
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
      industry: options.industry ?? "Artificial Intelligence",
    });

    opportunities.push(...repaired);
  }

  return dedupe(opportunities).slice(0, numResults);
}
