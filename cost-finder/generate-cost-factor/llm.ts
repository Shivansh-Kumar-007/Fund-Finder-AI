import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import { aiCostMetadataSchema } from "./ai-cost-output-schema";
import { formatWarning, LLM_CACHE_PATH, OUTPUT_DIR } from "./config";
import { Target } from "./data";
import {
  domainPreferredSearch,
  ExaResult,
  generalSearch,
  getCostNumericValue,
} from "./domain-search";
import {
  computeQualityScore,
  DerivationType,
  ProximityKey,
  SourceEntry,
  SourceTypeKey,
} from "./quality";

const SYSTEM_PROMPT = `
You are a careful and conservative assistant. 
Your task is to estimate the most probable bulk WHOLESALE cost of an ingredient 
based strictly on the provided Exa search results.

Follow ALL rules below:

============================================================
1. DATA SOURCES AND GENERAL RULES
============================================================
- You must use ONLY the information present in the provided search results to determine prices.
- You may use your own background knowledge ONLY for currency exchange rates 
  when no exchange rate is present in the search results.
- Do not invent, infer, or hallucinate price data.
- Do not use any knowledge about market prices outside the provided results (except FX).
- Ignore any cost entries where:
  - amount <= 0, OR
  - weight unit or currency is unclear, OR
  - the value is obviously not a valid price-per-quantity.

============================================================
2. HOW TO INTERPRET AND NORMALIZE PRICE DATA
============================================================
- Normalize all price observations to the SAME weight unit and the SAME currency.
- If units differ (e.g., kg vs ton vs lb), convert everything to kilograms.
- If price is given as a range (e.g., 350–420 USD/ton), take the midpoint as the value.
- If multiple weight units appear, normalize them to kilograms and compare prices per kilogram. 

============================================================
3. PRIORITIZATION LOGIC
============================================================
- If multiple price observations are available:
  1. Prefer entries where sourceType is "preferred".
  2. Among these, remove outliers (values extremely high or low vs the others).
  3. After outlier removal, select the value that best represents the central tendency.
     (mean or median are both acceptable; choose whichever is most reasonable).
- If no price is available for the target location, fall back to global prices.

============================================================
4. USD AND LOCAL CURRENCY LOGIC
============================================================
- If USD prices are available, use them directly.
- If ONLY local currency prices are available:
  - Convert to USD using the best exchange rate available.
  - If no exchange rate is found in the search results, you may use your internal FX knowledge.
  - When you infer the exchange rate, set isInferred to true.

============================================================
5. WHEN DATA IS INSUFFICIENT
============================================================
- If you cannot form a reliable estimate from the provided search results:
  - Set both costInUSD and costInLocalCurrency to 0.
  - Set dataQualityScore to a low number (e.g., 0-2).
  - Explain clearly why the data is insufficient in scoreExplanation.

============================================================
6. OUTPUT REQUIREMENTS
============================================================
- The output must strictly follow the JSON schema supplied.
- Use at most TWO decimal places for all numeric price values.
- Do not output ranges.
- Always include the weight unit used.
- Always include the list of sources used.
- For each source, when available, include:
  - type: one of [commodity_index, major_vendor, trade_stats, supplier_quote, industry_report, web_secondary, anecdotal].
  - ageMonths: months since the data point (when monthly/yearly recency is available; use null if unknown).
  - observedAt: ISO date string (YYYY-MM-DD or YYYY-MM) of the price observation.
  - rawPriceUsdPerKg: the raw observed price in USD per kg before any conversions.
- Also include derivationType (direct_local, direct_regional, inferred_regional, inferred_material_analog, heuristic)
  and geoProximity (same_cluster, same_country_same_market, same_country_different_market, neighboring_country, same_region, different_region) so downstream scoring
  can be computed deterministically.
- Be concise, factual, and do not add extra commentary.

============================================================
END OF RULES
============================================================

`;

