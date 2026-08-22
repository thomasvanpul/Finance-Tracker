import app from "./app";
import { logger } from "./lib/logger";
import { alpacaStream } from "./lib/alpaca-stream";
import { verifyModelAtBoot } from "./lib/ai-config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  alpacaStream.connect();
  // Verify the configured Gemini model against Google's models list.
  // Non-blocking — server is already accepting requests. If the model
  // is dead, an error-level log fires with the fix-me sentence and
  // /api/ai/status flips to available:false. See lib/ai-config.ts.
  void verifyModelAtBoot();
});
