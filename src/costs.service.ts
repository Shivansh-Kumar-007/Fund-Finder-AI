import { Injectable } from "@nestjs/common";

import { getCostEstimateLite } from "../cost-finder/cost-estimate-lite";
import { FundingService } from "./funding.service";

@Injectable()
export class CostsService {
  constructor(private readonly fundingService: FundingService) {}

  async estimate(params: { ingredient: string; location: string }) {
    return getCostEstimateLite(params);
  }

  async estimateWithFunding(params: { ingredient: string; location: string }) {
    const estimate = await this.estimate(params);

    const funding = await this.fundingService.search({
      countries: [params.location],
      keywords: params.ingredient,
      numResults: 8,
    });

    return {
      estimate,
      funding,
    };
  }
}