const costFactorMetadataSchema = aiCostMetadataSchema.extend({
  sources: z
    .array(
      z.object({
        label: z.string().describe("Short description or title of the source"),
        url: z.string().url().describe("URL of the exact page"),
        /**
         * Additional optional fields collected to compute quality on our side.
         */
        // Allow any string; we normalize to known keys and fallback to web_secondary.
        type: z.string().optional(),
        ageMonths: z.number().min(0).optional().nullable(),
        observedAt: z.string().optional(),
        rawPriceUsdPerKg: z.number().min(0).optional(),
      })
    )
    .describe("Sources used to derive the cost."),
  date: z.string().optional().describe("Date or vintage of the data"),
  derivationType: z
    .enum([
      "direct_local",
      "direct_regional",
      "inferred_regional",
      "inferred_material_analog",
      "heuristic",
    ])
    .optional(),
  geoProximity: z
    .enum([
      "same_cluster",
      "same_country_same_market",
      "same_country_different_market",
      "neighboring_country",
      "same_region",
      "different_region",
    ])
    .optional(),
  qualityBreakdown: z
    .object({
      recency: z.number().optional(),
      source: z.number().optional(),
      estimation: z.number().optional(),
      consistency: z.number().optional(),
      proximity: z.number().optional(),
      composite: z.number().optional(),
    })
    .optional(),
});

export type LlmResponse = z.infer<typeof costFactorMetadataSchema>;

type CacheEntry = LlmResponse;

const llmCache: Record<string, CacheEntry> = loadLlmCache();

type SearchResultForPrompt = ExaResult & {
  id: number;
  sourceType: "preferred" | "general";
};

type GatherOptions = {
  forceGlobalFallback?: boolean;
};

type GatherResultsFn = (
  target: Target,
  options?: GatherOptions
) => Promise<{ results: SearchResultForPrompt[]; usedGlobal: boolean }>;

type DomainSearchFns = {
  domainPreferredSearch: typeof domainPreferredSearch;
  generalSearch: typeof generalSearch;
};

/**
 * Helpers to normalize string values into the enums our scorer expects.
 */
function toSourceTypeKey(value: string | undefined): SourceTypeKey | undefined {
  if (!value) return undefined;
  const allowed: SourceTypeKey[] = [
    "commodity_index",
    "major_vendor",
    "trade_stats",
    "supplier_quote",
    "industry_report",
    "web_secondary",
    "anecdotal",
  ];
  return allowed.includes(value as SourceTypeKey) ? (value as SourceTypeKey) : undefined;
}

function toDerivationType(value: string | undefined): DerivationType | undefined {
  if (!value) return undefined;
  const allowed: DerivationType[] = [
    "direct_local",
    "direct_regional",
    "inferred_regional",
    "inferred_material_analog",
    "heuristic",
  ];
  return allowed.includes(value as DerivationType) ? (value as DerivationType) : undefined;
}

function toProximityKey(value: string | undefined): ProximityKey | undefined {
  if (!value) return undefined;
  const allowed: ProximityKey[] = [
    "same_cluster",
    "same_country_same_market",
    "same_country_different_market",
    "neighboring_country",
    "same_region",
    "different_region",
  ];
  return allowed.includes(value as ProximityKey) ? (value as ProximityKey) : undefined;
}

function makeCacheKey(target: Pick<Target, "ingredientName" | "locationCode">): string {
  return `${target.ingredientName.toLowerCase()}::${target.locationCode}`;
}

function makeCountryQuery(target: Target): string {
  return `${target.ingredientName} wholesale price ${target.locationName} bulk commodity`;
}

function makeGlobalQuery(target: Target): string {
  return `${target.ingredientName} global wholesale commodity price`;
}

function loadLlmCache(): Record<string, CacheEntry> {
  if (!existsSync(LLM_CACHE_PATH)) {
    return {};
  }
  try {
    const content = readFileSync(LLM_CACHE_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, CacheEntry>;
    }
  } catch (error) {
    console.warn(formatWarning("Failed to read LLM cache; starting with empty cache."), error);
  }
  return {};
}

function persistLlmCache() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(LLM_CACHE_PATH, JSON.stringify(llmCache, null, 2), "utf8");
}

function normalizeCostfulResults(results: SearchResultForPrompt[]): SearchResultForPrompt[] {
  return results
    .map((r) => ({
      ...r,
      cost: (r.cost ?? []).filter((c) => getCostNumericValue(c) > 0),
    }))
    .filter((r) => r.cost.length > 0);
}

function pickResultsForModel(results: SearchResultForPrompt[]): SearchResultForPrompt[] {
  const preferred = results.filter((r) => r.sourceType === "preferred");
  return preferred.length > 0 ? preferred : results;
}

