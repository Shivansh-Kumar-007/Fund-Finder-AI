import * as fs from "node:fs";
import { jest } from "@jest/globals";

import type { ExaResult } from "./domain-search";
import {
  gatherSearchResults,
  getCostEstimate,
  resetDomainSearchImpls,
  resetGatherSearchResultsImpl,
  resetGenerateObjectImpl,
  resetLlmCache,
  setDomainSearchImpls,
  setGatherSearchResultsImpl,
  setGenerateObjectImpl,
} from "./llm";

const mockGenerateObject = jest.fn() as jest.MockedFunction<any>;
const mockGatherSearchResults = jest.fn();
const mockDomainPreferredSearch = jest.fn();
const mockGeneralSearch = jest.fn();

jest.mock("ai", () => ({
  __esModule: true,
  generateObject: mockGenerateObject,
}));

jest.mock("@ai-sdk/openai", () => ({
  __esModule: true,
  openai: () => "mock-model",
}));

jest.mock("./domain-search", () => {
  const actual = jest.requireActual("./domain-search") as object;
  return {
    __esModule: true,
    ...actual,
    domainPreferredSearch: mockDomainPreferredSearch,
    generalSearch: mockGeneralSearch,
  };
});

const baseResult: ExaResult = {
  ingredientName: "wheat flour",
  locationName: "Australia",
  cost: [
    {
      amount: 100,
      currency: "USD",
      weightUnits: "ton",
      evaluationMethod: "wholesale",
      score: 0.8,
      scoreJustification: "solid",
      source: { url: "https://example.com", text: "price" },
    },
  ],
  text: "price text",
};

const baseTarget = {
  ingredientName: "wheat flour",
  locationName: "Australia",
  locationCode: "AU",
};

const defaultGenerateObjectResponse = {
  object: {
    localCurrencyCode: "USD",
    metadata: {
      costInUSD: 10,
      costInLocalCurrency: 50,
      assumedExchangeRate: 5,
      dataQualityScore: 7,
      sources: [],
      isInferred: false,
      sourceType: "general",
    },
  },
};

// Avoid touching the filesystem in tests
jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);

describe("getCostEstimate behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLlmCache();
    mockGenerateObject.mockReset();
    mockGenerateObject.mockResolvedValue(defaultGenerateObjectResponse as any);
    setGenerateObjectImpl(mockGenerateObject as any);
    mockGatherSearchResults.mockReset();
    setGatherSearchResultsImpl(mockGatherSearchResults as any);
  });

  afterEach(() => {
    resetGatherSearchResultsImpl();
    resetGenerateObjectImpl();
    resetDomainSearchImpls();
  });

  it("calls gatherSearchResults once with country-first when costs are found", async () => {
    (mockGatherSearchResults as any).mockResolvedValue({
      results: [{ ...baseResult, id: 1, sourceType: "preferred" }],
      usedGlobal: false,
    });

    await getCostEstimate({ ...baseTarget, locationCode: "TEST-AU-1" } as any);

    expect(mockGatherSearchResults).toHaveBeenCalledTimes(1);
    expect(mockGatherSearchResults).toHaveBeenCalledWith(
      expect.objectContaining({ ...baseTarget, locationCode: "TEST-AU-1" }),
      {
        forceGlobalFallback: false,
      }
    );
  });

  it("falls back to global when the first pass yields no costs", async () => {
    (mockGatherSearchResults as any)
      .mockResolvedValueOnce({ results: [], usedGlobal: false })
      .mockResolvedValueOnce({
        results: [{ ...baseResult, id: 1, sourceType: "preferred" }],
        usedGlobal: true,
      });

    await getCostEstimate({ ...baseTarget, locationCode: "TEST-AU-2" } as any);

    expect(mockGatherSearchResults).toHaveBeenCalledTimes(2);
    expect(mockGatherSearchResults.mock.calls[0]).toEqual([
      expect.objectContaining({ ...baseTarget, locationCode: "TEST-AU-2" }),
      { forceGlobalFallback: false },
    ]);
    expect(mockGatherSearchResults.mock.calls[1]).toEqual([
      expect.objectContaining({ ...baseTarget, locationCode: "TEST-AU-2" }),
      { forceGlobalFallback: true },
    ]);
  });

  it("does not retry global if initial search already used global and still had no costs", async () => {
    (mockGatherSearchResults as any).mockResolvedValue({
      results: [],
      usedGlobal: true,
    });

    const { response } = await getCostEstimate({ ...baseTarget, locationCode: "TEST-AU-3" } as any);

    expect(mockGatherSearchResults).toHaveBeenCalledTimes(1);
    expect(mockGatherSearchResults).toHaveBeenCalledWith(
      expect.objectContaining({ ...baseTarget, locationCode: "TEST-AU-3" }),
      {
        forceGlobalFallback: false,
      }
    );
    expect(response.metadata.costInUSD).toBe(0);
  });

  it("attaches deterministic quality scoring to the response", async () => {
    (mockGatherSearchResults as any).mockResolvedValue({
      results: [{ ...baseResult, id: 1, sourceType: "preferred" }],
      usedGlobal: false,
    });
    mockGenerateObject.mockResolvedValue({
      object: {
        localCurrencyCode: "USD",
        metadata: {
          costInUSD: 12,
          costInLocalCurrency: 48,
          dataQualityScore: 8,
          sources: [
            {
              label: "Commodity index",
              url: "https://example.com/idx",
              type: "commodity_index",
              ageDays: 5,
              rawPriceUsdPerKg: 12,
            },
          ],
          isInferred: false,
          sourceType: "preferred",
          derivationType: "direct_local",
          geoProximity: "same_country_same_market",
        },
      },
    });

    const { response } = await getCostEstimate(baseTarget as any);

    expect(response.metadata.qualityScore).toBeGreaterThan(0);
    expect(response.metadata.qualityBand).toBe("medium");
    expect(response.metadata.qualityBreakdown?.recency).toBeDefined();
  });
});

