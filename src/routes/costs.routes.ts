import { Router, Request, Response } from "express";
import { getCostEstimate } from "../../cost-finder/generate-cost-factor/llm";
import { findFundingOpportunities } from "../../domain-search";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { OPENAI_MODEL } from "../../config";

const router = Router();
const LOG_LABEL = "[Costs]";

async function generateFundingSearchParams(
  estimate: any,
  target: any,
  userIndustry?: string,
  userKeywords?: string
) {
  try {
    // Build sources description for context
    const sourcesDesc =
      estimate.sources
        ?.map(
          (s: any) => `${s.title || "Source"}: ${s.snippet || s.text || ""}`
        )
        .join("\n") || "No sources available";

    const prompt = `You are a funding opportunity search expert. Generate optimized search parameters to find relevant grants, subsidies, and investment opportunities.

PRODUCT CONTEXT:
- Product/Ingredient: ${target.ingredientName}
- Location/Region: ${target.locationName}
- Industry Context from Sources:
${sourcesDesc}

USER PREFERENCES:
${
  userIndustry
    ? `- Industry Focus: ${userIndustry}`
    : "- No specific industry provided"
}
${
  userKeywords
    ? `- Keywords: ${userKeywords}`
    : "- No specific keywords provided"
}

TASK:
Based on the product and location, determine:
1. The most relevant industry sector for funding search
2. What type of funding would be most valuable (sustainability grants, R&D funding, export development, production support, etc.)
3. Generate a targeted search query for finding relevant funding opportunities

Return a JSON object:
{
  "industry": "most relevant industry sector",
  "keywords": "optimized search query for funding opportunities"
}

The keywords should mention the product/ingredient, location, and type of funding (grants, subsidies, tax incentives, etc.).

Return ONLY the JSON object, no markdown.`;

    const { text } = await generateText({
      model: openai(OPENAI_MODEL),
      prompt,
    });

    // Parse the JSON response
    const cleanText = text.trim().replace(/```json\n?|```\n?/g, "");
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Error generating funding params:", error);
    // Fallback to simple generation
    return {
      keywords:
        userKeywords ||
        `${target.ingredientName} ${target.locationName} production grants subsidies funding`,
      industry: userIndustry || "agriculture",
    };
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const { ingredient, location, includeFunding, industry, keywords } =
      req.query;

    if (!ingredient || !location) {
      return res
        .status(400)
        .json({ error: "ingredient and location are required" });
    }

    // Create a Target object for the full getCostEstimate function
    const target = {
      ingredientMetadataId: String(ingredient)
        .toLowerCase()
        .replace(/\s+/g, "-"),
      ingredientName: String(ingredient),
      lifecycleStage: "Cradle to Gate",
      mainDataPointId: String(ingredient).toLowerCase().replace(/\s+/g, "-"),
      locationCode: String(location).slice(0, 2).toUpperCase() as any,
      locationName: String(location),
      year: new Date().getFullYear(),
    };

    let estimate, fromCache;
    try {
      const result = await getCostEstimate(target);
      estimate = result.response;
      fromCache = result.fromCache;
    } catch (estimateError) {
      console.error("Error calling getCostEstimate:", estimateError);
      return res.status(503).json({
        error: "Cost estimation service temporarily unavailable",
        details:
          estimateError instanceof Error
            ? estimateError.message
            : String(estimateError),
      });
    }

    const response: any = {
      input: { ingredient, location },
      estimate: {
        ingredient: target.ingredientName,
        location: target.locationName,
        costInUSD: estimate.costInUSD,
        costInLocalCurrency: estimate.costInLocalCurrency,
        localCurrencyCode: estimate.localCurrencyCode,
        weightUnits: estimate.weightUnits,
        qualityScore: estimate.qualityScore,
        qualityBand: estimate.qualityBand,
        scoreJustification: estimate.scoreJustification,
        sources: estimate.sources,
        fromCache,
      },
    };

    // Include funding opportunities if requested
    if (includeFunding === "true" || includeFunding === "1") {
      try {
        // Use LLM to generate optimized funding search parameters
        const fundingParams = await generateFundingSearchParams(
          estimate,
          target,
          industry ? String(industry) : undefined,
          keywords ? String(keywords) : undefined
        );

        const fundingQuery: any = {
          countries: [String(location)],
          keywords: fundingParams.keywords,
          ingredient: target.ingredientName,
          numResults: 8,
        };

        if (fundingParams.industry) {
          fundingQuery.industry = fundingParams.industry;
        }

        const funding = await findFundingOpportunities(fundingQuery);
        response.funding = {
          count: funding.length,
          opportunities: funding,
        };
      } catch (fundingError) {
        console.error("Error fetching funding:", fundingError);
        response.funding = {
          error: "Failed to fetch funding opportunities",
          count: 0,
          opportunities: [],
        };
      }
    }

    res.json(response);
  } catch (error) {
    console.error("Error in /costs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
