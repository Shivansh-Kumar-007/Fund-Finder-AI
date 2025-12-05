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
