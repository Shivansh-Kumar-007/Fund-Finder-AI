import { Router, Request, Response } from "express";
import { findSuppliers } from "../../supplier-finder/supplier-search";

const router = Router();
const LOG_LABEL = "[Suppliers]";

router.get("/", async (req: Request, res: Response) => {
  try {
    const { ingredient, countries, keywords, limit } = req.query;

    if (!ingredient) {
      return res.status(400).json({ error: "ingredient is required" });
    }

    const countriesArray = countries
      ? String(countries)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const numLimit = limit ? Math.max(1, parseInt(String(limit))) : undefined;

    console.log(`${LOG_LABEL} request`, {
      ingredient,
      countries: countriesArray,
      keywords: keywords ?? "",
      limit: numLimit ?? null,
    });

    let suppliers;
    try {
      suppliers = await findSuppliers({
        ingredient: String(ingredient),
        countries: countriesArray,
        keywords: keywords ? String(keywords) : "",
        limit: numLimit,
      });
    } catch (searchError) {
      console.error("Error calling findSuppliers:", searchError);
      return res.status(503).json({
        error: "Supplier search service temporarily unavailable",
        details:
          searchError instanceof Error
            ? searchError.message
            : String(searchError),
      });
    }

    const responsePayload = {
      input: {
        ingredient,
        countries: countriesArray,
        keywords: keywords ?? "",
        limit: numLimit,
      },
      count: suppliers.length,
      suppliers,
    };

    console.log(`${LOG_LABEL} response`, {
      ingredient,
      count: responsePayload.count,
      limit: responsePayload.input.limit ?? null,
    });

    res.json(responsePayload);
  } catch (error) {
    console.error("Error in /suppliers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
