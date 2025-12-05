import { resolve } from "node:path";

export enum Units {
  USD_PER_kg = "USD_PER_kg",
}

export type ScriptArgs = {
  dryRun: boolean;
  limit?: number;
  batchSize?: number;
};

export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

export const colorLabel = (label: string) =>
  `${ansi.bold}${ansi.yellow}${label}${ansi.reset}`;
export const colorValue = (value: string) =>
  `${ansi.cyan}${value}${ansi.reset}`;
export const formatWarning = (text: string) =>
  `${ansi.bold}${ansi.yellow}${text}${ansi.reset}`;
export const formatSuccess = (text: string) =>
  `${ansi.bold}${ansi.green}${text}${ansi.reset}`;
export const formatError = (text: string) =>
  `${ansi.bold}${ansi.red}${text}${ansi.reset}`;
export const formatInfo = (text: string) =>
  `${ansi.bold}${ansi.cyan}${text}${ansi.reset}`;

export const OUTPUT_DIR = __dirname;
export const UNDO_SQL_PATH = resolve(
  OUTPUT_DIR,
  "undo_generate_cost_factor.sql"
);
export const PROGRESS_LOG_PATH = resolve(
  OUTPUT_DIR,
  "generate_cost_factor_progress.log"
);
export const LLM_CACHE_PATH = resolve(OUTPUT_DIR, "llm_response_cache.json");

export const COST_DATA_SOURCE_ID =
  process.env.AI_COST_DATA_SOURCE_ID ?? "unibloom";
export const DEFAULT_UNITS = Units.USD_PER_kg;
export const TARGET_MAIN_DATA_POINT_IDS = [
  // "crude-palm-oil",
  // "crude-peanut-oil",
  // "rapeseed-meal",
  // "refined-sunflower-oil",
  // "molasses-from-sugarcane",
  // "sugarcane",
  // "wheat-grain",
  // "wheat-flour",
  // "barley-grain",
  // "citrus-pulp",
  // "rice-bran",
  // "soybean-meal",
  // "dairy-cow-meat",
  // "rapeseed-oil",
  // "rapeseed",
  // "low-density-polyethylene",
  "asphalt-standard-hot-mix",
  // "sodium-chloride",
  // "strawberry",
  // "polypropylene",
];

export const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:123456789@localhost:5432/local";

export function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--dryrun") {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.split("=")[1]);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error("`--limit` must be a positive integer.");
      }
      args.limit = value;
      continue;
    }
    if (arg === "--limit") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("`--limit` requires a value.");
      }
      const value = Number(next);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error("`--limit` must be a positive integer.");
      }
      args.limit = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      const value = Number(arg.split("=")[1]);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error("`--batch-size` must be a positive integer.");
      }
      args.batchSize = value;
      continue;
    }
    if (arg === "--batch-size") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("`--batch-size` requires a value.");
      }
      const value = Number(next);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error("`--batch-size` must be a positive integer.");
      }
      args.batchSize = value;
      i += 1;
    }
  }
  return args;
}

export async function confirmDatabase(url: string, isDryRun: boolean) {
  console.log(`${formatInfo("Connecting to database")}: ${colorValue(url)}`);
  if (isDryRun) {
    console.log(
      `${formatWarning("DRY RUN")}: no database changes will be written.`
    );
    return;
  }
  const response = await new Promise<string>((resolve) => {
    process.stdout.write(
      [
        formatWarning("This operation will update CostDataPoint rows."),
        `  ${colorLabel("Database URL")}: ${colorValue(url)}`,
        `${colorLabel("Type 'y' to continue or 'n' to abort")}: `,
      ].join("\n")
    );
    process.stdin.once("data", (data) =>
      resolve(data.toString().trim().toLowerCase())
    );
  });
  if (response !== "y") {
    throw new Error("Aborted by user.");
  }
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function validateDbUrls() {
  if (DB_URL.includes("REPLACE_WITH")) {
    throw new Error(
      "Update DB_URL in scripts/generate-cost-factor/config.ts with the correct connection string."
    );
  }
}
