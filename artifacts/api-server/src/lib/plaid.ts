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

export async function createLinkToken(): Promise<string> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: "fintrack-user" },
    client_name: "Fintrack",
    products: [Products.Transactions],
    country_codes: [CountryCode.Gb, CountryCode.Us, CountryCode.My],
    language: "en",
  });
  return response.data.link_token;
}

export async function exchangePublicToken(publicToken: string): Promise<string> {
  const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  return response.data.access_token;
}

export { logger };