describe("gatherSearchResults behavior", () => {
  const mockDomainPreferredSearch = jest.fn();
  const mockGeneralSearch = jest.fn();

  beforeEach(() => {
    resetDomainSearchImpls();
    mockDomainPreferredSearch.mockReset();
    mockGeneralSearch.mockReset();
    setDomainSearchImpls({
      domainPreferredSearch: mockDomainPreferredSearch as any,
      generalSearch: mockGeneralSearch as any,
    });
  });

  it("uses only country queries when threshold met", async () => {
    const sampleResult = {
      ingredientName: "wheat flour",
      locationName: "Australia",
      cost: [
        {
          amount: 10,
          currency: "USD",
          weightUnits: "kg",
          evaluationMethod: "wholesale",
          score: 0.9,
          scoreJustification: "good",
          source: { url: "https://example.com/1", text: "text" },
        },
      ],
      text: "text",
    };
    const sampleResult2 = {
      ...sampleResult,
      sourceType: "preferred",
      cost: [
        {
          ...sampleResult.cost[0],
          source: { url: "https://example.com/2", text: "text2" },
        },
      ],
    };
    const generalSample = {
      ...sampleResult,
      sourceType: "general",
      cost: [
        {
          ...sampleResult.cost[0],
          source: { url: "https://example.com/3", text: "text3" },
        },
      ],
    };
    (mockDomainPreferredSearch as any).mockResolvedValue([sampleResult, sampleResult2]);
    (mockGeneralSearch as any).mockResolvedValue([generalSample]);

    const { results, usedGlobal } = await gatherSearchResults(
      { ingredientName: "wheat flour", locationName: "Australia", locationCode: "AU" } as any,
      { forceGlobalFallback: false }
    );

    expect(mockDomainPreferredSearch).toHaveBeenCalledTimes(1);
    expect(mockGeneralSearch).toHaveBeenCalledTimes(1);
    expect(usedGlobal).toBe(false);
    expect(results).toHaveLength(3);
  });

  it("falls back to global when below threshold", async () => {
    const countryResult = {
      ingredientName: "wheat flour",
      locationName: "Australia",
      cost: [
        {
          amount: 10,
          currency: "USD",
          weightUnits: "kg",
          evaluationMethod: "wholesale",
          score: 0.9,
          scoreJustification: "good",
          source: { url: "https://example.com/1", text: "text" },
        },
      ],
      text: "text",
    };
    const globalResult = {
      ...countryResult,
      locationName: "Global",
      cost: [{ ...countryResult.cost[0], source: { url: "https://example.com/2", text: "text" } }],
    };
    const globalGeneral = {
      ...countryResult,
      locationName: "Global",
      cost: [{ ...countryResult.cost[0], source: { url: "https://example.com/3", text: "text" } }],
    };
    (mockDomainPreferredSearch as any)
      .mockResolvedValueOnce([countryResult])
      .mockResolvedValueOnce([globalResult]);
    (mockGeneralSearch as any).mockResolvedValueOnce([]).mockResolvedValueOnce([globalGeneral]);

    const { results, usedGlobal } = await gatherSearchResults(
      { ingredientName: "wheat flour", locationName: "Australia", locationCode: "AU" } as any,
      { forceGlobalFallback: false }
    );

    expect(mockDomainPreferredSearch).toHaveBeenCalledTimes(2);
    expect(mockGeneralSearch).toHaveBeenCalledTimes(2);
    expect(usedGlobal).toBe(true);
    expect(results).toHaveLength(3);
  });

  it("forces global when requested", async () => {
    const globalResult = {
      ingredientName: "wheat flour",
      locationName: "Global",
      cost: [
        {
          amount: 10,
          currency: "USD",
          weightUnits: "kg",
          evaluationMethod: "wholesale",
          score: 0.9,
          scoreJustification: "good",
          source: { url: "https://example.com/2", text: "text" },
        },
      ],
      text: "text",
    };
    (mockDomainPreferredSearch as any).mockResolvedValue([globalResult]);
    (mockGeneralSearch as any).mockResolvedValue([globalResult]);

    const { usedGlobal } = await gatherSearchResults(
      { ingredientName: "wheat flour", locationName: "Australia", locationCode: "AU" } as any,
      { forceGlobalFallback: true }
    );

    expect(mockDomainPreferredSearch).toHaveBeenCalledTimes(1);
    expect(mockGeneralSearch).toHaveBeenCalledTimes(1);
    expect(usedGlobal).toBe(true);
  });
});
