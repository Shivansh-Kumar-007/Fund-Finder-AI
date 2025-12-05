import OpenAI from "openai";

import {
  domainPreferredSearch,
  generalSearch,
  ExaResult,
  getCostNumericValue,
} from "./generate-cost-factor/domain-search";

type CostEstimateLite = {
  ingredient: string;
  location: string;
  costInUSD: number;
  weightUnits: "kg" | "ton";
  qualityBand: "high" | "medium" | "low_medium" | "low";
  qualityScore: number;
  scoreJustification: string;
  explanation?: {
    reasoningAndMethodology?: string;
    assumptions?: string;
  };
};

type SearchOptions = {
  ingredient: string;
  location: string;
};

function makeCountryQuery(ingredient: string, location: string): string {
  return `${ingredient} wholesale price ${location} bulk commodity`;
}

function makeGlobalQuery(ingredient: string): string {
  return `${ingredient} global wholesale commodity price`;
}

function normalizeResults(results: ExaResult[]): ExaResult[] {
  return results.map((r) => ({
    ...r,
    cost: (r.cost ?? []).filter((c) => getCostNumericValue(c) > 0),
  }));
}

async function searchCosts({ ingredient, location }: SearchOptions): Promise<ExaResult[]> {
  const countryQuery = makeCountryQuery(ingredient, location);
  const globalQuery = makeGlobalQuery(ingredient);

  let results = normalizeResults(await domainPreferredSearch(countryQuery));
  if (results.length === 0) {
    results = normalizeResults(await generalSearch(countryQuery));
  }

  // fallback to global
  if (results.length === 0) {
    results = normalizeResults(await domainPreferredSearch(globalQuery));
  }
  if (results.length === 0) {
    results = normalizeResults(await generalSearch(globalQuery));
  }

  return results;
}

function pickBestCost(results: ExaResult[]): { amount: number; unit: "kg" | "ton" } | null {
  const flattened = results.flatMap((r) =>
    (r.cost ?? []).map((c) => ({
      amount: getCostNumericValue(c),
      unit: c.weightUnits.toLowerCase().includes("ton") ? ("ton" as const) : ("kg" as const),
    }))
  );
  if (flattened.length === 0) return null;
  const sorted = flattened.sort((a, b) => a.amount - b.amount);
  return sorted[0];
}

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function callOpenAIForAggregation(
  ingredient: string,
  location: string,
  results: ExaResult[]
): Promise<CostEstimateLite> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are a careful assistant that estimates a wholesale cost from provided search results.
Return a JSON object with fields:
- ingredient (string)
- location (string)
- costInUSD (number, per kg or ton)
- weightUnits ("kg" or "ton")
- qualityBand ("high" | "medium" | "low_medium" | "low")
- qualityScore (0-100)
- scoreJustification (string)
- explanation (object with reasoningAndMethodology, assumptions)
Use only the provided results; if insufficient data, set costInUSD to 0 and qualityBand to "low".
        `.trim(),
      },
      {
        role: "user",
        content: `Ingredient: ${ingredient}\nLocation: ${location}\nResults:\n${JSON.stringify(
          results
        )}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content");
  }
  return JSON.parse(content) as CostEstimateLite;
}

export async function getCostEstimateLite(params: {
  ingredient: string;
  location: string;
}): Promise<CostEstimateLite> {
  const { ingredient, location } = params;
  const results = await searchCosts({ ingredient, location });

  if (results.length === 0) {
    return {
      ingredient,
      location,
      costInUSD: 0,
      weightUnits: "kg",
      qualityBand: "low",
      qualityScore: 0,
      scoreJustification: "No cost data found.",
      explanation: {
        reasoningAndMethodology: "No Exa results returned any usable cost data.",
      },
    };
  }

  // Try simple heuristic first
  const best = pickBestCost(results);
  if (best) {
    return {
      ingredient,
      location,
      costInUSD: best.amount ?? 0,
      weightUnits: best.unit,
      qualityBand: "medium",
      qualityScore: 50,
      scoreJustification: "Derived from best available Exa cost entry.",
      explanation: {
        reasoningAndMethodology: "Selected lowest positive cost from Exa structured results.",
      },
    };
  }

  // Fall back to OpenAI aggregation over results
  return callOpenAIForAggregation(ingredient, location, results);
}
