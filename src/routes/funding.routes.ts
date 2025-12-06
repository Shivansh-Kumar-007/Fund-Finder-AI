import { Router, Request, Response } from "express";
import {
  findFundingOpportunities,
  buildFundingQuery,
} from "../../domain-search";
import { DEFAULT_NUM_RESULTS } from "../../config";

const router = Router();
const LOG_LABEL = "[Funding]";

router.get("/", async (req: Request, res: Response) => {
  try {
    const { query, countries, industry, keywords, ingredient, limit } =
      req.query;

    const countriesArray = countries
      ? (Array.isArray(countries) ? countries : [countries])
          .flatMap((c) => String(c).split(","))
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const numResults = limit
      ? Math.max(1, parseInt(String(limit)))
      : DEFAULT_NUM_RESULTS;

    const ingredientName = ingredient
      ? String(Array.isArray(ingredient) ? ingredient[0] : ingredient)
      : undefined;

    const queryUsed = query
      ? String(query)
      : buildFundingQuery({
          countries: countriesArray,
          industry: industry ? String(industry) : undefined,
          keywords: keywords ? String(keywords) : undefined,
          ingredient: ingredientName,
        });

    console.log(`${LOG_LABEL} request`, {
      query: query ?? null,
      queryUsed,
      countries: countriesArray,
      industry: industry ?? null,
      keywords: keywords ?? null,
      ingredient: ingredientName ?? null,
      limit: numResults,
    });

    let opportunities;
    try {
      opportunities = await findFundingOpportunities({
        query: queryUsed,
        countries: countriesArray,
        industry: industry ? String(industry) : undefined,
        keywords: keywords ? String(keywords) : undefined,
        ingredient: ingredientName,
        numResults,
      });
    } catch (searchError) {
      console.error("Error calling findFundingOpportunities:", searchError);
      return res.status(503).json({
        error: "Funding search service temporarily unavailable",
        details:
          searchError instanceof Error
            ? searchError.message
            : String(searchError),
      });
    }

    const responsePayload = {
      input: {
        query: query ?? null,
        countries: countriesArray,
        industry: industry ?? null,
        keywords: keywords ?? null,
        ingredient: ingredientName ?? null,
        limit: numResults,
      },
      queryUsed,
      count: opportunities.length,
      opportunities,
    };

    if (opportunities.length === 0) {
      console.log(`${LOG_LABEL} no opportunities returned`);
    } else {
      const sample = opportunities.slice(0, 3);
      console.log(
        `${LOG_LABEL} opportunity sample (showing ${sample.length} of ${opportunities.length})`
      );
      console.dir(sample, { depth: null });
    }

    console.log(`${LOG_LABEL} response`, {
      queryUsed,
      count: responsePayload.count,
      limit: responsePayload.input.limit,
    });

    res.json(responsePayload);
  } catch (error) {
    console.error("Error in /funding:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