function buildPrompt(target: Target, searchResults: SearchResultForPrompt[]): string {
  return (
    `User question:
     what is the cost of ${target.ingredientName} in ${target.locationName}, both in USD and localCurrency?
   ` +
    `Here are search results (biased to preferred domains):\n\n` +
    JSON.stringify(searchResults) +
    `\n\n` +
    `Now respond with a JSON object that matches the given schema.`
  );
}

async function callModel(
  target: Target,
  searchResults: SearchResultForPrompt[]
): Promise<LlmResponse> {
  const { object } = await generateObjectImpl({
    model: openai("gpt-5-mini-2025-08-07"),
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(target, searchResults),
    schema: costFactorMetadataSchema,
  });
  return object;
}

function attachQualityScores(response: LlmResponse): LlmResponse {
  const sources = response.sources ?? [];

  if (sources.length === 0) {
    // If we have no sources, provide a deterministic low-quality record so consumers do not see undefined.
    if (response.qualityScore !== undefined && response.qualityBreakdown) {
      return response;
    }
    return {
      ...response,
      qualityScore: 0,
      qualityBand: "low",
      qualityBreakdown: {
        recency: 0,
        source: 0,
        estimation: 0,
        consistency: 0,
        proximity: 0,
        composite: 0,
      },
    };
  }

  const sourcesForScoring: SourceEntry[] = sources.map((source) => ({
    type: toSourceTypeKey(source.type) ?? "web_secondary",
    ageMonths: typeof source.ageMonths === "number" ? source.ageMonths : undefined,
    observedAt: source.observedAt,
    rawPriceUsdPerKg:
      typeof source.rawPriceUsdPerKg === "number" ? source.rawPriceUsdPerKg : undefined,
  }));

  const derivation = toDerivationType(response.derivationType);
  let proximityForScoring = toProximityKey(response.geoProximity);
  if (
    derivation !== "direct_local" &&
    proximityForScoring &&
    !["same_cluster", "same_country_same_market", "same_country_different_market"].includes(
      proximityForScoring
    )
  ) {
    // For non-local derivations, downgrade cross-country proximity claims to different_region.
    proximityForScoring = "different_region";
  }

  const quality = computeQualityScore({
    sources: sourcesForScoring,
    derivationType: derivation,
    proximity: proximityForScoring,
  });

  return {
    ...response,
    qualityScore: quality.composite,
    qualityBand: quality.band,
    qualityBreakdown: {
      recency: quality.recency,
      source: quality.source,
      estimation: quality.estimation,
      consistency: quality.consistency,
      proximity: quality.proximity,
      composite: quality.composite,
    },
  };
}

function makeEmptyResponse(): LlmResponse {
  return {
    localCurrencyCode: "USD",
    costInUSD: 0,
    costInLocalCurrency: 0,
    weightUnits: "kg",
    qualityScore: 0,
    qualityBand: "low",
    scoreJustification: "No cost data found for the ingredient.",
    sources: [],
    isInferred: false,
    sourceType: "general",
    qualityBreakdown: {
      recency: 0,
      source: 0,
      estimation: 0,
      consistency: 0,
      proximity: 0,
      composite: 0,
    },
  };
}

async function searchWithFallback(target: Target): Promise<{
  results: SearchResultForPrompt[];
  usedGlobal: boolean;
}> {
  const firstPass = await gatherSearchResultsImpl(target, { forceGlobalFallback: false });
  const firstWithCosts = normalizeCostfulResults(firstPass.results);

  // If we found costs or already searched globally inside gather, stop here.
  if (firstWithCosts.length > 0 || firstPass.usedGlobal) {
    return { results: firstWithCosts, usedGlobal: firstPass.usedGlobal };
  }

  // Otherwise, force a global search.
  const globalPass = await gatherSearchResultsImpl(target, { forceGlobalFallback: true });
  const globalWithCosts = normalizeCostfulResults(globalPass.results);
  return { results: globalWithCosts, usedGlobal: true };
}

