import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { LocationCode, PrismaClient } from "@prisma/client";

import {
  colorValue,
  COST_DATA_SOURCE_ID,
  DB_URL,
  formatInfo,
  formatWarning,
  OUTPUT_DIR,
  PROGRESS_LOG_PATH,
  TARGET_MAIN_DATA_POINT_IDS,
} from "./config";

export type Target = {
  ingredientMetadataId: string;
  ingredientName: string;
  lifecycleStage: string;
  mainDataPointId: string;
  locationCode: LocationCode;
  locationName: string;
  year: number;
};

export type ExistingCostDataPoint = {
  id: number;
  costDataPointId: string;
  ingredientMetadataId: string;
  locationCode: LocationCode;
  year: number;
  factor: number;
};

function withPgBouncerParams(url: string): string {
  const hasQuery = url.includes("?");
  const separator = hasQuery ? "&" : "?";
  return `${url}${separator}pgbouncer=true&connection_limit=1`;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withPgBouncerParams(DB_URL),
    },
  },
});

export function makeTargetKey(target: Pick<Target, "ingredientMetadataId" | "locationCode">) {
  return `${target.ingredientMetadataId}::${target.locationCode}`;
}

export function loadProcessedTargetKeys(): Set<string> {
  if (!existsSync(PROGRESS_LOG_PATH)) {
    return new Set();
  }
  try {
    const content = readFileSync(PROGRESS_LOG_PATH, "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const keys = new Set<string>();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.key) {
          keys.add(parsed.key);
          continue;
        }
      } catch {
        // Ignore JSON parse errors and fall back to raw line string.
      }
      keys.add(line);
    }
    return keys;
  } catch (error) {
    console.warn(formatWarning("Failed to read progress log, ignoring previous progress."), error);
    return new Set();
  }
}

export function recordProcessedTarget(target: Target, costDataPointId: string) {
  const entry = {
    key: makeTargetKey(target),
    ingredientMetadataId: target.ingredientMetadataId,
    locationCode: target.locationCode,
    year: target.year,
    lifecycleStage: target.lifecycleStage,
    costDataPointId,
    processedAt: new Date().toISOString(),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  appendFileSync(PROGRESS_LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}

export async function fetchTargets(): Promise<Target[]> {
  const dataPoints = await prisma.emissionsDataPointV2.findMany({
    where: {
      deleted: false,
      IngredientMetadata: {
        mainDataPointId: {
          in: TARGET_MAIN_DATA_POINT_IDS,
        },
      },
    },
    select: {
      ingredientMetadataId: true,
      year: true,
      locationCode: true,
      IngredientMetadata: {
        select: {
          mainDataPointId: true,
          lifecycleStage: true,
          MainDataPoint: {
            select: {
              displayName: true,
            },
          },
        },
      },
      Location: {
        select: {
          displayName: true,
        },
      },
    },
  });

  const grouped = new Map<string, Target>();
  for (const dp of dataPoints) {
    const ingredientName = dp.IngredientMetadata?.MainDataPoint?.displayName;
    const lifecycleStage = dp.IngredientMetadata?.lifecycleStage ?? "UNKNOWN";
    const mainDataPointId = dp.IngredientMetadata?.mainDataPointId;
    const locationName = dp.Location?.displayName;
    if (
      !ingredientName ||
      !locationName ||
      !mainDataPointId ||
      ingredientName.toLowerCase().includes("(custom)")
    ) {
      continue;
    }
    const key = `${dp.ingredientMetadataId}::${dp.locationCode}`;
    const existing = grouped.get(key);
    if (!existing || dp.year > existing.year) {
      grouped.set(key, {
        ingredientMetadataId: dp.ingredientMetadataId,
        ingredientName,
        lifecycleStage,
        mainDataPointId,
        locationCode: dp.locationCode,
        locationName,
        year: dp.year,
      });
    }
  }

  const sortedTargets = Array.from(grouped.values()).sort((a, b) => {
    const ingCompare = a.ingredientName.localeCompare(b.ingredientName);
    if (ingCompare !== 0) {
      return ingCompare;
    }
    return a.locationName.localeCompare(b.locationName);
  });

  const uniqueByMain = new Map<string, Target>();
  for (const target of sortedTargets) {
    if (uniqueByMain.has(target.mainDataPointId)) {
      continue;
    }
    uniqueByMain.set(target.mainDataPointId, target);
  }

  console.log(
    `${formatInfo("Fetched ingredient/location pairs")}: ${colorValue(String(uniqueByMain.size))}`
  );

  return Array.from(uniqueByMain.values());
}

export async function loadExistingCostDataPoints(
  targets: Target[]
): Promise<Map<string, ExistingCostDataPoint[]>> {
  const map = new Map<string, ExistingCostDataPoint[]>();
  if (targets.length === 0) {
    return map;
  }
  const uniqueKeys = Array.from(new Set(targets.map((target) => makeTargetKey(target))));
  const CHUNK_SIZE = 100;
  for (let i = 0; i < uniqueKeys.length; i += CHUNK_SIZE) {
    const chunk = uniqueKeys.slice(i, i + CHUNK_SIZE);
    const orConditions = chunk.map((key) => {
      const [ingredientMetadataId, locationCode] = key.split("::");
      return {
        ingredientMetadataId,
        locationCode: locationCode as LocationCode,
      };
    });
    const existing = await prisma.costDataPoint.findMany({
      where: {
        costDataSourceId: COST_DATA_SOURCE_ID,
        deleted: false,
        OR: orConditions,
      },
      select: {
        id: true,
        costDataPointId: true,
        ingredientMetadataId: true,
        locationCode: true,
        year: true,
        factor: true,
      },
    });
    for (const record of existing) {
      const key = makeTargetKey(record);
      const list = map.get(key) ?? [];
      list.push(record);
      map.set(key, list);
    }
  }
  return map;
}
