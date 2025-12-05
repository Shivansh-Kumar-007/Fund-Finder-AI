/**
 * Standalone Ingredient Alternatives Generator
 *
 * This file contains all the necessary code to find ingredient alternatives
 * using OpenAI and Exa web search. It's self-contained and can be copied
 * to another repository.
 *
 * Required packages (add to package.json):
 * - "@ai-sdk/openai": "^1.0.0"
 * - "ai": "^4.0.0"
 * - "exa-js": "^1.0.0"
 * - "zod": "^3.0.0"
 *
 * Required environment variables:
 * - OPENAI_API_KEY: Your OpenAI API key
 * - EXA_API_KEY: Your Exa API key
 */

import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import Exa from "exa-js";
import z from "zod";

// ============================================================================
// Type Definitions
// ============================================================================

export interface GetAlternativesParams {
  ingredientName: string;
  locationName: string;
  productDescription?: string;
  ingredientFunction?: string;
  excludedIngredients?: string[];
}

export interface AlternativeResult {
  ingredientName: string;
  countryCode: string;
  countryName: string;
  url: string;
}

const altIngLocItem = z.object({
  ingredientName: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  url: z.string(),
  source: z.string().optional(),
  efChangePercentage: z.number().nullable().optional(),
});

type AltIngLoc = z.infer<typeof altIngLocItem>;

const altIngLocsSchema = z.array(altIngLocItem).max(20);

const ingLocsSchema = z.object({
  altIngLocs: z.array(
    z.object({
      ingredientName: z.string(),
      countryCode: z.string(),
      countryName: z.string(),
      url: z.string(),
    })
  ),
});

// ============================================================================
// Exa Web Search Setup
// ============================================================================

const exa = new Exa(process.env.EXA_API_KEY);

async function searchAltIngLocs(query: string, exclusions: string[] = []) {
  const exclusionString = exclusions.map((term) => `-"${term}"`).join(" ");
  const fullQuery =
    exclusions.length > 0 ? `${query} ${exclusionString}`.trim() : query;

  const result = await exa.searchAndContents(fullQuery, {
    summary: {
      schema: ingLocsSchema,
    },
    numResults: 20,
    livecrawl: "always",
    type: "neural",
    includeDomains: [
      "www.foodrepo.org/en",
      "fdc.nal.usda.gov/data-documentation",
      "world.openfoodfacts.org/",
      "fdc.nal.usda.gov",
      "world.openfoodfacts.org",
      "foodrepo.org",
      "fao.org",
      "foodb.ca",
      "inddex.nutrition.tufts.edu",
      "foodstandards.gov.au",
      "dairyprocessinghandbook.tetrapak.com",
      "icecreamcalc.com",
      "iicma.in",
      "gea.com",
      "internationalicecreamconsortium.com",
    ],
  });

  return result.results
    .flatMap((r) => {
      if (r.summary) {
        const structuredData = JSON.parse(r.summary);
        return structuredData.altIngLocs;
      }
      return null;
    })
    .filter(Boolean);
}

