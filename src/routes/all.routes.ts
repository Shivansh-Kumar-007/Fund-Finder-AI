import { Router, Request, Response } from "express";
import {
  getIngredientAlternatives,
  AlternativeResult,
} from "../../sco-optimizer/get-ingredient-alternatives";
import { findSuppliers } from "../../supplier-finder/supplier-search";
import { Supplier } from "../../supplier-finder/supplier-output-schema";
import { getCostEstimate } from "../../cost-finder/generate-cost-factor/llm";
import {
  buildFundingQuery,
  findFundingOpportunities,
} from "../../domain-search";
import { DEFAULT_NUM_RESULTS } from "../../config";
import { FundingOpportunity } from "../../funding-output-schema";

type FundingResult = {
  count: number;
  opportunities: FundingOpportunity[];
  queryUsed: string;
  error?: string;
};

type CostEstimateSummary = {
  ingredient: string;
  location: string;
  costInUSD: number | null;
  costInLocalCurrency: number | null;
  localCurrencyCode: string | null;
  weightUnits: string | null;
  qualityScore: number | null;
  qualityBand: string | null;
  scoreJustification: string | null;
  sources: any;
  fromCache: boolean;
};

type CostResult = {
  estimate?: CostEstimateSummary;
  funding?: FundingResult;
  error?: string;
};

type SupplierResult = {
  count: number;
  suppliers: Supplier[];
  error?: string;
};

type AlternativeBundle = {
  alternative: AlternativeResult;
  suppliers: SupplierResult;
  costs: CostResult;
};

type AllInOneResponse = {
  input: {
    ingredient: string;
    location: string;
    productDescription?: string;
    ingredientFunction?: string;
  };
  results: {
    count: number;
    alternatives: AlternativeBundle[];
    error?: string;
  };
};

const router = Router();
const LOG_LABEL = "[All]";

router.get("/", async (req: Request, res: Response) => {
  const { ingredient, location, productDescription, ingredientFunction } =
    req.query;

  if (!ingredient || !location) {
    return res
      .status(400)
      .json({ error: "ingredient and location are required" });
  }

  const ingredientName = String(ingredient);
  const locationName = String(location);
  const productDescriptionText = productDescription
    ? String(productDescription)
    : "";
  const ingredientFunctionText = ingredientFunction
    ? String(ingredientFunction)
    : undefined;

  // Step 1: find alternatives (drives all downstream lookups).
  let alternatives: AlternativeResult[] = [];
  try {
    alternatives = await getIngredientAlternatives({
      ingredientName,
      locationName,
      productDescription: productDescriptionText,
      ingredientFunction: ingredientFunctionText,
    });
  } catch (error) {
    console.error("Error fetching alternatives:", error);
    return res
      .status(503)
      .json({ error: "alternatives_fetch_failed", details: String(error) });
  }

  // Helper for cost target per alternative.
  const buildCostTarget = (alt: AlternativeResult) => {
    const locationForAlt = alt.countryName || locationName;
    const locationCode = (alt.countryCode || locationForAlt || locationName)
      .slice(0, 2)
      .toUpperCase() as any;
    const ingredientSlug = alt.ingredientName
      .toLowerCase()
      .replace(/\s+/g, "-");
    return {
      ingredientMetadataId: ingredientSlug,
      ingredientName: alt.ingredientName,
      lifecycleStage: "Cradle to Gate",
      mainDataPointId: ingredientSlug,
      locationCode,
      locationName: locationForAlt,
      year: new Date().getFullYear(),
    };
  };

  // For each alternative, fetch suppliers + costs (with funding) in parallel.
  const bundles: AlternativeBundle[] = await Promise.all(
    alternatives.map(async (alt) => {
      const locationForAlt = alt.countryName || locationName;
      const fundingQueryText = buildFundingQuery({
        countries: locationForAlt ? [locationForAlt] : [],
        ingredient: alt.ingredientName,
        keywords: productDescriptionText || undefined,
      });

      const suppliersPromise: Promise<SupplierResult> = findSuppliers({
        ingredient: alt.ingredientName,
        countries: locationForAlt ? [locationForAlt] : [],
        keywords: productDescriptionText,
        limit: 10,
      })
        .then((suppliers) => ({
          count: suppliers.length,
          suppliers,
        }))
        .catch((error) => {
          console.error(
            "Error fetching suppliers for alternative:",
            alt.ingredientName,
            error
          );
          return {
            count: 0,
            suppliers: [] as Supplier[],
            error: "suppliers_fetch_failed",
          };
        });

      const costsPromise: Promise<CostResult> = getCostEstimate(
        buildCostTarget(alt)
      )
        .then(async (result) => {
          const estimate = result.response;
          const funding = await findFundingOpportunities({
            query: fundingQueryText,
            countries: locationForAlt ? [locationForAlt] : [],
            ingredient: alt.ingredientName,
            keywords: productDescriptionText || undefined,
            numResults: DEFAULT_NUM_RESULTS,
          })
            .then((opportunities) => ({
              count: opportunities.length,
              opportunities,
              queryUsed: fundingQueryText,
            }))
            .catch((error) => {
              console.error(
                "Error fetching funding for alternative:",
                alt.ingredientName,
                error
              );
              return {
                count: 0,
                opportunities: [] as FundingOpportunity[],
                queryUsed: fundingQueryText,
                error: "funding_fetch_failed",
              };
            });

          return {
            estimate: {
              ingredient: alt.ingredientName,
              location: locationForAlt,
              costInUSD: estimate.costInUSD,
              costInLocalCurrency: estimate.costInLocalCurrency,
              localCurrencyCode: estimate.localCurrencyCode,
              weightUnits: estimate.weightUnits,
              qualityScore: estimate.qualityScore,
              qualityBand: estimate.qualityBand,
              scoreJustification: estimate.scoreJustification,
              sources: estimate.sources,
              fromCache: result.fromCache,
            },
            funding,
          };
        })
        .catch((error) => {
          console.error(
            "Error fetching costs for alternative:",
            alt.ingredientName,
            error
          );
          return { error: "costs_fetch_failed" };
        });

      const [suppliers, costs] = await Promise.all([
        suppliersPromise,
        costsPromise,
      ]);

      return {
        alternative: alt,
        suppliers,
        costs,
      };
    })
  );

  const responsePayload: AllInOneResponse = {
    input: {
      ingredient: ingredientName,
      location: locationName,
      productDescription: productDescriptionText || undefined,
      ingredientFunction: ingredientFunctionText,
    },
    results: {
      count: bundles.length,
      alternatives: bundles,
    },
  };

  console.log(`${LOG_LABEL} response`, {
    alternatives: bundles.length,
    suppliersFetched: bundles.reduce(
      (sum, b) => sum + (b.suppliers.count || 0),
      0
    ),
    fundingFetched: bundles.reduce(
      (sum, b) => sum + (b.costs.funding?.count || 0),
      0
    ),
    costsWithData: bundles.filter((b) => b.costs.estimate).length,
  });

  res.json(responsePayload);
});

export default router;
