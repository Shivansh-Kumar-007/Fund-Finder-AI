import { Injectable } from "@nestjs/common";

import { findSuppliers } from "../supplier-finder/supplier-search";
import { Supplier } from "../supplier-finder/supplier-output-schema";

@Injectable()
export class SuppliersService {
  async search(params: { ingredient: string; countries?: string[]; keywords?: string; limit?: number }): Promise<Supplier[]> {
    return findSuppliers(params);
  }
}
