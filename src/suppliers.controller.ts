import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { SuppliersService } from "./suppliers.service";

function parseCountries(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async getSuppliers(
    @Query("ingredient") ingredient?: string,
    @Query("countries") countriesParam?: string,
    @Query("keywords") keywords?: string,
    @Query("limit") limitParam?: string
  ) {
    if (!ingredient) {
      throw new BadRequestException("ingredient is required");
    }

    const countries = parseCountries(countriesParam);
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
      throw new BadRequestException("limit must be a positive number");
    }

    const suppliers = await this.suppliersService.search({
      ingredient,
      countries,
      keywords: keywords ?? "",
      limit,
    });

    return {
      input: { ingredient, countries, keywords: keywords ?? "", limit: limit ?? undefined },
      count: suppliers.length,
      suppliers,
    };
  }
}
