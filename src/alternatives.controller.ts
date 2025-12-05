import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { AlternativesService } from "./alternatives.service";

@Controller("alternatives")
export class AlternativesController {
  constructor(private readonly alternativesService: AlternativesService) {}

  @Get()
  async getAlternatives(
    @Query("ingredient") ingredient?: string,
    @Query("location") location?: string,
    @Query("productDescription") productDescription?: string,
    @Query("ingredientFunction") ingredientFunction?: string
  ) {
    if (!ingredient || !location) {
      throw new BadRequestException("ingredient and location are required query params");
    }

    const alternatives = await this.alternativesService.findAlternatives({
      ingredientName: ingredient,
      locationName: location,
      productDescription: productDescription ?? "",
      ingredientFunction: ingredientFunction ?? undefined,
    });

    return {
      input: {
        ingredient,
        location,
        productDescription: productDescription ?? "",
        ingredientFunction: ingredientFunction ?? undefined,
      },
      count: alternatives.length,
      alternatives,
    };
  }
}
