import app from "./app";
import { logger } from "./lib/logger";
import { alpacaStream } from "./lib/alpaca-stream";
import { verifyProvidersAtBoot } from "./lib/ai-config";

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
  // Verify every AI provider's configured models against its live
  // models list — Groq, Cerebras, OpenRouter in parallel. Non-blocking:
  // server is already accepting requests. If any provider's model is
  // dead, an error-level log fires with the provider-specific fix-me
  // sentence and /api/ai/status flips that provider to
  // modelsVerified=false. `available` at the top level stays true so
  // long as ONE provider remains verified. See lib/ai-config.ts.
  void verifyProvidersAtBoot();
});