export async function getCostEstimate(
  target: Target
): Promise<{ response: LlmResponse; fromCache: boolean }> {
  const cacheKey = makeCacheKey(target);
  const cached = llmCache[cacheKey];
  if (cached) {
    return { response: attachQualityScores(cached), fromCache: true };
  }

  // Gather search results (country-first, then global fallback if needed) and keep only positive-cost hits.
  const { results: costfulResults } = await searchWithFallback(target);

  // If nothing to price, return the deterministic empty response.
  if (costfulResults.length === 0) {
    const emptyResponse = makeEmptyResponse();
    llmCache[cacheKey] = emptyResponse;
    persistLlmCache();
    return { response: emptyResponse, fromCache: false };
  }

  // Prefer preferred-domain sources when available.
  const promptResults = pickResultsForModel(costfulResults);

  // Ask the LLM to aggregate, then attach deterministic quality scoring and cache.
  const response = await callModel(target, promptResults);
  const responseWithQuality = attachQualityScores(response);
  llmCache[cacheKey] = responseWithQuality;
  persistLlmCache();
  return { response: responseWithQuality, fromCache: false };
}

export async function gatherSearchResults(
  target: Target,
  options: GatherOptions = {}
): Promise<{ results: SearchResultForPrompt[]; usedGlobal: boolean }> {
  const forceGlobalFallback = options.forceGlobalFallback ?? false;
  const countryQuery = forceGlobalFallback ? null : makeCountryQuery(target);
  const globalQuery = makeGlobalQuery(target);
  const preferredCountry = forceGlobalFallback
    ? []
    : await domainPreferredSearchImpl(countryQuery!);
  const generalCountry = forceGlobalFallback ? [] : await generalSearchImpl(countryQuery!);

  const RESULTS_THRESHOLD = 3;
  let preferred = preferredCountry;
  let general = generalCountry;

  const shouldUseGlobal =
    forceGlobalFallback || preferred.length + general.length < RESULTS_THRESHOLD;

  if (shouldUseGlobal) {
    const preferredGlobal = await domainPreferredSearchImpl(globalQuery);
    const generalGlobal = await generalSearchImpl(globalQuery);
    preferred = [...preferred, ...preferredGlobal];
    general = [...general, ...generalGlobal];
  }

  const allPreferredCosts = preferred.map((r) => r.cost);
  // const allGeneralCosts = general.map((r) => r.cost);
  // console.dir(
  //   {
  //     target,
  //     queries: {
  //       countryQuery,
  //       globalQueryUsed: shouldUseGlobal,
  //     },
  //     preferredCosts: allPreferredCosts,
  //     generalCosts: allGeneralCosts,
  //   },
  //   { depth: null }
  // );
  const seen = new Set(allPreferredCosts.flatMap((c) => c.map((c) => c.source.url)));
  const annotatedPreferred: SearchResultForPrompt[] = preferred.map((res, index) => ({
    ...res,
    id: index + 1,
    sourceType: "preferred",
  }));

  const filteredGeneral = general.filter((res) => {
    const validCosts = res.cost.filter((c) => c.source && !seen.has(c.source.url));
    if (validCosts.length === 0) {
      return false;
    }
    // Add all valid sources to seen set
    validCosts.forEach((c) => seen.add(c.source.url));
    return true;
  });

  const annotatedGeneral: SearchResultForPrompt[] = filteredGeneral.map((res, index) => ({
    ...res,
    id: annotatedPreferred.length + index + 1,
    sourceType: "general",
  }));

  return {
    results: [...annotatedPreferred, ...annotatedGeneral],
    usedGlobal: shouldUseGlobal,
  };
}

let gatherSearchResultsImpl: GatherResultsFn = gatherSearchResults;
let generateObjectImpl: typeof generateObject = generateObject;
let domainPreferredSearchImpl: typeof domainPreferredSearch = domainPreferredSearch;
let generalSearchImpl: typeof generalSearch = generalSearch;

export function setGatherSearchResultsImpl(fn: GatherResultsFn) {
  gatherSearchResultsImpl = fn;
}

export function resetGatherSearchResultsImpl() {
  gatherSearchResultsImpl = gatherSearchResults;
}

export function resetLlmCache() {
  Object.keys(llmCache).forEach((key) => {
    delete llmCache[key];
  });
}

export function setGenerateObjectImpl(fn: typeof generateObject) {
  generateObjectImpl = fn;
}

export function resetGenerateObjectImpl() {
  generateObjectImpl = generateObject;
}

export function setDomainSearchImpls(fns: DomainSearchFns) {
  domainPreferredSearchImpl = fns.domainPreferredSearch;
  generalSearchImpl = fns.generalSearch;
}

export function resetDomainSearchImpls() {
  domainPreferredSearchImpl = domainPreferredSearch;
  generalSearchImpl = generalSearch;
}
