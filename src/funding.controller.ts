import { Controller, Get, Logger, Query } from "@nestjs/common";

import { DEFAULT_NUM_RESULTS } from "../config.ts";
import { FundingService } from "./funding.service";

type CountriesQuery = string | string[] | undefined;

function parseCountries(input: CountriesQuery): string[] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  return values
    .flatMap((val) => val.split(","))
    .map((val) => val.trim())
    .filter(Boolean);
}

function parseLimit(limit?: string): number | undefined {
  if (!limit) return undefined;
  const parsed = Number(limit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

@Controller()
export class FundingController {
  private readonly logger = new Logger(FundingController.name);

  constructor(private readonly fundingService: FundingService) {}

  @Get("/funding")
  async searchFunding(
    @Query("query") query?: string,
    @Query("countries") countriesParam?: CountriesQuery,
    @Query("industry") industry?: string,
    @Query("keywords") keywords?: string,
    @Query("limit") limitParam?: string
  ) {
    const countries = parseCountries(countriesParam);
    const limit = parseLimit(limitParam) ?? DEFAULT_NUM_RESULTS;

    const { opportunities, queryUsed } = await this.fundingService.search({
      query: query || undefined,
      countries,
      industry: industry || undefined,
      keywords: keywords || undefined,
      numResults: limit,
    });

    this.logger.log(`funding search | query="${queryUsed}" | results=${opportunities.length}`);

    return {
      query: queryUsed,
      count: opportunities.length,
      opportunities,
    };
  }
}
