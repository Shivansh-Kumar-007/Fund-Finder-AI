import { Module } from "@nestjs/common";

import { AlternativesController } from "./alternatives.controller";
import { AlternativesService } from "./alternatives.service";
import { FundingController } from "./funding.controller";
import { FundingService } from "./funding.service";

@Module({
  controllers: [FundingController, AlternativesController],
  providers: [FundingService, AlternativesService],
})
export class AppModule {}
