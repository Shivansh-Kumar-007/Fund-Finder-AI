import { z } from "zod";

export const aiCostMetadataSchema = z.object({
  qualityBand: z
    .enum(["high", "medium", "low_medium", "low"])
    .optional()
    .describe("Quality band inferred from sources (high > medium > low_medium > low)."),
  qualityScore: z
    .number()
    .optional()
    .describe(
      "Deterministic quality score (0-100) derived from source recency, type, consistency."
    ),
  scoreJustification: z
    .string()
    .optional()
    .describe("Short human-friendly justification for the quality score/band."),
  explanation: z
    .object({
      reasoningAndMethodology: z
        .string()
        .describe("Reasoning and methodology used to derive the cost and quality band/score."),
      assumptions: z.string().optional().describe("Any assumptions applied to reach the estimate."),
    })
    .optional(),
  costInUSD: z
    .number()
    .describe("Normalized cost in USD per weight unit (one number, max 2 decimals, no ranges)."),
  costInLocalCurrency: z
    .number()
    .optional()
    .describe(
      "Cost in local currency per weight unit (one number, max 2 decimals, no ranges). Optional."
    ),
  localCurrencyCode: z
    .string()
    .optional()
    .describe("ISO currency code for the local currency used in costInLocalCurrency."),
  weightUnits: z
    .enum(["kg", "ton"])
    .optional()
    .describe("Weight unit applied to the costs i need values in kg."),
  /**
   * Why does the LLM return invalid value for isInferred sometimes ?
   *
   * Because we're relying on free-form text generation constrained only by a prompt + schema, the model sometimes slips.
   * Even though the instructions say "set isInferred to true when you extrapolate and false otherwise," the LLM may:
   *
   * Omit the field entirely when it deems it "obvious" (e.g., thinks the explanation already conveys inferred vs exact).
   * Emit "true"/"false" as strings, null, or another truthy description instead of a literal boolean when it isn't confident.
   * Produce objects that pass human inspection but don't satisfy the exact Zod contract, especially when the response is auto-repaired after initial validation failures.
   * Those variations are common with structured LLM outputs. Adding schema: z.object({ ... isInferred: z.boolean().catch(false) }) helps absorb those mismatches so the entire record isn't discarded when the model forgets or misformats that one field.
   */
  isInferred: z
    .boolean()
    .catch(false)
    .optional()
    .describe("True when cost is inferred from non-local data or assumed any sorts."),
  sourceType: z
    .enum(["preferred", "general"])
    .catch("general")
    .optional()
    .describe("Source type classification for prioritization."),
});

export const AICostFactorSchema = z.object({
  ingredient: z.string(),
  location: z.string(),
  costFactor: z.number(),
  aiMetadata: aiCostMetadataSchema,
});

export const AICostFactorsSchema = z.array(AICostFactorSchema);

export type AICostMetadata = z.infer<typeof aiCostMetadataSchema>;
export type CostAIFactor = z.infer<typeof AICostFactorSchema>;
