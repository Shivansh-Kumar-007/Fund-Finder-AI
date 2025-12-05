import { runBatches } from "./batch-runner";
import { confirmDatabase, DB_URL, formatError, parseArgs, validateDbUrls } from "./config";
import { prisma } from "./data";

async function main() {
  validateDbUrls();
  const args = parseArgs(process.argv.slice(2));
  await confirmDatabase(DB_URL, args.dryRun);

  try {
    await runBatches(args);
  } catch (error) {
    console.error(formatError("Script failed."), error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  // process.exit();
}

void main();
