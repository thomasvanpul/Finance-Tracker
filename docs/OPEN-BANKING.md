# Open banking — provider research

Researched 16 Aug 2026. Not legal advice; confirm terms with the provider before
building. Supersedes the earlier note in `TARGET-PRODUCT.md`, which named
GoCardless — that option is gone.

## What changed

**GoCardless Bank Account Data (formerly Nordigen) has closed to new signups.**
It was the standard free-tier recommendation for EU/UK indie developers and is
no longer available; existing integrations may continue. Any advice naming it is
stale.

## The market as it actually is

There is no free tier at production scale, and the reason is structural rather
than commercial: the eIDAS certificate every provider must hold is a fixed
annual cost that sets a floor under production access.

"Free" in this market means one of three different things, and they are
routinely conflated:
- **Free sandbox** — fake data, every provider has one, never serves real users.
- **Free production, capped** — real data with a hard connection limit.
- **Free on your own accounts** — real production data, but only for accounts
  you personally link.

## The recommendation: Enable Banking, Restricted Production

Enable Banking is the common path for new EU/UK indie work: self-serve signup,
sandbox, and Restricted Production before paid scale. It is the default fit for
EU/UK indie developers after the GoCardless closure.

From Enable Banking's own FAQ: a production application becomes active once a
contract is signed and the KYB process is completed for the company — **or** it
can be activated in restricted mode by linking your own accounts, in which case
only those linked accounts are accessible through the application.

**That is exactly this project's situation today.** One user, his own accounts,
real data, arriving automatically, at no cost and with no company required.

Useful implementation detail from the same source: session validity is set by
the client via `valid_until` on `POST /auth`, capped by each bank's
`maximum_consent_validity` (180 days for most). Consent is renewed only when
that date is reached — there is no separate refresh process to implement, as the
API abstracts the banks' short-lived access tokens internally.

## What this does not solve

- **Strangers cannot sign up.** Restricted Production covers linked accounts
  only. Public signup needs a signed contract and KYB, which needs a company.
  Budget four to twelve weeks after sandbox sign-off for security review,
  contract and bank certification — the critical path is usually bank-specific
  certification rather than application code.
- **Malaysia is still out.** Enable Banking is pan-European. Maybank and MYR
  stay manual regardless of provider.

## Alternatives worth knowing

- **Yapily Connect** — hosted auth under the aggregator's licence, aimed at
  unregulated teams. Note that "Yapily Connect" is Yapily's FCA-regulated
  entity, not a pricing tier; this is a common confusion.
- **TrueLayer** — free sandbox and pay-as-you-go, strongest for payment
  initiation and Variable Recurring Payments. Still the right answer for the
  payments work recorded in `TARGET-PRODUCT.md`, which is a separate concern
  from account data.
- **Plaid** — unlimited free sandbox, but EU/UK production is sales-led.

## Sequence

1. Enable Banking sandbox, self-serve. Build the integration against fake data.
2. Restricted Production with Thomas's own Wise and Revolut accounts. Real data,
   automatic, free. Removes the CSV-import barrier for the only user there is.
3. Public signup only when there is a reason — that is when KYB, a company and
   the 4–12 week path become worth starting.