const webSearch = tool({
  description: "Search the web with exclusions and filters",
  inputSchema: z.object({
    query: z.string(),
    excludeTerms: z.array(z.string()).default([]),
  }),
  async execute({ query, excludeTerms }) {
    return searchAltIngLocs(query, excludeTerms);
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

async function buildSearchQueries({
  ingredientName,
  locationName,
  productDescription,
  ingredientFunction,
}: {
  ingredientName: string;
  locationName: string;
  productDescription: string;
  ingredientFunction?: string;
}): Promise<{ queryWithinLocation: string; queryOutsideLocation: string }> {
  const funcFragment = ingredientFunction
    ? ` and serving the function of ${ingredientFunction}`
    : "";
  const template1 = `sustainable cost-effective alternatives to <ingredientName> used in <productDescription>${funcFragment} and sourced from ${locationName}.`;
  const template2 = `sustainable cost-effective alternatives to <ingredientName> used in <productDescription>${funcFragment}.`;

  const prompt = `Create two precise web search queries for ingredient "${ingredientName}" (currently from locationName - ${locationName}) used in a product whose description is given as "${productDescription}". The ingredient is serving the function of: ${ingredientFunction}.
            Return two queries - one that focuses on alternatives found within the same location that the ingredient is currently sourced from and another that focuses on alternatives found outside the current location.
            `;

  const { object: queries } = await generateObject({
    model: openai("gpt-4o-mini"),
    system: `
    You are a web search query generator. You are given a product description, an ingredient name, its sourcing location and its function in the product.
    Return web search queries using the provided templates. No prose.
    Use the following templates:
    for alternatives sourced within the same location use ${template1}
    for alternatives sourced outside the current location use ${template2}

    Do not output any prose or explanation — only the two query strings in the expected schema.
    `,
    prompt: prompt,
    schema: z.object({
      queryWithinLocation: z.string(),
      queryOutsideLocation: z.string(),
    }),
  });

  return {
    queryWithinLocation: queries.queryWithinLocation ?? "",
    queryOutsideLocation: queries.queryOutsideLocation ?? "",
  };
}

function sortByCountryNamePresence<T extends { countryName?: string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aHasCountryName =
      typeof a?.countryName === "string" && a.countryName.trim().length > 0;
    const bHasCountryName =
      typeof b?.countryName === "string" && b.countryName.trim().length > 0;

    if (aHasCountryName === bHasCountryName) {
      return 0;
    }

    return aHasCountryName ? -1 : 1;
  });
}

async function sanitizeCandidates(
  merged: AltIngLoc[]
): Promise<{ altIngLocs: AltIngLoc[] }> {
  const { object: sanitized } = await generateObject({
    model: openai("gpt-4o"),
    system: `
    You are a specialized content sanitizer and formatter. You have to do the following
    1. Sanitize Data
       a. ingredient names have to be specific, not vague.
       <example>
        <vaguename>whole milk alternatives</vaguename>
        <vaguename>egg yolk alternatives</vaguename>
        <specificname>almond milk</specificname>
        <specificname>Oat milk</specificname>
       </example>
    2. Dedupe the data
    3. Limit to only 5 entries - Prefer entries with non-empty countryName.

    `.trim(),
    prompt: JSON.stringify(merged),
    schema: z.object({ altIngLocs: altIngLocsSchema }),
  });

  return {
    altIngLocs: sanitized.altIngLocs ?? [],
  };
}

function dedupe(items: AltIngLoc[]): AltIngLoc[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.url}::${it.countryName ?? ""}::${
      it.ingredientName ?? ""
    }`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAndNormalizeResults({
  ingredientName,
  withinQuery,
  outsideQuery,
  excludedIngredients,
}: {
  ingredientName: string;
  withinQuery: string;
  outsideQuery: string;
  excludedIngredients: string[];
}): Promise<AltIngLoc[]> {
  // Search within the same location
  const { text: withinResults } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `${withinQuery} Exclude ${excludedIngredients.join(", ")}`,
    tools: { webSearch },
    stopWhen: stepCountIs(4),
  });

  const { object: withinResultsObj } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: z.object({
      results: z.array(
        z.object({
          ingredientName: z.string(),
          countryCode: z.string(),
          countryName: z.string(),
          url: z.string(),
        })
      ),
    }),
    prompt: withinResults,
  });
  const withinResultsArrays = withinResultsObj?.results ?? [];

  // Search outside the current location
  const { text: outsideResults } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `${outsideQuery} Exclude ${excludedIngredients
      .filter((ing) => ing !== ingredientName)
      .join(", ")}`,
    tools: { webSearch },
    stopWhen: stepCountIs(4),
  });

  const { object: outsideResultsObj } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: z.object({
      results: z.array(
        z.object({
          ingredientName: z.string(),
          countryCode: z.string(),
          countryName: z.string(),
          url: z.string(),
        })
      ),
    }),
    prompt: outsideResults,
  });
  const outsideResultsArrays = outsideResultsObj?.results ?? [];

  // Combine and deduplicate
  const allAlternatives = [...withinResultsArrays, ...outsideResultsArrays];
  const deduped = dedupe(allAlternatives);

  return altIngLocsSchema.parse(
    sortByCountryNamePresence(deduped).slice(0, 10)
  );
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Generate alternative ingredients using the scenario optimizer pipeline.
 * This function searches for sustainable, cost-effective alternatives to a given ingredient
 * using OpenAI and Exa web search.
 *
 * @param params - Configuration for finding alternatives
 * @returns Array of alternative ingredient locations
 *
 * @example
 * ```ts
 * const alternatives = await getIngredientAlternatives({
 *   ingredientName: "skimmed milk powder",
 *   locationName: "New Zealand",
 *   productDescription: "ice cream",
 *   ingredientFunction: "protein source",
 * });
 * ```
 */
export async function getIngredientAlternatives(
  params: GetAlternativesParams
): Promise<AlternativeResult[]> {
  const {
    ingredientName,
    locationName,
    productDescription = "",
    ingredientFunction,
    excludedIngredients = [],
  } = params;

  // Step 1: Build search queries using OpenAI
  const queries = await buildSearchQueries({
    ingredientName,
    locationName,
    productDescription,
    ingredientFunction,
  });

  // Step 2: Fetch and normalize results from web search
  const alternatives = await fetchAndNormalizeResults({
    ingredientName,
    withinQuery: queries.queryWithinLocation,
    outsideQuery: queries.queryOutsideLocation,
    excludedIngredients,
  });

  // Step 3: Sanitize candidates
  const sanitized = await sanitizeCandidates(alternatives);

  return sanitized.altIngLocs.map((item) => ({
    ingredientName: item.ingredientName ?? "",
    countryCode: item.countryCode ?? "",
    countryName: item.countryName ?? "",
    url: item.url ?? "",
  }));
}
