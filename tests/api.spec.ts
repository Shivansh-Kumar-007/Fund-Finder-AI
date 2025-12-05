import "reflect-metadata";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { describe, beforeAll, afterAll, it, expect, jest } from "@jest/globals";

import { AppModule } from "../src/app.module";
import { AlternativesService } from "../src/alternatives.service";
import { SuppliersService } from "../src/suppliers.service";
import { FundingService } from "../src/funding.service";

describe("API integration (controllers only, services mocked)", () => {
  let app: INestApplication;
  const mockAlternatives = [
    {
      ingredientName: "almond milk powder",
      countryCode: "US",
      countryName: "United States",
      url: "https://example.com/almond",
    },
  ];
  const mockSuppliers = [
    {
      name: "Best Supplier",
      website: "https://supplier.example.com",
      country: "United States",
      city: "San Francisco",
      summary: "Provides almond milk powder",
      products: ["almond milk powder"],
    },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AlternativesService)
      .useValue({ findAlternatives: jest.fn().mockResolvedValue(mockAlternatives) })
      .overrideProvider(SuppliersService)
      .useValue({ search: jest.fn().mockResolvedValue(mockSuppliers) })
      .overrideProvider(FundingService)
      .useValue({ searchFunding: jest.fn(), search: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /alternatives returns mocked alternatives", async () => {
    const res = await request(app.getHttpServer())
      .get("/alternatives")
      .query({ ingredient: "skimmed milk powder", location: "New Zealand" })
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.alternatives).toEqual(mockAlternatives);
  });

  it("GET /suppliers returns mocked suppliers", async () => {
    const res = await request(app.getHttpServer())
      .get("/suppliers")
      .query({ ingredient: "skimmed milk powder", countries: "US" })
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.suppliers).toEqual(mockSuppliers);
  });
});
