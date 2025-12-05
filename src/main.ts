import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { cors: true });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const envInfo = [
    `PORT=${port}`,
    `EXA_API_KEY=${process.env.EXA_API_KEY ? "set" : "missing"}`,
    `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "set" : "missing"}`,
  ].join(" | ");
  logger.log(`Starting Fund-Finder API (${envInfo})`);

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

void bootstrap().catch((error) => {
  // Ensure crashes are visible in container logs.
  // eslint-disable-next-line no-console
  console.error("Failed to start Nest API:", error);
  process.exit(1);
});
