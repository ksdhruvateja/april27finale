import { loadEnvFromRepoRoot } from "./lib/load-env";

loadEnvFromRepoRoot();

import app from "./app";
import { logger } from "./lib/logger";
import { ensureSerialSequencesAligned } from "./lib/db-health";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Do not block startup on DB maintenance tasks.
    void ensureSerialSequencesAligned().catch((alignErr) => {
      logger.error({ err: alignErr }, "Failed to align DB sequences");
    });
  });
}

void start();
