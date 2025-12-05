import { Injectable } from "@nestjs/common";

import { buildFundingQuery, findFundingOpportunities } from "../domain-search.ts";
import type { FundingSearchOptions } from "../domain-search.ts";
import type { FundingOpportunity } from "../funding-output-schema.ts";

type SearchResponse = {
  opportunities: FundingOpportunity[];
  queryUsed: string;
};

@Injectable()
export class FundingService {
  async search(options: FundingSearchOptions): Promise<SearchResponse> {
    const queryUsed = options.query ?? buildFundingQuery(options);
    const opportunities = await findFundingOpportunities({
      ...options,
      query: queryUsed,
    });
    return { opportunities, queryUsed };
  }
}
