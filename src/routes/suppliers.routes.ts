import { Router, Request, Response } from "express";
import { findSuppliers } from "../../supplier-finder/supplier-search";

const router = Router();

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

    const suppliers = await findSuppliers({
      ingredient: String(ingredient),
      countries: countriesArray,
      keywords: keywords ? String(keywords) : "",
      limit: numLimit,
    });

    res.json({
      input: {
        ingredient,
        countries: countriesArray,
        keywords: keywords ?? "",
        limit: numLimit,
      },
      count: suppliers.length,
      suppliers,
    });
  } catch (error) {
    console.error("Error in /suppliers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
