import { Router, Request, Response } from "express";
import { getIngredientAlternatives } from "../../sco-optimizer/get-ingredient-alternatives";

const router = Router();
const LOG_LABEL = "[Alternatives]";

router.get("/", async (req: Request, res: Response) => {
  try {
    const { ingredient, location, productDescription, ingredientFunction } =
      req.query;

    if (!ingredient || !location) {
      return res
        .status(400)
        .json({ error: "ingredient and location are required" });
    }

    console.log(`${LOG_LABEL} request`, {
      ingredient,
      location,
      productDescription: productDescription ?? "",
      ingredientFunction: ingredientFunction ?? null,
    });

    let alternatives;
    try {
      alternatives = await getIngredientAlternatives({
        ingredientName: String(ingredient),
        locationName: String(location),
        productDescription: productDescription
          ? String(productDescription)
          : "",
        ingredientFunction: ingredientFunction
          ? String(ingredientFunction)
          : undefined,
      });
    } catch (searchError) {
      console.error("Error calling getIngredientAlternatives:", searchError);
      return res.status(503).json({
        error: "Alternatives search service temporarily unavailable",
        details:
          searchError instanceof Error
            ? searchError.message
            : String(searchError),
      });
    }

    const responsePayload = {
      input: {
        ingredient,
        location,
        productDescription: productDescription ?? "",
        ingredientFunction: ingredientFunction ?? undefined,
      },
      count: alternatives.length,
      alternatives,
    };

    if (alternatives.length === 0) {
      console.log(`${LOG_LABEL} no alternatives returned`);
    } else {
      const sample = alternatives.slice(0, 3);
      console.log(
        `${LOG_LABEL} alternatives sample (showing ${sample.length} of ${alternatives.length})`
      );
      console.dir(sample, { depth: null });
    }

    console.log(`${LOG_LABEL} response`, {
      ingredient,
      location,
      count: responsePayload.count,
    });

    res.json(responsePayload);
  } catch (error) {
    console.error("Error in /alternatives:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
