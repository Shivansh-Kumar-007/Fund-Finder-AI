import { Module } from "@nestjs/common";

import { AlternativesController } from "./alternatives.controller";
import { AlternativesService } from "./alternatives.service";
import { CostsController } from "./costs.controller";
import { CostsService } from "./costs.service";
import { FundingController } from "./funding.controller";
import { FundingService } from "./funding.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";

@Module({
  controllers: [FundingController, AlternativesController, SuppliersController, CostsController],
  providers: [FundingService, AlternativesService, SuppliersService, CostsService],
})
export class AppModule {}
