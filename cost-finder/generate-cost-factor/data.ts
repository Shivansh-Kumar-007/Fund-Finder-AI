// Type definitions only - no database dependencies
// This file is used by llm.ts to define the Target type

export type LocationCode = string;

export type Target = {
  ingredientMetadataId: string;
  ingredientName: string;
  lifecycleStage: string;
  mainDataPointId: string;
  locationCode: LocationCode;
  locationName: string;
  year: number;
};
