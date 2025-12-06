import { z } from "zod";

// -----------------------------
// Alternatives
// -----------------------------
export const AlternativesRequestSchema = z.object({
  ingredient: z.string().min(1),
  location: z.string().min(1),
  productDescription: z.string().optional(),
  ingredientFunction: z.string().optional(),
});

export const AlternativeSchema = z.object({
  ingredientName: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  url: z.string().url(),
  reason: z.string().optional(),
});

export const AlternativesResponseSchema = z.object({
  input: AlternativesRequestSchema,
  count: z.number(),
  alternatives: z.array(AlternativeSchema),
});

// -----------------------------
// Suppliers
// -----------------------------
export const SuppliersRequestSchema = z.object({
  ingredient: z.string().min(1),
  countries: z.string().optional(), // comma-separated list
  keywords: z.string().optional(),
  limit: z.string().optional(), // parsed to number server-side
});

export const SupplierSchema = z.object({
  name: z.string(),
  website: z.string().url(),
  country: z.string().optional(),
  city: z.string().optional(),
  summary: z.string(),
  products: z.array(z.string()).optional(),
});

export const SuppliersResponseSchema = z.object({
  input: z.object({
    ingredient: z.string(),
    countries: z.array(z.string()),
    keywords: z.string(),
    limit: z.number().optional(),
  }),
  count: z.number(),
  suppliers: z.array(SupplierSchema),
});

// -----------------------------
// Costs (with optional funding)
// -----------------------------
export const CostsRequestSchema = z.object({
  ingredient: z.string().min(1),
  location: z.string().min(1),
  includeFunding: z.string().optional(), // "true" to include funding
});

export const CostEstimateSchema = z.object({
  ingredient: z.string(),
  location: z.string(),
  costInUSD: z.number(),
  weightUnits: z.enum(["kg", "ton"]),
  qualityBand: z.enum(["high", "medium", "low_medium", "low"]),
  qualityScore: z.number(),
  scoreJustification: z.string(),
  explanation: z
    .object({
      reasoningAndMethodology: z.string().optional(),
      assumptions: z.string().optional(),
    })
    .optional(),
});

export const FundingOpportunitySchema = z.object({
  name: z.string(),
  website: z.string(),
  applicableCountries: z.array(z.string()),
  relevantIndustry: z.string(),
  fundingAmount: z.string().optional(),
  summary: z.string(),
});

export const FundingResponseSchema = z.object({
  query: z.string(),
  count: z.number(),
  opportunities: z.array(FundingOpportunitySchema),
});

export const CostsResponseSchema = z.object({
  input: z.object({
    ingredient: z.string(),
    location: z.string(),
  }),
  estimate: CostEstimateSchema,
  funding: FundingResponseSchema.optional(),
});

// -----------------------------
// Funding (direct)
// -----------------------------
export const FundingRequestSchema = z.object({
  query: z.string().optional(),
  countries: z.string().optional(), // comma-separated list
  industry: z.string().optional(),
  keywords: z.string().optional(),
  limit: z.string().optional(), // parsed to number server-side
});

export const FundingDirectResponseSchema = FundingResponseSchema;

// -----------------------------
// All-in-one (alternatives -> suppliers + costs + funding)
// -----------------------------
export const AllInOneResponseSchema = z.object({
  input: AlternativesRequestSchema,
  results: z.object({
    count: z.number(),
    alternatives: z.array(
      z.object({
        alternative: AlternativeSchema,
        suppliers: z.object({
          count: z.number(),
          suppliers: z.array(SupplierSchema),
          error: z.string().optional(),
        }),
        costs: z.object({
          estimate: z
            .object({
              ingredient: z.string(),
              location: z.string(),
              costInUSD: z.number().nullable(),
              costInLocalCurrency: z.number().nullable(),
              localCurrencyCode: z.string().nullable(),
              weightUnits: z.string().nullable(),
              qualityScore: z.number().nullable(),
              qualityBand: z.string().nullable(),
              scoreJustification: z.string().nullable(),
              sources: z.any().optional(),
              fromCache: z.boolean(),
            })
            .optional(),
          funding: z
            .object({
              count: z.number(),
              opportunities: z.array(FundingOpportunitySchema),
              queryUsed: z.string(),
              error: z.string().optional(),
            })
            .optional(),
          error: z.string().optional(),
        }),
      })
    ),
    error: z.string().optional(),
  }),
});
