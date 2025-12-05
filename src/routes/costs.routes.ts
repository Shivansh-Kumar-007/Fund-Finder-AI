import { Router, Request, Response } from "express";
import { getCostEstimateLite } from "../../cost-finder/cost-estimate-lite";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { ingredient, location } = req.query;

    if (!ingredient || !location) {
      return res
        .status(400)
        .json({ error: "ingredient and location are required" });
    }

    const estimate = await getCostEstimateLite({
      ingredient: String(ingredient),
      location: String(location),
    });

    res.json({
      input: { ingredient, location },
      estimate,
    });
  } catch (error) {
    console.error("Error in /costs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
