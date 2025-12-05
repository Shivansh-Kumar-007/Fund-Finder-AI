import { Injectable } from "@nestjs/common";

import type { GetAlternativesParams, AlternativeResult } from "../sco-optimizer/get-ingredient-alternatives";
import { getIngredientAlternatives } from "../sco-optimizer/get-ingredient-alternatives";

@Injectable()
export class AlternativesService {
  async findAlternatives(params: GetAlternativesParams): Promise<AlternativeResult[]> {
    return getIngredientAlternatives(params);
  }
}
