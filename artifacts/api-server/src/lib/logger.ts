import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Redact paths: pino matches these against every log object. Wildcards
  // catch arbitrary nesting so a body/property that happens to sit
  // deeper in an object still gets caught. Every path here has caused a
  // real or possible leak — do not shorten this list without a reason.
  //
  //   req.headers.authorization  — Bearer/Basic auth heading
  //   req.headers.cookie         — session token
  //   res.headers.set-cookie     — Set-Cookie on the way out
  //   *.credential               — CreateConnectionInput.credential (plain)
  //   *.credentialCiphertext     — the encrypted blob (leaks nothing but
  //                                logging it invites a habit)
  //   *.credential_ciphertext    — DB column snake_case, same reason
  //   *.token, *.apiKey, *.secret — generic; every future adapter body
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
    "credential",
    "credentialCiphertext",
    "credential_ciphertext",
    "token",
    "apiKey",
    "secret",
    "*.credential",
    "*.credentialCiphertext",
    "*.credential_ciphertext",
    "*.token",
    "*.apiKey",
    "*.secret",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
