import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { logger } from "./logger";

const PLAID_ENV = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

const config = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
      "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
    },
  },
});

export const plaidClient = new PlaidApi(config);

// Plaid sandbox only supports: US, GB, ES, FR, IE, NL, CA, DE, IT, DK, NO, PL, SE
// MY (Malaysia) is NOT supported in sandbox — it causes 400 INVALID_FIELD errors
const SANDBOX_COUNTRY_CODES = [CountryCode.Gb, CountryCode.Us];
const PROD_COUNTRY_CODES = [CountryCode.Gb, CountryCode.Us];

export async function createLinkToken(): Promise<string> {
  logger.info({ env: PLAID_ENV }, "Creating Plaid link token");

  const countryCodes = PLAID_ENV === "sandbox" ? SANDBOX_COUNTRY_CODES : PROD_COUNTRY_CODES;

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "fintrack-user" },
      client_name: "Fintrack",
      products: [Products.Transactions],
      country_codes: countryCodes,
      language: "en",
    });
    logger.info({ linkToken: response.data.link_token?.slice(0, 20) + "…" }, "Plaid link token created");
    return response.data.link_token;
  } catch (err: any) {
    // Extract the actual Plaid API error message from the axios response
    const plaidError = err?.response?.data;
    logger.error(
      { plaidError, status: err?.response?.status, env: PLAID_ENV },
      "Plaid link token creation failed"
    );
    throw err;
  }
}

export async function exchangePublicToken(publicToken: string): Promise<string> {
  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    return response.data.access_token;
  } catch (err: any) {
    const plaidError = err?.response?.data;
    logger.error({ plaidError, status: err?.response?.status }, "Plaid token exchange failed");
    throw err;
  }
}

export { logger };
