import { DEFAULT_NUM_RESULTS } from "./config";
import { exa } from "./exa-client";
import {
  FundingOpportunity,
  fundingOpportunitySchema,
} from "./funding-output-schema";

export type FundingSearchOptions = {
  query?: string;
  countries?: string[];
  industry?: string;
  keywords?: string;
  numResults?: number;
};

type SummaryFallback = {
  url: string;
  title?: string;
  text?: string;
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
    : "for AI startups and research";
  const keywordFragment = options.keywords ? ` ${options.keywords}` : "";

  return `AI funding opportunities ${industryFragment} ${countryFragment}${keywordFragment} grants OR subsidies OR programs application deadline`;
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

function parseSummary(summary: unknown): Partial<FundingOpportunity>[] {
  if (typeof summary !== "string") return [];
  try {
    const parsed = JSON.parse(summary);
    const candidates = extractOpportunityObjects(parsed);
    const partialSchema = fundingOpportunitySchema.partial();
    return candidates
      .map((candidate) => {
        const validated = partialSchema.safeParse(candidate);
        if (validated.success) {
          return validated.data;
        }
        return candidate && typeof candidate === "object"
          ? (candidate as Partial<FundingOpportunity>)
          : {};
      })
      .filter((candidate) => Object.keys(candidate).length > 0);
  } catch (error) {
    console.error("Failed to parse Exa summary:", error);
    return [];
  }
}

function normalizeOpportunity(
  raw: Partial<FundingOpportunity>,
  fallback: SummaryFallback,
  defaults: { industry: string; countries: string[] }
): FundingOpportunity | null {
  const name = (raw.name ?? fallback.title ?? fallback.url ?? "").trim();
  const website = (raw.website ?? fallback.url ?? "").trim();
  const summary = (raw.summary ?? fallback.text ?? "").trim();

  if (!name || !website || !summary) {
    return null;
  }

  const countriesFromRaw = normalizeCountries(raw.applicableCountries);
  const countriesFromAlternate = normalizeCountries(
    (raw as any).countries ?? (raw as any).applicableCountry
  );
  const countries =
    countriesFromRaw.length > 0
      ? countriesFromRaw
      : countriesFromAlternate.length > 0
      ? countriesFromAlternate
      : defaults.countries;

  const fundingAmount = (
    raw.fundingAmount ??
    (raw as any).amount ??
    (raw as any).value ??
    ""
  )
    .toString()
    .trim();

  return {
    name,
    website,
    applicableCountries:
      countries && countries.length > 0 ? countries : defaults.countries,
    relevantIndustry: (raw.relevantIndustry ?? defaults.industry).trim(),
    fundingAmount: fundingAmount.length > 0 ? fundingAmount : undefined,
    summary: summary.length > 600 ? `${summary.slice(0, 597)}...` : summary,
  };
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
  const defaults = {
    industry: options.industry ?? "Artificial Intelligence",
    countries: normalizeCountries(options.countries),
  };

  const res = await exa.searchAndContents(query, {
    summary: { schema: fundingSummarySchema },
    numResults,
    livecrawl: "always",
    type: "neural",
    ...DEFAULT_TEXT_OPTIONS,
    useAutoprompt: true,
  });

  const opportunities: FundingOpportunity[] = [];

  for (const r of res.results) {
    const fallback: SummaryFallback = {
      url: r.url,
      title: r.title ?? "",
      text:
        r.text ??
        (Array.isArray((r as any).highlights)
          ? (r as any).highlights.join(" ")
          : ""),
    };
    const structured = parseSummary((r as any).summary);
    const normalized = structured
      .map((candidate) => normalizeOpportunity(candidate, fallback, defaults))
      .filter(
        (candidate): candidate is FundingOpportunity => candidate !== null
      );

    if (normalized.length > 0) {
      opportunities.push(...normalized);
      continue;
    }

    const fallbackOpportunity = normalizeOpportunity({}, fallback, defaults);
    if (fallbackOpportunity) {
      opportunities.push(fallbackOpportunity);
    }
  }

  return dedupe(opportunities).slice(0, numResults);
}
