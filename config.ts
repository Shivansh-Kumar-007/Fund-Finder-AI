import { resolve } from "node:path";

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export type ScriptArgs = {
  query?: string;
  countries: string[];
  industry?: string;
  keywords?: string;
  ingredient?: string;
  limit: number;
  outputPath?: string;
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

// Use __dirname for CommonJS compatibility
const OUTPUT_DIR = __dirname;
export { OUTPUT_DIR };
export const DEFAULT_OUTPUT_PATH = resolve(
  OUTPUT_DIR,
  "funding-opportunities.json"
);
export const DEFAULT_NUM_RESULTS = 12;

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensurePositiveInteger(
  value: string | undefined,
  flag: string
): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

export function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = {
    countries: [],
    limit: DEFAULT_NUM_RESULTS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--query") {
      args.query = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--query=")) {
      args.query = arg.split("=").slice(1).join("=");
      continue;
    }

    if (arg === "--country" || arg === "--countries") {
      args.countries = splitList(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--country=") || arg.startsWith("--countries=")) {
      args.countries = splitList(arg.split("=").slice(1).join("="));
      continue;
    }

    if (arg === "--industry") {
      args.industry = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--industry=")) {
      args.industry = arg.split("=").slice(1).join("=");
      continue;
    }

    if (arg === "--keywords") {
      args.keywords = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--keywords=")) {
      args.keywords = arg.split("=").slice(1).join("=");
      continue;
    }

    if (arg === "--ingredient") {
      args.ingredient = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--ingredient=")) {
      args.ingredient = arg.split("=").slice(1).join("=");
      continue;
    }

    if (arg === "--limit") {
      const value = ensurePositiveInteger(argv[i + 1], "--limit");
      if (value !== undefined) {
        args.limit = value;
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = ensurePositiveInteger(
        arg.split("=").slice(1).join("="),
        "--limit"
      );
      if (value !== undefined) {
        args.limit = value;
      }
      continue;
    }

    if (arg === "--output") {
      args.outputPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.outputPath = arg.split("=").slice(1).join("=");
    }
  }

  return args;
}
