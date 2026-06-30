import { loadEnvFromRepoRoot } from "./lib/load-env";

loadEnvFromRepoRoot();

import app from "./app";
import { logger } from "./lib/logger";
import { ensureDocumentsTable, ensureSerialSequencesAligned } from "./lib/db-health";
import { ensureLocalUploadDirs, isLocalStorageMode } from "./lib/localFileStorage";

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

    void (async () => {
      try {
        await ensureDocumentsTable();
        if (isLocalStorageMode()) {
          await ensureLocalUploadDirs();
          logger.info("Local file storage enabled (uploads/)");
        }
        await ensureSerialSequencesAligned();
      } catch (err) {
        logger.error({ err }, "Startup DB/storage maintenance failed");
      }
    })();
  });
}

void start();
