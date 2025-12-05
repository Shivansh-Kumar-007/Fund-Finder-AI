import { Router, Request, Response } from "express";
import {
  findFundingOpportunities,
  buildFundingQuery,
} from "../../domain-search";
import { DEFAULT_NUM_RESULTS } from "../../config";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { query, countries, industry, keywords, limit } = req.query;

    const countriesArray = countries
      ? (Array.isArray(countries) ? countries : [countries])
          .flatMap((c) => String(c).split(","))
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const numResults = limit
      ? Math.max(1, parseInt(String(limit)))
      : DEFAULT_NUM_RESULTS;

    const queryUsed = query
      ? String(query)
      : buildFundingQuery({
          countries: countriesArray,
          industry: industry ? String(industry) : undefined,
          keywords: keywords ? String(keywords) : undefined,
        });

    const opportunities = await findFundingOpportunities({
      query: queryUsed,
      countries: countriesArray,
      industry: industry ? String(industry) : undefined,
      keywords: keywords ? String(keywords) : undefined,
      numResults,
    });

    res.json({
      input: {
        query: query ?? null,
        countries: countriesArray,
        industry: industry ?? null,
        keywords: keywords ?? null,
        limit: numResults,
      },
      queryUsed,
      count: opportunities.length,
      opportunities,
    });
  } catch (error) {
    console.error("Error in /funding:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
