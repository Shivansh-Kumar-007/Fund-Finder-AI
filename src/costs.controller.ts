import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { CostsService } from "./costs.service";

@Controller("costs")
export class CostsController {
  constructor(private readonly costsService: CostsService) {}

  @Get("")
  async getCost(
    @Query("ingredient") ingredient?: string,
    @Query("location") location?: string
  ) {
    if (!ingredient || !location) {
      throw new BadRequestException("ingredient and location are required");
    }

    const estimate = await this.costsService.estimate({ ingredient, location });
    return {
      input: { ingredient, location },
      estimate,
    };
  }
}
