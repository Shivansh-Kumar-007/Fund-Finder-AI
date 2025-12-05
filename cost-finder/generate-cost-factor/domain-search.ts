import { exa } from "./exa-client";

const PREFERRED_DOMAINS = [
  "selinawamucii.com",
  "tridge.com",
  "fao.org",
  "ahdb.org.uk",
  // "indexmundi.com",
  "tradingeconomics.com",
];

type CostAmount =
  | {
      amount: number;
      minAmount?: undefined;
      maxAmount?: undefined;
    }
  | {
      amount?: undefined;
      minAmount: number;
      maxAmount: number;
    };

export type ExaResult = {
  ingredientName: string;
  locationName: string;
  cost: (CostAmount & {
    currency: string;
    weightUnits: string;
    evaluationMethod: string;
    assumptions?: string;
    score: number;
    scoreJustification: string;
    source: {
      url: string;
      text: string;
    };
  })[];
  text: string;
};

export function getCostNumericValue(cost: CostAmount): number {
  return cost.amount ?? cost.minAmount ?? cost.maxAmount ?? 0;
}

type SearchOptions = {
  numResults?: number;
};

const DEFAULT_TEXT_OPTIONS = {
  text: { maxCharacters: 1500 as const },
  highlights: { numSentences: 3 as const },
};

const costFactorSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Cost Factor Information",
  type: "object",
  properties: {
    costFactor: {
      type: "object",
      properties: {
        ingredientName: {
          type: "string",
        },
        locationName: {
          type: "string",
        },
        cost: {
          type: "array",
          description:
            "Each entry represents the cost **per weightUnit** of the ingredient. The weightUnit field should properly record the unit used for the cost amount (e.g., 'kg', 'g', 'lb', 'ton', 'Metric Ton').",
          items: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description:
                  "Single cost **for exactly 1 weightUnit** of the ingredient. The weightUnit field indicates the unit used for this amount (e.g., 'kg', 'g', 'lb', 'ton', 'metric ton', 'tonne'). Use this when only one value is provided.",
              },
              minAmount: {
                type: "number",
                description: "Minimum observed cost for exactly 1 weightUnit of the ingredient, when the source provides a range.",
              },
              maxAmount: {
                type: "number",
                description: "Maximum observed cost for exactly 1 weightUnit of the ingredient, when the source provides a range.",
              },
              currency: {
                type: "string",
                description: "Currency code (e.g., 'USD', 'BRL', 'EUR')",
              },
              weightUnits: {
                type: "string",
                description:
                  "Unit of weight EXACTLY as stated in the source (e.g., 'kg', 'g', 'lb', 'ton', 'metric ton', 'tonne'). Pay special attention to distinguish between kg and ton/tonne - check if prices seem reasonable for the unit.",
              },
              evaluationMethod: {
                type: "string",
                description: "How the cost was determined (e.g., 'market price', 'wholesale', 'retail')",
              },
              assumptions: {
                type: "string",
                description: "Assumptions made in determining the cost",
              },
              score: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence score (0-1) for this cost data",
              },
              scoreJustification: {
                type: "string",
                description: "Explanation for the confidence score",
              },
              source: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  text: { type: "string" },
                },
                required: ["url"],
              },
            },
            oneOf: [
              {
                description: "Single price point",
                required: ["amount", "currency", "weightUnits", "source"],
              },
              {
                description: "Price range",
                required: ["minAmount", "maxAmount", "currency", "weightUnits", "source"],
              },
            ],
          },
        },
      },
      description: "cost per unit data for the given ingredient at the specified location",
      required: ["ingredientName", "locationName", "cost"],
    },
  },
  required: ["costFactor"],
} as const;

export async function domainPreferredSearch(query: string, opts?: SearchOptions): Promise<ExaResult[]> {
  const numResults = opts?.numResults ?? 6;
  const res = await exa.searchAndContents(query, {
    summary: {
      schema: costFactorSchema,
    },
    numResults,
    includeDomains: PREFERRED_DOMAINS,
    livecrawl: "always",
    type: "keyword",
    ...DEFAULT_TEXT_OPTIONS,
  });

  return res.results.flatMap((r: any) => {
    if (r.summary) {
      try {
        const structuredData: { costFactor: ExaResult } = JSON.parse(r.summary);
        if (
          !structuredData.costFactor ||
          !structuredData.costFactor.cost ||
          structuredData.costFactor.cost.length === 0 ||
          structuredData.costFactor.cost.every((c) => c.score && c.score < 0.6) ||
          structuredData.costFactor.cost.every((c) => getCostNumericValue(c) <= 0)
        ) {
          return [];
        }
        return [
          {
            ...structuredData.costFactor,
            cost: structuredData.costFactor.cost.filter((c) => c.score && c.score >= 0.6),
            text: r.text,
          },
        ];
      } catch (e) {
        console.error("Failed to parse summary:", e);
        return [];
      }
    }
    return [];
  });
}

export async function generalSearch(query: string, opts?: SearchOptions): Promise<ExaResult[]> {
  const numResults = opts?.numResults ?? 6;
  const res = await exa.searchAndContents(query, {
    summary: {
      query: "Extract exact cost data with precise weight units (kg vs ton) as stated in the source",
      schema: costFactorSchema,
    },
    numResults,
    ...DEFAULT_TEXT_OPTIONS,
    livecrawl: "always",
    type: "neural",
  });

  return res.results.flatMap((r) => {
    if (r.summary) {
      try {
        const structuredData: { costFactor: ExaResult } = JSON.parse(r.summary);
        if (
          !structuredData.costFactor ||
          !structuredData.costFactor.cost ||
          structuredData.costFactor.cost.length === 0 ||
          structuredData.costFactor.cost.every((c) => c.score && c.score < 0.6) ||
          structuredData.costFactor.cost.every((c) => getCostNumericValue(c) <= 0)
        ) {
          return [];
        }
        return [
          {
            ...structuredData.costFactor,
            cost: structuredData.costFactor.cost.filter((c) => c.score && c.score >= 0.6),
            text: r.text,
          },
        ];
      } catch (e) {
        console.error("Failed to parse summary:", e);
        return [];
      }
    }
    return [];
  });
}
