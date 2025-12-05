import { z } from "zod";

export const fundingOpportunitySchema = z.object({
  name: z.string().describe("Name of the funding program or grant."),
  website: z.string().describe("Direct URL to the funding opportunity."),
  applicableCountries: z.array(z.string()).default([]),
  relevantIndustry: z.string().describe("Industry or vertical the funding targets."),
  fundingAmount: z.string().optional().describe("Advertised funding amount or range, if stated."),
  summary: z.string().describe("Brief description of what the funding covers."),
});

export const fundingOpportunityListSchema = z.object({
  opportunities: z.array(fundingOpportunitySchema),
});

export type FundingOpportunity = z.infer<typeof fundingOpportunitySchema>;
